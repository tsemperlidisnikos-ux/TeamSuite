import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Mail,
  Plus,
  Smartphone,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { getSession } from '../auth/auth';
import { useT } from '../i18n/LocaleContext';
import {
  ensureSessionClub,
  getClubById,
  getClubSmtp,
  getClubViva,
  clubAllowsOnlineProvider,
  smtpHasStoredSecret,
  updateClubLogo,
  updateClubProfile,
} from '../auth/clubs';
import {
  periodLabel,
  resolveClubLicensePackage,
} from '../auth/licensePackages';
import { getSessionToken, updateCloudClubLogo } from '../api/services/sessionService';
import { saveClubLogoFromFile } from '../utils/clubLogoFile';
import { BackupPanel } from '../components/BackupPanel';
import { ChangePasswordPanel } from '../components/ChangePasswordPanel';
import { ClubEmailPanel } from '../components/ClubEmailPanel';
import { ClubSmsPanel } from '../components/ClubSmsPanel';
import { ClubPublicRegistrationPanel } from '../components/ClubPublicRegistrationPanel';
import { ClubUsersPanel } from '../components/ClubUsersPanel';
import { ClubVivaPanel } from '../components/ClubVivaPanel';
import { ClubStripePanel } from '../components/ClubStripePanel';
import { ClubEurobankPanel } from '../components/ClubEurobankPanel';
import { ClubSetupWizard } from '../components/ClubSetupWizard';
import { Button } from '../components/ui/Button';
import { SizeChartPanel } from '../components/SizeChartPanel';
import { ClothingPackagesPanel } from '../components/ClothingPackagesPanel';
import { DiscountReasonsPanel } from '../components/DiscountReasonsPanel';
import { ReceiptBookPanel } from '../components/ReceiptBookPanel';
import { useAppData } from '../hooks/useAppData';
import { getPreviewClubId } from '../platform/platformConfig';
import { AssociationsPage } from './AssociationsPage';
import { AmkaCompliancePanel } from './AmkaCompliancePanel';
import { FacilitiesPage } from './FacilitiesPage';
import { SeasonsPage } from './SeasonsPage';
import { SportsPage } from './SportsPage';
import { TermsOfUsePanel } from './TermsOfUsePanel';
import { remainingAthleteLicenseSeats } from '../utils/athleteLicenseCap';
import { useSearchParams } from 'react-router-dom';

type SettingsTab =
  | 'club'
  | 'users'
  | 'email'
  | 'sms'
  | 'viva'
  | 'stripe'
  | 'eurobank'
  | 'publicRegistration'
  | 'password'
  | 'associations'
  | 'facilities'
  | 'sports'
  | 'seasons'
  | 'sizes'
  | 'clothing'
  | 'discounts'
  | 'receipts'
  | 'terms'
  | 'amka'
  | 'backup';

type ClubForm = {
  name: string;
  vatNumber: string;
  taxOffice: string;
  address: string;
  foundedYear: string;
  website: string;
  phone: string;
  email: string;
  customChargeLabel: string;
};

const SETTINGS_NAV: Array<{
  title: string;
  tab?: SettingsTab;
  items: Array<{ id: SettingsTab; label: string }>;
}> = [
  {
    title: 'Προφίλ',
    tab: 'club',
    items: [
      { id: 'facilities', label: 'Γήπεδα' },
      { id: 'sports', label: 'Αθλήματα' },
      { id: 'seasons', label: 'Σεζόν' },
      { id: 'users', label: 'Χρήστες' },
      { id: 'publicRegistration', label: 'Εγγραφές' },
    ],
  },
  {
    title: 'Επικοινωνία',
    items: [
      { id: 'email', label: 'Email' },
      { id: 'sms', label: 'SMS' },
    ],
  },
  {
    title: 'Πληρωμές',
    items: [
      { id: 'viva', label: 'Viva' },
      { id: 'eurobank', label: 'Eurobank' },
      { id: 'stripe', label: 'Stripe' },
      { id: 'receipts', label: 'Αποδείξεις' },
    ],
  },
  {
    title: 'Εκτυπώσεις',
    tab: 'clothing',
    items: [],
  },
  {
    title: 'Εγκατάσταση',
    items: [
      { id: 'password', label: 'Κωδικός' },
      { id: 'associations', label: 'Σωματείο' },
      { id: 'sizes', label: 'Μεγεθολόγιο' },
      { id: 'discounts', label: 'Εκπτώσεις' },
      { id: 'terms', label: 'Όροι' },
      { id: 'amka', label: 'GDPR' },
      { id: 'backup', label: 'Backup' },
    ],
  },
];

function isSettingsTab(value: string): value is SettingsTab {
  return SETTINGS_NAV.some(
    (group) => group.tab === value || group.items.some((item) => item.id === value),
  );
}

export function SettingsPage() {
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const session = getSession();
  const clubId = getPreviewClubId() ?? session?.clubId ?? null;
  const { data } = useAppData();
  const [club, setClub] = useState(() => ensureSessionClub(session) ?? getClubById(clubId));
  const [tab, setTab] = useState<SettingsTab>(() => {
    const fromQuery = searchParams.get('tab') ?? '';
    return isSettingsTab(fromQuery) ? fromQuery : 'club';
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canManageUsers = session?.role === 'admin' || session?.role === 'platform_admin';

  const activeAthleteLicenses = data.students.filter((s) => s.status === 'active').length;
  const licenseLimit = club?.athleteLicenseLimit ?? 0;
  const licenseRemaining =
    clubId ? remainingAthleteLicenseSeats(data.students, clubId) : null;
  const licenseFull = licenseRemaining === 0;
  const licenseOver = licenseLimit > 0 && activeAthleteLicenses > licenseLimit;
  const licensePackage = club ? resolveClubLicensePackage(club) : null;
  const licensePct =
    licenseLimit > 0
      ? Math.min(100, Math.round((activeAthleteLicenses / licenseLimit) * 100))
      : 0;
  const [clubForm, setClubForm] = useState<ClubForm>({
    name: '',
    vatNumber: '',
    taxOffice: '',
    address: '',
    foundedYear: '',
    website: '',
    phone: '',
    email: '',
    customChargeLabel: '',
  });

  const refreshClub = useCallback(() => {
    const next = ensureSessionClub(getSession()) ?? getClubById(clubId);
    setClub(next);
    if (next) {
      setClubForm({
        name: next.name ?? '',
        vatNumber: next.vatNumber ?? '',
        taxOffice: next.taxOffice ?? '',
        address: next.address ?? next.city ?? '',
        foundedYear: next.foundedYear ?? '',
        website: next.website ?? '',
        phone: next.phone ?? '',
        email: next.email ?? '',
        customChargeLabel: next.customChargeLabel ?? '',
      });
    }
  }, [clubId]);

  useEffect(() => {
    const fromQuery = searchParams.get('tab') ?? '';
    if (isSettingsTab(fromQuery)) setTab(fromQuery);
  }, [searchParams]);

  useEffect(() => {
    refreshClub();
  }, [refreshClub]);

  useEffect(() => {
    const onClubsUpdated = () => refreshClub();
    window.addEventListener('academyhub-clubs-updated', onClubsUpdated);
    return () => window.removeEventListener('academyhub-clubs-updated', onClubsUpdated);
  }, [refreshClub]);

  async function readLogoFile(file: File) {
    if (!clubId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const cloud = await saveClubLogoFromFile(clubId, file);
      if (!cloud.success) throw new Error(cloud.error ?? 'Αποτυχία αποθήκευσης λογοτύπου.');
      setMessage(getSessionToken() ? 'Το λογότυπο αποθηκεύτηκε στο cloud.' : 'Το λογότυπο αποθηκεύτηκε τοπικά.');
      refreshClub();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Αποτυχία αποθήκευσης λογοτύπου.');
    } finally {
      setSaving(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void readLogoFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readLogoFile(file);
  }

  async function handleSaveAll() {
    if (!clubId) return;
    setSaving(true);
    setError('');
    setMessage('');

    const profile = updateClubProfile(clubId, {
      ...clubForm,
      city: clubForm.address,
    });
    if (!profile.success) {
      setSaving(false);
      setError(profile.error ?? 'Σφάλμα αποθήκευσης συλλόγου');
      return;
    }

    setSaving(false);
    setMessage('Τα στοιχεία συλλόγου αποθηκεύτηκαν.');
    refreshClub();
  }

  const navGroups = SETTINGS_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.id === 'users') return canManageUsers;
      if (item.id === 'viva') return clubAllowsOnlineProvider(clubId, 'viva');
      if (item.id === 'eurobank') return clubAllowsOnlineProvider(clubId, 'eurobank');
      if (item.id === 'stripe') return clubAllowsOnlineProvider(clubId, 'stripe');
      return true;
    }),
  })).filter((group) => Boolean(group.tab) || group.items.length > 0);
  const smtp = getClubSmtp(clubId);
  const viva = getClubViva(clubId);
  const smtpReady = Boolean(
    smtp.enabled || (smtp.host?.trim() && smtp.username?.trim() && smtpHasStoredSecret(smtp)),
  );
  const vivaReady = Boolean(viva.clientId?.trim() && (viva.clientSecret?.trim() || viva.merchantId?.trim()));

  return (
    <div className="set-page">
      <header className="set-page-head">
        <h1>{t('Ρυθμίσεις')}</h1>
      </header>

      <div className="set-body">
      <nav className="set-nav" aria-label={t('Κατηγορίες ρυθμίσεων')}>
        <p className="set-nav-kicker">{t('Ρυθμίσεις')}</p>
        {navGroups.map((group) => (
          <div key={group.title} className="set-nav-group">
            {group.tab ? (
              <button
                type="button"
                role="tab"
                aria-selected={tab === group.tab}
                className={`set-nav-group-title${tab === group.tab ? ' is-active' : ''}`}
                onClick={() => setTab(group.tab!)}
              >
                {t(group.title)}
              </button>
            ) : (
              <p className="set-nav-group-title">{t(group.title)}</p>
            )}
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? 'is-active' : ''}
                onClick={() => setTab(item.id)}
              >
                {t(item.label)}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="set-main">
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}

      {tab === 'club' && clubId ? (
        <ClubSetupWizard
          clubId={clubId}
          onOpenTab={(next) => {
            if (isSettingsTab(next)) setTab(next);
          }}
          onClubChanged={refreshClub}
        />
      ) : null}

      {tab === 'club' ? (
        !clubId || !club ? (
          <p className="form-error">Δεν βρέθηκε σύλλογος για τον λογαριασμό.</p>
        ) : (
          <div className="set-club-layout">
            <section className="set-license-hero">
              <div className="set-license-strip">
                <div className="set-license-copy">
                  <span>Άδειες αθλητών</span>
                  <strong>{licensePackage?.name ?? 'Χωρίς πακέτο'}</strong>
                  <em>
                    {licensePackage
                      ? `${periodLabel(licensePackage.periodMonths)} · ${licensePackage.athleteLicenses} άδειες`
                      : 'Το όριο ορίζεται από τον διαχειριστή πλατφόρμας'}
                    {club.usageEndsOn
                      ? ` · έως ${new Date(`${club.usageEndsOn}T00:00:00`).toLocaleDateString('el-GR')}`
                      : ''}
                  </em>
                </div>
                <div className="set-license-meter">
                  <div className="set-license-usage">
                    <strong>
                      {activeAthleteLicenses}/{licenseLimit || '—'}
                    </strong>
                    <em>ενεργές άδειες</em>
                  </div>
                  {licenseLimit > 0 ? (
                    <div
                      className="set-license-bar"
                      role="progressbar"
                      aria-valuenow={activeAthleteLicenses}
                      aria-valuemin={0}
                      aria-valuemax={licenseLimit}
                    >
                      <i style={{ width: `${licensePct}%` }} />
                    </div>
                  ) : null}
                </div>
              </div>
              {licenseOver ? (
                <p className="set-license-notice set-license-notice--over" role="status">
                  Οι ενεργοί αθλητές ({activeAthleteLicenses}) ξεπερνούν το πακέτο ({licenseLimit}).
                  Δεν μπορείτε να προσθέσετε νέους ενεργούς μέχρι ο διαχειριστής πλατφόρμας να αυξήσει
                  τις άδειες. Οι υπάρχοντες αθλητές δεν διαγράφονται.
                </p>
              ) : licenseFull ? (
                <p className="set-license-notice set-license-notice--full" role="status">
                  Το πακέτο αδειών είναι γεμάτο ({activeAthleteLicenses} / {licenseLimit} ενεργοί).
                  Ζητήστε αύξηση πακέτου από τον διαχειριστή πλατφόρμας για να προσθέσετε νέους
                  ενεργούς αθλητές. Μπορείτε ακόμα να ενημερώνετε υπάρχοντες ή να προσθέτετε
                  δοκιμαστικούς / ανενεργούς.
                </p>
              ) : null}
            </section>

            <section className="set-card panel set-identity-card">
              <div className="set-identity">
                <div className="set-identity-logo">
                  <h2>Λογότυπο</h2>
                  <p className="set-card-lede">PNG, JPG ή SVG · 512×512px</p>

              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={handleFileChange}
              />
              {club.logoUrl ? (
                <div className="set-logo-current">
                  <img src={club.logoUrl} alt={`Logo ${club.name}`} />
                  <div className="set-logo-current-actions">
                    <Button type="button" disabled={saving} onClick={() => fileRef.current?.click()}>
                      Αλλαγή
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={saving}
                      onClick={() => {
                        if (!confirm('Αφαίρεση λογότυπου;')) return;
                        void (async () => {
                          setSaving(true);
                          setError('');
                          try {
                            if (getSessionToken()) {
                              const cloud = await updateCloudClubLogo(clubId, null);
                              if (!cloud.success) {
                                throw new Error(cloud.error ?? 'Αποτυχία αφαίρεσης στο cloud.');
                              }
                            }
                            updateClubLogo(clubId, null);
                            refreshClub();
                            setMessage('Το λογότυπο αφαιρέθηκε.');
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Αποτυχία αφαίρεσης λογοτύπου.');
                          } finally {
                            setSaving(false);
                          }
                        })();
                      }}
                    >
                      Αφαίρεση
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={`set-logo-drop${dragOver ? ' is-drag' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                      <Plus size={22} />
                      <strong>Προσθήκη λογοτύπου</strong>
                      <span>Κλικ ή σύρετε αρχείο</span>
                    </div>
                  )}
                </div>

                <div className="set-identity-form">
                  <h2>Στοιχεία συλλόγου</h2>
              <div className="set-grid-2">
                <label className="set-field set-field--full">
                  <span>Όνομα</span>
                  <input
                    value={clubForm.name}
                    onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })}
                  />
                </label>
                <label className="set-field">
                  <span>Α.Φ.Μ.</span>
                  <input
                    value={clubForm.vatNumber}
                    onChange={(e) => setClubForm({ ...clubForm, vatNumber: e.target.value })}
                  />
                </label>
                <label className="set-field">
                  <span>Δ.Ο.Υ.</span>
                  <input
                    value={clubForm.taxOffice}
                    onChange={(e) => setClubForm({ ...clubForm, taxOffice: e.target.value })}
                  />
                </label>
                <label className="set-field">
                  <span>Έδρα</span>
                  <input
                    value={clubForm.address}
                    onChange={(e) => setClubForm({ ...clubForm, address: e.target.value })}
                  />
                </label>
                <label className="set-field">
                  <span>Έτος Ίδρυσης</span>
                  <input
                    value={clubForm.foundedYear}
                    onChange={(e) => setClubForm({ ...clubForm, foundedYear: e.target.value })}
                  />
                </label>
                <label className="set-field">
                  <span>Ιστοσελίδα</span>
                  <input
                    value={clubForm.website}
                    onChange={(e) => setClubForm({ ...clubForm, website: e.target.value })}
                    placeholder="https://"
                  />
                </label>
                <label className="set-field">
                  <span>Τηλέφωνο</span>
                  <input
                    value={clubForm.phone}
                    onChange={(e) => setClubForm({ ...clubForm, phone: e.target.value })}
                  />
                </label>
                <label className="set-field set-field--full">
                  <span>Email</span>
                  <input
                    type="email"
                    value={clubForm.email}
                    onChange={(e) => setClubForm({ ...clubForm, email: e.target.value })}
                  />
                </label>
                <label className="set-field set-field--full">
                  <span>Τίτλος προσαρμοσμένης χρέωσης</span>
                  <input
                    value={clubForm.customChargeLabel}
                    onChange={(e) =>
                      setClubForm({ ...clubForm, customChargeLabel: e.target.value })
                    }
                    placeholder="π.χ. Στολή"
                  />
                  <span className="settings-hint">
                    Εμφανίζεται στο προφίλ αθλητή μετά την «Χρέωση μήνα».
                  </span>
                </label>
              </div>
                  <div className="set-identity-actions">
                    <Button type="button" disabled={saving} onClick={() => void handleSaveAll()}>
                      {saving ? 'Αποθήκευση…' : 'Αποθήκευση στοιχείων'}
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <div className="set-connect-grid">
              <button type="button" className="set-connect-card" onClick={() => setTab('email')}>
                <Mail size={18} />
                <span>
                  <strong>Email / SMTP</strong>
                  <em className={smtpReady ? 'is-on' : ''}>
                    {smtpReady ? 'Συνδεδεμένο' : 'Δεν έχει ρυθμιστεί'}
                  </em>
                </span>
                <b>Άνοιγμα ρυθμίσεων</b>
              </button>
              <button type="button" className="set-connect-card" onClick={() => setTab('sms')}>
                <Smartphone size={18} />
                <span>
                  <strong>SMS</strong>
                  <em>Ρύθμιση στο tab SMS</em>
                </span>
                <b>Άνοιγμα ρυθμίσεων</b>
              </button>
              {clubAllowsOnlineProvider(clubId, 'viva') ? (
                <button type="button" className="set-connect-card" onClick={() => setTab('viva')}>
                  <Wallet size={18} />
                  <span>
                    <strong>Viva Wallet</strong>
                    <em className={vivaReady ? 'is-on' : ''}>
                      {vivaReady ? 'Συνδεδεμένο' : 'Δεν έχει ρυθμιστεί'}
                    </em>
                  </span>
                  <b>Άνοιγμα ρυθμίσεων</b>
                </button>
              ) : null}
            </div>
          </div>
        )
      ) : null}

      {tab === 'users' && clubId ? <ClubUsersPanel clubId={clubId} mode="users" /> : null}
      {tab === 'email' && clubId ? <ClubEmailPanel clubId={clubId} /> : null}
      {tab === 'sms' && clubId ? <ClubSmsPanel clubId={clubId} /> : null}
      {tab === 'viva' && clubId ? <ClubVivaPanel clubId={clubId} /> : null}
      {tab === 'eurobank' && clubId ? <ClubEurobankPanel clubId={clubId} /> : null}
      {tab === 'stripe' && clubId ? <ClubStripePanel clubId={clubId} /> : null}
      {tab === 'publicRegistration' && clubId ? (
        <div className="set-embed">
          <div className="set-embed-head">
            <UserPlus size={18} />
            <h2>Δημόσια εγγραφή</h2>
          </div>
          <ClubPublicRegistrationPanel clubId={clubId} onOpenGdpr={() => setTab('amka')} />
        </div>
      ) : null}
      {tab === 'password' ? <ChangePasswordPanel /> : null}
      {tab === 'associations' ? <AssociationsPage /> : null}
      {tab === 'facilities' ? <FacilitiesPage /> : null}
      {tab === 'sports' ? <SportsPage /> : null}
      {tab === 'seasons' ? <SeasonsPage /> : null}
      {tab === 'sizes' ? <SizeChartPanel /> : null}
      {tab === 'clothing' ? <ClothingPackagesPanel /> : null}
      {tab === 'discounts' ? <DiscountReasonsPanel /> : null}
      {tab === 'receipts' ? <ReceiptBookPanel /> : null}
      {tab === 'terms' ? <TermsOfUsePanel /> : null}
      {tab === 'amka' ? <AmkaCompliancePanel /> : null}
      {tab === 'backup' ? <BackupPanel /> : null}
      </div>
      </div>
    </div>
  );
}
