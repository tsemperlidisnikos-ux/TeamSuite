import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  UserCog,
  Layers,
  CalendarDays,
  ClipboardCheck,
  Wallet,
  ArrowLeftRight,
  UsersRound,
  CreditCard,
  Menu,
  X,
  LogOut,
  Printer,
  Images,
  Users,
  Megaphone,
  Package,
  Building2,
  Settings,
  Trophy,
  FileText,
  KeyRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type SVGProps,
} from 'react';
import { getSession, getUserById, isPlatformAdmin, logout, roleLabels } from '../../auth/auth';
import { getClubById, ensureSessionClub } from '../../auth/clubs';
import { AthletesIcon } from '../icons/AthletesIcon';
import { TrainingsIcon } from '../icons/TrainingsIcon';
import {
  ACADEMY_MODULES,
  endPreview,
  getAcademyModulesForClub,
  getAppLogoUrlForClub,
  getAppName,
  getPreviewClubId,
  userCanAccessModule,
  type AcademyModuleId,
} from '../../platform/platformConfig';
import { useAppData } from '../../hooks/useAppData';
import { useCloudMirrorAutoPull } from '../../hooks/useCloudMirrorAutoPull';
import { useT } from '../../i18n/LocaleContext';
import { downloadClubBackupJsonAndAthletesXlsx } from '../../utils/clubQuickExport';
import { ClubSyncStatus } from '../ClubSyncStatus';
import { RosterSyncHealthBanner } from '../RosterSyncHealthBanner';
import { listLowStockProducts } from '../../utils/warehouseStock';
import {
  CLUB_SYNC_STATUS_EVENT,
  CLUB_WRITE_CONFLICT_EVENT,
  flushClubMirrorPush,
  getClubWriteConflict,
  getLastSyncAt,
  getLastSyncError,
  isMirrorPushStale,
  resolveClubWriteConflict,
} from '../../data/clubSync';
import * as publicClubCloudService from '../../api/services/publicClubCloudService';
import { publishAppLogo, publishClubAppLogo } from '../../api/services/platformBrandingService';
import { optimizeLogoDataUrl } from '../../utils/clubLogoFile';

type NavIcon = LucideIcon | ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const academyItems: Array<{
  id: AcademyModuleId;
  to: string;
  label: string;
  icon: NavIcon;
  end?: boolean;
}> = [
  { id: 'dashboard', to: '/', label: 'Προεπισκόπηση', icon: LayoutDashboard, end: true },
  { id: 'calendar', to: '/calendar', label: 'Ημερολόγιο', icon: Calendar },
  { id: 'athletes', to: '/athletes', label: 'Αθλητές', icon: AthletesIcon },
  { id: 'staff', to: '/staff', label: 'Προσωπικό', icon: UsersRound },
  { id: 'coaches', to: '/coaches', label: 'Προπονητές', icon: UserCog },
  { id: 'classes', to: '/classes', label: 'Τμήματα', icon: Layers },
  { id: 'parents', to: '/parents', label: 'Γονείς', icon: Users },
  { id: 'trainings', to: '/trainings', label: 'Προπονήσεις', icon: TrainingsIcon },
  { id: 'matches', to: '/matches', label: 'Αγώνες', icon: Trophy },
  { id: 'schedule', to: '/schedule', label: 'Πρόγραμμα', icon: CalendarDays },
  { id: 'attendance', to: '/attendance', label: 'Παρουσίες', icon: ClipboardCheck },
  { id: 'announcements', to: '/announcements', label: 'Ανακοινώσεις', icon: Megaphone },
  { id: 'prints', to: '/prints', label: 'Εκτυπώσεις', icon: Printer },
  { id: 'photos', to: '/photos', label: 'Φωτογραφίες', icon: Images },
  { id: 'warehouse', to: '/warehouse', label: 'Αποθήκη', icon: Package },
  { id: 'fees', to: '/fees', label: 'Συνδρομές / Πληρωμές', icon: CreditCard },
  { id: 'transactions', to: '/transactions', label: 'Συναλλαγές', icon: ArrowLeftRight },
  {
    id: 'partnerBusinesses',
    to: '/partner-businesses',
    label: 'Συμβεβλημένες Επιχειρήσεις',
    icon: Building2,
  },
  { id: 'documentProtocol', to: '/document-protocol', label: 'Πρωτόκολλο Εγγράφων', icon: FileText },
  { id: 'settings', to: '/settings', label: 'Ρυθμίσεις', icon: Settings },
];

const provisionsItems: Array<{
  id: AcademyModuleId;
  to: string;
  label: string;
  icon: NavIcon;
}> = [
  { id: 'rental', to: '/rental', label: 'Ενοικίαση', icon: KeyRound },
  { id: 'finance', to: '/finance', label: 'Οικονομικά', icon: Wallet },
];

export function AppLayout() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [clubTick, setClubTick] = useState(0);
  const [platformTick, setPlatformTick] = useState(0);
  const [logoError, setLogoError] = useState('');
  const navigate = useNavigate();
  const session = getSession();
  const previewClubId = getPreviewClubId();
  const clubId = previewClubId ?? session?.clubId ?? null;
  const club = useMemo(() => {
    if (previewClubId) return getClubById(previewClubId);
    return ensureSessionClub(session) ?? getClubById(clubId);
  }, [clubId, clubTick, previewClubId, session]);
  const appName = getAppName();
  const clubLogoUrl = club?.logoUrl?.trim() || '';
  const appLogoUrl = useMemo(() => getAppLogoUrlForClub(clubId), [platformTick, clubId]);
  const appLogoInputRef = useRef<HTMLInputElement>(null);
  const canUploadAppLogo = isPlatformAdmin();

  const [usersTick, setUsersTick] = useState(0);
  const { data: appData } = useAppData();
  useCloudMirrorAutoPull(clubId);
  const pendingRegistrationCount = useMemo(
    () =>
      (appData.registrationApplications ?? []).filter((app) => app.status === 'pending')
        .length,
    [appData.registrationApplications],
  );
  const lowStockCount = useMemo(
    () => listLowStockProducts(appData.products).length,
    [appData.products],
  );
  const [conflictTick, setConflictTick] = useState(0);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  useEffect(() => {
    const bump = () => setConflictTick((n) => n + 1);
    window.addEventListener(CLUB_WRITE_CONFLICT_EVENT, bump);
    window.addEventListener(CLUB_SYNC_STATUS_EVENT, bump);
    return () => {
      window.removeEventListener(CLUB_WRITE_CONFLICT_EVENT, bump);
      window.removeEventListener(CLUB_SYNC_STATUS_EVENT, bump);
    };
  }, []);
  void conflictTick;
  const writeConflict = clubId ? getClubWriteConflict(clubId) : null;
  const lastSyncError = clubId ? getLastSyncError(clubId) : null;
  const lastSyncAt = clubId ? getLastSyncAt(clubId) : null;
  const mirrorStale = Boolean(clubId && isMirrorPushStale(clubId) && !lastSyncError && !writeConflict);

  useEffect(() => {
    const onClubsUpdated = () => setClubTick((n) => n + 1);
    const onPlatformUpdated = () => setPlatformTick((n) => n + 1);
    const onUsersUpdated = () => setUsersTick((n) => n + 1);
    window.addEventListener('academyhub-clubs-updated', onClubsUpdated);
    window.addEventListener('academyhub-platform-updated', onPlatformUpdated);
    window.addEventListener('academyhub-users-updated', onUsersUpdated);
    return () => {
      window.removeEventListener('academyhub-clubs-updated', onClubsUpdated);
      window.removeEventListener('academyhub-platform-updated', onPlatformUpdated);
      window.removeEventListener('academyhub-users-updated', onUsersUpdated);
    };
  }, []);

  useEffect(() => {
    if (!clubId) return;
    void publicClubCloudService.pullRemoteRegistrationApplications(clubId);
  }, [clubId]);

  const enabledModules = useMemo(() => {
    if (!clubId) return new Set(ACADEMY_MODULES.map((m) => m.id));
    const set = new Set(getAcademyModulesForClub(clubId));
    set.add('dashboard');
    return set;
  }, [clubId, platformTick]);

  const accessUser = useMemo(() => {
    if (!session) return { role: '' as const, permissions: null };
    if (session.role === 'platform_admin') {
      return { role: session.role, permissions: null };
    }
    const stored = getUserById(session.id);
    return {
      role: session.role,
      permissions: stored?.permissions ?? null,
    };
  }, [session, platformTick, clubTick, usersTick]);

  const roleNavLabels = useMemo((): Partial<Record<AcademyModuleId, string>> => {
    if (session?.role === 'athlete') {
      return {
        dashboard: 'Αρχική',
        schedule: 'Προπονήσεις',
        attendance: 'Παρουσίες',
        fees: 'Οικονομικά',
        announcements: 'Ανακοινώσεις',
        settings: 'Ρυθμίσεις',
      };
    }
    if (session?.role === 'coach') {
      return {
        dashboard: 'Αρχική',
        calendar: 'Ημερολόγιο',
        classes: 'Τα Τμήματά μου',
        trainings: 'Προπονήσεις',
        matches: 'Αγώνες',
        attendance: 'Απουσίες / Παρουσίες',
        announcements: 'Ανακοινώσεις',
        athletes: 'Αθλητές',
        schedule: 'Πρόγραμμα',
        partnerBusinesses: 'Συμβεβλημένες Επιχειρήσεις',
        photos: 'Φωτογραφίες',
        settings: 'Ρυθμίσεις',
      };
    }
    if (session?.role === 'parent') {
      return { dashboard: 'Αρχική' };
    }
    return {};
  }, [session?.role]);

  const visibleAcademy = academyItems
    .filter((item) => {
      if (item.id === 'dashboard') {
        return userCanAccessModule(accessUser, 'dashboard');
      }
      return enabledModules.has(item.id) && userCanAccessModule(accessUser, item.id);
    })
    .map((item) => {
      const label = roleNavLabels[item.id];
      return label ? { ...item, label } : item;
    });
  const visibleProvisions = provisionsItems.filter(
    (item) => enabledModules.has(item.id) && userCanAccessModule(accessUser, item.id),
  );

  const headerGreeting = useMemo(() => {
    if (!session) return null;
    if (session.role === 'coach') return 'Καλωσήρθες, Coach!';
    return null;
  }, [session]);

  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    endPreview();
    const { persistLocalStateToCloudBeforeLogout } = await import('../../data/clubSync');
    await persistLocalStateToCloudBeforeLogout();
    logout();
    navigate('/login', { replace: true });
  }

  async function handleAppLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canUploadAppLogo) return;
    setLogoError('');
    try {
      const dataUrl = await optimizeLogoDataUrl(file);
      const result = clubId
        ? await publishClubAppLogo(clubId, dataUrl)
        : await publishAppLogo(dataUrl);
      if (!result.success) {
        setLogoError(result.error ?? 'Αποτυχία αποθήκευσης logo εφαρμογής.');
        return;
      }
      setPlatformTick((n) => n + 1);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Αποτυχία αποθήκευσης logo εφαρμογής.');
    }
  }

  const canQuickClubExport =
    Boolean(clubId) &&
    (session?.role === 'admin' ||
      session?.role === 'secretariat' ||
      session?.role === 'platform_admin');

  const showWarehouseStockAlert =
    lowStockCount > 0 &&
    enabledModules.has('warehouse') &&
    userCanAccessModule(accessUser, 'warehouse') &&
    session?.role !== 'coach' &&
    session?.role !== 'parent' &&
    session?.role !== 'athlete' &&
    session?.role !== 'doctor';

  async function handleResolveConflict(choice: 'keep-local' | 'take-cloud') {
    if (!clubId || conflictBusy) return;
    setConflictBusy(true);
    const result = await resolveClubWriteConflict(clubId, choice);
    setConflictBusy(false);
    setConflictTick((n) => n + 1);
    if (!result.success) {
      window.alert(result.error ?? 'Αποτυχία επίλυσης σύγκρουσης');
    }
  }

  function handleClubLogoQuickExport() {
    if (!clubId || !canQuickClubExport) return;
    downloadClubBackupJsonAndAthletesXlsx(clubId);
  }

  return (
    <div className={`app-frame ${open ? 'nav-open' : ''}`}>
      <header className="app-header">
        <div className="app-header-brand">
          <button
            className="icon-btn mobile-only"
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('Άνοιγμα μενού')}
          >
            <Menu size={18} />
          </button>

          <input
            ref={appLogoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            hidden
            onChange={(e) => void handleAppLogoChange(e)}
          />
          <button
            type="button"
            className={`app-logo-btn ${appLogoUrl ? 'app-logo-btn--full' : ''} ${canUploadAppLogo ? 'is-editable' : ''}`}
            onClick={() => {
              if (canUploadAppLogo) appLogoInputRef.current?.click();
            }}
            aria-label={
              canUploadAppLogo
                ? clubId
                  ? t('Αλλαγή λογότυπου εφαρμογής για αυτόν τον σύλλογο')
                  : t('Αλλαγή λογότυπου εφαρμογής')
                : appName
            }
            title={
              canUploadAppLogo
                ? clubId
                  ? t('Platform Admin: λογότυπο εφαρμογής μόνο για αυτόν τον σύλλογο')
                  : t('Platform Admin: καθολικό λογότυπο εφαρμογής')
                : appName
            }
          >
            {appLogoUrl ? (
              <img src={appLogoUrl} alt={appName} />
            ) : (
              <span className="brand-mark">SS</span>
            )}
          </button>
          {session?.role === 'athlete' || session?.role === 'coach' || logoError ? (
            <div>
              {session?.role === 'athlete' ? (
                <span className="app-header-portal">ATHLETE PORTAL</span>
              ) : session?.role === 'coach' ? (
                <span className="app-header-portal">COACH PORTAL</span>
              ) : null}
              {logoError ? <em className="app-logo-error">{logoError}</em> : null}
            </div>
          ) : null}
        </div>

        {headerGreeting ? <p className="app-header-greeting">{t(headerGreeting)}</p> : null}

        <div className="app-header-user">
          {clubId ? <ClubSyncStatus clubId={clubId} /> : null}
          <div className="app-header-user-meta">
            <strong>{session?.fullName ?? t('Χρήστης')}</strong>
            <span>{session ? t(roleLabels[session.role]) : ''}</span>
          </div>
          <div className="sidebar-user-actions">
            {isPlatformAdmin() ? (
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  endPreview();
                  navigate('/platform');
                }}
                aria-label={t('Διαχείριση πλατφόρμας')}
                title={t('Διαχείριση πλατφόρμας')}
              >
                <UsersRound size={16} />
              </button>
            ) : null}
            <button
              type="button"
              className="icon-btn"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              aria-label={t('Αποσύνδεση')}
              title={t('Αποσύνδεση')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-mobile-close mobile-only">
            <button
              className="icon-btn"
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('Κλείσιμο μενού')}
            >
              <X size={18} />
            </button>
          </div>

          {clubLogoUrl ? (
            canQuickClubExport ? (
              <button
                type="button"
                className="sidebar-club-logo"
                onClick={handleClubLogoQuickExport}
                title={t('Λήψη backup συλλόγου (JSON) και εξαγωγή αθλητών (Excel)')}
                aria-label={t('Λήψη backup συλλόγου (JSON) και εξαγωγή αθλητών (Excel)')}
              >
                <img src={clubLogoUrl} alt="" />
              </button>
            ) : (
              <div className="sidebar-club-logo">
                <img src={clubLogoUrl} alt={club?.name ?? ''} />
              </div>
            )
          ) : null}

          <nav className="side-nav">
            <p className="nav-section">
              {session?.role === 'athlete' ||
              session?.role === 'coach' ||
              session?.role === 'parent' ||
              session?.role === 'doctor'
                ? t('Μενού')
                : t('Ακαδημία')}
            </p>
            {visibleAcademy.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setOpen(false)}
              >
                <item.icon size={18} />
                <span className="nav-link-label">{t(item.label)}</span>
                {item.id === 'athletes' && pendingRegistrationCount > 0 ? (
                  <span className="nav-badge" title={t('Εκκρεμείς αιτήσεις εγγραφής')}>
                    {pendingRegistrationCount > 99 ? '99+' : pendingRegistrationCount}
                  </span>
                ) : null}
                {item.id === 'warehouse' && lowStockCount > 0 && showWarehouseStockAlert ? (
                  <span className="nav-badge" title="Χαμηλό απόθεμα">
                    {lowStockCount > 99 ? '99+' : lowStockCount}
                  </span>
                ) : null}
              </NavLink>
            ))}
            {visibleProvisions.length > 0 ? <p className="nav-section">{t('Παροχές')}</p> : null}
            {visibleProvisions.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setOpen(false)}
              >
                <item.icon size={18} />
                {t(item.label)}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="main-area">
          {previewClubId && isPlatformAdmin() ? (
            <div className="preview-banner">
              <div>
                <strong>{t('Preview συλλόγου')}</strong>
                <span>{club?.name ?? previewClubId}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  endPreview();
                  navigate('/platform');
                }}
              >
                {t('Τέλος preview')}
              </button>
            </div>
          ) : null}
          <main className="page page--flush-top">
            <RosterSyncHealthBanner clubId={clubId} />
            {lastSyncError && !writeConflict ? (
              <div className="ops-alert-banner is-warn" role="status">
                <p>Αποτυχία αποστολής στο cloud: {lastSyncError}</p>
                <div className="ops-alert-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={retryBusy}
                    onClick={() => {
                      if (!clubId) return;
                      setRetryBusy(true);
                      void flushClubMirrorPush(clubId, { force: true }).finally(() =>
                        setRetryBusy(false),
                      );
                    }}
                  >
                    {retryBusy ? 'Επανάληψη…' : 'Επανάληψη Push'}
                  </button>
                  <Link className="btn btn-secondary" to="/settings?tab=backup">
                    Backup / sync
                  </Link>
                </div>
              </div>
            ) : null}
            {mirrorStale ? (
              <div className="ops-alert-banner is-warn" role="status">
                <p>
                  Τελευταίο επιτυχές Push:{' '}
                  {lastSyncAt ? new Date(lastSyncAt).toLocaleString('el-GR') : 'ποτέ'}. Το νυχτερινό
                  backup αντιγράφει μόνο ό,τι έχει ήδη ανέβει στο cloud.
                </p>
                <div className="ops-alert-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={retryBusy}
                    onClick={() => {
                      if (!clubId) return;
                      setRetryBusy(true);
                      void flushClubMirrorPush(clubId, { force: true }).finally(() =>
                        setRetryBusy(false),
                      );
                    }}
                  >
                    {retryBusy ? 'Αποστολή…' : 'Push τώρα'}
                  </button>
                  <Link className="btn btn-secondary" to="/settings?tab=backup">
                    Backup
                  </Link>
                </div>
              </div>
            ) : null}
            {writeConflict ? (
              <div className="ops-alert-banner is-warn" role="status">
                <p>
                  Ο/Η <strong>{writeConflict.cloudByName}</strong> αποθήκευσε στο cloud στις{' '}
                  {new Date(writeConflict.cloudAt).toLocaleString('el-GR')}. Οι αλλαγές σε αυτόν
                  τον υπολογιστή δεν αντικατέστησαν σιωπηλά τις δικές του.
                </p>
                <div className="ops-alert-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={conflictBusy}
                    onClick={() => void handleResolveConflict('keep-local')}
                  >
                    Κράτα τα δικά μου
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={conflictBusy}
                    onClick={() => void handleResolveConflict('take-cloud')}
                  >
                    Φόρτωσε του άλλου
                  </button>
                </div>
              </div>
            ) : null}
            {showWarehouseStockAlert ? (
              <Link className="ops-alert-banner is-warn" to="/warehouse?status=low">
                <p>
                  <strong>{lowStockCount}</strong> προϊόντα στην αποθήκη είναι κάτω από το ελάχιστο
                  απόθεμα.
                </p>
              </Link>
            ) : null}
            <Outlet />
          </main>
        </div>

        {open ? (
          <button
            className="nav-scrim"
            type="button"
            aria-label="Κλείσιμο"
            onClick={() => setOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
