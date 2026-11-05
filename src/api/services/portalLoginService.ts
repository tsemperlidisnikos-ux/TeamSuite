import { upsertCloudUser } from './accountSyncService';
import {
  getSession,
  getUsers,
  isDemoSessionActive,
  isLocalSessionActive,
  prepareStoredPassword,
  saveUsers,
  type AppUser,
} from '../../auth/auth';
import { createId, getData, mutateData } from '../../data/repository';
import type { Student } from '../../types';
import { localDateTimeIso } from '../../utils/dates';
import { fatherFullName, collapseDuplicateSurname, motherFullName } from '../../utils/greekSurname';
import { generatePortalPassword } from '../../utils/tempPassword';

export type PortalLoginRole = 'coach' | 'parent';

export type PortalLoginResult = {
  userId: string;
  email: string;
  role: PortalLoginRole;
  created: boolean;
  password: string | null;
  warning?: string;
};

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function canProvisionPortalLogin(clubId: string): boolean {
  const session = getSession();
  if (!session) return false;
  if (session.role === 'platform_admin') return true;
  if (!session.clubId || session.clubId !== clubId) return false;
  return session.role === 'admin' || session.role === 'secretariat';
}

function findUserByEmail(email: string): AppUser | undefined {
  return getUsers().find((user) => user.email.toLowerCase() === email);
}

async function persistUser(next: AppUser, users: AppUser[]): Promise<string | undefined> {
  saveUsers(users);
  if (isDemoSessionActive() || isLocalSessionActive()) return undefined;
  const cloud = await Promise.race([
    upsertCloudUser(next),
    new Promise<{ success: false; error: string }>((resolve) => {
      window.setTimeout(
        () => resolve({ success: false, error: 'timeout' }),
        6000,
      );
    }),
  ]);
  if (cloud.success) return undefined;
  if (cloud.error === 'timeout') {
    void upsertCloudUser(next);
    return undefined;
  }
  if (/unauthoriz|forbidden|401|403/i.test(cloud.error ?? '')) {
    return 'Ο λογαριασμός αποθηκεύτηκε. Δεν ήταν δυνατή η αποστολή στο cloud από αυτή τη σύνδεση.';
  }
  return cloud.error ?? 'Ο λογαριασμός αποθηκεύτηκε τοπικά, αλλά όχι στο cloud.';
}

export function formatPortalLoginMessage(
  results: PortalLoginResult[],
  appUrl: string,
  who: 'προπονητή' | 'γονέα',
): string {
  if (results.length === 0) return '';
  const lines: string[] = [];
  for (const row of results) {
    if (row.warning && !row.userId) {
      lines.push(row.warning);
      continue;
    }
    if (row.created && row.password) {
      lines.push(
        `Λογαριασμός ${who}: ${row.email}\nΚωδικός: ${row.password}\nΕφαρμογή: ${appUrl}`,
      );
    } else {
      lines.push(`Ο λογαριασμός ${who} συνδέθηκε με την καρτέλα (${row.email}).`);
    }
    if (row.warning) lines.push(row.warning);
  }
  return lines.join('\n\n');
}

export async function ensureCoachPortalLogin(input: {
  clubId: string;
  coachId: string;
  fullName: string;
  email: string;
}): Promise<PortalLoginResult | null> {
  if (!canProvisionPortalLogin(input.clubId)) return null;
  const email = normalizeEmail(input.email);
  if (!email.includes('@')) return null;

  const fullName = input.fullName.trim() || email;
  const users = getUsers();
  const existing = findUserByEmail(email);

  if (existing) {
    if (existing.clubId && existing.clubId !== input.clubId) {
      return {
        userId: existing.id,
        email,
        role: 'coach',
        created: false,
        password: null,
        warning: 'Το email χρησιμοποιείται ήδη σε άλλον σύλλογο.',
      };
    }
    if (existing.role !== 'coach') {
      return {
        userId: existing.id,
        email,
        role: 'coach',
        created: false,
        password: null,
        warning: 'Το email χρησιμοποιείται ήδη από άλλον ρόλο. Ο λογαριασμός προπονητή δεν δημιουργήθηκε.',
      };
    }
    const next: AppUser = {
      ...existing,
      fullName: fullName || existing.fullName,
      role: 'coach',
      active: true,
      clubId: input.clubId,
      coachId: input.coachId,
    };
    const nextUsers = users.map((user) => (user.id === existing.id ? next : user));
    const warning = await persistUser(next, nextUsers);
    return { userId: next.id, email, role: 'coach', created: false, password: null, warning };
  }

  const password = generatePortalPassword('pr');
  const credentials = await prepareStoredPassword(password);
  const user: AppUser = {
    id: createId('user'),
    email,
    password: credentials.password,
    passwordReveal: credentials.passwordReveal,
    fullName,
    role: 'coach',
    active: true,
    clubId: input.clubId,
    coachId: input.coachId,
    permissions: null,
  };
  const warning = await persistUser(user, [...users, user]);
  return { userId: user.id, email, role: 'coach', created: true, password, warning };
}

export async function ensureParentPortalLogin(input: {
  clubId: string;
  fullName: string;
  email: string;
  athleteId?: string | null;
}): Promise<PortalLoginResult | null> {
  if (!canProvisionPortalLogin(input.clubId)) return null;
  const email = normalizeEmail(input.email);
  if (!email.includes('@')) return null;

  const fullName = input.fullName.trim() || 'Γονέας';
  const athleteId = input.athleteId?.trim() || null;
  const users = getUsers();
  const existing = findUserByEmail(email);

  let user: AppUser;
  let created = false;
  let password: string | null = null;

  if (existing) {
    if (existing.clubId && existing.clubId !== input.clubId) {
      return {
        userId: existing.id,
        email,
        role: 'parent',
        created: false,
        password: null,
        warning: 'Το email χρησιμοποιείται ήδη σε άλλον σύλλογο.',
      };
    }
    if (existing.role !== 'parent') {
      return {
        userId: existing.id,
        email,
        role: 'parent',
        created: false,
        password: null,
        warning: 'Το email χρησιμοποιείται ήδη από άλλον ρόλο. Ο λογαριασμός γονέα δεν δημιουργήθηκε.',
      };
    }
    user = {
      ...existing,
      fullName: fullName || existing.fullName,
      role: 'parent',
      active: true,
      clubId: input.clubId,
    };
    const warning = await persistUser(
      user,
      users.map((row) => (row.id === existing.id ? user : row)),
    );
    linkParentAthlete(user.id, athleteId);
    return { userId: user.id, email, role: 'parent', created: false, password: null, warning };
  }

  password = generatePortalPassword('gon');
  const credentials = await prepareStoredPassword(password);
  user = {
    id: createId('user'),
    email,
    password: credentials.password,
    passwordReveal: credentials.passwordReveal,
    fullName,
    role: 'parent',
    active: true,
    clubId: input.clubId,
    permissions: null,
  };
  created = true;
  const warning = await persistUser(user, [...users, user]);
  linkParentAthlete(user.id, athleteId);
  return { userId: user.id, email, role: 'parent', created, password, warning };
}

function linkParentAthlete(parentUserId: string, athleteId: string | null) {
  if (!athleteId) return;
  const student = getData().students.find((row) => row.id === athleteId);
  if (!student || student.status === 'inactive') return;
  mutateData((store) => {
    if (!store.parentLinks) store.parentLinks = [];
    const exists = store.parentLinks.some(
      (link) => link.parentUserId === parentUserId && link.athleteId === athleteId,
    );
    if (exists) return;
    store.parentLinks.unshift({
      id: createId('plink'),
      parentUserId,
      athleteId,
      createdAt: localDateTimeIso(),
    });
  });
}

export async function ensureStudentParentLogins(
  clubId: string,
  student: Pick<
    Student,
    | 'id'
    | 'lastName'
    | 'fatherFirstName'
    | 'motherFirstName'
    | 'fatherEmail'
    | 'motherEmail'
    | 'guardianName'
  >,
): Promise<PortalLoginResult[]> {
  const results: PortalLoginResult[] = [];
  const fatherEmail = normalizeEmail(student.fatherEmail);
  const motherEmail = normalizeEmail(student.motherEmail);

  if (fatherEmail.includes('@')) {
    const fullName =
      fatherFullName(student.fatherFirstName, student.lastName) ||
      collapseDuplicateSurname(student.guardianName || '') ||
      'Πατέρας';
    const row = await ensureParentPortalLogin({
      clubId,
      fullName,
      email: fatherEmail,
      athleteId: student.id,
    });
    if (row) results.push(row);
  }

  if (motherEmail.includes('@') && motherEmail !== fatherEmail) {
    const fullName =
      motherFullName(student.motherFirstName, student.lastName) ||
      collapseDuplicateSurname(student.guardianName || '') ||
      'Μητέρα';
    const row = await ensureParentPortalLogin({
      clubId,
      fullName,
      email: motherEmail,
      athleteId: student.id,
    });
    if (row) results.push(row);
  }

  return results;
}
