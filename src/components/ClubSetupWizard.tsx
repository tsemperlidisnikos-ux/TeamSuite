import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Circle, ListChecks } from 'lucide-react';
import * as publicClubCloudService from '../api/services/publicClubCloudService';
import * as clubUsersService from '../api/services/clubUsersService';
import { upsertCloudUser } from '../api/services/accountSyncService';
import { saveClassForm } from './ClassFormModal';
import { ClubEurobankPanel } from './ClubEurobankPanel';
import { ClubStripePanel } from './ClubStripePanel';
import { ClubVivaPanel } from './ClubVivaPanel';
import { Button } from './ui/Button';
import { getSession } from '../auth/auth';
import {
  acceptClubDpa,
  clubAllowsOnlineProvider,
  getClubById,
  getClubPublicRegistration,
  updateClubProfile,
  updateClubPublicRegistration,
} from '../auth/clubs';
import {
  CLUB_SETUP_STEPS,
  canManageClubSetup,
  getClubSetupProgress,
  getClubSetupState,
  setClubSetupDismissed,
  shouldOfferClubSetup,
  skipClubSetupStep,
  type ClubSetupStepId,
} from '../auth/clubSetupWizard';
import { useAppData } from '../hooks/useAppData';
import type { ClassInput } from '../schemas';
import { getActiveSeason, seasonDisplayName } from '../utils/clubSeasons';
import { activeClubSportSelectOptions } from '../utils/clubSports';

type Props = {
  clubId: string;
  forceOpen?: boolean;
  onOpenTab: (tab: string) => void;
  onClubChanged: () => void;
};

function emptyClassForm(seasonId: string | null, startDate: string, endDate: string): ClassInput {
  return {
    name: '',
    sport: '',
    ageGroup: '',
    coachId: null,
    maxStudents: 18,
    scheduleSummary: '',
    monthlyFee: 55,
    startDate,
    endDate,
    seasonId,
    gender: '',
    birthYearFrom: null,
    birthYearTo: null,
    manualInactive: false,
  };
}

export function ClubSetupWizard({ clubId, forceOpen = false, onOpenTab, onClubChanged }: Props) {
  const { data, refresh } = useAppData();
  const session = getSession();
  const [tick, setTick] = useState(0);
  const [step, setStep] = useState<ClubSetupStepId>('profile');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const club = getClubById(clubId);
  const progress = useMemo(
    () => getClubSetupProgress(clubId, { classCount: data.classes.length }),
    [clubId, data.classes.length, tick],
  );

  const [profile, setProfile] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
  });
  const [classForm, setClassForm] = useState<ClassInput>(() => emptyClassForm(null, '', ''));
  const [joinEnabled, setJoinEnabled] = useState(true);
  const [dpaOk, setDpaOk] = useState(false);
  const [secLast, setSecLast] = useState('');
  const [secFirst, setSecFirst] = useState('');
  const [secEmail, setSecEmail] = useState('');
  const [secPassword, setSecPassword] = useState('');

  const reloadLocal = useCallback(() => {
    setTick((n) => n + 1);
    onClubChanged();
    refresh();
  }, [onClubChanged, refresh]);

  useEffect(() => {
    const next = getClubById(clubId);
    setProfile({
      name: next?.name ?? '',
      address: next?.address ?? next?.city ?? '',
      phone: next?.phone ?? '',
      email: next?.email ?? '',
    });
    const pub = getClubPublicRegistration(clubId);
    setJoinEnabled(pub.enabled || !next?.publicRegistration);
    setDpaOk(Boolean(next?.dpaAcceptedAt));
  }, [clubId, tick]);

  useEffect(() => {
    function onClubsUpdated() {
      setTick((n) => n + 1);
    }
    window.addEventListener('academyhub-clubs-updated', onClubsUpdated);
    return () => window.removeEventListener('academyhub-clubs-updated', onClubsUpdated);
  }, []);

  useEffect(() => {
    const season = getActiveSeason(data.clubSeasons);
    setClassForm((prev) =>
      prev.name
        ? prev
        : emptyClassForm(season?.id ?? null, season?.startDate ?? '', season?.endDate ?? ''),
    );
  }, [data.clubSeasons]);

  useEffect(() => {
    if (progress.nextStep) setStep(progress.nextStep);
  }, [progress.nextStep]);

  const sportOptions = useMemo(
    () => activeClubSportSelectOptions(data.sports, { emptyLabel: '—' }),
    [data.sports],
  );

  const offer = shouldOfferClubSetup(clubId, {
    classCount: data.classes.length,
    studentCount: data.students.length,
  });
  const visible = forceOpen || offer;

  if (!canManageClubSetup() || !club) return null;

  if (!visible) {
    if (getClubSetupState(clubId).dismissed && !progress.complete) {
      return (
        <div className="club-setup-reopen">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setClubSetupDismissed(clubId, false);
              setTick((n) => n + 1);
            }}
          >
            <ListChecks size={16} /> Οδηγός πρώτης εβδομάδας
          </Button>
        </div>
      );
    }
    return null;
  }

  async function handleSaveProfile() {
    setSaving(true);
    setError('');
    setMessage('');
    const current = getClubById(clubId);
    const result = updateClubProfile(clubId, {
      name: profile.name,
      vatNumber: current?.vatNumber ?? '',
      taxOffice: current?.taxOffice ?? '',
      address: profile.address,
      foundedYear: current?.foundedYear ?? '',
      website: current?.website ?? '',
      phone: profile.phone,
      email: profile.email,
      city: profile.address,
      customChargeLabel: current?.customChargeLabel ?? '',
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία αποθήκευσης προφίλ');
      return;
    }
    setMessage('Το προφίλ αποθηκεύτηκε.');
    reloadLocal();
  }

  async function handleSaveClass() {
    setSaving(true);
    setError('');
    setMessage('');
    const result = await saveClassForm(null, classForm);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία δημιουργίας τμήματος');
      return;
    }
    setMessage(`Δημιουργήθηκε το τμήμα «${result.data?.name ?? classForm.name}».`);
    setClassForm((prev) => ({ ...prev, name: '' }));
    reloadLocal();
  }

  async function handleSaveJoin() {
    setSaving(true);
    setError('');
    setMessage('');
    if (joinEnabled && !getClubById(clubId)?.dpaAcceptedAt) {
      if (!dpaOk) {
        setSaving(false);
        setError('Απαιτείται αποδοχή DPA για δημόσια εγγραφή.');
        return;
      }
      const dpa = acceptClubDpa(clubId);
      if (!dpa.success) {
        setSaving(false);
        setError(dpa.error ?? 'Αποτυχία αποδοχής DPA');
        return;
      }
    }
    const current = getClubPublicRegistration(clubId);
    const saved = updateClubPublicRegistration(clubId, {
      ...current,
      enabled: joinEnabled,
      autoApprove: false,
      notifyEmail: current.notifyEmail ?? '',
    });
    if (!saved.success) {
      setSaving(false);
      setError(saved.error ?? 'Αποτυχία αποθήκευσης φόρμας');
      return;
    }
    const publish = await publicClubCloudService.publishPublicClubCloud(clubId);
    setSaving(false);
    if (!publish.success) {
      setMessage('Η φόρμα αποθηκεύτηκε τοπικά. Η δημοσίευση στο cloud απέτυχε — δοκιμάστε από το live.');
      setError(publish.error ?? '');
      reloadLocal();
      return;
    }
    setMessage('Η δημόσια φόρμα ενεργοποιήθηκε.');
    reloadLocal();
  }

  async function handleSaveSecretariat() {
    setSaving(true);
    setError('');
    setMessage('');
    const fullName = `${secLast.trim()} ${secFirst.trim()}`.trim();
    const result = await clubUsersService.inviteClubUser({
      clubId,
      fullName,
      email: secEmail,
      password: secPassword,
      role: 'secretariat',
      permissions: clubUsersService.defaultPermissionsForRole('secretariat'),
    });
    if (!result.success || !result.data) {
      setSaving(false);
      setError(result.error ?? 'Αποτυχία δημιουργίας χρήστη');
      return;
    }
    const cloud = await upsertCloudUser(result.data);
    setSaving(false);
    if (!cloud.success) {
      setError(cloud.error ?? 'Ο λογαριασμός αποθηκεύτηκε τοπικά, όχι στο cloud.');
      reloadLocal();
      return;
    }
    setMessage('Ο λογαριασμός γραμματείας δημιουργήθηκε.');
    setSecPassword('');
    reloadLocal();
  }

  function handleSkip(id: ClubSetupStepId) {
    skipClubSetupStep(clubId, id);
    setMessage('Το βήμα παραλείφθηκε. Μπορείτε να το ρυθμίσετε αργότερα.');
    reloadLocal();
  }

  function handleDismiss() {
    setClubSetupDismissed(clubId, true);
    reloadLocal();
  }

  const pct = Math.round((progress.doneCount / progress.total) * 100);

  return (
    <section className="club-setup-wizard panel" aria-labelledby="club-setup-title">
      <header className="club-setup-wizard-head">
        <div>
          <h2 id="club-setup-title">
            <ListChecks size={20} aria-hidden /> Οδηγός πρώτης εβδομάδας
          </h2>
          <p>
            Πέντε βήματα για να ξεκινήσει ο σύλλογος. Τα υπόλοιπα (email, SMS, GDPR, backup) μένουν
            στις προχωρημένες ρυθμίσεις.
          </p>
        </div>
        <div className="club-setup-wizard-meta">
          <strong>
            {progress.doneCount}/{progress.total}
          </strong>
          <Button type="button" variant="ghost" onClick={handleDismiss}>
            Απόκρυψη
          </Button>
        </div>
      </header>

      <div className="club-setup-bar" role="progressbar" aria-valuenow={progress.doneCount} aria-valuemin={0} aria-valuemax={progress.total}>
        <i style={{ width: `${pct}%` }} />
      </div>

      <ol className="club-setup-steps">
        {CLUB_SETUP_STEPS.map((item, index) => {
          const done = progress.done[item.id];
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`club-setup-step${step === item.id ? ' is-active' : ''}${done ? ' is-done' : ''}`}
                onClick={() => {
                  setStep(item.id);
                  setError('');
                  setMessage('');
                }}
              >
                <span className="club-setup-index" aria-hidden>
                  {done ? <Check size={14} /> : <Circle size={14} />}
                </span>
                <span>
                  <strong>
                    {index + 1}. {item.label}
                  </strong>
                  <em>{item.hint}</em>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}

      {step === 'profile' ? (
        <div className="club-setup-body">
          <p className="lede">Συμπληρώστε τα βασικά στοιχεία που φαίνονται σε αποδείξεις και στη δημόσια φόρμα.</p>
          <div className="set-grid-2">
            <label className="set-field set-field--full">
              <span>Όνομα συλλόγου</span>
              <input
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              />
            </label>
            <label className="set-field">
              <span>Έδρα / πόλη</span>
              <input
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              />
            </label>
            <label className="set-field">
              <span>Τηλέφωνο</span>
              <input
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              />
            </label>
            <label className="set-field set-field--full">
              <span>Email</span>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              />
            </label>
          </div>
          <div className="club-setup-actions">
            <Button type="button" disabled={saving} onClick={() => void handleSaveProfile()}>
              {saving ? 'Αποθήκευση…' : 'Αποθήκευση και συνέχεια'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenTab('club')}>
              Πλήρες προφίλ / λογότυπο
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'classes' ? (
        <div className="club-setup-body">
          {progress.done.classes ? (
            <p className="lede">Υπάρχει ήδη τουλάχιστον ένα τμήμα. Μπορείτε να προσθέσετε κι άλλα από Τμήματα.</p>
          ) : (
            <p className="lede">Ένα τμήμα αρκεί για να δεχτείτε αθλητές και δημόσιες αιτήσεις.</p>
          )}
          <div className="set-grid-2">
            <label className="set-field set-field--full">
              <span>Όνομα τμήματος</span>
              <input
                value={classForm.name}
                onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                placeholder="π.χ. Ακαδημία U10"
              />
            </label>
            <label className="set-field">
              <span>Άθλημα</span>
              <select
                value={classForm.sport ?? ''}
                onChange={(e) => setClassForm({ ...classForm, sport: e.target.value })}
              >
                {sportOptions.map((opt) => (
                  <option key={opt.value || 'empty'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-field">
              <span>Σεζόν</span>
              <select
                value={classForm.seasonId ?? ''}
                onChange={(e) => {
                  const seasonId = e.target.value || null;
                  const season = (data.clubSeasons ?? []).find((s) => s.id === seasonId);
                  setClassForm({
                    ...classForm,
                    seasonId,
                    startDate: season?.startDate ?? classForm.startDate,
                    endDate: season?.endDate ?? classForm.endDate,
                  });
                }}
              >
                <option value="">—</option>
                {(data.clubSeasons ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {seasonDisplayName(s)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="club-setup-actions">
            <Button type="button" disabled={saving} onClick={() => void handleSaveClass()}>
              {saving ? 'Αποθήκευση…' : 'Δημιουργία τμήματος'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => handleSkip('classes')}>
              Παράλειψη
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'publicJoin' ? (
        <div className="club-setup-body">
          <p className="lede">
            Οι γονείς συμπληρώνουν φόρμα στο <code>/join/…</code>. Η αίτηση έρχεται για έγκριση, όχι
            απευθείας στο μητρώο.
          </p>
          <label className="public-reg-check">
            <input
              type="checkbox"
              checked={joinEnabled}
              onChange={(e) => setJoinEnabled(e.target.checked)}
            />
            Ενεργοποίηση δημόσιας εγγραφής
          </label>
          <label className="public-reg-check">
            <input type="checkbox" checked={dpaOk} onChange={(e) => setDpaOk(e.target.checked)} />
            Αποδέχομαι τη συμφωνία επεξεργασίας (DPA) για τη δημόσια φόρμα
          </label>
          <div className="club-setup-actions">
            <Button type="button" disabled={saving} onClick={() => void handleSaveJoin()}>
              {saving ? 'Αποθήκευση…' : 'Αποθήκευση φόρμας'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenTab('publicRegistration')}>
              Πλήρεις επιλογές / QR
            </Button>
            <Button type="button" variant="ghost" onClick={() => handleSkip('publicJoin')}>
              Αργότερα
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'payments' ? (
        <div className="club-setup-body">
          <p className="lede">
            Αν οι γονείς πληρώνουν online, συμπληρώστε έναν πάροχο. Αν εισπράττετε μόνο μετρητά /
            κατάθεση, παραλείψτε το βήμα.
          </p>
          {clubAllowsOnlineProvider(clubId, 'viva') ? <ClubVivaPanel clubId={clubId} /> : null}
          {clubAllowsOnlineProvider(clubId, 'eurobank') ? <ClubEurobankPanel clubId={clubId} /> : null}
          {clubAllowsOnlineProvider(clubId, 'stripe') ? <ClubStripePanel clubId={clubId} /> : null}
          {!clubAllowsOnlineProvider(clubId, 'viva') &&
          !clubAllowsOnlineProvider(clubId, 'eurobank') &&
          !clubAllowsOnlineProvider(clubId, 'stripe') ? (
            <p className="form-error">
              Κανένας online πάροχος δεν έχει επιτραπεί από τον διαχειριστή πλατφόρμας. Χρησιμοποιήστε
              μετρητά ή ζητήστε ενεργοποίηση.
            </p>
          ) : null}
          <div className="club-setup-actions">
            <Button type="button" variant="secondary" onClick={() => onOpenTab('payments')}>
              Καρτέλα πληρωμών
            </Button>
            <Button type="button" variant="ghost" onClick={() => handleSkip('payments')}>
              Μόνο μετρητά — παράλειψη
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'secretariat' ? (
        <div className="club-setup-body">
          <p className="lede">
            Ο λογαριασμός σας ({session?.email}) είναι διαχειριστής. Προσθέστε γραμματεία για
            καθημερινές εγγραφές χωρίς πλήρη δικαιώματα.
          </p>
          <div className="set-grid-2">
            <label className="set-field">
              <span>Επώνυμο</span>
              <input value={secLast} onChange={(e) => setSecLast(e.target.value)} />
            </label>
            <label className="set-field">
              <span>Όνομα</span>
              <input value={secFirst} onChange={(e) => setSecFirst(e.target.value)} />
            </label>
            <label className="set-field">
              <span>Email εισόδου</span>
              <input type="email" value={secEmail} onChange={(e) => setSecEmail(e.target.value)} />
            </label>
            <label className="set-field">
              <span>Κωδικός (τουλάχιστον 6)</span>
              <input
                type="password"
                value={secPassword}
                onChange={(e) => setSecPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>
          <div className="club-setup-actions">
            <Button type="button" disabled={saving} onClick={() => void handleSaveSecretariat()}>
              {saving ? 'Αποθήκευση…' : 'Δημιουργία γραμματείας'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenTab('users')}>
              Όλοι οι χρήστες
            </Button>
            <Button type="button" variant="ghost" onClick={() => handleSkip('secretariat')}>
              Θα το κάνω αργότερα
            </Button>
          </div>
        </div>
      ) : null}

      {progress.complete ? (
        <p className="settings-success">Η πρώτη εβδομάδα ολοκληρώθηκε. Μπορείτε να αποκρύψετε τον οδηγό.</p>
      ) : null}
    </section>
  );
}

export function ClubSetupBanner({
  clubId,
  classCount,
  studentCount,
}: {
  clubId: string;
  classCount: number;
  studentCount: number;
}) {
  if (!shouldOfferClubSetup(clubId, { classCount, studentCount })) return null;
  const progress = getClubSetupProgress(clubId, { classCount });
  const next = CLUB_SETUP_STEPS.find((s) => s.id === progress.nextStep);
  return (
    <Link className="ops-alert-banner club-setup-banner" to="/settings?setup=1">
      <span>
        <ListChecks size={16} aria-hidden /> Οδηγός πρώτης εβδομάδας: {progress.doneCount}/
        {progress.total}
        {next ? ` · επόμενο: ${next.label}` : ''}
      </span>
      <em>Άνοιγμα</em>
    </Link>
  );
}
