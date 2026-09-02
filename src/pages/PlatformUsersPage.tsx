import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Heart,
  Shield,
  Stethoscope,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react';
import {
  deleteUser,
  getSession,
  getUsers,
  impersonateUser,
  isPlatformAdmin,
  updateUserEmail,
  type UserRole,
} from '../auth/auth';
import {
  getClubById,
  getClubs,
  purgeClub,
  updateClubLicenses,
  type Club,
} from '../auth/clubs';
import {
  ONLINE_PAYMENT_PROVIDERS,
  normalizeOnlinePaymentProviders,
  type OnlinePaymentProviderId,
} from '../shared/onlinePayments';
import {
  formatLicenseEuro,
  listAssignableLicensePackages,
  resolveClubLicensePackage,
  seatPackageId,
} from '../auth/licensePackages';
import { pushAccountBundle } from '../api/services/accountSyncService';
import { AdminDrill, type AdminDrillCategory } from '../components/layout/AdminDrill';
import { PlatformAdminShell } from '../components/layout/PlatformAdminShell';
import { loadStore, removeClubStore } from '../data/store';

type PlatformRole =
  | 'platform_admin'
  | 'admin'
  | 'doctor'
  | 'secretariat'
  | 'coach'
  | 'staff'
  | 'athlete'
  | 'parent';

interface PlatformUserRow {
  id: string;
  fullName: string;
  email: string;
  role: PlatformRole;
  clubId: string | null;
  clubName: string;
  roleLabel: string;
  active: boolean;
  licenseText: string | null;
  canDelete: boolean;
  canImpersonate: boolean;
  source: 'user' | 'student';
  athleteId?: string;
}

const ROLE_CARDS: Array<{
  role: PlatformRole;
  title: string;
}> = [
  { role: 'platform_admin', title: 'Διαχειριστές πλατφόρμας' },
  { role: 'admin', title: 'Διαχειριστές συλλόγων' },
  { role: 'doctor', title: 'Ιατροί' },
  { role: 'secretariat', title: 'Γραμματεία' },
  { role: 'coach', title: 'Προπονητές' },
  { role: 'staff', title: 'Προσωπικό' },
  { role: 'athlete', title: 'Αθλητές' },
  { role: 'parent', title: 'Γονείς' },
];

const USER_DRILL: AdminDrillCategory[] = [
  {
    id: 'manage',
    label: 'Διαχείριση',
    icon: Shield,
    items: [
      { id: 'platform_admin', label: 'Διαχειριστές πλατφόρμας', icon: Shield },
      { id: 'admin', label: 'Διαχειριστές συλλόγων', icon: Briefcase },
      { id: 'secretariat', label: 'Γραμματεία', icon: Users },
      { id: 'doctor', label: 'Ιατροί', icon: Stethoscope },
    ],
  },
  {
    id: 'team',
    label: 'Ομάδα',
    icon: UserRound,
    items: [
      { id: 'coach', label: 'Προπονητές', icon: Users },
      { id: 'staff', label: 'Προσωπικό', icon: UsersRound },
    ],
  },
  {
    id: 'members',
    label: 'Μέλη',
    icon: Heart,
    items: [
      { id: 'athlete', label: 'Αθλητές', icon: Users },
      { id: 'parent', label: 'Γονείς', icon: Heart },
    ],
  },
];

function licenseText(club: Club | null): string | null {
  if (!club) return null;
  const pkg = resolveClubLicensePackage(club);
  const usage = `${club.athleteLicenseUsed} / ${club.athleteLicenseLimit}`;
  const period = club.usageStartsOn || club.usageEndsOn
    ? ` · ${club.usageStartsOn ? `Από ${club.usageStartsOn}` : 'Από τώρα'}${club.usageEndsOn ? ` έως ${club.usageEndsOn}` : ''}`
    : '';
  if (pkg) return `${pkg.name} · ${usage}${period}`;
  return `ΑΔΕΙΕΣ ΑΘΛΗΤΩΝ ${usage}${period}`;
}

function buildRows(): PlatformUserRow[] {
  const clubs = getClubs();
  const users = getUsers();
  const data = loadStore();
  const session = getSession();

  const fromUsers: PlatformUserRow[] = users
    .filter((u) =>
      (['platform_admin', 'admin', 'doctor', 'secretariat', 'coach', 'staff', 'athlete', 'parent'] as UserRole[]).includes(
        u.role,
      ),
    )
    .map((u) => {
      const club = getClubById(u.clubId);
      const clubName = club?.name ?? '';
      let roleLabel = '';
      if (u.role === 'admin') roleLabel = clubName ? `${clubName} Διαχειριστής` : 'Διαχειριστής συλλόγου';
      else if (u.role === 'doctor') roleLabel = clubName ? `${clubName} Ιατρός` : 'Ιατρός';
      else if (u.role === 'athlete') roleLabel = clubName ? `${clubName} Αθλητής` : 'Αθλητής';
      else if (u.role === 'coach') roleLabel = clubName ? `${clubName} Προπονητής` : 'Προπονητής';
      else if (u.role === 'secretariat') roleLabel = clubName ? `${clubName} Γραμματεία` : 'Γραμματεία';
      else if (u.role === 'staff') roleLabel = clubName ? `${clubName} Προσωπικό` : 'Προσωπικό';
      else if (u.role === 'parent') roleLabel = clubName ? `${clubName} Γονέας` : 'Γονέας';

      return {
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        role: u.role as PlatformRole,
        clubId: u.clubId ?? null,
        clubName,
        roleLabel,
        active: u.active,
        licenseText:
          u.role === 'admin' || u.role === 'athlete' ? licenseText(club) : null,
        canDelete: u.role !== 'platform_admin' && u.id !== session?.id,
        canImpersonate: u.id !== session?.id,
        source: 'user' as const,
        athleteId: u.athleteId ?? undefined,
      };
    });

  const athleteUserEmails = new Set(
    fromUsers.filter((u) => u.role === 'athlete').map((u) => u.email.toLowerCase()),
  );

  const defaultClub = clubs[0] ?? null;
  const fromStudents: PlatformUserRow[] = (data?.students ?? [])
    .filter((s) => s.email && !athleteUserEmails.has(s.email.toLowerCase()))
    .map((s) => {
      const club =
        clubs.find((c) => c.name === s.clubName) ??
        defaultClub;
      const clubName = club?.name ?? s.clubName ?? '';
      return {
        id: `student_${s.id}`,
        fullName: `${s.lastName} ${s.firstName}`.trim(),
        email: s.email,
        role: 'athlete' as const,
        clubId: club?.id ?? null,
        clubName,
        roleLabel: clubName ? `${clubName} Αθλητής` : 'Αθλητής',
        active: s.status !== 'inactive',
        licenseText: licenseText(club),
        canDelete: false,
        canImpersonate: true,
        source: 'student' as const,
        athleteId: s.id,
      };
    });

  return [...fromUsers, ...fromStudents];
}

export function PlatformUsersPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PlatformUserRow[]>(() => buildRows());
  const [queries, setQueries] = useState<Record<PlatformRole, string>>({
    platform_admin: '',
    admin: '',
    doctor: '',
    secretariat: '',
    coach: '',
    staff: '',
    athlete: '',
    parent: '',
  });
  const [emailEdit, setEmailEdit] = useState<PlatformUserRow | null>(null);
  const [emailValue, setEmailValue] = useState('');
  const [licenseEdit, setLicenseEdit] = useState<PlatformUserRow | null>(null);
  const [licenseLimit, setLicenseLimit] = useState(10);
  const [licenseUsed, setLicenseUsed] = useState(0);
  const [licensePackageId, setLicensePackageId] = useState('');
  const [usageStartsOn, setUsageStartsOn] = useState('');
  const [usageEndsOn, setUsageEndsOn] = useState('');
  const [onlineProviders, setOnlineProviders] = useState<OnlinePaymentProviderId[]>(['viva']);
  const activePackages = useMemo(() => listAssignableLicensePackages(), []);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [userCat, setUserCat] = useState('manage');
  const [userRole, setUserRole] = useState<PlatformRole>('platform_admin');

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      ROLE_CARDS.map((c) => [c.role, [] as PlatformUserRow[]]),
    ) as Record<PlatformRole, PlatformUserRow[]>;
    for (const row of rows) {
      map[row.role]?.push(row);
    }
    return map;
  }, [rows]);

  const userDrill = useMemo(
    () =>
      USER_DRILL.map((cat) => ({
        ...cat,
        items: cat.items.map((item) => ({
          ...item,
          count: grouped[item.id as PlatformRole]?.length ?? 0,
        })),
      })),
    [grouped],
  );

  function refresh() {
    setRows(buildRows());
  }

  function handleEnter(row: PlatformUserRow) {
    setError('');
    if (row.source === 'student' && row.athleteId) {
      navigate(`/athletes/${row.athleteId}`);
      return;
    }
    const result = impersonateUser(row.id);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία εισόδου');
      return;
    }
    if (result.data?.role === 'platform_admin') {
      navigate('/platform', { replace: true });
      return;
    }
    navigate('/', { replace: true });
  }

  function openEmailEdit(row: PlatformUserRow) {
    if (row.source !== 'user') {
      setError('Η αλλαγή email για αθλητές από τα δεδομένα ακαδημίας γίνεται στο προφίλ αθλητή.');
      return;
    }
    setEmailEdit(row);
    setEmailValue(row.email);
    setError('');
  }

  function saveEmail() {
    if (!emailEdit) return;
    const result = updateUserEmail(emailEdit.id, emailValue);
    if (!result.success) {
      setError(result.error ?? 'Αποτυχία ενημέρωσης');
      return;
    }
    setEmailEdit(null);
    setMessage('Το email ενημερώθηκε.');
    refresh();
  }

  function openLicenses(row: PlatformUserRow) {
    if (!row.clubId) {
      setError('Δεν υπάρχει συνδεδεμένος σύλλογος για άδειες.');
      return;
    }
    const club = getClubById(row.clubId);
    if (!club) {
      setError('Ο σύλλογος δεν βρέθηκε.');
      return;
    }
    setLicenseEdit(row);
    setLicenseLimit(Number(club.athleteLicenseLimit) || 0);
    setLicenseUsed(Number(club.athleteLicenseUsed) || 0);
    // Prefer stored package id. Empty/null = χειροκίνητο (do not re-select Start from seat count).
    if (!club.licensePackageId) {
      setLicensePackageId('');
    } else {
      const pkg = resolveClubLicensePackage(club);
      setLicensePackageId(pkg ? seatPackageId(pkg.athleteLicenses) : club.licensePackageId);
    }
    setUsageStartsOn(club.usageStartsOn ?? '');
    setUsageEndsOn(club.usageEndsOn ?? '');
    setOnlineProviders(normalizeOnlinePaymentProviders(club.onlinePaymentProviders));
    setError('');
    setMessage('');
  }

  function applyLicensePackage(packageId: string) {
    setLicensePackageId(packageId);
    if (!packageId) return;
    const pkg = activePackages.find((p) => p.id === packageId);
    if (pkg) setLicenseLimit(pkg.athleteLicenses);
  }

  async function saveLicenses() {
    if (!licenseEdit?.clubId) return;
    const limit = Number(licenseLimit);
    const used = Number(licenseUsed);
    if (!Number.isFinite(limit) || limit < 0) {
      setError('Συμπλήρωσε έγκυρο όριο αδειών.');
      return;
    }
    if (!Number.isFinite(used) || used < 0) {
      setError('Συμπλήρωσε έγκυρο αριθμό χρησιμοποιημένων αδειών.');
      return;
    }
    const result = updateClubLicenses(licenseEdit.clubId, {
      athleteLicenseLimit: limit,
      athleteLicenseUsed: used,
      licensePackageId: licensePackageId || null,
      usageStartsOn: usageStartsOn || null,
      usageEndsOn: usageEndsOn || null,
      onlinePaymentProviders: onlineProviders,
    });
    if (!result.success || !result.data) {
      setError(result.error ?? 'Αποτυχία ενημέρωσης αδειών');
      return;
    }
    const pushed = await pushAccountBundle();
    setLicenseEdit(null);
    refresh();
    if (!pushed.success) {
      setError(
        `Αποθηκεύτηκε τοπικά (${result.data.athleteLicenseUsed}/${result.data.athleteLicenseLimit}), αλλά το cloud push απέτυχε: ${pushed.error ?? 'άγνωστο σφάλμα'}. Κάντε Push από Backup.`,
      );
      return;
    }
    setMessage(
      licensePackageId
        ? `Οι άδειες ενημερώθηκαν: ${result.data.athleteLicenseUsed} / ${result.data.athleteLicenseLimit}`
        : `Χειροκίνητο όριο · ${result.data.athleteLicenseUsed} / ${result.data.athleteLicenseLimit}`,
    );
  }

  async function handleDelete(row: PlatformUserRow) {
    if (!row.canDelete) return;
    const ok = window.confirm(
      row.role === 'admin' && row.clubId
        ? `Διαγραφή συλλόγου «${row.clubName || row.fullName}»; Θα διαγραφούν ο admin και τα δεδομένα.`
        : `Διαγραφή χρήστη «${row.fullName}»;`,
    );
    if (!ok) return;
    if (row.role === 'admin' && row.clubId) {
      const purged = purgeClub(row.clubId);
      if (!purged.success) {
        setError(purged.error ?? 'Αποτυχία διαγραφής συλλόγου');
        return;
      }
      removeClubStore(row.clubId);
    } else {
      const result = deleteUser(row.id);
      if (!result.success) {
        setError(result.error ?? 'Αποτυχία διαγραφής');
        return;
      }
    }
    const pushed = await pushAccountBundle();
    if (!pushed.success) {
      setError(
        pushed.error ??
          'Διαγράφηκε τοπικά. Το cloud push απέτυχε — κάντε Push από το Backup.',
      );
    } else {
      setMessage(row.role === 'admin' ? 'Ο σύλλογος διαγράφηκε.' : 'Ο χρήστης διαγράφηκε.');
    }
    refresh();
  }

  if (!isPlatformAdmin()) {
    return null;
  }

  return (
    <PlatformAdminShell
      title="Χρήστες πλατφόρμας"
      lede="Όλοι οι εγγεγραμμένοι χρήστες, ομαδοποιημένοι ανά ρόλο. Αλλαγή email, είσοδος ως χρήστης, άδειες συλλόγου και διαγραφή."
      banner={message}
      error={error}
    >
      <AdminDrill
        categories={userDrill}
        categoryId={userCat}
        itemId={userRole}
        onNavigate={(cat, item) => {
          setUserCat(cat);
          setUserRole(item as PlatformRole);
        }}
      >
        {ROLE_CARDS.map((card) => {
          const role = card.role;
          const q = queries[role].trim().toLowerCase();
          const list = grouped[role].filter((row) => {
            if (!q) return true;
            return (
              row.fullName.toLowerCase().includes(q) ||
              row.email.toLowerCase().includes(q) ||
              row.clubName.toLowerCase().includes(q)
            );
          });
          return (
            <article
              key={role}
              className="admin-zone-card"
              hidden={role !== userRole}
            >
              <header className="admin-zone-card-head">
                <h3>{card.title}</h3>
                <div className="platform-card-tools">
                  <input
                    type="search"
                    placeholder="Αναζήτηση..."
                    value={queries[role]}
                    onChange={(e) =>
                      setQueries((prev) => ({ ...prev, [role]: e.target.value }))
                    }
                  />
                  <span className="platform-count">{grouped[role].length}</span>
                </div>
              </header>
              <div className="admin-zone-card-body">
                {list.length === 0 ? (
                  <p className="platform-empty">Δεν υπάρχουν χρήστες σε αυτή την κατηγορία.</p>
                ) : (
                  <ul className="platform-user-list">
                    {list.map((row) => (
                      <li key={row.id} className="platform-user-item">
                        <div className="platform-user-meta">
                          <strong>{row.fullName}</strong>
                          <span>{row.email}</span>
                          {row.roleLabel ? (
                            <span className="platform-user-role">{row.roleLabel}</span>
                          ) : null}
                          <span className={row.active ? 'platform-user-status is-active' : 'platform-user-status is-inactive'}>
                            {row.active ? 'Ενεργός λογαριασμός' : 'Ανενεργός λογαριασμός'}
                          </span>
                          {row.licenseText ? (
                            <span className="platform-user-licenses">{row.licenseText}</span>
                          ) : null}
                        </div>
                        <div className="platform-user-actions">
                          <button
                            type="button"
                            className="pu-btn pu-btn-enter"
                            onClick={() => handleEnter(row)}
                            disabled={!row.canImpersonate && row.source === 'user'}
                          >
                            Είσοδος →
                          </button>
                          <button
                            type="button"
                            className="pu-btn pu-btn-email"
                            onClick={() => openEmailEdit(row)}
                          >
                            Αλλαγή email
                          </button>
                          <button
                            type="button"
                            className="pu-btn pu-btn-access"
                            onClick={() => openLicenses(row)}
                          >
                            Πρόσβαση &amp; άδειες αθλητών
                          </button>
                          <button
                            type="button"
                            className="pu-btn pu-btn-delete"
                            onClick={() => void handleDelete(row)}
                            disabled={!row.canDelete}
                          >
                            Διαγραφή
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </AdminDrill>

      {emailEdit ? (
        <div className="platform-modal-backdrop">
          <div className="platform-modal">
            <h3>Αλλαγή email</h3>
            <p>{emailEdit.fullName}</p>
            <label>
              <span>Νέο email</span>
              <input
                type="email"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
              />
            </label>
            <div className="platform-modal-actions">
              <button type="button" className="pu-btn pu-btn-access" onClick={() => setEmailEdit(null)}>
                Ακύρωση
              </button>
              <button type="button" className="pu-btn pu-btn-enter" onClick={saveEmail}>
                Αποθήκευση
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {licenseEdit ? (
        <div className="platform-modal-backdrop">
          <div className="platform-modal">
            <h3>Πρόσβαση &amp; άδειες αθλητών</h3>
            <p>
              {licenseEdit.clubName || 'Σύλλογος'} — {licenseEdit.fullName}
            </p>
            <label>
              <span>Πακέτο συνδρομής</span>
              <select
                value={licensePackageId}
                onChange={(e) => applyLicensePackage(e.target.value)}
              >
                <option value="">Χωρίς πακέτο (χειροκίνητο όριο)</option>
                {activePackages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} · {pkg.athleteLicenses} άδειες · €{formatLicenseEuro(pkg.price)} +ΦΠΑ
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Όριο αδειών</span>
              <input
                type="number"
                min={0}
                value={Number.isFinite(licenseLimit) ? licenseLimit : 0}
                onChange={(e) => setLicenseLimit(Number(e.target.value))}
              />
            </label>
            <label>
              <span>Χρησιμοποιημένες άδειες</span>
              <input
                type="number"
                min={0}
                value={Number.isFinite(licenseUsed) ? licenseUsed : 0}
                onChange={(e) => setLicenseUsed(Number(e.target.value))}
              />
            </label>
            <div className="platform-date-grid">
              <label>
                <span>Έναρξη χρήσης</span>
                <input type="date" value={usageStartsOn} onChange={(e) => setUsageStartsOn(e.target.value)} />
              </label>
              <label>
                <span>Λήξη χρήσης</span>
                <input type="date" value={usageEndsOn} onChange={(e) => setUsageEndsOn(e.target.value)} />
              </label>
            </div>
            <fieldset className="platform-online-pay">
              <legend>Online πληρωμές συλλόγου</legend>
              <p className="platform-online-pay-hint">
                Επιλέξτε ποιους παρόχους μπορεί να ενεργοποιήσει ο σύλλογος στις Ρυθμίσεις. Μπορείτε
                περισσότερους από έναν.
              </p>
              {ONLINE_PAYMENT_PROVIDERS.map((p) => (
                <label key={p.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={onlineProviders.includes(p.id)}
                    onChange={(e) => {
                      setOnlineProviders((prev) => {
                        if (e.target.checked) return [...prev, p.id];
                        return prev.filter((id) => id !== p.id);
                      });
                    }}
                  />
                  {p.label}
                </label>
              ))}
            </fieldset>
            <div className="platform-modal-actions">
              <button
                type="button"
                className="pu-btn pu-btn-access"
                onClick={() => setLicenseEdit(null)}
              >
                Ακύρωση
              </button>
              <button
                type="button"
                className="pu-btn pu-btn-enter"
                onClick={() => void saveLicenses()}
              >
                Αποθήκευση
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PlatformAdminShell>
  );
}
