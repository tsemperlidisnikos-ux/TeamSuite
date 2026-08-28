import { Link, useParams } from 'react-router-dom';
import {
  getPublicLegalHtml,
  type PublicLegalDocId,
} from '../shared/gdprLegalDefaults';
import { DEFAULT_TERMS_OF_USE_HTML } from '../shared/termsDefaults';
import {
  getCookieConsent,
  hasCookieConsentDecision,
  rejectOptionalCookies,
  saveCookieConsent,
} from '../auth/cookieConsent';

const DOCS: Array<{ id: PublicLegalDocId; label: string }> = [
  { id: 'privacy', label: 'Απόρρητο' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'breach', label: 'Παραβίαση δεδομένων' },
  { id: 'ropa', label: 'RoPA' },
  { id: 'payment', label: 'Πληρωμές' },
  { id: 'terms', label: 'Όροι' },
];

function resolveDoc(raw: string | undefined): PublicLegalDocId {
  const id = (raw || 'privacy') as PublicLegalDocId;
  return DOCS.some((d) => d.id === id) ? id : 'privacy';
}

export function PublicLegalPage() {
  const { doc: raw } = useParams();
  const doc = resolveDoc(raw);
  const html = getPublicLegalHtml(doc, DEFAULT_TERMS_OF_USE_HTML);
  const consent = getCookieConsent();

  return (
    <div className="legal-page">
      <nav className="legal-page-nav" aria-label="Νομικά έγγραφα">
        <Link to="/login">Σύνδεση</Link>
        {DOCS.map((item) => (
          <Link
            key={item.id}
            to={`/legal/${item.id}`}
            aria-current={item.id === doc ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <article className="legal-doc" dangerouslySetInnerHTML={{ __html: html }} />

      {doc === 'cookies' ? (
        <div className="panel" style={{ marginTop: '1.25rem', padding: '1rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Οι επιλογές σας</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {hasCookieConsentDecision()
              ? `Analytics: ${consent?.analytics ? 'Ναι' : 'Όχι'} · Marketing: ${
                  consent?.marketing ? 'Ναι' : 'Όχι'
                } · Ενημέρωση: ${consent?.updatedAt ?? '—'}`
              : 'Δεν έχετε ακόμη αποφασίσει.'}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="consent-btn consent-btn-accept"
              onClick={() =>
                saveCookieConsent({ analytics: true, marketing: true, source: 'accept_all' })
              }
            >
              Αποδοχή όλων
            </button>
            <button
              type="button"
              className="consent-btn consent-btn-reject"
              onClick={() => rejectOptionalCookies()}
            >
              Απόρριψη προαιρετικών
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
