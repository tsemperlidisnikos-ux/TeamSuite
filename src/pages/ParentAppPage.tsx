import { useEffect, useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import { getSession, logout } from '../auth/auth';
import { getClubById } from '../auth/clubs';
import { ParentPushOptIn } from '../components/ParentPushOptIn';
import { useCloudMirrorAutoPull } from '../hooks/useCloudMirrorAutoPull';
import { getAppLogoUrl, getAppName } from '../platform/platformConfig';
import { applyParentChrome } from '../utils/parentApp';
import { LoginPage } from './LoginPage';
import { ParentPortalPage } from './ParentPortalPage';

export function ParentAppPage() {
  const [tick, setTick] = useState(0);
  const session = getSession();
  const club = session?.clubId ? getClubById(session.clubId) : null;
  useCloudMirrorAutoPull(session?.clubId ?? null);

  useEffect(() => {
    applyParentChrome();
  }, []);

  const logoUrl = useMemo(() => getAppLogoUrl(), [tick]);
  const appName = useMemo(() => getAppName(), [tick]);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener('academyhub-platform-updated', bump);
    window.addEventListener('academyhub-clubs-updated', bump);
    window.addEventListener('academyhub-users-updated', bump);
    return () => {
      window.removeEventListener('academyhub-platform-updated', bump);
      window.removeEventListener('academyhub-clubs-updated', bump);
      window.removeEventListener('academyhub-users-updated', bump);
    };
  }, []);

  if (!session) {
    return <LoginPage parentApp />;
  }

  if (session.role !== 'parent') {
    return (
      <div className="parent-app-wrong-role">
        <h1>Αυτή η εφαρμογή είναι για γονείς</h1>
        <p>
          Συνδεθήκατε ως {session.fullName || session.email}. Για τη γραμματεία χρησιμοποιήστε την
          κανονική είσοδο του TeamSuite.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            logout();
            window.location.assign('/app/parent');
          }}
        >
          Έξοδος
        </button>
      </div>
    );
  }

  return (
    <div className="parent-app-shell">
      <header className="parent-app-bar">
        <div className="parent-app-bar-brand">
          {logoUrl ? <img src={logoUrl} alt="" /> : null}
          <div>
            <strong>{club?.name || 'TeamSuite Γονείς'}</strong>
            <span>{appName} · {session.fullName}</span>
          </div>
        </div>
        <button
          type="button"
          className="parent-app-logout"
          onClick={() => {
            logout();
            window.location.assign('/app/parent');
          }}
        >
          <LogOut size={16} />
          Έξοδος
        </button>
      </header>
      <ParentPushOptIn />
      <ParentPortalPage />
    </div>
  );
}
