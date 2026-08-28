import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  acceptAllCookies,
  getCookieConsent,
  hasCookieConsentDecision,
  rejectOptionalCookies,
  saveCookieConsent,
  type CookieConsentState,
} from '../auth/cookieConsent';
import { syncAuthHeaders } from '../api/syncAuth';
import { getSession } from '../auth/auth';

async function logConsentToServer(state: CookieConsentState) {
  try {
    const session = getSession();
    await fetch('/api/gdpr?op=consent', {
      method: 'POST',
      headers: {
        ...syncAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'cookie',
        clubId: session?.clubId ?? null,
        userId: session?.id ?? null,
        email: session?.email ?? null,
        consent: state,
      }),
    });
  } catch {
    /* offline / API unavailable — local consent still valid */
  }
}

export function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!hasCookieConsentDecision()) setOpen(true);
    const existing = getCookieConsent();
    if (existing) {
      setAnalytics(existing.analytics);
      setMarketing(existing.marketing);
    }
  }, []);

  function persist(state: CookieConsentState) {
    setOpen(false);
    setCustomize(false);
    void logConsentToServer(state);
  }

  if (!open) return null;

  return (
    <div className="consent-banner" role="dialog" aria-labelledby="consent-banner-title">
      <div className="consent-banner-inner">
        <h2 id="consent-banner-title">Συγκατάθεση cookies</h2>
        <p>
          Χρησιμοποιούμε απαραίτητα cookies για τη λειτουργία της εφαρμογής. Τα analytics και
          marketing ενεργοποιούνται μόνο με τη συγκατάθεσή σας.{' '}
          <Link to="/legal/cookies">Πολιτική cookies</Link>
          {' · '}
          <Link to="/legal/privacy">Απόρρητο</Link>
        </p>

        {customize ? (
          <div className="consent-banner-cats">
            <label>
              <input type="checkbox" checked disabled readOnly />
              <span>
                <strong>Essential</strong> — σύνδεση, ασφάλεια, προτιμήσεις
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
              />
              <span>
                <strong>Analytics</strong> — στατιστικά χρήσης
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
              />
              <span>
                <strong>Marketing</strong> — προωθητικά
              </span>
            </label>
          </div>
        ) : null}

        <div className="consent-banner-actions">
          <button
            type="button"
            className="consent-btn consent-btn-reject"
            onClick={() => persist(rejectOptionalCookies())}
          >
            Απόρριψη
          </button>
          <button
            type="button"
            className="consent-btn consent-btn-customize"
            onClick={() => {
              if (customize) {
                persist(
                  saveCookieConsent({
                    analytics,
                    marketing,
                    source: 'customize',
                  }),
                );
              } else {
                setCustomize(true);
              }
            }}
          >
            {customize ? 'Αποθήκευση επιλογών' : 'Προσαρμογή'}
          </button>
          <button
            type="button"
            className="consent-btn consent-btn-accept"
            onClick={() => persist(acceptAllCookies())}
          >
            Αποδοχή όλων
          </button>
        </div>
      </div>
    </div>
  );
}
