import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getSession, getUserById } from './auth';
import {
  type AcademyModuleId,
  userCanAccessModule,
} from '../platform/platformConfig';

type Props = {
  moduleId: AcademyModuleId;
  children: ReactNode;
};

/** Blocks club routes when the signed-in user lacks the module permission. */
export function RequireModule({ moduleId, children }: Props) {
  const session = getSession();
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const stored = session.role === 'platform_admin' ? null : getUserById(session.id);
  const accessUser = {
    role: session.role,
    permissions: stored?.permissions ?? null,
  };

  if (!userCanAccessModule(accessUser, moduleId)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
