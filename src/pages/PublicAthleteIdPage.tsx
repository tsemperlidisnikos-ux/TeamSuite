import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  parseAthleteIdCardHash,
  type AthleteIdCardPayload,
} from '../utils/athleteIdCard';
import { formatDate } from '../utils/labels';
import { getAppLogoUrl, getAppName } from '../platform/platformConfig';

export function PublicAthleteIdPage() {
  const [payload, setPayload] = useState<AthleteIdCardPayload | null>(null);

  useEffect(() => {
    const read = () => setPayload(parseAthleteIdCardHash(window.location.hash));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const logoUrl = useMemo(
    () => payload?.logoUrl || getAppLogoUrl(),
    [payload?.logoUrl],
  );

  const initials = (payload?.clubName || getAppName() || 'SS')
    .trim()
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="public-athlete-id-page">
      <div className="public-athlete-id-shell">
        <p className="public-athlete-id-brand">{getAppName() || 'SPORTSUITE 360'}</p>
        <h1>Επαλήθευση ταυτότητας αθλητή</h1>

        {!payload ? (
          <div className="public-athlete-id-empty">
            <p>Μη έγκυρο ή κενό QR. Σκανάρετε ξανά την κάρτα αθλητή.</p>
            <Link to="/login">Σύνδεση</Link>
          </div>
        ) : (
          <article className="athlete-qr-card public-athlete-id-card">
            <div className="athlete-qr-card-top">
              {logoUrl ? (
                <img
                  className="athlete-qr-logo"
                  src={logoUrl}
                  alt={payload.clubName || 'Logo συλλόγου'}
                />
              ) : (
                <div className="athlete-qr-logo-fallback" aria-hidden>
                  {initials}
                </div>
              )}
              <div className="athlete-qr-heading">
                <strong>ΤΑΥΤΟΤΗΤΑ ΑΘΛΗΤΗ</strong>
                <span>
                  {payload.clubName || 'Σύλλογος'}
                  {payload.season ? ` · Σεζόν ${payload.season}` : ''}
                </span>
              </div>
            </div>
            <div className="athlete-qr-meta public-athlete-id-meta">
              <div>
                <span>Επώνυμο</span>
                <strong>{payload.lastName || '—'}</strong>
              </div>
              <div>
                <span>Όνομα</span>
                <strong>{payload.firstName || '—'}</strong>
              </div>
              <div>
                <span>Ημ. γέννησης</span>
                <strong>
                  {payload.birthDate ? formatDate(payload.birthDate) : '—'}
                </strong>
              </div>
              <div>
                <span>Κωδ. αθλητή</span>
                <strong>{payload.athleteCode || '—'}</strong>
              </div>
            </div>
            <p className="public-athlete-id-note">
              Εμφανίζονται μόνο δημόσια στοιχεία επαλήθευσης (χωρίς ΑΜΚΑ, ιατρικά ή στοιχεία
              επικοινωνίας).
            </p>
          </article>
        )}
      </div>
    </div>
  );
}
