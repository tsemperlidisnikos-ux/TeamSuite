import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  getSessionToken,
  serverVerifySession,
  type ServerSessionUser,
} from '../api/services/sessionService';
import {
  getSession,
  isAuthenticated,
  isDemoSessionActive,
  isPlatformAdmin,
  logout,
  setSessionFromVerifiedUser,
} from './auth';
import { ensureSessionClub, isClubUsageActive } from './clubs';

type GateState = 'checking' | 'ok' | 'deny' | 'retry';

export function RequireAuth() {
  const location = useLocation();
  const [gate, setGate] = useState<GateState>('checking');
  const [retryMessage, setRetryMessage] = useState('');
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let active = true;

    async function verify() {
      if (!getSession()) {
        if (active) setGate('deny');
        return;
      }

      // Presentation DEMO is local-only (no cloud JWT).
      if (isDemoSessionActive()) {
        if (active) setGate('ok');
        return;
      }

      const token = getSessionToken();
      if (!token) {
        // Local-only sessions are allowed in DEV (first bootstrap / offline).
        if (import.meta.env.DEV) {
          if (active) setGate('ok');
          return;
        }
        logout();
        if (active) setGate('deny');
        return;
      }

      if (active) setGate('checking');
      const result = await serverVerifySession();
      if (!active) return;

      if (!result.success || !result.data) {
        if (result.code === 'transient') {
          setRetryMessage(
            result.error || 'Προσωρινό πρόβλημα επαλήθευσης. Δοκιμάστε ξανά.',
          );
          setGate('retry');
          return;
        }

        logout();
        setGate('deny');
        return;
      }

      setSessionFromVerifiedUser(result.data as ServerSessionUser);
      setRetryMessage('');
      setGate('ok');
    }

    void verify();
    return () => {
      active = false;
    };
    // Verify once per mount / explicit retry — NOT on every route change (that caused
    // login↔home bounce when verify raced or briefly failed).
  }, [retryTick]);

  if (gate === 'checking') {
    return (
      <div className="access-blocked" aria-busy="true">
        <p>Επαλήθευση συνεδρίας…</p>
      </div>
    );
  }

  if (gate === 'retry') {
    return (
      <div className="access-blocked">
        <h1>Προσωρινό πρόβλημα σύνδεσης</h1>
        <p>{retryMessage || 'Δεν ήταν δυνατή η επαλήθευση της συνεδρίας.'}</p>
        <button type="button" className="btn btn-primary" onClick={() => setRetryTick((n) => n + 1)}>
          Δοκιμή ξανά
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            logout();
            setGate('deny');
          }}
        >
          Έξοδος
        </button>
      </div>
    );
  }

  if (gate === 'deny' || !isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const session = getSession();
  const club = ensureSessionClub(session);
  if (!isPlatformAdmin() && club && !isClubUsageActive(club)) {
    return (
      <div className="access-blocked">
        <h1>Η περίοδος χρήσης έχει λήξει</h1>
        <p>Επικοινωνήστε με τον Platform Admin για ανανέωση της πρόσβασης του συλλόγου.</p>
        <button type="button" onClick={logout}>
          Έξοδος
        </button>
      </div>
    );
  }

  return <Outlet />;
}
