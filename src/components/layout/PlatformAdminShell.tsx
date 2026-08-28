import { type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getSession, logout } from '../../auth/auth';
import { Button } from '../ui/Button';

export function AdminZone({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-zone">
      <h2 className="admin-zone-title">{title}</h2>
      <div className="admin-zone-stack">{children}</div>
    </section>
  );
}

export function PlatformAdminShell({
  title,
  lede,
  extraActions,
  banner,
  error,
  children,
}: {
  title: string;
  lede: string;
  extraActions?: ReactNode;
  banner?: string;
  error?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession();
  const path = location.pathname;

  return (
    <div className="platform-admin-page">
      <header className="platform-admin-header">
        <div>
          <p className="eyebrow">Platform Admin</p>
          <h1>{title}</h1>
          <p className="lede">{lede}</p>
        </div>
        <div className="platform-admin-actions">
          <span className="platform-admin-user">{session?.fullName}</span>
          <Link
            className={`btn btn-secondary${path === '/platform' ? ' is-current' : ''}`}
            to="/platform"
          >
            Διαχείριση
          </Link>
          <Link
            className={`btn btn-secondary${path.startsWith('/platform/users') ? ' is-current' : ''}`}
            to="/platform/users"
          >
            Χρήστες
          </Link>
          <Link
            className={`btn btn-secondary${path.startsWith('/platform/packages') ? ' is-current' : ''}`}
            to="/platform/packages"
          >
            Πακέτο αδειών
          </Link>
          {extraActions}
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            Αποσύνδεση
          </Button>
        </div>
      </header>
      {banner ? <p className="platform-admin-banner">{banner}</p> : null}
      {error ? <p className="platform-admin-banner platform-admin-banner-error">{error}</p> : null}
      {children}
    </div>
  );
}
