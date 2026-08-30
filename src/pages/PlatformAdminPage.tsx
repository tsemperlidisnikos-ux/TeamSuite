import {
  Activity,
  Archive,
  BadgeCheck,
  Building2,
  Calendar,
  CalendarClock,
  Clock,
  Cloud,
  Eye,
  FileImage,
  Image,
  Landmark,
  Layers,
  Library,
  List,
  Monitor,
  Palette,
  PanelLeft,
  PieChart,
  Settings,
  Shield,
  Tag,
  Timer,
  Users,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { pushAccountBundle } from '../api/services/accountSyncService';
import { getUsers, saveUsers } from '../auth/auth';
import { getClubs, saveClubs, type Club } from '../auth/clubs';
import { BackupSchedulePanel } from '../components/BackupSchedulePanel';
import { GoogleDriveBackupPanel } from '../components/GoogleDriveBackupPanel';
import { ClubWaitlistPanel } from '../components/ClubWaitlistPanel';
import { LoginActivityPanel } from '../components/LoginActivityPanel';
import { PlatformDiagnosticPanel } from '../components/PlatformDiagnosticPanel';
import { AdminDrill, type AdminDrillCategory } from '../components/layout/AdminDrill';
import { PlatformAdminShell } from '../components/layout/PlatformAdminShell';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { persistLocalStateToCloud } from '../data/clubSync';
import * as joinFormSnapshotAdminService from '../api/services/joinFormSnapshotAdminService';
import { optimizeLogoDataUrl } from '../utils/clubLogoFile';
import {
  createId,
  getData,
  mutateData,
  replaceAllClubsData,
  replaceClubData,
  replaceData,
  resetData,
} from '../data/repository';
import {
  assertPlatformScopedRestore,
  buildClubBackupPayload,
  clubBackupFilenamePrefix,
  downloadBackupJson,
  formatBackupError,
  mergeClubsPreservingSecrets,
  mergeUsersPreservingPasswords,
  pickAppDataForRestore,
  readBackupFile,
} from '../utils/backupArchive';
import {
  ACADEMY_MODULES,
  CLUB_PERMISSION_LABELS,
  CLUB_PERMISSIONS,
  CLUB_ROLE_LABELS,
  CLUB_ROLES,
  FINANCE_TABS,
  clearStampedRoleDefaultPermissions,
  endPreview,
  getAcademyModulesForClub,
  getEnabledFinanceTabs,
  getPreviewClubId,
  APPEARANCE_THEMES,
  loadPlatformConfig,
  resetFinanceCatalogDefaults,
  saveFinanceCatalogAsDefaults,
  savePlatformConfig,
  setAppearanceTheme,
  setEnabledFinanceTabs,
  startPreview,
  type AcademyModuleId,
  type AppearanceTheme,
  type ClubPermission,
  type ClubRole,
  type FinanceTabId,
  type PlatformConfig,
} from '../platform/platformConfig';

type AdminWorkspaceTab = 'platform' | 'academio' | 'backup';

const PLATFORM_DRILL: AdminDrillCategory[] = [
  {
    id: 'ops',
    label: 'Λειτουργία',
    icon: Settings,
    items: [
      { id: 'waitlist', label: 'Λίστα αναμονής ακαδημιών', hint: 'Αιτήσεις /register', icon: Users },
      { id: 'logins', label: 'Ιστορικό εισόδων', hint: 'Φίλτρο συλλόγου', icon: Clock },
      { id: 'jpegs', label: 'Φόρμες δημόσιας εγγραφής', hint: 'JPEG / υπογραφές', icon: FileImage },
    ],
  },
  {
    id: 'look',
    label: 'Εμφάνιση',
    icon: Eye,
    items: [
      { id: 'logo', label: 'Logo εφαρμογής', hint: 'Καθολικό σήμα', icon: Image },
      { id: 'theme', label: 'Εμφάνιση εφαρμογής', hint: 'Ocean Slate / Ember', icon: Palette },
    ],
  },
  {
    id: 'catalog',
    label: 'Κατάλογος',
    icon: Library,
    items: [
      { id: 'incomeCat', label: 'Κατηγορίες εσόδων', icon: Tag },
      { id: 'incomeDesc', label: 'Περιγραφές εσόδων', icon: List },
      { id: 'expenseCat', label: 'Κατηγορίες εξόδων', icon: Wallet },
      { id: 'expenseDesc', label: 'Περιγραφές εξόδων', icon: List },
      { id: 'roles', label: 'Δικαιώματα ρόλων', icon: Shield },
    ],
  },
];

const BACKUP_DRILL: AdminDrillCategory[] = [
  {
    id: 'copies',
    label: 'Αντίγραφα',
    icon: Archive,
    items: [
      { id: 'full', label: 'Backup όλης της εφαρμογής', icon: Archive },
      { id: 'club', label: 'Backup συλλόγου', icon: Building2 },
      { id: 'gdrive', label: 'Google Drive', icon: Cloud },
    ],
  },
  {
    id: 'schedule',
    label: 'Πρόγραμμα',
    icon: CalendarClock,
    items: [{ id: 'schedule', label: 'Πρόγραμμα backup', icon: Timer }],
  },
  {
    id: 'check',
    label: 'Έλεγχος',
    icon: Activity,
    items: [{ id: 'diagnostic', label: 'Διαγνωστικό τεστ', icon: Activity }],
  },
];

const ACADEMY_DRILL: AdminDrillCategory[] = [
  {
    id: 'preview',
    label: 'Preview',
    icon: Monitor,
    items: [
      { id: 'preview', label: 'Preview συλλόγου', icon: Monitor },
      { id: 'clubLogo', label: 'Λογότυπο ανά σύλλογο', icon: Image },
      { id: 'associations', label: 'Ομάδες σωματείου', icon: Landmark },
    ],
  },
  {
    id: 'academy',
    label: 'Κατάλογος ακαδημίας',
    icon: Layers,
    items: [
      { id: 'financeTabs', label: 'Καρτέλες Οικονομικών', icon: PieChart },
      { id: 'menu', label: 'Καρτέλες μενού', icon: PanelLeft },
    ],
  },
  {
    id: 'season',
    label: 'Σεζόν & άδειες',
    icon: Calendar,
    items: [
      { id: 'seasons', label: 'Σεζόν', icon: Calendar },
      { id: 'licenses', label: 'Άδειες / πακέτο', icon: BadgeCheck },
    ],
  },
];

function AdminRow({
  title,
  description,
  entry,
  records,
  id,
  drillId,
  activeDrill,
}: {
  title: string;
  description: string;
  entry: ReactNode;
  records: ReactNode;
  id?: string;
  drillId?: string;
  activeDrill?: string;
}) {
  return (
    <article
      className="admin-zone-card"
      id={id}
      hidden={Boolean(drillId && activeDrill && drillId !== activeDrill)}
    >
      <header className="admin-zone-card-head">
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      <div className="admin-zone-card-body">{entry}</div>
      <div className="admin-zone-card-status">{records}</div>
    </article>
  );
}

function RecordsTable({ children }: { children: ReactNode }) {
  return (
    <div className="ta-table">
      <div className="ta-row ta-header" aria-hidden="true">
        <div className="ta-title">Κατάσταση</div>
        <div className="ta-analysis">Τιμές</div>
      </div>
      {children}
    </div>
  );
}

function RecordsRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ta-row">
      <div className="ta-title">{title}</div>
      <div className="ta-analysis">{children}</div>
    </div>
  );
}

function EditableRecordLine({
  value,
  uppercase = false,
  onSave,
  onDelete,
}: {
  value: string;
  uppercase?: boolean;
  onSave: (nextValue: string) => { success: boolean; error?: string };
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(value);
    setEditing(false);
  }

  function saveEdit() {
    const next = uppercase ? draft.trim().toUpperCase() : draft.trim();
    if (!next) return;
    if (next === value) {
      setEditing(false);
      return;
    }
    const result = onSave(next);
    if (result.success) {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="admin-record-line admin-record-line-edit">
        <input
          className="admin-record-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              saveEdit();
            }
            if (e.key === 'Escape') cancelEdit();
          }}
          autoFocus
        />
        <div className="admin-record-actions">
          <button type="button" className="btn btn-ghost" onClick={saveEdit}>
            Αποθήκευση
          </button>
          <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
            Άκυρο
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-record-line">
      <span>{value}</span>
      <div className="admin-record-actions">
        <button type="button" className="btn btn-ghost" onClick={startEdit}>
          Επεξεργασία
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDelete}>
          Διαγραφή
        </button>
      </div>
    </div>
  );
}

export function PlatformAdminPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clubsTick, setClubsTick] = useState(0);
  const clubs = useMemo(() => getClubs(), [clubsTick]);
  const [config, setConfig] = useState<PlatformConfig>(() => {
    const loaded = loadPlatformConfig();
    saveFinanceCatalogAsDefaults(loaded);
    return loaded;
  });
  const roleDefaultsBaselineRef = useRef(
    structuredClone(loadPlatformConfig().clubRolePermissions),
  );
  const [catalogClubId, setCatalogClubId] = useState(() => getClubs()[0]?.id ?? '');
  const clubLogoFileRef = useRef<HTMLInputElement>(null);
  const [clubRole, setClubRole] = useState<ClubRole>('admin');
  const [message, setMessage] = useState('');
  const [newIncomeCategory, setNewIncomeCategory] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState('');
  const [incomeDescSub, setIncomeDescSub] = useState(config.incomeCategories[0] ?? '');
  const [expenseDescSub, setExpenseDescSub] = useState(config.expenseCategories[0] ?? '');
  const [newIncomeDesc, setNewIncomeDesc] = useState('');
  const [newExpenseDesc, setNewExpenseDesc] = useState('');
  const [newAssociation, setNewAssociation] = useState('');
  const [newSeason, setNewSeason] = useState('');
  const [tick, setTick] = useState(0);
  const [adminTab, setAdminTab] = useState<AdminWorkspaceTab>('platform');
  const [platformCat, setPlatformCat] = useState('ops');
  const [platformItem, setPlatformItem] = useState('waitlist');
  const [backupCat, setBackupCat] = useState('copies');
  const [backupItem, setBackupItem] = useState('full');
  const [academyCat, setAcademyCat] = useState('preview');
  const [academyItem, setAcademyItem] = useState('preview');
  const [restoreClubId, setRestoreClubId] = useState(() => getClubs()[0]?.id ?? '');
  const [platformRestoring, setPlatformRestoring] = useState(false);
  const [clubRestoring, setClubRestoring] = useState(false);
  const [joinFormAllClubs, setJoinFormAllClubs] = useState(true);
  const [joinFormClubIds, setJoinFormClubIds] = useState<string[]>([]);
  const [joinFormBusy, setJoinFormBusy] = useState(false);
  const [joinFormError, setJoinFormError] = useState('');

  useEffect(() => {
    const onClubsUpdated = () => setClubsTick((n) => n + 1);
    window.addEventListener('academyhub-clubs-updated', onClubsUpdated);
    return () => window.removeEventListener('academyhub-clubs-updated', onClubsUpdated);
  }, []);

  useEffect(() => {
    if (!restoreClubId && clubs[0]?.id) {
      setRestoreClubId(clubs[0].id);
      return;
    }
    if (restoreClubId && clubs.length > 0 && !clubs.some((c) => c.id === restoreClubId)) {
      setRestoreClubId(clubs[0]?.id ?? '');
    }
  }, [clubs, restoreClubId]);

  const selectedClub: Club | undefined = clubs.find((c) => c.id === catalogClubId);
  const previewClubId = getPreviewClubId();
  const academyModules = catalogClubId ? getAcademyModulesForClub(catalogClubId) : [];
  const financeTabs = useMemo(
    () => getEnabledFinanceTabs(),
    [config.financeTabs, tick],
  );
  const appData = useMemo(() => getData(), [tick]);

  function persist(next: PlatformConfig) {
    setConfig(next);
    savePlatformConfig(next);
  }

  const flash = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 4000);
  }, []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const drive = searchParams.get('drive');
    const driveMsg = searchParams.get('driveMsg');
    if (!tab && !drive) return;
    if (tab === 'backup') {
      setAdminTab('backup');
      if (drive) {
        setBackupCat('copies');
        setBackupItem('gdrive');
      }
    }
    if (drive === 'ok') flash('Το Google Drive συνδέθηκε.');
    if (drive === 'error') {
      flash(driveMsg || 'Αποτυχία σύνδεσης Google Drive.');
    }
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    next.delete('drive');
    next.delete('driveMsg');
    setSearchParams(next, { replace: true });
    // Intentionally once after OAuth redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStripJoinFormSnapshots() {
    const ids = joinFormAllClubs
      ? clubs.map((club) => club.id).filter((id) => id && id !== '_default')
      : joinFormClubIds.filter((id) => id && id !== '_default');
    if (ids.length === 0) {
      setJoinFormError('Επιλέξτε τουλάχιστον έναν σύλλογο.');
      return;
    }
    const preview = joinFormSnapshotAdminService.previewJoinFormSnapshotCounts(ids);
    const stored = preview.reduce((sum, row) => sum + row.total, 0);
    if (
      !window.confirm(
        `Διαγραφή JPEG φορμών δημόσιας εγγραφής από ${ids.length} συλλόγους; Βρέθηκαν ${stored} αποθηκευμένα στιγμιότυπα/υπογραφές. Οι αθλητές και οι αιτήσεις μένουν.`,
      )
    ) {
      return;
    }
    setJoinFormBusy(true);
    setJoinFormError('');
    try {
      const result = await joinFormSnapshotAdminService.stripJoinFormSnapshotsForClubs(ids);
      flash(
        `Διαγράφηκαν φόρμες από ${result.clubs} συλλόγους (${result.athletes} αθλητές, ${result.applications} αιτήσεις).`,
      );
      setTick((n) => n + 1);
    } catch (err) {
      setJoinFormError(err instanceof Error ? err.message : 'Αποτυχία διαγραφής φορμών');
    } finally {
      setJoinFormBusy(false);
    }
  }

  function toggleClubPermission(permission: ClubPermission) {
    if (clubRole === 'admin' || clubRole === 'doctor') return;
    const current = config.clubRolePermissions?.[clubRole] ?? [];
    const nextList = current.includes(permission)
      ? current.filter((p) => p !== permission)
      : [...current, permission];
    persist({
      ...config,
      clubRolePermissions: {
        ...(config.clubRolePermissions ?? {}),
        [clubRole]: nextList,
      },
    });
  }

  function renameIncomeCategory(oldLabel: string, nextLabel: string) {
    if (nextLabel !== oldLabel && config.incomeCategories.includes(nextLabel)) {
      flash('Υπάρχει ήδη.');
      return { success: false, error: 'Υπάρχει ήδη.' };
    }
    const descriptions = { ...config.incomeDescriptions };
    descriptions[nextLabel] = descriptions[oldLabel] ?? [];
    if (nextLabel !== oldLabel) delete descriptions[oldLabel];
    persist({
      ...config,
      incomeCategories: config.incomeCategories.map((c) => (c === oldLabel ? nextLabel : c)),
      incomeDescriptions: descriptions,
    });
    if (incomeDescSub === oldLabel) setIncomeDescSub(nextLabel);
    flash('Η κατηγορία ενημερώθηκε.');
    return { success: true };
  }

  function renameExpenseCategory(oldLabel: string, nextLabel: string) {
    if (nextLabel !== oldLabel && config.expenseCategories.includes(nextLabel)) {
      flash('Υπάρχει ήδη.');
      return { success: false, error: 'Υπάρχει ήδη.' };
    }
    const descriptions = { ...config.expenseDescriptions };
    descriptions[nextLabel] = descriptions[oldLabel] ?? [];
    if (nextLabel !== oldLabel) delete descriptions[oldLabel];
    persist({
      ...config,
      expenseCategories: config.expenseCategories.map((c) => (c === oldLabel ? nextLabel : c)),
      expenseDescriptions: descriptions,
    });
    if (expenseDescSub === oldLabel) setExpenseDescSub(nextLabel);
    flash('Η κατηγορία ενημερώθηκε.');
    return { success: true };
  }

  function renameDescription(
    kind: 'income' | 'expense',
    subcategory: string,
    oldLabel: string,
    nextLabel: string,
  ) {
    const mapKey = kind === 'income' ? 'incomeDescriptions' : 'expenseDescriptions';
    const current = config[mapKey][subcategory] ?? [];
    if (nextLabel !== oldLabel && current.includes(nextLabel)) {
      flash('Υπάρχει ήδη.');
      return { success: false, error: 'Υπάρχει ήδη.' };
    }
    persist({
      ...config,
      [mapKey]: {
        ...config[mapKey],
        [subcategory]: current.map((d) => (d === oldLabel ? nextLabel : d)),
      },
    });
    flash('Η περιγραφή ενημερώθηκε.');
    return { success: true };
  }

  function toggleAcademyModule(moduleId: AcademyModuleId) {
    if (!catalogClubId) return;
    const current = getAcademyModulesForClub(catalogClubId);
    const nextList = current.includes(moduleId)
      ? current.filter((id) => id !== moduleId)
      : [...current, moduleId];
    if (nextList.length === 0) {
      flash('Πρέπει να μείνει τουλάχιστον μία καρτέλα.');
      return;
    }
    persist({
      ...config,
      academyModulesByClub: { ...config.academyModulesByClub, [catalogClubId]: nextList },
    });
  }

  function toggleFinanceTab(tabId: FinanceTabId) {
    const current = getEnabledFinanceTabs();
    const nextList = current.includes(tabId)
      ? current.filter((id) => id !== tabId)
      : [...current, tabId];
    if (nextList.length === 0) {
      flash('Πρέπει να μείνει τουλάχιστον μία καρτέλα ενεργή.');
      return;
    }
    const ordered = FINANCE_TABS.map((t) => t.id).filter((id) => nextList.includes(id));
    const next = setEnabledFinanceTabs(ordered);
    setConfig(next);
    setTick((n) => n + 1);
  }

  function handlePreview() {
    if (!catalogClubId) {
      flash('Επιλέξτε λογαριασμό');
      return;
    }
    startPreview(catalogClubId);
    navigate('/');
  }

  function handleEndPreview() {
    endPreview();
    flash('Το preview τερματίστηκε.');
    setTick((n) => n + 1);
  }

  function handleBackupExport() {
    downloadBackupJson();
    flash('Το πλήρες backup JSON κατέβηκε (χωρίς SMTP/Viva secrets και password hashes).');
  }

  function handleClubBackupExport() {
    if (!restoreClubId) {
      flash('Επιλέξτε σύλλογο για λήψη backup.');
      return;
    }
    const club = clubs.find((c) => c.id === restoreClubId);
    downloadBackupJson(buildClubBackupPayload(restoreClubId), clubBackupFilenamePrefix(restoreClubId));
    flash(`Backup συλλόγου «${club?.name ?? restoreClubId}» κατέβηκε.`);
  }

  async function applyPlatformBackupFile(file: File) {
    setPlatformRestoring(true);
    try {
      const confirmed = window.confirm(
        'Πλήρης επαναφορά πλατφόρμας: θα αντικατασταθούν δεδομένα όλων των συλλόγων και ρυθμίσεις από το αρχείο. ' +
          'Κωδικοί SMTP/Viva και hashes χρηστών που λείπουν από το backup διατηρούνται τοπικά. Συνέχεια;',
      );
      if (!confirmed) return;

      const parsed = await readBackupFile(file);
      assertPlatformScopedRestore(parsed);
      if (parsed.appDataByClub && Object.keys(parsed.appDataByClub).length > 0) {
        replaceAllClubsData(parsed.appDataByClub);
      } else if (parsed.appData) {
        const targetId = restoreClubId || getClubs()[0]?.id;
        if (targetId) replaceClubData(targetId, parsed.appData);
        else replaceData(parsed.appData);
      }
      if (parsed.platformConfig) {
        persist(parsed.platformConfig);
      }
      if (parsed.users?.length) {
        saveUsers(mergeUsersPreservingPasswords(parsed.users, getUsers()));
      }
      if (parsed.clubs?.length) {
        saveClubs(mergeClubsPreservingSecrets(parsed.clubs, getClubs()));
      }

      const restoredClubIds =
        parsed.appDataByClub && Object.keys(parsed.appDataByClub).length > 0
          ? Object.keys(parsed.appDataByClub)
          : [restoreClubId, getClubs()[0]?.id].filter(Boolean) as string[];
      const cloud = await persistLocalStateToCloud({
        clubIds: restoredClubIds,
        overwriteCloud: true,
      });
      if (!cloud.success) {
        flash(
          `Η τοπική επαναφορά έγινε, αλλά το cloud απέτυχε: ${cloud.error ?? 'άγνωστο'}. Μην κάνετε logout μέχρι να πετύχει Push.`,
        );
        return;
      }

      flash('Πλήρης επαναφορά πλατφόρμας αποθηκεύτηκε και στο cloud. Ανανέωση σελίδας…');
      window.setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch (err) {
      flash(formatBackupError(err));
    } finally {
      setPlatformRestoring(false);
    }
  }

  async function applyClubBackupFile(file: File) {
    if (!restoreClubId) {
      flash('Επιλέξτε σύλλογο για επαναφορά.');
      return;
    }
    setClubRestoring(true);
    try {
      const clubName = clubs.find((c) => c.id === restoreClubId)?.name ?? restoreClubId;
      const confirmed = window.confirm(
        `Επαναφορά μόνο στον σύλλογο «${clubName}». Τα δεδομένα αυτού του συλλόγου θα αντικατασταθούν. ` +
          'Οι υπόλοιποι σύλλογοι δεν επηρεάζονται. Συνέχεια;',
      );
      if (!confirmed) return;

      const parsed = await readBackupFile(file);
      const clubData = pickAppDataForRestore(parsed, restoreClubId);
      if (!clubData) {
        throw new Error('Το backup δεν περιέχει δεδομένα συλλόγου για επαναφορά.');
      }

      const expectedStudents = clubData.students?.length ?? 0;
      replaceClubData(restoreClubId, clubData);

      const backupClub =
        parsed.clubs?.find((c) => c.id === restoreClubId) ??
        (parsed.scope === 'club' && parsed.clubs?.length === 1 ? parsed.clubs[0] : undefined);
      if (backupClub) {
        const existing = getClubs();
        const mergedOne = mergeClubsPreservingSecrets(
          [{ ...backupClub, id: restoreClubId }],
          existing.filter((c) => c.id === restoreClubId),
        )[0];
        if (mergedOne) {
          saveClubs(existing.map((c) => (c.id === restoreClubId ? mergedOne : c)));
        }
      }

      const sourceIds = new Set(
        [parsed.sourceClubId, restoreClubId, ...(parsed.clubs?.map((c) => c.id) ?? [])].filter(
          Boolean,
        ) as string[],
      );
      const incomingUsers = (parsed.users ?? [])
        .filter((u) => u.role !== 'platform_admin')
        .filter((u) => !u.clubId || sourceIds.has(u.clubId) || parsed.scope === 'club')
        .map((u) => ({ ...u, clubId: restoreClubId }));
      if (incomingUsers.length > 0) {
        const others = getUsers().filter((u) => u.clubId !== restoreClubId);
        const existingClubUsers = getUsers().filter((u) => u.clubId === restoreClubId);
        saveUsers([
          ...others,
          ...mergeUsersPreservingPasswords(incomingUsers, existingClubUsers),
        ]);
      }

      setClubsTick((n) => n + 1);
      setTick((n) => n + 1);
      flash(
        `Επαναφορά συλλόγου «${clubName}» OK` +
          (expectedStudents ? ` (${expectedStudents} αθλητές στο αρχείο)` : '') +
          '.',
      );
      const cloud = await persistLocalStateToCloud({
        clubIds: [restoreClubId],
        overwriteCloud: true,
      });
      if (!cloud.success) {
        flash(
          `Τα δεδομένα είναι τοπικά, αλλά το cloud απέτυχε: ${cloud.error ?? 'άγνωστο'}. Μην κάνετε logout μέχρι να πετύχει Push.`,
        );
        return;
      }
      flash('Αποθηκεύτηκε και στο cloud. Ανανέωση…');
      window.setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch (err) {
      flash(formatBackupError(err));
    } finally {
      setClubRestoring(false);
    }
  }

  function handlePlatformBackupImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem('platformBackupFile') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      flash('Επιλέξτε πρώτα αρχείο backup πλατφόρμας (.json).');
      return;
    }
    void applyPlatformBackupFile(file);
  }

  function handleClubBackupImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem('clubBackupFile') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      flash('Επιλέξτε πρώτα αρχείο backup συλλόγου (.json).');
      return;
    }
    void applyClubBackupFile(file);
  }

  function handleResetAppData() {
    if (!confirm('Διαγραφή όλων των δεδομένων εφαρμογής;')) return;
    resetData();
    setTick((n) => n + 1);
    flash('Τα δεδομένα μηδενίστηκαν.');
  }

  return (
    <PlatformAdminShell
      title="Διαχείριση"
      lede="Ρυθμίσεις πλατφόρμας και ακαδημίας για συλλόγους και καταλόγους."
      banner={message}
      extraActions={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setAdminTab('platform');
              setPlatformCat('ops');
              setPlatformItem('waitlist');
            }}
          >
            Λίστα αναμονής
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setAdminTab('platform');
              setPlatformCat('ops');
              setPlatformItem('logins');
            }}
          >
            Ιστορικό εισόδων
          </button>
        </>
      }
    >
      <nav className="admin-workspace-tabs" aria-label="Ενότητες διαχείρισης">
        {(
          [
            ['platform', 'Πλατφόρμα'],
            ['academio', 'Σύλλογος'],
            ['backup', 'Backup'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`admin-workspace-tab${adminTab === id ? ' is-active' : ''}`}
            onClick={() => setAdminTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {adminTab === 'platform' ? (
      <AdminDrill
        categories={PLATFORM_DRILL}
        categoryId={platformCat}
        itemId={platformItem}
        onNavigate={(cat, item) => {
          setPlatformCat(cat);
          setPlatformItem(item);
        }}
      >
          <AdminRow
            drillId="waitlist"
            activeDrill={platformItem}
            id="club-waitlist"
            title="Λίστα αναμονής ακαδημιών"
            description="Αιτήσεις από /register. Έγκριση με κωδικό δημιουργεί σύλλογο και admin λογαριασμό."
            entry={<ClubWaitlistPanel onSaved={flash} />}
            records={
              <RecordsTable>
                <RecordsRow title="Πηγή">
                  Δημόσια φόρμα εγγραφής ακαδημίας (/register).
                </RecordsRow>
                <RecordsRow title="Έγκριση">
                  Ο Platform Admin ορίζει κωδικό και δημιουργεί σύλλογο + admin. Μετά μπορεί να
                  διαγράψει τον σύλλογο.
                </RecordsRow>
                <RecordsRow title="Αποθήκευση">
                  Cloud durable store + τοπικό αντίγραφο. Μετά την έγκριση γίνεται Push λογαριασμών.
                </RecordsRow>
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="logins"
            activeDrill={platformItem}
            id="login-activity"
            title="Ιστορικό εισόδων"
            description="Ποιος συνδέθηκε, σε ποιον σύλλογο ανήκει ο λογαριασμός, ρόλος και ώρα. Αποθήκευση στο cloud."
            entry={<LoginActivityPanel onSaved={flash} />}
            records={
              <RecordsTable>
                <RecordsRow title="Καταγράφει">
                  Επιτυχημένες συνδέσεις και impersonate από Platform Admin.
                </RecordsRow>
                <RecordsRow title="Πεδία">
                  Όνομα, email, σύλλογος, ρόλος, τύπος (σύνδεση / impersonate), ώρα.
                </RecordsRow>
                <RecordsRow title="Αποθήκευση">
                  Cloud durable store (Blob/Redis) + τοπικό αντίγραφο ασφαλείας.
                </RecordsRow>
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="jpegs"
            activeDrill={platformItem}
            id="join-form-snapshots"
            title="Φόρμες δημόσιας εγγραφής (JPEG)"
            description="Ομαδική διαγραφή αποθηκευμένων στιγμιότυπων JPEG (και υπογραφών) από όλους τους συλλόγους ή από επιλεγμένους. Οι αιτήσεις και οι καρτέλες αθλητών μένουν."
            entry={
              <div className="entry-form admin-entry">
                {joinFormError ? <p className="form-error">{joinFormError}</p> : null}
                <label className="admin-check">
                  <span>Όλοι οι σύλλογοι</span>
                  <input
                    type="checkbox"
                    checked={joinFormAllClubs}
                    onChange={(e) => {
                      setJoinFormAllClubs(e.target.checked);
                      if (e.target.checked) setJoinFormClubIds([]);
                    }}
                  />
                </label>
                {!joinFormAllClubs ? (
                  <div className="admin-check-list">
                    {clubs.map((club) => (
                      <label key={club.id} className="admin-check">
                        <span>{club.name}</span>
                        <input
                          type="checkbox"
                          checked={joinFormClubIds.includes(club.id)}
                          onChange={(e) => {
                            setJoinFormClubIds((prev) =>
                              e.target.checked
                                ? [...prev, club.id]
                                : prev.filter((id) => id !== club.id),
                            );
                          }}
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
                <div className="admin-entry-actions">
                  <Button
                    type="button"
                    variant="danger"
                    disabled={joinFormBusy || clubs.length === 0}
                    onClick={() => void handleStripJoinFormSnapshots()}
                  >
                    {joinFormBusy ? 'Διαγραφή…' : 'Διαγραφή JPEG φορμών'}
                  </Button>
                </div>
              </div>
            }
            records={
              <RecordsTable>
                <RecordsRow title="Τι σβήνει">
                  JPEG φόρμας, υπογραφή γονέα και επιλογές δημόσιας αίτησης.
                </RecordsRow>
                <RecordsRow title="Τι μένει">
                  Αθλητές και αιτήσεις (στοιχεία επικοινωνίας). Όχι η κάρτα «Φόρμα δημόσιας εγγραφής».
                </RecordsRow>
                <RecordsRow title="Εμβέλεια">
                  {joinFormAllClubs
                    ? `Όλοι οι σύλλογοι (${clubs.length})`
                    : `${joinFormClubIds.length} επιλεγμένοι`}
                </RecordsRow>
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="logo"
            activeDrill={platformItem}
            title="Logo εφαρμογής"
            description="Καθολικό λογότυπο εφαρμογής (εικονίδιο SS, login, έγγραφα). Αν υπάρχει λογότυπο εφαρμογής ανά σύλλογο, αυτό υπερισχύει στην κεφαλίδα του συλλόγου."
            entry={
              <div className="entry-form admin-entry">
                <div className="settings-logo-row">
                  <div className="settings-logo-preview">
                    {config.appLogoUrl ? (
                      <img src={config.appLogoUrl} alt="Logo εφαρμογής" />
                    ) : (
                      <span>SS</span>
                    )}
                  </div>
                  <div className="settings-logo-actions">
                    <input
                      id="platform-app-logo"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        if (!file.type.startsWith('image/')) {
                          flash('Επιλέξτε εικόνα.');
                          return;
                        }
                        if (file.size > 500_000) {
                          flash('Η εικόνα πρέπει να είναι έως ~500KB.');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          void (async () => {
                            flash('Ανέβασμα logo στο cloud…');
                            const { publishAppLogo } = await import(
                              '../api/services/platformBrandingService'
                            );
                            const result = await publishAppLogo(String(reader.result ?? ''));
                            if (!result.success || !result.data) {
                              flash(result.error ?? 'Αποτυχία αποθήκευσης logo.');
                              return;
                            }
                            setConfig(result.data);
                            flash('Το logo εφαρμόστηκε για όλους τους χρήστες (cloud).');
                          })();
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        void (async () => {
                          const { publishAppLogo } = await import(
                            '../api/services/platformBrandingService'
                          );
                          const result = await publishAppLogo(null);
                          if (!result.success || !result.data) {
                            flash(result.error ?? 'Αποτυχία αφαίρεσης logo.');
                            return;
                          }
                          setConfig(result.data);
                          flash('Το logo αφαιρέθηκε για όλους τους χρήστες.');
                        })();
                      }}
                    >
                      Αφαίρεση logo
                    </Button>
                  </div>
                </div>
              </div>
            }
            records={
              <RecordsTable>
                <RecordsRow title="Όνομα">{config.appName || 'TeamSuite'}</RecordsRow>
                <RecordsRow title="Logo">
                  {config.appLogoUrl ? 'Ορισμένο' : 'Προεπιλογή (SS)'}
                </RecordsRow>
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="theme"
            activeDrill={platformItem}
            title="Εμφάνιση εφαρμογής"
            description="Το θέμα ισχύει για όλους τους συλλόγους: login, shell και modules. Δεν αλλάζει ανά σωματείο."
            entry={
              <div className="entry-form admin-entry appearance-theme-picker">
                {APPEARANCE_THEMES.map((theme) => {
                  const selected =
                    (config.appearanceTheme ?? 'ocean-slate') === theme.id;
                  const swatches: Record<AppearanceTheme, [string, string, string]> = {
                    'ocean-slate': ['#000000', '#f0f4f8', '#2a9bb5'],
                    'graphite-ember': ['#0b0c0e', '#1a1d24', '#e85d2c'],
                  };
                  const [c1, c2, c3] = swatches[theme.id];
                  return (
                    <label
                      key={theme.id}
                      className={`appearance-theme-option${selected ? ' is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="appearance-theme"
                        value={theme.id}
                        checked={selected}
                        onChange={() => {
                          const next = setAppearanceTheme(theme.id as AppearanceTheme);
                          setConfig(next);
                          flash(`Ενεργό θέμα: ${theme.label}.`);
                          void pushAccountBundle().then((pushed) => {
                            if (!pushed.success) {
                              flash(
                                pushed.error ??
                                  'Το θέμα αποθηκεύτηκε τοπικά, αλλά όχι στο cloud. Κάντε Push από Backup.',
                              );
                            }
                          });
                        }}
                      />
                      <div>
                        <strong>{theme.label}</strong>
                        <span>{theme.description}</span>
                        <div className="appearance-theme-swatches" aria-hidden>
                          <i style={{ background: c1 }} />
                          <i style={{ background: c2 }} />
                          <i style={{ background: c3 }} />
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            }
            records={
              <RecordsTable>
                <RecordsRow title="Ενεργό">
                  {APPEARANCE_THEMES.find(
                    (t) => t.id === (config.appearanceTheme ?? 'ocean-slate'),
                  )?.label ?? 'Ocean Slate'}
                </RecordsRow>
                <RecordsRow title="Εμβέλεια">Όλοι οι σύλλογοι (login, shell, modules)</RecordsRow>
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="incomeCat"
            activeDrill={platformItem}
            title="Κατηγορίες εσόδων"
            description="Υποκατηγορίες εσόδων που εμφανίζονται στη φόρμα καταχώρησης."
            entry={
              <form
                className="entry-form admin-entry"
                onSubmit={(e) => {
                  e.preventDefault();
                  const label = newIncomeCategory.trim().toUpperCase();
                  if (!label) return;
                  if (config.incomeCategories.includes(label)) {
                    flash('Υπάρχει ήδη.');
                    return;
                  }
                  persist({
                    ...config,
                    incomeCategories: [...config.incomeCategories, label],
                    incomeDescriptions: { ...config.incomeDescriptions, [label]: [] },
                  });
                  setNewIncomeCategory('');
                  flash('Προστέθηκε κατηγορία εσόδου.');
                }}
              >
                <div className="admin-entry-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      saveFinanceCatalogAsDefaults(config);
                      flash('Οι τρέχουσες κατηγορίες ορίστηκαν ως προεπιλογές.');
                    }}
                  >
                    Ορισμός ως προεπιλογές
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const next = resetFinanceCatalogDefaults(config);
                      setConfig(next);
                      setIncomeDescSub(next.incomeCategories[0] ?? '');
                      setExpenseDescSub(next.expenseCategories[0] ?? '');
                      flash('Επαναφορά προεπιλογών εσόδων/εξόδων.');
                    }}
                  >
                    Επαναφορά defaults
                  </Button>
                </div>
                <label className="field">
                  <span>Νέα κατηγορία</span>
                  <input
                    value={newIncomeCategory}
                    onChange={(e) => setNewIncomeCategory(e.target.value)}
                    placeholder="π.χ. ΕΚΔΗΛΩΣΕΙΣ VIP"
                  />
                </label>
                <Button type="submit">Προσθήκη</Button>
              </form>
            }
            records={
              <RecordsTable>
                {config.incomeCategories.map((item) => (
                  <RecordsRow key={item} title="Κατηγορία">
                    <EditableRecordLine
                      value={item}
                      uppercase
                      onSave={(next) => renameIncomeCategory(item, next)}
                      onDelete={() => {
                        const descriptions = { ...config.incomeDescriptions };
                        delete descriptions[item];
                        persist({
                          ...config,
                          incomeCategories: config.incomeCategories.filter((c) => c !== item),
                          incomeDescriptions: descriptions,
                        });
                        if (incomeDescSub === item) {
                          setIncomeDescSub(
                            config.incomeCategories.find((c) => c !== item) ?? '',
                          );
                        }
                      }}
                    />
                  </RecordsRow>
                ))}
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="incomeDesc"
            activeDrill={platformItem}
            title="Περιγραφές εσόδων"
            description="Επιλογές dropdown ανά υποκατηγορία εσόδου."
            entry={
              <form
                className="entry-form admin-entry"
                onSubmit={(e) => {
                  e.preventDefault();
                  const label = newIncomeDesc.trim().toUpperCase();
                  if (!incomeDescSub || !label) return;
                  const current = config.incomeDescriptions[incomeDescSub] ?? [];
                  if (current.includes(label)) {
                    flash('Υπάρχει ήδη.');
                    return;
                  }
                  persist({
                    ...config,
                    incomeDescriptions: {
                      ...config.incomeDescriptions,
                      [incomeDescSub]: [...current, label],
                    },
                  });
                  setNewIncomeDesc('');
                }}
              >
                <label className="field">
                  <span>Υποκατηγορία</span>
                  <select value={incomeDescSub} onChange={(e) => setIncomeDescSub(e.target.value)}>
                    {config.incomeCategories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Νέα περιγραφή</span>
                  <input value={newIncomeDesc} onChange={(e) => setNewIncomeDesc(e.target.value)} />
                </label>
                <Button type="submit">Προσθήκη</Button>
              </form>
            }
            records={
              <RecordsTable>
                {(config.incomeDescriptions[incomeDescSub] ?? []).map((item) => (
                  <RecordsRow key={item} title="Περιγραφή">
                    <EditableRecordLine
                      value={item}
                      uppercase
                      onSave={(next) => renameDescription('income', incomeDescSub, item, next)}
                      onDelete={() => {
                        persist({
                          ...config,
                          incomeDescriptions: {
                            ...config.incomeDescriptions,
                            [incomeDescSub]: (config.incomeDescriptions[incomeDescSub] ?? []).filter(
                              (d) => d !== item,
                            ),
                          },
                        });
                      }}
                    />
                  </RecordsRow>
                ))}
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="expenseCat"
            activeDrill={platformItem}
            title="Κατηγορίες εξόδων"
            description="Υποκατηγορίες εξόδων που εμφανίζονται στη φόρμα καταχώρησης."
            entry={
              <form
                className="entry-form admin-entry"
                onSubmit={(e) => {
                  e.preventDefault();
                  const label = newExpenseCategory.trim().toUpperCase();
                  if (!label) return;
                  if (config.expenseCategories.includes(label)) {
                    flash('Υπάρχει ήδη.');
                    return;
                  }
                  persist({
                    ...config,
                    expenseCategories: [...config.expenseCategories, label],
                    expenseDescriptions: { ...config.expenseDescriptions, [label]: [] },
                  });
                  setNewExpenseCategory('');
                  flash('Προστέθηκε κατηγορία εξόδου.');
                }}
              >
                <label className="field">
                  <span>Νέα κατηγορία</span>
                  <input
                    value={newExpenseCategory}
                    onChange={(e) => setNewExpenseCategory(e.target.value)}
                    placeholder="π.χ. ΜΕΤΑΦΟΡΕΣ"
                  />
                </label>
                <Button type="submit">Προσθήκη</Button>
              </form>
            }
            records={
              <RecordsTable>
                {config.expenseCategories.map((item) => (
                  <RecordsRow key={item} title="Κατηγορία">
                    <EditableRecordLine
                      value={item}
                      uppercase
                      onSave={(next) => renameExpenseCategory(item, next)}
                      onDelete={() => {
                        const descriptions = { ...config.expenseDescriptions };
                        delete descriptions[item];
                        persist({
                          ...config,
                          expenseCategories: config.expenseCategories.filter((c) => c !== item),
                          expenseDescriptions: descriptions,
                        });
                        if (expenseDescSub === item) {
                          setExpenseDescSub(
                            config.expenseCategories.find((c) => c !== item) ?? '',
                          );
                        }
                      }}
                    />
                  </RecordsRow>
                ))}
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="expenseDesc"
            activeDrill={platformItem}
            title="Περιγραφές εξόδων"
            description="Επιλογές dropdown ανά υποκατηγορία εξόδου."
            entry={
              <form
                className="entry-form admin-entry"
                onSubmit={(e) => {
                  e.preventDefault();
                  const label = newExpenseDesc.trim().toUpperCase();
                  if (!expenseDescSub || !label) return;
                  const current = config.expenseDescriptions[expenseDescSub] ?? [];
                  if (current.includes(label)) {
                    flash('Υπάρχει ήδη.');
                    return;
                  }
                  persist({
                    ...config,
                    expenseDescriptions: {
                      ...config.expenseDescriptions,
                      [expenseDescSub]: [...current, label],
                    },
                  });
                  setNewExpenseDesc('');
                }}
              >
                <label className="field">
                  <span>Υποκατηγορία</span>
                  <select
                    value={expenseDescSub}
                    onChange={(e) => setExpenseDescSub(e.target.value)}
                  >
                    {config.expenseCategories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Νέα περιγραφή</span>
                  <input
                    value={newExpenseDesc}
                    onChange={(e) => setNewExpenseDesc(e.target.value)}
                  />
                </label>
                <Button type="submit">Προσθήκη</Button>
              </form>
            }
            records={
              <RecordsTable>
                {(config.expenseDescriptions[expenseDescSub] ?? []).map((item) => (
                  <RecordsRow key={item} title="Περιγραφή">
                    <EditableRecordLine
                      value={item}
                      uppercase
                      onSave={(next) => renameDescription('expense', expenseDescSub, item, next)}
                      onDelete={() => {
                        persist({
                          ...config,
                          expenseDescriptions: {
                            ...config.expenseDescriptions,
                            [expenseDescSub]: (config.expenseDescriptions[expenseDescSub] ?? []).filter(
                              (d) => d !== item,
                            ),
                          },
                        });
                      }}
                    />
                  </RecordsRow>
                ))}
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="roles"
            activeDrill={platformItem}
            title="Δικαιώματα ρόλων"
            description="Καθολικές προεπιλογές για όλα τα σωματεία. Ό,τι ορίζει εδώ ο Platform Admin ισχύει by default σε κάθε σύλλογο."
            entry={
              <div className="entry-form admin-entry">
                <p className="admin-entry-note">
                  Τα δικαιώματα αποθηκεύονται κεντρικά και εφαρμόζονται αυτόματα σε όλα τα
                  σωματεία για τον αντίστοιχο ρόλο.
                </p>
                <div className="admin-role-tabs">
                  {CLUB_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      className={`report-chip ${clubRole === role ? 'is-active' : ''}`}
                      onClick={() => setClubRole(role)}
                    >
                      {CLUB_ROLE_LABELS[role]}
                    </button>
                  ))}
                </div>
                <div className="admin-check-list">
                  {clubRole === 'admin' ? (
                    <p className="admin-entry-note">
                      Ο διαχειριστής συλλόγου έχει by default όλα τα δικαιώματα ενεργά.
                    </p>
                  ) : null}
                  {CLUB_PERMISSIONS.map((permission) => {
                    const active =
                      clubRole === 'admin' ||
                      (config.clubRolePermissions?.[clubRole] ?? []).includes(permission);
                    return (
                      <label key={permission} className="admin-check">
                        <span>
                          {CLUB_PERMISSION_LABELS[permission]}: {active ? 'Ενεργό' : 'Ανενεργό'}
                        </span>
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={clubRole === 'admin' || clubRole === 'doctor'}
                          onChange={() => toggleClubPermission(permission)}
                        />
                      </label>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const previous = structuredClone(roleDefaultsBaselineRef.current);
                      persist(config);
                      saveUsers(
                        clearStampedRoleDefaultPermissions(getUsers(), previous),
                      );
                      roleDefaultsBaselineRef.current = structuredClone(
                        config.clubRolePermissions,
                      );
                      const pushed = await pushAccountBundle();
                      if (!pushed.success) {
                        flash(
                          pushed.error ??
                            'Αποθηκεύτηκε τοπικά, αλλά όχι στο cloud. Κάντε Push από Backup.',
                        );
                        return;
                      }
                      flash(
                        'Τα δικαιώματα ρόλων αποθηκεύτηκαν ως προεπιλογή για όλα τα σωματεία.',
                      );
                    })();
                  }}
                >
                  Αποθήκευση δικαιωμάτων
                </Button>
              </div>
            }
            records={
              <RecordsTable>
                <RecordsRow title="Εμβέλεια">Όλα τα σωματεία (by default)</RecordsRow>
                <RecordsRow title="Ρόλος">{CLUB_ROLE_LABELS[clubRole]}</RecordsRow>
                <RecordsRow title="Ενεργά">
                  {(config.clubRolePermissions?.[clubRole] ?? [])
                    .map((p) => CLUB_PERMISSION_LABELS[p])
                    .filter(Boolean)
                    .join(' · ') || 'Κανένα'}
                </RecordsRow>
                <RecordsRow title="Σύνολο">
                  {(config.clubRolePermissions?.[clubRole] ?? []).length} /{' '}
                  {CLUB_PERMISSIONS.length}
                </RecordsRow>
              </RecordsTable>
            }
          />
      </AdminDrill>
      ) : null}

      {adminTab === 'backup' ? (
      <AdminDrill
        categories={BACKUP_DRILL}
        categoryId={backupCat}
        itemId={backupItem}
        onNavigate={(cat, item) => {
          setBackupCat(cat);
          setBackupItem(item);
        }}
      >
          <AdminRow
            drillId="full"
            activeDrill={backupItem}
            title="Backup / επαναφορά όλης της εφαρμογής"
            description="Πλήρες αντίγραφο πλατφόρμας: όλοι οι σύλλογοι, users, config. Ξεχωριστή επαναφορά από το club restore."
            entry={
              <div className="entry-form admin-entry">
                <div className="admin-entry-actions">
                  <Button type="button" onClick={handleBackupExport}>
                    Λήψη full backup
                  </Button>
                  <Button type="button" variant="danger" onClick={handleResetAppData}>
                    Μηδενισμός δεδομένων
                  </Button>
                </div>
                <form onSubmit={handlePlatformBackupImport} className="admin-import-form">
                  <p className="admin-entry-note">
                    <strong>Επαναφορά πλατφόρμας</strong> — επιλέξτε αρχείο <strong>.json</strong> από «Λήψη
                    full backup». Δεν περιέχει SMTP/Viva secrets ούτε password hashes (διατηρούνται
                    τα τοπικά).
                  </p>
                  <input
                    name="platformBackupFile"
                    type="file"
                    accept="application/json,.json"
                    disabled={platformRestoring}
                  />
                  <Button type="submit" variant="secondary" disabled={platformRestoring}>
                    {platformRestoring ? 'Επαναφορά…' : 'Επαναφορά όλης της εφαρμογής'}
                  </Button>
                </form>
              </div>
            }
            records={
              <RecordsTable>
                <RecordsRow title="Περιεχόμενο">
                  Users/clubs (χωρίς secrets), app data όλων των συλλόγων, platform config.
                </RecordsRow>
                <RecordsRow title="Restore">Μόνο full platform αρχεία (όχι club-only).</RecordsRow>
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="club"
            activeDrill={backupItem}
            title="Backup / επαναφορά συγκεκριμένου συλλόγου"
            description="Στοχευμένη λήψη ή επαναφορά δεδομένων ενός συλλόγου — οι υπόλοιποι δεν αλλάζουν."
            entry={
              <div className="entry-form admin-entry">
                <Select
                  label="Σύλλογος"
                  name="restoreClubId"
                  value={restoreClubId}
                  onChange={(e) => setRestoreClubId(e.target.value)}
                  options={
                    clubs.length > 0
                      ? clubs.map((c) => ({ value: c.id, label: c.name }))
                      : [{ value: '', label: '— Δεν υπάρχουν σύλλογοι —' }]
                  }
                />
                <div className="admin-entry-actions">
                  <Button
                    type="button"
                    onClick={handleClubBackupExport}
                    disabled={!restoreClubId}
                  >
                    Λήψη backup συλλόγου
                  </Button>
                </div>
                <form onSubmit={handleClubBackupImport} className="admin-import-form">
                  <p className="admin-entry-note">
                    <strong>Επαναφορά συλλόγου</strong> — δέχεται club-only backup JSON ή full platform
                    backup (θα χρησιμοποιηθούν μόνο τα δεδομένα του επιλεγμένου συλλόγου).
                  </p>
                  <input
                    name="clubBackupFile"
                    type="file"
                    accept="application/json,.json"
                    disabled={clubRestoring || !restoreClubId}
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={clubRestoring || !restoreClubId}
                  >
                    {clubRestoring ? 'Επαναφορά…' : 'Επαναφορά στον επιλεγμένο σύλλογο'}
                  </Button>
                </form>
              </div>
            }
            records={
              <RecordsTable>
                <RecordsRow title="Ενεργός στόχος">
                  {clubs.find((c) => c.id === restoreClubId)?.name ?? '—'}
                </RecordsRow>
                <RecordsRow title="Εμβέλεια">
                  Μόνο AppData (+ users/club record του συλλόγου αν υπάρχουν στο αρχείο).
                </RecordsRow>
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="gdrive"
            activeDrill={backupItem}
            title="Google Drive (όλοι οι σύλλογοι)"
            description="Ένας φάκελος στο Drive σας, με υποφάκελο ανά σύλλογο. Το νυχτερινό backup ανεβάζει JSON χωρίς να χρειάζεται ανοιχτό browser."
            entry={<GoogleDriveBackupPanel onSaved={flash} />}
            records={
              <RecordsTable>
                <RecordsRow title="Δομή">
                  TeamSuite-Backups / όνομα συλλόγου / ΗΜΕΡΟΜΗΝΙΑ.json
                </RecordsRow>
                <RecordsRow title="Πότε">
                  Cron 02:00 UTC και κουμπί «Δοκιμή / αποστολή τώρα».
                </RecordsRow>
                <RecordsRow title="Περιεχόμενο">
                  Club mirror (ευαίσθητα πεδία όπως στο cloud). Όχι SMTP/Viva secrets.
                </RecordsRow>
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="schedule"
            activeDrill={backupItem}
            title="Πρόγραμμα backup"
            description="Ορίστε πότε γίνεται full backup εφαρμογής και πότε backup δεδομένων κάθε συλλόγου/χρήστη."
            entry={<BackupSchedulePanel onSaved={flash} />}
            records={
              <RecordsTable>
                <RecordsRow title="Full app">
                  Όλη η βάση (users, clubs, config, δεδομένα).
                </RecordsRow>
                <RecordsRow title="Ανά σύλλογο">
                  Ξεχωριστό JSON ή cloud mirror ανά tenant.
                </RecordsRow>
                <RecordsRow title="Σημείωση">
                  Αυτόματη εκτέλεση όσο είναι ανοιχτή η εφαρμογή (τοπική ώρα browser).
                </RecordsRow>
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="diagnostic"
            activeDrill={backupItem}
            title="Διαγνωστικό τεστ εφαρμογής"
            description="Έλεγχος λειτουργιών και Auto Repair για ορφανά δεδομένα / σπασμένες συνδέσεις χρηστών."
            entry={<PlatformDiagnosticPanel onSaved={flash} />}
            records={
              <RecordsTable>
                <RecordsRow title="Καλύπτει">
                  API, Redis/sync, storage, users, clubs, SMTP/Viva, δεδομένα, οικονομικά, fees,
                  αγώνες, config, backup.
                </RecordsRow>
                <RecordsRow title="Αποτέλεσμα">
                  Κρίσιμα / προειδοποιήσεις / info / OK + τρόπος διόρθωσης ανά εύρημα.
                </RecordsRow>
                <RecordsRow title="Auto Repair">
                  Καθαρίζει ορφανές συναλλαγές/παρουσίες και άκυρα coachId/athleteId, τα αποθηκεύει στο cloud και ξανατρέχει τον έλεγχο.
                </RecordsRow>
                <RecordsRow title="Εξαγωγή">
                  Λήψη αναφοράς TXT μετά την εκτέλεση.
                </RecordsRow>
              </RecordsTable>
            }
          />
      </AdminDrill>
      ) : null}

      {adminTab === 'academio' ? (
      <AdminDrill
        categories={ACADEMY_DRILL}
        categoryId={academyCat}
        itemId={academyItem}
        onNavigate={(cat, item) => {
          setAcademyCat(cat);
          setAcademyItem(item);
        }}
      >
          <AdminRow
            drillId="preview"
            activeDrill={academyItem}
            title="Preview συλλόγου"
            description="Δείτε την εφαρμογή όπως εμφανίζεται σε συγκεκριμένο λογαριασμό, χωρίς αποθήκευση αλλαγών."
            entry={
              <div className="entry-form admin-entry">
                <label className="field">
                  <span>Λογαριασμός</span>
                  <select
                    value={catalogClubId}
                    onChange={(e) => setCatalogClubId(e.target.value)}
                  >
                    <option value="">Επιλέξτε…</option>
                    {clubs.map((club) => (
                      <option key={club.id} value={club.id}>
                        {club.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="admin-entry-actions">
                  <Button type="button" onClick={handlePreview} disabled={!catalogClubId}>
                    Preview εφαρμογής
                  </Button>
                  {previewClubId ? (
                    <Button type="button" variant="secondary" onClick={handleEndPreview}>
                      Τέλος preview
                    </Button>
                  ) : null}
                </div>
              </div>
            }
            records={
              <RecordsTable>
                <RecordsRow title="Κατάσταση">
                  {previewClubId
                    ? `Ενεργό preview: ${clubs.find((c) => c.id === previewClubId)?.name ?? previewClubId}`
                    : 'Δεν υπάρχει ενεργό preview.'}
                </RecordsRow>
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="clubLogo"
            activeDrill={academyItem}
            title="Λογότυπο εφαρμογής ανά σύλλογο"
            description="Διαφορετικό εικονίδιο SS στην κεφαλίδα για κάθε σύλλογο. Το λογότυπο συλλόγου (αποδείξεις, Ρυθμίσεις) ορίζεται χωριστά από τον σύλλογο."
            entry={
              <div className="entry-form admin-entry">
                <input
                  ref={clubLogoFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  hidden
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file || !catalogClubId) return;
                    void (async () => {
                      try {
                        flash('Ανέβασμα λογότυπου εφαρμογής στο cloud…');
                        const dataUrl = await optimizeLogoDataUrl(file);
                        const { publishClubAppLogo } = await import(
                          '../api/services/platformBrandingService'
                        );
                        const result = await publishClubAppLogo(catalogClubId, dataUrl);
                        if (!result.success || !result.data) {
                          flash(result.error ?? 'Αποτυχία αποθήκευσης λογότυπου εφαρμογής.');
                          return;
                        }
                        setConfig(result.data);
                        flash('Το λογότυπο εφαρμογής αποθηκεύτηκε για τον επιλεγμένο σύλλογο.');
                      } catch (err) {
                        flash(
                          err instanceof Error
                            ? err.message
                            : 'Αποτυχία αποθήκευσης λογότυπου εφαρμογής.',
                        );
                      }
                    })();
                  }}
                />
                <label className="field">
                  <span>Σύλλογος</span>
                  <select
                    value={catalogClubId}
                    onChange={(e) => setCatalogClubId(e.target.value)}
                  >
                    <option value="">Επιλέξτε…</option>
                    {clubs.map((club) => (
                      <option key={club.id} value={club.id}>
                        {club.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="admin-entry-actions">
                  <Button
                    type="button"
                    disabled={!catalogClubId}
                    onClick={() => clubLogoFileRef.current?.click()}
                  >
                    Ανέβασμα λογότυπου εφαρμογής
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!catalogClubId || !config.clubAppLogos?.[catalogClubId]}
                    onClick={() => {
                      if (!catalogClubId) return;
                      void (async () => {
                        const { publishClubAppLogo } = await import(
                          '../api/services/platformBrandingService'
                        );
                        const result = await publishClubAppLogo(catalogClubId, null);
                        if (!result.success || !result.data) {
                          flash(result.error ?? 'Αποτυχία αφαίρεσης.');
                          return;
                        }
                        setConfig(result.data);
                        flash('Επανήλθε το καθολικό λογότυπο εφαρμογής για αυτόν τον σύλλογο.');
                      })();
                    }}
                  >
                    Αφαίρεση (καθολικό)
                  </Button>
                </div>
              </div>
            }
            records={
              <RecordsTable>
                {clubs.map((club) => {
                  const perClub = (config.clubAppLogos?.[club.id] ?? '').trim();
                  return (
                    <RecordsRow key={club.id} title={club.name}>
                      {perClub ? (
                        <img className="admin-club-logo-thumb" src={perClub} alt="" />
                      ) : (
                        'Καθολικό logo εφαρμογής / SS'
                      )}
                    </RecordsRow>
                  );
                })}
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="associations"
            activeDrill={academyItem}
            title="Ομάδες σωματείου"
            description="Σωματεία που εμφανίζονται στις φόρμες εσόδων/εξόδων."
            entry={
              <form
                className="entry-form admin-entry"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newAssociation.trim();
                  if (!name) return;
                  mutateData((data) => {
                    data.associations.push({
                      id: createId('assoc'),
                      name,
                      city: '',
                      phone: '',
                      email: '',
                      address: '',
                      active: true,
                    });
                  });
                  setNewAssociation('');
                  setTick((n) => n + 1);
                }}
              >
                <label className="field">
                  <span>Νέο σωματείο</span>
                  <input
                    value={newAssociation}
                    onChange={(e) => setNewAssociation(e.target.value)}
                  />
                </label>
                <Button type="submit">Προσθήκη</Button>
              </form>
            }
            records={
              <RecordsTable>
                {appData.associations.length === 0 ? (
                  <RecordsRow title="Κατάσταση">Δεν υπάρχουν σωματεία.</RecordsRow>
                ) : (
                  appData.associations.map((item) => (
                    <RecordsRow key={item.id} title="Σωματείο">
                      <EditableRecordLine
                        value={item.name}
                        onSave={(next) => {
                          mutateData((data) => {
                            const target = data.associations.find((a) => a.id === item.id);
                            if (target) target.name = next;
                          });
                          setTick((n) => n + 1);
                          flash('Το σωματείο ενημερώθηκε.');
                          return { success: true };
                        }}
                        onDelete={() => {
                          mutateData((data) => {
                            data.associations = data.associations.filter((a) => a.id !== item.id);
                          });
                          setTick((n) => n + 1);
                        }}
                      />
                    </RecordsRow>
                  ))
                )}
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="financeTabs"
            activeDrill={academyItem}
            title="Καρτέλες Οικονομικών"
            description="Ποιες επιλογές εμφανίζονται στο μενού Οικονομικά (Ανάλυση, Έσοδα, Έξοδα, Ταμεία, Ισοζύγιο, Προϋπολογισμός, Αναφορές). Ισχύει για όλους τους συλλόγους."
            entry={
              <div className="entry-form admin-entry">
                <div className="admin-check-list">
                  {FINANCE_TABS.map((tab) => (
                    <label key={tab.id} className="admin-check">
                      <span>
                        {tab.label}: {financeTabs.includes(tab.id) ? 'Ενεργή' : 'Ανενεργή'}
                      </span>
                      <input
                        type="checkbox"
                        checked={financeTabs.includes(tab.id)}
                        onChange={() => toggleFinanceTab(tab.id)}
                      />
                    </label>
                  ))}
                </div>
                <Button
                  type="button"
                  onClick={() => flash('Οι καρτέλες Οικονομικών αποθηκεύτηκαν.')}
                >
                  Αποθήκευση καρτελών
                </Button>
              </div>
            }
            records={
              <RecordsTable>
                <RecordsRow title="Ενεργές">
                  {FINANCE_TABS.filter((t) => financeTabs.includes(t.id))
                    .map((t) => t.label)
                    .join(' · ') || '—'}
                </RecordsRow>
              </RecordsTable>
            }
          />
          <AdminRow
            drillId="menu"
            activeDrill={academyItem}
            title="Καρτέλες μενού ακαδημίας"
            description="Εμφάνιση/απόκρυψη στοιχείων sidebar (Αθλητές, Τμήματα, Οικονομικά κ.λπ.)."
            entry={
              <div className="entry-form admin-entry">
                <label className="field">
                  <span>Λογαριασμός</span>
                  <select
                    value={catalogClubId}
                    onChange={(e) => setCatalogClubId(e.target.value)}
                  >
                    <option value="">Επιλέξτε…</option>
                    {clubs.map((club) => (
                      <option key={club.id} value={club.id}>
                        {club.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="admin-check-list">
                  {ACADEMY_MODULES.map((module) => (
                    <label key={module.id} className="admin-check">
                      <span>
                        {module.label}:{' '}
                        {academyModules.includes(module.id) ? 'Εμφανής' : 'Κρυφή'}
                      </span>
                      <input
                        type="checkbox"
                        checked={academyModules.includes(module.id)}
                        onChange={() => toggleAcademyModule(module.id)}
                        disabled={!catalogClubId}
                      />
                    </label>
                  ))}
                </div>
                <Button
                  type="button"
                  onClick={() => flash('Το μενού ακαδημίας αποθηκεύτηκε.')}
                  disabled={!catalogClubId}
                >
                  Αποθήκευση μενού
                </Button>
              </div>
            }
            records={
              <RecordsTable>
                <RecordsRow title="Ενεργές">
                  {selectedClub
                    ? academyModules
                        .map((id) => ACADEMY_MODULES.find((m) => m.id === id)?.label ?? id)
                        .join(' · ') || '—'
                    : 'Επιλέξτε λογαριασμό'}
                </RecordsRow>
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="seasons"
            activeDrill={academyItem}
            title="Σεζόν"
            description="Διαθέσιμες αγωνιστικές σεζόν για φίλτρα και οικονομικά."
            entry={
              <form
                className="entry-form admin-entry"
                onSubmit={(e) => {
                  e.preventDefault();
                  const label = newSeason.trim();
                  if (!label) return;
                  if (config.seasons.includes(label)) return;
                  persist({ ...config, seasons: [...config.seasons, label] });
                  setNewSeason('');
                }}
              >
                <label className="field">
                  <span>Νέα σεζόν</span>
                  <input
                    value={newSeason}
                    onChange={(e) => setNewSeason(e.target.value)}
                    placeholder="π.χ. 2027–2028"
                  />
                </label>
                <Button type="submit">Προσθήκη</Button>
              </form>
            }
            records={
              <RecordsTable>
                {config.seasons.map((item) => (
                  <RecordsRow key={item} title="Σεζόν">
                    <EditableRecordLine
                      value={item}
                      onSave={(next) => {
                        if (next !== item && config.seasons.includes(next)) {
                          flash('Υπάρχει ήδη.');
                          return { success: false, error: 'Υπάρχει ήδη.' };
                        }
                        persist({
                          ...config,
                          seasons: config.seasons.map((s) => (s === item ? next : s)),
                        });
                        flash('Η σεζόν ενημερώθηκε.');
                        return { success: true };
                      }}
                      onDelete={() =>
                        persist({
                          ...config,
                          seasons: config.seasons.filter((s) => s !== item),
                        })
                      }
                    />
                  </RecordsRow>
                ))}
              </RecordsTable>
            }
          />

          <AdminRow
            drillId="licenses"
            activeDrill={academyItem}
            title="Άδειες / πακέτο"
            description="Όρια αθλητών και πακέτο GROWTH (τιμές μόνο από Platform Admin)."
            entry={
              <div className="entry-form admin-entry">
                <p className="admin-entry-note">
                  Διαχείριση πακέτου GROWTH και αδειών ανά σύλλογο.
                </p>
                <Link className="btn btn-primary" to="/platform/packages">
                  Πακέτο αδειών
                </Link>
                <Link className="btn btn-secondary" to="/platform/users">
                  Άδειες ανά σύλλογο
                </Link>
              </div>
            }
            records={
              <RecordsTable>
                {clubs.map((club) => (
                  <RecordsRow key={club.id} title={club.name}>
                    {club.athleteLicenseUsed} / {club.athleteLicenseLimit} άδειες
                  </RecordsRow>
                ))}
              </RecordsTable>
            }
          />
      </AdminDrill>
      ) : null}
    </PlatformAdminShell>
  );
}
