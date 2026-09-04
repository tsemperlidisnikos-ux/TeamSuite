import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { getSession, isPlatformAdmin } from './auth/auth';
import { RequireAuth } from './auth/RequireAuth';
import { RequireModule } from './auth/RequireModule';
import { RequireAthletesOrOwnProfile } from './auth/RequireAthletesOrOwnProfile';
import { RequirePlatformAdmin } from './auth/RequirePlatformAdmin';
import { AppLayout } from './components/layout/AppLayout';
import { ConsentBanner } from './components/ConsentBanner';
import { LocaleProvider } from './i18n/LocaleContext';
import { getPreviewClubId } from './platform/platformConfig';

const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterClubPage = lazy(() =>
  import('./pages/RegisterClubPage').then((m) => ({ default: m.RegisterClubPage })),
);
const PublicJoinPage = lazy(() =>
  import('./pages/PublicJoinPage').then((m) => ({ default: m.PublicJoinPage })),
);
const PublicRentPage = lazy(() =>
  import('./pages/PublicRentPage').then((m) => ({ default: m.PublicRentPage })),
);
const PublicAthleteIdPage = lazy(() =>
  import('./pages/PublicAthleteIdPage').then((m) => ({ default: m.PublicAthleteIdPage })),
);
const PublicLegalPage = lazy(() =>
  import('./pages/PublicLegalPage').then((m) => ({ default: m.PublicLegalPage })),
);
const PlatformAdminPage = lazy(() =>
  import('./pages/PlatformAdminPage').then((m) => ({ default: m.PlatformAdminPage })),
);
const PlatformUsersPage = lazy(() =>
  import('./pages/PlatformUsersPage').then((m) => ({ default: m.PlatformUsersPage })),
);
const LicensePackagesPage = lazy(() =>
  import('./pages/LicensePackagesPage').then((m) => ({ default: m.LicensePackagesPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const ParentPortalPage = lazy(() =>
  import('./pages/ParentPortalPage').then((m) => ({ default: m.ParentPortalPage })),
);
const CoachPortalPage = lazy(() =>
  import('./pages/CoachPortalPage').then((m) => ({ default: m.CoachPortalPage })),
);
const AthletePortalPage = lazy(() =>
  import('./pages/AthletePortalPage').then((m) => ({ default: m.AthletePortalPage })),
);
const CalendarPage = lazy(() =>
  import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const StudentsPage = lazy(() =>
  import('./pages/StudentsPage').then((m) => ({ default: m.StudentsPage })),
);
const AthleteProfilePage = lazy(() =>
  import('./pages/AthleteProfilePage').then((m) => ({ default: m.AthleteProfilePage })),
);
const StaffPage = lazy(() =>
  import('./pages/StaffPage').then((m) => ({ default: m.StaffPage })),
);
const CoachesPage = lazy(() =>
  import('./pages/CoachesPage').then((m) => ({ default: m.CoachesPage })),
);
const ClassesPage = lazy(() =>
  import('./pages/ClassesPage').then((m) => ({ default: m.ClassesPage })),
);
const ClassProfilePage = lazy(() =>
  import('./pages/ClassProfilePage').then((m) => ({ default: m.ClassProfilePage })),
);
const ParentsPage = lazy(() =>
  import('./pages/ParentsPage').then((m) => ({ default: m.ParentsPage })),
);
const TrainingsPage = lazy(() =>
  import('./pages/TrainingsPage').then((m) => ({ default: m.TrainingsPage })),
);
const MatchesPage = lazy(() =>
  import('./pages/MatchesPage').then((m) => ({ default: m.MatchesPage })),
);
const SchedulePage = lazy(() =>
  import('./pages/SchedulePage').then((m) => ({ default: m.SchedulePage })),
);
const AttendancePage = lazy(() =>
  import('./pages/AttendancePage').then((m) => ({ default: m.AttendancePage })),
);
const AssociationsPage = lazy(() =>
  import('./pages/AssociationsPage').then((m) => ({ default: m.AssociationsPage })),
);
const SportsPage = lazy(() =>
  import('./pages/SportsPage').then((m) => ({ default: m.SportsPage })),
);
const AnnouncementsPage = lazy(() =>
  import('./pages/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })),
);
const PrintsPage = lazy(() =>
  import('./pages/PrintsPage').then((m) => ({ default: m.PrintsPage })),
);
const RentalPage = lazy(() =>
  import('./pages/RentalPage').then((m) => ({ default: m.RentalPage })),
);
const PhotosPage = lazy(() =>
  import('./pages/PhotosPage').then((m) => ({ default: m.PhotosPage })),
);
const WarehousePage = lazy(() =>
  import('./pages/WarehousePage').then((m) => ({ default: m.WarehousePage })),
);
const FeesPage = lazy(() =>
  import('./pages/FeesPage').then((m) => ({ default: m.FeesPage })),
);
const TransactionsPage = lazy(() =>
  import('./pages/TransactionsPage').then((m) => ({ default: m.TransactionsPage })),
);
const PartnerBusinessesPage = lazy(() =>
  import('./pages/PartnerBusinessesPage').then((m) => ({ default: m.PartnerBusinessesPage })),
);
const DocumentProtocolPage = lazy(() =>
  import('./pages/DocumentProtocolPage').then((m) => ({ default: m.DocumentProtocolPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const FinancePage = lazy(() =>
  import('./pages/FinancePage').then((m) => ({ default: m.FinancePage })),
);

function PageFallback() {
  return (
    <div className="stack-lg" style={{ padding: '2rem' }}>
      <p className="muted">Φόρτωση…</p>
    </div>
  );
}

function HomeRoute() {
  if (isPlatformAdmin() && !getPreviewClubId()) {
    return <Navigate to="/platform" replace />;
  }
  const session = getSession();
  if (session?.role === 'parent') return <ParentPortalPage />;
  if (session?.role === 'coach') return <CoachPortalPage />;
  if (session?.role === 'athlete') return <AthletePortalPage />;
  return <DashboardPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <LocaleProvider>
      <ConsentBanner />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterClubPage />} />
          <Route path="/join/:slug" element={<PublicJoinPage />} />
          <Route path="/rent/:slug" element={<PublicRentPage />} />
          <Route path="/id/card" element={<PublicAthleteIdPage />} />
          <Route path="/legal/:doc" element={<PublicLegalPage />} />
          <Route path="/legal" element={<PublicLegalPage />} />

          <Route element={<RequireAuth />}>
            <Route path="platform" element={<RequirePlatformAdmin />}>
              <Route index element={<PlatformAdminPage />} />
              <Route path="users" element={<PlatformUsersPage />} />
              <Route path="packages" element={<LicensePackagesPage />} />
            </Route>

            <Route element={<AppLayout />}>
              <Route index element={<HomeRoute />} />
              <Route
                path="calendar"
                element={
                  <RequireModule moduleId="calendar">
                    <CalendarPage />
                  </RequireModule>
                }
              />
              <Route
                path="athletes"
                element={
                  <RequireModule moduleId="athletes">
                    <StudentsPage />
                  </RequireModule>
                }
              />
              <Route
                path="athletes/:athleteId"
                element={
                  <RequireAthletesOrOwnProfile>
                    <AthleteProfilePage />
                  </RequireAthletesOrOwnProfile>
                }
              />
              <Route path="students" element={<Navigate to="/athletes" replace />} />
              <Route
                path="staff"
                element={
                  <RequireModule moduleId="staff">
                    <StaffPage />
                  </RequireModule>
                }
              />
              <Route
                path="coaches"
                element={
                  <RequireModule moduleId="coaches">
                    <CoachesPage />
                  </RequireModule>
                }
              />
              <Route
                path="classes/:classId"
                element={
                  <RequireModule moduleId="classes">
                    <ClassProfilePage />
                  </RequireModule>
                }
              />
              <Route
                path="classes"
                element={
                  <RequireModule moduleId="classes">
                    <ClassesPage />
                  </RequireModule>
                }
              />
              <Route
                path="parents"
                element={
                  <RequireModule moduleId="parents">
                    <ParentsPage />
                  </RequireModule>
                }
              />
              <Route
                path="trainings"
                element={
                  <RequireModule moduleId="trainings">
                    <TrainingsPage />
                  </RequireModule>
                }
              />
              <Route
                path="matches"
                element={
                  <RequireModule moduleId="matches">
                    <MatchesPage />
                  </RequireModule>
                }
              />
              <Route
                path="schedule"
                element={
                  <RequireModule moduleId="schedule">
                    <SchedulePage />
                  </RequireModule>
                }
              />
              <Route
                path="attendance"
                element={
                  <RequireModule moduleId="attendance">
                    <AttendancePage />
                  </RequireModule>
                }
              />
              <Route
                path="associations"
                element={
                  <RequireModule moduleId="associations">
                    <AssociationsPage />
                  </RequireModule>
                }
              />
              <Route
                path="sports"
                element={
                  <RequireModule moduleId="sports">
                    <SportsPage />
                  </RequireModule>
                }
              />
              <Route
                path="announcements"
                element={
                  <RequireModule moduleId="announcements">
                    <AnnouncementsPage />
                  </RequireModule>
                }
              />
              <Route
                path="prints"
                element={
                  <RequireModule moduleId="prints">
                    <PrintsPage />
                  </RequireModule>
                }
              />
              <Route
                path="rental"
                element={
                  <RequireModule moduleId="rental">
                    <RentalPage />
                  </RequireModule>
                }
              />
              <Route
                path="photos"
                element={
                  <RequireModule moduleId="photos">
                    <PhotosPage />
                  </RequireModule>
                }
              />
              <Route
                path="warehouse"
                element={
                  <RequireModule moduleId="warehouse">
                    <WarehousePage />
                  </RequireModule>
                }
              />
              <Route
                path="fees"
                element={
                  <RequireModule moduleId="fees">
                    <FeesPage />
                  </RequireModule>
                }
              />
              <Route
                path="transactions"
                element={
                  <RequireModule moduleId="transactions">
                    <TransactionsPage />
                  </RequireModule>
                }
              />
              <Route
                path="partner-businesses"
                element={
                  <RequireModule moduleId="partnerBusinesses">
                    <PartnerBusinessesPage />
                  </RequireModule>
                }
              />
              <Route
                path="document-protocol"
                element={
                  <RequireModule moduleId="documentProtocol">
                    <DocumentProtocolPage />
                  </RequireModule>
                }
              />
              <Route
                path="settings"
                element={
                  <RequireModule moduleId="settings">
                    <SettingsPage />
                  </RequireModule>
                }
              />
              <Route
                path="finance"
                element={
                  <RequireModule moduleId="finance">
                    <FinancePage />
                  </RequireModule>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
      </LocaleProvider>
    </BrowserRouter>
  );
}
