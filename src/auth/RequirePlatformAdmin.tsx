import { Navigate, Outlet } from 'react-router-dom';
import { isPlatformAdmin } from './auth';

export function RequirePlatformAdmin() {
  if (!isPlatformAdmin()) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

export function RedirectPlatformAdmin({ to = '/platform' }: { to?: string }) {
  if (isPlatformAdmin()) {
    return <Navigate to={to} replace />;
  }
  return <Outlet />;
}
