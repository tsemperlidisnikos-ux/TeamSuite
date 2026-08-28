import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { getSession, getUserById } from './auth';
import { getData } from '../data/repository';
import { userCanAccessModule } from '../platform/platformConfig';

type Props = {
  children: ReactNode;
};

function isOwnAthleteProfile(
  session: NonNullable<ReturnType<typeof getSession>>,
  athleteId: string,
): boolean {
  if (session.role !== 'athlete') return false;
  if (session.athleteId && session.athleteId === athleteId) return true;
  const email = session.email?.toLowerCase() ?? '';
  if (!email) return false;
  const student = getData().students.find((s) => s.id === athleteId);
  return Boolean(student && student.email.toLowerCase() === email);
}

/** Πρόσβαση στο προφίλ αθλητή: module athletes, ή ο ίδιος ο αθλητής στο δικό του id. */
export function RequireAthletesOrOwnProfile({ children }: Props) {
  const session = getSession();
  const { athleteId } = useParams();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const stored = session.role === 'platform_admin' ? null : getUserById(session.id);
  const accessUser = {
    role: session.role,
    permissions: stored?.permissions ?? null,
  };

  if (userCanAccessModule(accessUser, 'athletes')) {
    return <>{children}</>;
  }

  if (athleteId && isOwnAthleteProfile(session, athleteId)) {
    return <>{children}</>;
  }

  return <Navigate to="/" replace />;
}
