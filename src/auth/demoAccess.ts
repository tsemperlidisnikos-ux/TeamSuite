import { fail, ok, type ApiResult } from '../api/apiClient';
import { clearDataCache, reseedDemoShowcase } from '../data/repository';
import { isDemoClubName } from '../data/demoShowcase';
import { endPreview } from '../platform/platformConfig';
import { localDateIso } from '../utils/dates';
import {
  getUsers,
  login,
  prepareStoredPassword,
  saveUsers,
  type AppUser,
  type UserRole,
} from './auth';
import { getClubs, saveClubs } from './clubs';
import { isPasswordHashed } from './password';
import {
  DEMO_CLUB_ID,
  DEMO_CLUB_NAME,
  DEMO_COACH_EMAIL,
  DEMO_COACH_USER_ID,
  DEMO_EMAIL,
  DEMO_PARENT_B_EMAIL,
  DEMO_PARENT_B_USER_ID,
  DEMO_PARENT_EMAIL,
  DEMO_PARENT_USER_ID,
  DEMO_PASSWORD,
  DEMO_USER_ID,
} from './demoCredentials';

export {
  DEMO_CLUB_ID,
  DEMO_CLUB_NAME,
  DEMO_COACH_EMAIL,
  DEMO_COACH_USER_ID,
  DEMO_EMAIL,
  DEMO_PARENT_B_EMAIL,
  DEMO_PARENT_B_USER_ID,
  DEMO_PARENT_EMAIL,
  DEMO_PARENT_USER_ID,
  DEMO_PASSWORD,
  DEMO_USER_ID,
  getDemoLoginHint,
  getDemoRoleHints,
} from './demoCredentials';

type DemoRoleUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  coachId?: string | null;
};

async function upsertDemoUser(
  clubId: string,
  spec: DemoRoleUser,
  hashedPassword: string,
): Promise<void> {
  const users = getUsers();
  const index = users.findIndex(
    (u) => u.id === spec.id || u.email.toLowerCase() === spec.email.toLowerCase(),
  );
  const next: AppUser = {
    id: spec.id,
    email: spec.email,
    password: hashedPassword,
    fullName: spec.fullName,
    role: spec.role,
    active: true,
    clubId,
    coachId: spec.coachId ?? null,
    athleteId: null,
  };
  if (index < 0) {
    saveUsers([...users, next]);
    return;
  }
  const copy = [...users];
  copy[index] = {
    ...copy[index],
    ...next,
    password: hashedPassword,
  };
  saveUsers(copy);
}

/**
 * Ensures DEMO club + admin/coach/parent users exist, loads presentation data, and logs in as admin.
 * Works on production (Vercel) because all data lives in the browser localStorage.
 */
export async function enterDemoPresentation(): Promise<ApiResult<AppUser>> {
  endPreview();

  const clubs = getClubs();
  let club =
    clubs.find((c) => c.id === DEMO_CLUB_ID) ??
    clubs.find((c) => isDemoClubName(c.name));

  if (!club) {
    club = {
      id: DEMO_CLUB_ID,
      name: DEMO_CLUB_NAME,
      city: 'Αθήνα',
      phone: '2100000000',
      adminUserId: DEMO_USER_ID,
      createdAt: localDateIso(),
      athleteLicenseLimit: 100,
      athleteLicenseUsed: 0,
    };
    saveClubs([...clubs, club]);
  } else if (club.name.trim().toUpperCase() !== DEMO_CLUB_NAME) {
    const next = clubs.map((c) =>
      c.id === club!.id ? { ...c, name: DEMO_CLUB_NAME } : c,
    );
    saveClubs(next);
    club = next.find((c) => c.id === club!.id)!;
  }

  const clubId = club.id;
  const existingHash = getUsers().find(
    (u) => u.id === DEMO_USER_ID && isPasswordHashed(u.password),
  )?.password;
  const hashedPassword = existingHash ?? (await prepareStoredPassword(DEMO_PASSWORD));

  await upsertDemoUser(clubId, {
    id: DEMO_USER_ID,
    email: DEMO_EMAIL,
    fullName: 'Διαχειριστής DEMO',
    role: 'admin',
  }, hashedPassword);

  await upsertDemoUser(clubId, {
    id: DEMO_COACH_USER_ID,
    email: DEMO_COACH_EMAIL,
    fullName: 'Νίκος Παπαδόπουλος (DEMO)',
    role: 'coach',
    coachId: 'demo_coach_1',
  }, hashedPassword);

  await upsertDemoUser(clubId, {
    id: DEMO_PARENT_USER_ID,
    email: DEMO_PARENT_EMAIL,
    fullName: 'Κώστας Ιωάννου (DEMO)',
    role: 'parent',
  }, hashedPassword);

  await upsertDemoUser(clubId, {
    id: DEMO_PARENT_B_USER_ID,
    email: DEMO_PARENT_B_EMAIL,
    fullName: 'Μαρία Χριστοδούλου (DEMO)',
    role: 'parent',
  }, hashedPassword);

  const user = getUsers().find((u) => u.id === DEMO_USER_ID)!;

  // Keep club adminUserId in sync
  const refreshedClubs = getClubs().map((c) =>
    c.id === clubId
      ? {
          ...c,
          adminUserId: user.id,
          athleteLicenseLimit: Math.max(c.athleteLicenseLimit, 100),
        }
      : c,
  );
  saveClubs(refreshedClubs);

  const sessionResult = await login(DEMO_EMAIL, DEMO_PASSWORD);
  if (!sessionResult.success || !sessionResult.data) {
    return fail(sessionResult.error ?? 'Αποτυχία σύνδεσης DEMO');
  }

  // Session is set — reseed against the active DEMO club bucket.
  clearDataCache();
  const seeded = reseedDemoShowcase(clubId);
  if (!seeded) {
    return fail('Αποτυχία φόρτωσης DEMO δεδομένων.');
  }

  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  window.dispatchEvent(new CustomEvent('academyhub-users-updated'));
  return ok(sessionResult.data);
}
