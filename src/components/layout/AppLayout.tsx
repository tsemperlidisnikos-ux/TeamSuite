import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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
  { id: 'rental', to: '/rental', label: 'Ενοικίαση', icon: KeyRound },
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

const analysisItems: Array<{
  id: AcademyModuleId;
  to: string;
  label: string;
  icon: NavIcon;
}> = [
  { id: 'finance', to: '/finance', label: 'Οικονομικά', icon: Wallet },
];

export function AppLayout() {
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
    return new Set(getAcademyModulesForClub(clubId));
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
    .filter((item) => enabledModules.has(item.id) && userCanAccessModule(accessUser, item.id))
    .map((item) => {
      const label = roleNavLabels[item.id];
      return label ? { ...item, label } : item;
    });
  const visibleAnalysis = analysisItems.filter(
    (item) => enabledModules.has(item.id) && userCanAccessModule(accessUser, item.id),
  );

  const headerGreeting = useMemo(() => {
    if (!session) return null;
    if (session.role === 'coach') return 'Καλωσήρθες, Coach!';
    return null;
  }, [session]);

  async function handleLogout() {
    endPreview();
    const { persistLocalStateToCloud } = await import('../../data/clubSync');
    await persistLocalStateToCloud();
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

  return (
    <div className={`app-frame ${open ? 'nav-open' : ''}`}>
      <header className="app-header">
        <div className="app-header-brand">
          <button
            className="icon-btn mobile-only"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Άνοιγμα μενού"
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
                  ? 'Αλλαγή λογότυπου εφαρμογής για αυτόν τον σύλλογο'
                  : 'Αλλαγή λογότυπου εφαρμογής'
                : appName
            }
            title={
              canUploadAppLogo
                ? clubId
                  ? 'Platform Admin: λογότυπο εφαρμογής μόνο για αυτόν τον σύλλογο'
                  : 'Platform Admin: καθολικό λογότυπο εφαρμογής'
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

        {headerGreeting ? <p className="app-header-greeting">{headerGreeting}</p> : null}

        <div className="app-header-user">
          <div>
            <strong>{session?.fullName ?? 'Χρήστης'}</strong>
            <span>{session ? roleLabels[session.role] : ''}</span>
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
                aria-label="Διαχείριση πλατφόρμας"
                title="Διαχείριση πλατφόρμας"
              >
                <UsersRound size={16} />
              </button>
            ) : null}
            <button type="button" className="icon-btn" onClick={handleLogout} aria-label="Αποσύνδεση">
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
              aria-label="Κλείσιμο μενού"
            >
              <X size={18} />
            </button>
          </div>

          {clubLogoUrl ? (
            <div className="sidebar-club-logo">
              <img src={clubLogoUrl} alt={club?.name ?? ''} />
            </div>
          ) : null}

          <nav className="side-nav">
            <p className="nav-section">
              {session?.role === 'athlete' ||
              session?.role === 'coach' ||
              session?.role === 'parent' ||
              session?.role === 'doctor'
                ? 'Μενού'
                : 'Ακαδημία'}
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
                <span className="nav-link-label">{item.label}</span>
                {item.id === 'athletes' && pendingRegistrationCount > 0 ? (
                  <span className="nav-badge" title="Εκκρεμείς αιτήσεις εγγραφής">
                    {pendingRegistrationCount > 99 ? '99+' : pendingRegistrationCount}
                  </span>
                ) : null}
              </NavLink>
            ))}
            {visibleAnalysis.length > 0 ? <p className="nav-section">Ανάλυση</p> : null}
            {visibleAnalysis.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setOpen(false)}
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="main-area">
          {previewClubId && isPlatformAdmin() ? (
            <div className="preview-banner">
              <div>
                <strong>Preview συλλόγου</strong>
                <span>{club?.name ?? previewClubId} · μόνο προβολή</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  endPreview();
                  navigate('/platform');
                }}
              >
                Τέλος preview
              </button>
            </div>
          ) : null}
          <main className="page page--flush-top">
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
