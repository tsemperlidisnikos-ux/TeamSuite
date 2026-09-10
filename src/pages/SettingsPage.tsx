import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Building2,
  CalendarRange,
  Database,
  FileText,
  KeyRound,
  MessageSquare,
  Percent,
  Plus,
  Receipt,
  Ruler,
  ShieldCheck,
  Shirt,
  Trophy,
  UserPlus,
} from 'lucide-react';
import { getSession } from '../auth/auth';
import { useT } from '../i18n/LocaleContext';
import {
  ensureSessionClub,
  getClubById,
  clubAllowsOnlineProvider,
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
  | 'payments'
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

const PRIMARY_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'club', label: 'Σύλλογος' },
  { id: 'users', label: 'Χρήστες' },
  { id: 'publicRegistration', label: 'Δημόσια εγγραφή' },
  { id: 'payments', label: 'Πληρωμές' },
];

const MORE_TABS: Array<{ id: SettingsTab; label: string; icon: typeof KeyRound }> = [
  { id: 'facilities', label: 'Γήπεδο', icon: Building2 },
  { id: 'email', label: 'Email', icon: FileText },
  { id: 'sms', label: 'SMS', icon: MessageSquare },
  { id: 'password', label: 'Κωδικός', icon: KeyRound },
  { id: 'associations', label: 'Σωματείο', icon: Building2 },
  { id: 'sports', label: 'Άθλημα', icon: Trophy },
  { id: 'seasons', label: 'Σεζόν', icon: CalendarRange },
  { id: 'sizes', label: 'Μεγεθολόγιο', icon: Ruler },
  { id: 'clothing', label: 'Πακέτο ρουχισμού', icon: Shirt },
  { id: 'discounts', label: 'Λόγοι έκπτωσης', icon: Percent },
  { id: 'receipts', label: 'Αποδείξεις', icon: Receipt },
  { id: 'terms', label: 'Όροι', icon: FileText },
  { id: 'amka', label: 'GDPR', icon: ShieldCheck },
  { id: 'backup', label: 'Backup', icon: Database },
];

const PAYMENT_TABS: SettingsTab[] = ['payments', 'viva', 'stripe', 'eurobank'];

function isSettingsTab(value: string): value is SettingsTab {
  return (
    PRIMARY_TABS.some((item) => item.id === value) ||
    MORE_TABS.some((item) => item.id === value) ||
    (PAYMENT_TABS as string[]).includes(value)
  );
}

function navTabFor(tab: SettingsTab): SettingsTab {
  return PAYMENT_TABS.includes(tab) ? 'payments' : tab;
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
  const [advancedUserOpen, setAdvancedUserOpen] = useState(() =>
    MORE_TABS.some((item) => item.id === (searchParams.get('tab') ?? '')),
  );
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
    setMessage('Οι ρυθμίσεις συλλόγου αποθηκεύτηκαν.');
    refreshClub();
  }

  const tabs = PRIMARY_TABS.filter((item) => (item.id === 'users' ? canManageUsers : true));
  const navTab = navTabFor(tab);

  useEffect(() => {
    if (MORE_TABS.some((item) => item.id === tab)) setAdvancedUserOpen(true);
  }, [tab]);

  return (
    <div className="set-page">
      <header className="set-page-head">
        <h1>{t('Ρυθμίσεις')}</h1>
        <p className="set-page-lede">
          Τα βασικά για να λειτουργήσει ο σύλλογος είναι εδώ. Email, SMS, GDPR και backup βρίσκονται
          στα προχωρημένα.
        </p>
      </header>

      <nav className="set-tabs" aria-label={t('Κατηγορίες ρυθμίσεων')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={navTab === item.id ? 'is-active' : ''}
            onClick={() => setTab(item.id)}
          >
            {t(item.label)}
          </button>
        ))}
      </nav>
      <details
        className="set-tabs-advanced"
        open={advancedUserOpen}
        onToggle={(event) => setAdvancedUserOpen(event.currentTarget.open)}
      >
        <summary>{t('Για προχωρημένους')}</summary>
        <div className="set-tabs-more">
          {MORE_TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? 'is-active' : ''}
                onClick={() => setTab(item.id)}
                title={t(item.label)}
              >
                <Icon size={14} />
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </div>
      </details>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}

      {tab === 'club' ? (
        !clubId || !club ? (
          <p className="form-error">Δεν βρέθηκε σύλλογος για τον λογαριασμό.</p>
        ) : (
          <div className="set-club-layout">
            <section className="set-card panel set-license-card">
              <h2>Συνδρομή &amp; άδειες αθλητών</h2>
              <p className="set-card-lede">
                Όριο αδειών σύμφωνα με το πακέτο συνδρομής του συλλόγου.
              </p>
              <div className="set-license-grid">
                <div className="set-license-stat">
                  <span>Πακέτο</span>
                  <strong>{licensePackage?.name ?? 'Χωρίς πακέτο'}</strong>
                  {licensePackage ? (
                    <em>
                      {periodLabel(licensePackage.periodMonths)} ·{' '}
                      {licensePackage.athleteLicenses} άδειες · €
                      {licensePackage.price.toLocaleString('el-GR', {
                        minimumFractionDigits: 2,
                      })}{' '}
                      +ΦΠΑ
                    </em>
                  ) : (
                    <em>Το όριο ορίζεται από τον διαχειριστή πλατφόρμας.</em>
                  )}
                  <em>
                    {club.usageEndsOn
                      ? `Λογαριασμός ενεργός έως ${new Date(`${club.usageEndsOn}T00:00:00`).toLocaleDateString('el-GR')}`
                      : 'Λογαριασμός χωρίς ημερομηνία λήξης'}
                  </em>
                </div>
                <div className="set-license-stat">
                  <span>Χρήση αδειών</span>
                  <strong>
                    {activeAthleteLicenses} / {licenseLimit || '—'}
                  </strong>
                  <em>
                    {licenseLimit > 0
                      ? `${licensePct}% πληρότητα · ενεργοί αθλητές`
                      : 'Δεν έχει οριστεί όριο αδειών'}
                  </em>
                </div>
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

            <section className="set-card panel">
              <h2>Λογότυπο Συλλόγου</h2>
              <p className="set-card-lede">
                Ανεβάστε το λογότυπο του συλλόγου. Προτεινόμενη διάσταση: 512×512px.
              </p>
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
                  <Plus size={28} />
                  <strong>Κάντε κλικ για επιλογή αρχείου ή σύρετε το αρχείο εδώ</strong>
                  <span>PNG, JPG ή SVG (μέγ. 2MB)</span>
                </div>
              )}
            </section>

            <section className="set-card panel">
              <h2>Στοιχεία Συλλόγου</h2>
              <div className="set-grid-2">
                <label className="set-field set-field--full">
                  <span>Όνομα Συλλόγου</span>
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
                    Εμφανίζεται στο προφίλ αθλητή (Ναι/Όχι) μετά την «Χρέωση μήνα» και στη
                    δημιουργία χρεώσεων.
                  </span>
                </label>
              </div>
            </section>

            <div className="set-save-bar">
              <Button type="button" disabled={saving} onClick={() => void handleSaveAll()}>
                {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
              </Button>
            </div>
          </div>
        )
      ) : null}

      {tab === 'users' && clubId ? <ClubUsersPanel clubId={clubId} mode="users" /> : null}
      {tab === 'email' && clubId ? <ClubEmailPanel clubId={clubId} /> : null}
      {tab === 'sms' && clubId ? <ClubSmsPanel clubId={clubId} /> : null}
      {PAYMENT_TABS.includes(tab) && clubId ? (
        <div className="set-embed stack-lg">
          <div className="set-embed-head">
            <h2>Online πληρωμές</h2>
          </div>
          <p className="lede">
            Οι γονείς βλέπουν μόνο τους παρόχους που έχει επιτρέψει ο διαχειριστής πλατφόρμας.
            Email και SMS ρυθμίζονται στα προχωρημένα.
          </p>
          {(tab === 'payments' || tab === 'viva') && clubAllowsOnlineProvider(clubId, 'viva') ? (
            <ClubVivaPanel clubId={clubId} />
          ) : null}
          {(tab === 'payments' || tab === 'eurobank') &&
          clubAllowsOnlineProvider(clubId, 'eurobank') ? (
            <ClubEurobankPanel clubId={clubId} />
          ) : null}
          {(tab === 'payments' || tab === 'stripe') && clubAllowsOnlineProvider(clubId, 'stripe') ? (
            <ClubStripePanel clubId={clubId} />
          ) : null}
        </div>
      ) : null}
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
  );
}
