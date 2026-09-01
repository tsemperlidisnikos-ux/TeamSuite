import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import * as clubUsersService from '../api/services/clubUsersService';
import {
  removeCloudUser,
  upsertCloudUser,
} from '../api/services/accountSyncService';
import { getSession, getUsers, type AppUser } from '../auth/auth';
import { useAppData } from '../hooks/useAppData';
import { Button } from './ui/Button';
import { SettingsFormRow } from './ui/SettingsFormRow';
import {
  CLUB_PERMISSION_LABELS,
  CLUB_PERMISSIONS,
  CLUB_ROLE_LABELS,
  CLUB_ROLES,
  DOCTOR_CLUB_PERMISSIONS,
  getEffectiveClubPermissions,
  type ClubPermission,
  type ClubRole,
} from '../platform/platformConfig';

type ClubUsersPanelProps = {
  clubId: string;
  mode?: 'users' | 'invitations';
};

export function ClubUsersPanel({ clubId, mode = 'users' }: ClubUsersPanelProps) {
  const session = getSession();
  const { data: appData, refresh: refreshAppData } = useAppData();
  const formRef = useRef<HTMLFormElement>(null);
  const isInvitations = mode === 'invitations';
  const [users, setUsers] = useState<AppUser[]>([]);
  const [directory, setDirectory] = useState<clubUsersService.ClubDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [searchLastName, setSearchLastName] = useState('');
  const [searchFirstName, setSearchFirstName] = useState('');
  const [searchRole, setSearchRole] = useState('');

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ClubRole>('coach');
  const [athleteId, setAthleteId] = useState('');
  const [coachId, setCoachId] = useState('');
  const [permissions, setPermissions] = useState<ClubPermission[]>(() =>
    clubUsersService.defaultPermissionsForRole('coach'),
  );
  const [financeOwnEntriesOnly, setFinanceOwnEntriesOnly] = useState(false);
  const [creating, setCreating] = useState(true);
  const [creatingFromRow, setCreatingFromRow] = useState(false);

  const editingUser = useMemo(
    () => users.find((u) => u.id === editingId) ?? null,
    [users, editingId],
  );
  const isEditMode = Boolean(editingId) || creatingFromRow;
  const passwordRequired = !editingId;

  const showForm = true;

  const roleOptions = useMemo(() => {
    const labels = new Set(directory.map((row) => row.roleLabel));
    return [...labels].sort((a, b) => a.localeCompare(b, 'el'));
  }, [directory]);

  const filteredDirectory = useMemo(() => {
    const lastQ = searchLastName.trim().toLowerCase();
    const firstQ = searchFirstName.trim().toLowerCase();
    const roleQ = searchRole.trim().toLowerCase();

    return directory.filter((row) => {
      const parts = row.fullName.trim().split(/\s+/).filter(Boolean);
      const lastName = (parts[0] ?? '').toLowerCase();
      const firstName = parts.slice(1).join(' ').toLowerCase();

      if (lastQ && !lastName.includes(lastQ) && !row.fullName.toLowerCase().includes(lastQ)) {
        return false;
      }
      if (firstQ && !firstName.includes(firstQ) && !row.fullName.toLowerCase().includes(firstQ)) {
        return false;
      }
      if (roleQ && !row.roleLabel.toLowerCase().includes(roleQ)) {
        return false;
      }
      return true;
    });
  }, [directory, searchLastName, searchFirstName, searchRole]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [usersResult, directoryResult] = await Promise.all([
      clubUsersService.listClubUsers(clubId),
      clubUsersService.listClubDirectory(clubId),
    ]);
    setLoading(false);
    if (!usersResult.success) {
      setError(usersResult.error ?? 'Αποτυχία φόρτωσης');
      return;
    }
    if (!directoryResult.success) {
      setError(directoryResult.error ?? 'Αποτυχία φόρτωσης μητρώου');
      return;
    }
    setUsers(usersResult.data ?? []);
    setDirectory(directoryResult.data ?? []);
  }, [clubId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (isInvitations) {
      resetForm();
      setError('');
      setMessage('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when switching to invitations tab
  }, [isInvitations]);

  const athleteOptions = useMemo(
    () =>
      [...(appData.students ?? [])]
        .filter((s) => s.status !== 'inactive')
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
        ),
    [appData.students],
  );

  const coachOptions = useMemo(
    () =>
      [...(appData.coaches ?? [])]
        .filter((c) => c.active)
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'el'),
        ),
    [appData.coaches],
  );

  function applyRoleDefaults(nextRole: ClubRole) {
    setRole(nextRole);
    setPermissions(clubUsersService.defaultPermissionsForRole(nextRole));
    if (nextRole !== 'athlete') setAthleteId('');
    if (nextRole !== 'coach') setCoachId('');
    if (nextRole === 'admin' || nextRole === 'doctor') setFinanceOwnEntriesOnly(false);
  }

  function togglePermission(permission: ClubPermission) {
    if (role === 'doctor' || role === 'admin') return;
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission],
    );
  }

  function scrollToUserForm() {
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function roleFromDirectoryRow(row: clubUsersService.ClubDirectoryRow): ClubRole {
    if (row.kind === 'athlete') return 'athlete';
    if (row.kind === 'coach') return 'coach';
    if (row.roleLabel === CLUB_ROLE_LABELS.admin) return 'admin';
    if (row.roleLabel === CLUB_ROLE_LABELS.secretariat) return 'secretariat';
    if (row.roleLabel === CLUB_ROLE_LABELS.doctor) return 'doctor';
    if (row.roleLabel === CLUB_ROLE_LABELS.staff) return 'staff';
    if (row.roleLabel === CLUB_ROLE_LABELS.parent) return 'parent';
    return 'coach';
  }

  function composedFullName(): string {
    return `${lastName.trim()} ${firstName.trim()}`.trim();
  }

  function splitFullName(value: string): { lastName: string; firstName: string } {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { lastName: '', firstName: '' };
    if (parts.length === 1) return { lastName: parts[0], firstName: '' };
    return { lastName: parts[0], firstName: parts.slice(1).join(' ') };
  }

  function resetForm() {
    setEditingId(null);
    setCreating(true);
    setLastName('');
    setFirstName('');
    setEmail('');
    setPassword('');
    setAthleteId('');
    setCoachId('');
    applyRoleDefaults('coach');
    setFinanceOwnEntriesOnly(false);
    setCreatingFromRow(false);
  }

  function startCreate() {
    setEditingId(null);
    setCreating(true);
    setCreatingFromRow(false);
    setLastName('');
    setFirstName('');
    setEmail('');
    setPassword('');
    setAthleteId('');
    setCoachId('');
    applyRoleDefaults('coach');
    setFinanceOwnEntriesOnly(false);
    setError('');
    setMessage('');
  }

  function startEdit(user: AppUser) {
    setCreating(false);
    setCreatingFromRow(true);
    setEditingId(user.id);
    const split = splitFullName(user.fullName);
    setLastName(split.lastName);
    setFirstName(split.firstName);
    setEmail(user.email);
    setPassword('');
    const nextRole = (CLUB_ROLES as readonly string[]).includes(user.role)
      ? (user.role as ClubRole)
      : 'coach';
    setRole(nextRole);
    setAthleteId(user.athleteId ?? '');
    setCoachId(user.coachId ?? '');
    setPermissions(
      nextRole === 'doctor'
        ? [...DOCTOR_CLUB_PERMISSIONS]
        : (getEffectiveClubPermissions(user).filter((p) =>
            (CLUB_PERMISSIONS as readonly string[]).includes(p),
          ) as ClubPermission[]),
    );
    setFinanceOwnEntriesOnly(
      nextRole !== 'admin' && nextRole !== 'doctor' && Boolean(user.financeOwnEntriesOnly),
    );
    setError('');
    setMessage('');
    scrollToUserForm();
  }

  async function syncUserToCloud(user: AppUser): Promise<string | null> {
    const pushed = await upsertCloudUser(user);
    if (!pushed.success) {
      return (
        pushed.error ??
        'Ο λογαριασμός αποθηκεύτηκε τοπικά, αλλά όχι στο cloud.'
      );
    }
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');

    const fullName = composedFullName();
    if (!lastName.trim() || !firstName.trim()) {
      setError('Συμπληρώστε επώνυμο και όνομα.');
      return;
    }

    const passwordValue = password.trim();
    if (!editingId && passwordValue.length < 6) {
      setError('Ο κωδικός εισόδου πρέπει να έχει τουλάχιστον 6 χαρακτήρες.');
      return;
    }
    if (editingId && passwordValue && passwordValue.length < 6) {
      setError('Ο κωδικός εισόδου πρέπει να έχει τουλάχιστον 6 χαρακτήρες.');
      return;
    }
    if (!email.trim().includes('@')) {
      setError('Απαιτείται μοναδικό email για σύνδεση (κάθε αθλητής δικό του email).');
      return;
    }

    const savedPermissions =
      role === 'doctor'
        ? [...DOCTOR_CLUB_PERMISSIONS]
        : role === 'admin'
          ? [...CLUB_PERMISSIONS]
          : permissions;

    if (editingId) {
      const result = await clubUsersService.updateClubUser(clubId, editingId, {
        fullName,
        role,
        permissions: savedPermissions,
        password: passwordValue || undefined,
        athleteId: role === 'athlete' ? athleteId || null : null,
        coachId: role === 'coach' ? coachId || null : null,
        financeOwnEntriesOnly,
      });
      if (!result.success || !result.data) {
        setError(result.error ?? 'Αποτυχία ενημέρωσης');
        return;
      }
      const pushError = await syncUserToCloud(result.data);
      if (pushError) {
        setError(pushError);
        await refresh();
        return;
      }
      setMessage(
        passwordValue
          ? 'Ο χρήστης αποθηκεύτηκε στο cloud. Ο νέος κωδικός είναι έτοιμος για σύνδεση.'
          : 'Ο χρήστης αποθηκεύτηκε στο cloud.',
      );
      resetForm();
      await refresh();
      return;
    }

    const result = await clubUsersService.inviteClubUser({
      clubId,
      fullName,
      email,
      password: passwordValue,
      role,
      permissions: savedPermissions,
      athleteId: role === 'athlete' ? athleteId || null : null,
      coachId: role === 'coach' ? coachId || null : null,
      financeOwnEntriesOnly,
    });
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία πρόσκλησης');
      return;
    }
    const pushError = result.data ? await syncUserToCloud(result.data) : 'Αποτυχία αποθήκευσης χρήστη';
    if (pushError) {
      setError(pushError);
      await refresh();
      return;
    }
    setMessage(
      `Αποθηκεύτηκε στο cloud: ${result.data?.email}. Σύνδεση με το email και τον κωδικό που ορίσατε.`,
    );
    resetForm();
    await refresh();
  }

  function handleEdit(row: clubUsersService.ClubDirectoryRow) {
    const loginUser = row.userId ? users.find((u) => u.id === row.userId) : undefined;
    if (loginUser) {
      startEdit(loginUser);
      return;
    }

    const split = splitFullName(row.fullName);
    const nextRole = roleFromDirectoryRow(row);
    setEditingId(null);
    setCreating(true);
    setCreatingFromRow(true);
    setLastName(split.lastName);
    setFirstName(split.firstName);
    setEmail(row.email.includes('@') ? row.email : '');
    setPassword('');
    applyRoleDefaults(nextRole);
    setAthleteId(row.kind === 'athlete' ? row.entityId ?? '' : '');
    setCoachId(row.kind === 'coach' ? row.entityId ?? '' : '');
    setFinanceOwnEntriesOnly(false);
    setError('');
    setMessage('');
    scrollToUserForm();
  }

  async function handleDelete(row: clubUsersService.ClubDirectoryRow) {
    if (!confirm(`Διαγραφή «${row.fullName}»;`)) return;
    setError('');
    const result = await clubUsersService.removeClubDirectoryMember(clubId, row);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία διαγραφής');
      return;
    }
    if (row.userId && editingId === row.userId) resetForm();
    if (row.userId) {
      const cloud = await removeCloudUser(row.userId);
      if (!cloud.success) {
        setError(
          cloud.error ??
            'Διαγράφηκε τοπικά, αλλά όχι στο cloud. Δοκιμάστε ξανά.',
        );
        await refresh();
        return;
      }
    }
    setMessage('Η εγγραφή διαγράφηκε.');
    refreshAppData();
    await refresh();
  }

  async function handleToggleActive(row: clubUsersService.ClubDirectoryRow) {
    setError('');
    setMessage('');
    setTogglingId(row.id);
    const nextActive = !row.active;
    const result = await clubUsersService.setClubMemberActive(clubId, row, nextActive);
    setTogglingId(null);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία αλλαγής κατάστασης');
      return;
    }
    if (row.userId) {
      const user = getUsers().find((item) => item.id === row.userId);
      if (user) {
        const cloud = await upsertCloudUser(user);
        if (!cloud.success) {
          setError(
            cloud.error ??
              'Η κατάσταση άλλαξε τοπικά, αλλά όχι στο cloud. Δοκιμάστε ξανά.',
          );
          await refresh();
          return;
        }
      }
    }
    setMessage(
      nextActive
        ? `${row.fullName} ενεργοποιήθηκε.`
        : `${row.fullName} απενεργοποιήθηκε και δεν εμφανίζεται πλέον στις αντίστοιχες λίστες.`,
    );
    refreshAppData();
    await refresh();
  }

  if (session?.role !== 'admin' && session?.role !== 'platform_admin') {
    return (
      <section className="panel settings-panel">
        <p className="form-error">Μόνο ο διαχειριστής συλλόγου μπορεί να προσκαλεί χρήστες.</p>
      </section>
    );
  }

  return (
    <section className="panel settings-panel club-users-panel">
      <div className="club-users-panel-head">
        <div>
          <h3>{isInvitations ? 'Προσκλήσεις' : 'Χρήστες'}</h3>
          <p className="lede">
            {isInvitations
              ? 'Προσκαλέστε μέλη στον σύλλογο και ορίστε ρόλο + δικαιώματα πρόσβασης.'
              : 'Δημιουργήστε λογαριασμό με μοναδικό email και κωδικό εισόδου. Κάθε χρήστης δικό του email. Μετά την αποθήκευση ο λογαριασμός ανεβαίνει στο cloud για σύνδεση από κάθε συσκευή.'}
          </p>
        </div>
        {!isInvitations && !editingUser ? (
          <Button type="button" onClick={startCreate}>
            <UserPlus size={16} /> Νέος χρήστης
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <form
          ref={formRef}
          id="club-user-edit-form"
          className="entry-form club-users-form settings-form"
          onSubmit={handleSubmit}
        >
          <h4>{isEditMode ? 'Επεξεργασία χρήστη' : 'Νέος χρήστης / Πρόσκληση'}</h4>

          <SettingsFormRow label="Επώνυμο" htmlFor="club-user-last-name">
            <input
              id="club-user-last-name"
              className="field-input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              autoComplete="family-name"
            />
          </SettingsFormRow>

          <SettingsFormRow label="Όνομα" htmlFor="club-user-first-name">
            <input
              id="club-user-first-name"
              className="field-input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoComplete="given-name"
            />
          </SettingsFormRow>

          <SettingsFormRow label="Email" htmlFor="club-user-email">
            <input
              id="club-user-email"
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={Boolean(editingId)}
            />
          </SettingsFormRow>

          <SettingsFormRow
            label="Κωδικός εισόδου"
            htmlFor="club-user-password"
          >
            <input
              id="club-user-password"
              className="field-input"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={passwordRequired}
              minLength={passwordRequired || password.trim() ? 6 : undefined}
              autoComplete="new-password"
              placeholder={
                editingId
                  ? 'Πληκτρολογήστε νέο κωδικό ή αφήστε κενό'
                  : 'Πληκτρολογήστε κωδικό (τουλάχιστον 6 χαρακτήρες)'
              }
            />
            <p className="ap-field-hint">
              {editingId
                ? 'Πληκτρολογήστε χειροκίνητα νέο κωδικό μόνο αν θέλετε να αλλάξει.'
                : 'Πληκτρολογήστε χειροκίνητα τον κωδικό. Θα τον χρησιμοποιήσει ο χρήστης στο /login μαζί με το email.'}
            </p>
          </SettingsFormRow>

          <SettingsFormRow label="Ρόλος" htmlFor="club-user-role">
            <select
              id="club-user-role"
              className="field-input"
              value={role}
              onChange={(e) => applyRoleDefaults(e.target.value as ClubRole)}
            >
              {CLUB_ROLES.map((item) => (
                <option key={item} value={item}>
                  {CLUB_ROLE_LABELS[item]}
                </option>
              ))}
            </select>
          </SettingsFormRow>

          {role === 'athlete' ? (
            <SettingsFormRow label="Σύνδεση με αθλητή" htmlFor="club-user-athlete">
              <select
                id="club-user-athlete"
                className="field-input"
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
              >
                <option value="">— χωρίς σύνδεση —</option>
                {athleteOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.lastName} {s.firstName}
                  </option>
                ))}
              </select>
            </SettingsFormRow>
          ) : null}

          {role === 'coach' ? (
            <SettingsFormRow label="Σύνδεση με προπονητή" htmlFor="club-user-coach">
              <select
                id="club-user-coach"
                className="field-input"
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
              >
                <option value="">— χωρίς σύνδεση —</option>
                {coachOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.lastName} {c.firstName}
                  </option>
                ))}
              </select>
            </SettingsFormRow>
          ) : null}

          <SettingsFormRow label="Δικαιώματα πρόσβασης">
            {role === 'doctor' ? (
              <p className="ap-field-hint">
                Ο ιατρός έχει πρόσβαση μόνο σε Αθλητές. Οικονομικά, ρυθμίσεις και άλλες καρτέλες δεν
                μπορούν να ενεργοποιηθούν.
              </p>
            ) : role === 'admin' ? (
              <p className="ap-field-hint">
                Ο διαχειριστής συλλόγου έχει by default όλα τα δικαιώματα ενεργά.
              </p>
            ) : (
              <p className="ap-field-hint">
                Προεπιλογή από Platform Admin για όλους τους συλλόγους. Αλλάξτε τα μόνο αν θέλετε
                εξαίρεση για αυτόν τον χρήστη.
              </p>
            )}
            <div className="club-users-permissions-grid">
              {(role === 'doctor' ? DOCTOR_CLUB_PERMISSIONS : CLUB_PERMISSIONS).map(
                (permission) => (
                  <label key={permission} className="admin-check">
                    <input
                      type="checkbox"
                      checked={
                        role === 'doctor' || role === 'admin'
                          ? true
                          : permissions.includes(permission)
                      }
                      disabled={role === 'doctor' || role === 'admin'}
                      onChange={() => togglePermission(permission)}
                    />
                    <span>{CLUB_PERMISSION_LABELS[permission]}</span>
                  </label>
                ),
              )}
            </div>
          </SettingsFormRow>

          {role !== 'admin' && role !== 'doctor' ? (
            <SettingsFormRow label="Οικονομικά (έσοδα / έξοδα)">
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={financeOwnEntriesOnly}
                  onChange={(e) => setFinanceOwnEntriesOnly(e.target.checked)}
                />
                <span>Μόνο οι δικές του καταχωρήσεις</span>
              </label>
              <p className="ap-field-hint">
                Ενεργοποιήστε το στο λογαριασμό με αυτό το email. Θα βλέπει στα Οικονομικά μόνο
                έσοδα/έξοδα που καταχώρησε ο ίδιος. Οι συνδρομές αθλητών και οι εγγραφές άλλων
                χρηστών μένουν εκτός της οθόνης του. Ο διαχειριστής τα βλέπει όλα. Χρειάζεται
                δικαίωμα «Οικονομικά».
              </p>
            </SettingsFormRow>
          ) : null}

          <div className="settings-form-actions admin-entry-actions">
            <Button type="submit">
              <UserPlus size={16} /> {isEditMode ? 'Αποθήκευση' : 'Δημιουργία χρήστη'}
            </Button>
            {editingId || creating || creatingFromRow ? (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Άκυρο
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="settings-success">{message}</p> : null}

      {!isInvitations ? (
        <div className="club-users-list">
          <h4>Εγγεγραμμένοι στην εφαρμογή</h4>
          <div className="club-users-search settings-form">
            <SettingsFormRow label="Επώνυμο" htmlFor="club-user-search-last">
              <input
                id="club-user-search-last"
                className="field-input"
                value={searchLastName}
                onChange={(e) => setSearchLastName(e.target.value)}
                placeholder="Αναζήτηση επωνύμου"
              />
            </SettingsFormRow>
            <SettingsFormRow label="Όνομα" htmlFor="club-user-search-first">
              <input
                id="club-user-search-first"
                className="field-input"
                value={searchFirstName}
                onChange={(e) => setSearchFirstName(e.target.value)}
                placeholder="Αναζήτηση ονόματος"
              />
            </SettingsFormRow>
            <SettingsFormRow label="Ρόλος" htmlFor="club-user-search-role">
              <select
                id="club-user-search-role"
                className="field-input"
                value={searchRole}
                onChange={(e) => setSearchRole(e.target.value)}
              >
                <option value="">Όλοι οι ρόλοι</option>
                {roleOptions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </SettingsFormRow>
          </div>
          {loading ? <p className="lede">Φόρτωση…</p> : null}
          {!loading && directory.length === 0 ? (
            <p className="lede">Δεν υπάρχουν ακόμα εγγεγραμμένα μέλη.</p>
          ) : null}
          {!loading && directory.length > 0 && filteredDirectory.length === 0 ? (
            <p className="lede">Δεν βρέθηκαν αποτελέσματα για την αναζήτηση.</p>
          ) : null}
          <div className="ta-table">
            {filteredDirectory.map((row) => (
              <div key={row.id} className="ta-row">
                <div className="ta-title">{row.roleLabel}</div>
                <div className="ta-analysis">
                  <div className="admin-record-line">
                    <span>
                      {row.fullName} · {row.email}
                      {row.hasLogin ? ' · λογαριασμός' : ' · μητρώο'}
                      {row.customPermissions ? ' · προσαρμοσμένα δικαιώματα' : ''}
                      {row.linkedLabel ? ` · ${row.linkedLabel}` : ''}
                      {' · '}
                      <span className={row.active ? 'badge badge-active' : 'badge badge-inactive'}>
                        {row.active ? 'Ενεργός' : 'Ανενεργός'}
                      </span>
                    </span>
                    <div className="admin-record-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={togglingId === row.id}
                        onClick={() => void handleToggleActive(row)}
                      >
                        {row.active ? 'Ανενεργός' : 'Ενεργός'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleEdit(row)}
                      >
                        Κωδικός / Επεξεργασία
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void handleDelete(row)}
                      >
                        Διαγραφή
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
