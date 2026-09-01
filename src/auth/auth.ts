import { recordLoginActivity } from '../api/services/loginActivityService';
import {
  getSessionToken,
  serverLogin,
  setSessionToken,
} from '../api/services/sessionService';
import { clearAmkaFieldKeyCache } from '../utils/amkaCrypto';
import { hashPassword, isPasswordHashed, verifyPassword } from './password';

export type UserRole =
  | 'platform_admin'
  | 'admin'
  | 'doctor'
  | 'coach'
  | 'secretariat'
  | 'staff'
  | 'athlete'
  | 'parent';

export interface AppUser {
  id: string;
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  clubId?: string | null;
  athleteId?: string | null;
  coachId?: string | null;
  /** Προσαρμοσμένα δικαιώματα από τον σύλλογο· αν λείπει → defaults ρόλου από Platform Admin. */
  permissions?: string[] | null;
  /**
   * Αν true, στα Οικονομικά βλέπει μόνο έσοδα/έξοδα που καταχώρησε ο ίδιος
   * (όχι συνδρομές αθλητών ούτε εγγραφές άλλων).
   */
  financeOwnEntriesOnly?: boolean;
}

const SESSION_KEY = 'teamsuite-session-v1';
const USERS_KEY = 'teamsuite-users-v1';
const DEMO_SESSION_KEY = 'teamsuite-demo-session-v1';
const LOCAL_SESSION_KEY = 'teamsuite-local-session-v1';

/** Presentation DEMO accounts (local-only; not in cloud account bundle). */
const DEMO_ACCOUNT_EMAILS = new Set([
  'demo@teamsuite.app',
  'coach@teamsuite.app',
  'parent@teamsuite.app',
  'parent2@teamsuite.app',
]);

export function isPresentationDemoEmail(email: string | null | undefined): boolean {
  return DEMO_ACCOUNT_EMAILS.has(String(email ?? '').trim().toLowerCase());
}

export function isDemoSessionActive(): boolean {
  try {
    if (localStorage.getItem(DEMO_SESSION_KEY) !== '1') return false;
    const session = getSession();
    return Boolean(session && isPresentationDemoEmail(session.email));
  } catch {
    return false;
  }
}

function setDemoSessionActive(active: boolean): void {
  try {
    if (active) localStorage.setItem(DEMO_SESSION_KEY, '1');
    else localStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function setLocalSessionActive(active: boolean): void {
  try {
    if (active) localStorage.setItem(LOCAL_SESSION_KEY, '1');
    else localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Local login without cloud JWT (first platform admin bootstrap on production). */
export function isLocalSessionActive(): boolean {
  try {
    if (localStorage.getItem(LOCAL_SESSION_KEY) !== '1') return false;
    return Boolean(getSession());
  } catch {
    return false;
  }
}

/** Stable id for the primary platform admin account (no credentials in source). */
export const PLATFORM_ADMIN_ID = 'user_platform_admin';

/** @deprecated Use PLATFORM_ADMIN_ID — kept for older imports without password. */
export const PLATFORM_ADMIN = {
  id: PLATFORM_ADMIN_ID,
  email: '',
  password: '',
  fullName: 'Platform Admin',
  role: 'platform_admin' as const,
  active: true,
};

function readUsersRaw(): AppUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw) as AppUser[];
    const legacy = localStorage.getItem('academyhub-users-v1');
    if (legacy) return JSON.parse(legacy) as AppUser[];
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * Dev-only bootstrap from .env.local (never shipped to production builds).
 * VITE_BOOTSTRAP_PLATFORM_ADMIN_EMAIL / VITE_BOOTSTRAP_PLATFORM_ADMIN_PASSWORD
 */
function readDevBootstrapAdmin(): {
  email: string;
  password: string;
  fullName: string;
} | null {
  const allowProdBootstrap = String(
    import.meta.env.VITE_BOOTSTRAP_PLATFORM_ADMIN_ALLOW_PROD ?? '',
  ).trim() === '1';
  if (!import.meta.env.DEV && !allowProdBootstrap) return null;
  const email = String(import.meta.env.VITE_BOOTSTRAP_PLATFORM_ADMIN_EMAIL ?? '')
    .trim()
    .toLowerCase();
  const password = String(import.meta.env.VITE_BOOTSTRAP_PLATFORM_ADMIN_PASSWORD ?? '').trim();
  if (!email || !password) return null;
  const fullName =
    String(import.meta.env.VITE_BOOTSTRAP_PLATFORM_ADMIN_NAME ?? '').trim() || 'Platform Admin';
  return { email, password, fullName };
}

function setSessionFromUser(user: AppUser): void {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      clubId: user.clubId ?? null,
      athleteId: user.athleteId ?? null,
      coachId: user.coachId ?? null,
    }),
  );
}

/** Refresh local session fields from a verified server user (JWT path). */
export function setSessionFromVerifiedUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  clubId?: string | null;
  athleteId?: string | null;
  coachId?: string | null;
}): void {
  const current = getSession();
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as UserRole,
      clubId: user.clubId ?? null,
      athleteId: user.athleteId ?? current?.athleteId ?? null,
      coachId: user.coachId ?? current?.coachId ?? null,
    }),
  );
}

/**
 * Normalize users store without embedding secrets in the client bundle.
 * - Keeps existing platform_admin hashed passwords (never overwrite with bootstrap plaintext).
 * - Does not seed club admins with hardcoded passwords.
 * - In DEV (or ALLOW_PROD bootstrap), can create the first platform_admin from env vars.
 */
export function ensurePlatformAdmin(): AppUser | null {
  const users = readUsersRaw();
  let changed = false;

  let admin =
    users.find((u) => u.id === PLATFORM_ADMIN_ID) ??
    users.find((u) => u.role === 'platform_admin') ??
    null;

  if (admin) {
    if (!admin.active) {
      admin = { ...admin, active: true };
      changed = true;
    }
    const bootstrap = readDevBootstrapAdmin();
    if (bootstrap) {
      // Never replace a hashed password with bootstrap plaintext — that undoes migratePlaintextPasswords.
      const password = isPasswordHashed(admin.password)
        ? admin.password
        : bootstrap.password;
      const nextAdmin = {
        ...admin,
        email: bootstrap.email,
        fullName: bootstrap.fullName,
        password,
      };
      if (
        nextAdmin.email !== admin.email ||
        nextAdmin.password !== admin.password ||
        nextAdmin.fullName !== admin.fullName
      ) {
        admin = nextAdmin;
        changed = true;
      }
    }
  } else {
    const bootstrap = readDevBootstrapAdmin();
    if (bootstrap) {
      admin = {
        id: PLATFORM_ADMIN_ID,
        email: bootstrap.email,
        password: bootstrap.password,
        fullName: bootstrap.fullName,
        role: 'platform_admin',
        active: true,
      };
      changed = true;
    }
  }

  const others = users.filter(
    (u) => u.id !== (admin?.id ?? PLATFORM_ADMIN_ID) && u.role !== 'platform_admin',
  );

  const next = admin ? [admin, ...others] : [...others];
  if (changed) {
    localStorage.setItem(USERS_KEY, JSON.stringify(next));
  } else if (!localStorage.getItem(USERS_KEY) && next.length > 0) {
    localStorage.setItem(USERS_KEY, JSON.stringify(next));
  }
  return admin;
}

export function getUsers(): AppUser[] {
  ensurePlatformAdmin();
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AppUser[];
  } catch {
    return [];
  }
}

export function saveUsers(users: AppUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  ensurePlatformAdmin();
  window.dispatchEvent(new CustomEvent('academyhub-users-updated'));
}

function isCloudAuthRejection(message: string): boolean {
  const m = message.toLowerCase();
  return (
    message.includes('Λάθος email') ||
    message.includes('περίοδος χρήσης') ||
    m.includes('http 401') ||
    m.includes('http 403') ||
    m.includes('unauthorized') ||
    m.includes('forbidden')
  );
}

function isNoAccountBundle(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('no_account_bundle') ||
    m.includes('http 404') ||
    m.includes('session login http 404')
  );
}

function isCloudInfrastructureError(message: string): boolean {
  return (
    message.includes('cloud storage') ||
    message.includes('cloud account') ||
    message.includes('Session signing unavailable') ||
    message.includes('HTTP 503')
  );
}

export async function login(
  email: string,
  password: string,
): Promise<{ success: boolean; data?: AppUser; error?: string }> {
  ensurePlatformAdmin();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();

  // Presentation DEMO is local-only (not in cloud users). Always authenticate locally.
  if (isPresentationDemoEmail(normalizedEmail)) {
    return loginLocalUser(normalizedEmail, normalizedPassword, { demoSession: true });
  }

  // Prefer server session when cloud account bundle is available.
  const remote = await serverLogin(normalizedEmail, normalizedPassword);
  if (remote.success && remote.data?.user) {
    const users = getUsers();
    let local =
      users.find((u) => u.id === remote.data!.user.id) ??
      users.find((u) => u.email.toLowerCase() === normalizedEmail);

    if (!local) {
      local = {
        id: remote.data.user.id,
        email: remote.data.user.email,
        fullName: remote.data.user.fullName,
        role: remote.data.user.role as UserRole,
        active: true,
        clubId: remote.data.user.clubId ?? null,
        password: await hashPassword(normalizedPassword),
      };
      saveUsers([local, ...users.filter((u) => u.id !== local!.id)]);
    } else {
      const idx = users.findIndex((u) => u.id === local!.id);
      const nextPassword = isPasswordHashed(local.password)
        ? local.password
        : await hashPassword(normalizedPassword);
      const next = [...users];
      next[idx] = {
        ...local,
        email: remote.data.user.email,
        fullName: remote.data.user.fullName,
        role: remote.data.user.role as UserRole,
        active: true,
        clubId: remote.data.user.clubId ?? null,
        password: nextPassword,
      };
      saveUsers(next);
      local = next[idx];
    }

    setDemoSessionActive(false);
    setLocalSessionActive(false);
    setSessionFromUser(local);
    recordLoginActivity(local, 'login');
    return { success: true, data: local };
  }

  const err = (remote.error ?? '').trim();

  // Wrong password / expired club: never fall through to stale local passwords.
  if (isCloudAuthRejection(err)) {
    return {
      success: false,
      error: err.includes('περίοδος χρήσης')
        ? err
        : 'Λάθος email ή κωδικός',
    };
  }

  if (isCloudInfrastructureError(err)) {
    return { success: false, error: err };
  }

  // Local auth only for first-time bootstrap (no cloud bundle yet) or DEV offline.
  const allowLocal = import.meta.env.DEV || isNoAccountBundle(err);
  if (!allowLocal) {
    const boot = await loginWithBootstrapIfMatch(normalizedEmail, normalizedPassword);
    if (boot) return boot;
    return {
      success: false,
      error:
        err ||
        'Δεν είναι δυνατή η σύνδεση με τον διακομιστή. Δοκιμάστε ξανά.',
    };
  }

  const boot = await loginWithBootstrapIfMatch(normalizedEmail, normalizedPassword);
  if (boot) return boot;
  return loginLocalUser(normalizedEmail, normalizedPassword, { demoSession: false });
}

async function loginWithBootstrapIfMatch(
  normalizedEmail: string,
  normalizedPassword: string,
): Promise<{ success: boolean; data?: AppUser; error?: string } | null> {
  const bootstrap = readDevBootstrapAdmin();
  if (!bootstrap) return null;
  if (normalizedEmail !== bootstrap.email || normalizedPassword !== bootstrap.password) {
    return null;
  }

  const hashed = await hashPassword(normalizedPassword);
  const users = readUsersRaw();
  let admin =
    users.find((u) => u.id === PLATFORM_ADMIN_ID) ??
    users.find((u) => u.role === 'platform_admin') ??
    null;
  const nextAdmin: AppUser = {
    id: admin?.id ?? PLATFORM_ADMIN_ID,
    email: bootstrap.email,
    password: hashed,
    fullName: bootstrap.fullName,
    role: 'platform_admin',
    active: true,
    clubId: null,
  };
  const others = users.filter((u) => u.id !== nextAdmin.id && u.role !== 'platform_admin');
  saveUsers([nextAdmin, ...others]);
  setSessionToken(null);
  setDemoSessionActive(false);
  setLocalSessionActive(true);
  setSessionFromUser(nextAdmin);
  recordLoginActivity(nextAdmin, 'login');
  return { success: true, data: nextAdmin };
}

async function loginLocalUser(
  normalizedEmail: string,
  normalizedPassword: string,
  options: { demoSession: boolean },
): Promise<{ success: boolean; data?: AppUser; error?: string }> {
  const users = getUsers();
  const index = users.findIndex(
    (u) => u.email.toLowerCase() === normalizedEmail && u.active,
  );
  if (index < 0) {
    return { success: false, error: 'Λάθος email ή κωδικός' };
  }

  const user = users[index];
  const ok = await verifyPassword(normalizedPassword, user.password);
  if (!ok) {
    return { success: false, error: 'Λάθος email ή κωδικός' };
  }

  if (!isPasswordHashed(user.password)) {
    users[index] = { ...user, password: await hashPassword(normalizedPassword) };
    saveUsers(users);
  }

  if (options.demoSession) {
    setSessionToken(null);
    setDemoSessionActive(true);
    setLocalSessionActive(false);
  } else {
    setDemoSessionActive(false);
    setLocalSessionActive(true);
  }
  setSessionFromUser(users[index]);
  recordLoginActivity(users[index], 'login');
  return { success: true, data: users[index] };
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
  setDemoSessionActive(false);
  setLocalSessionActive(false);
  setSessionToken(null);
  clearAmkaFieldKeyCache();
}

export function getSession(): {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  clubId?: string | null;
  athleteId?: string | null;
  coachId?: string | null;
} | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  if (!getSession()) return false;
  if (getSessionToken()) return true;
  if (isDemoSessionActive()) return true;
  return import.meta.env.DEV;
}

export function isPlatformAdmin(): boolean {
  if (!isAuthenticated()) return false;
  return getSession()?.role === 'platform_admin';
}

export const roleLabels: Record<UserRole, string> = {
  platform_admin: 'Διαχειριστής πλατφόρμας',
  admin: 'Διαχειριστής συλλόγου',
  doctor: 'Ιατρός',
  coach: 'Προπονητής',
  secretariat: 'Γραμματεία',
  staff: 'Προσωπικό',
  athlete: 'Αθλητής',
  parent: 'Γονέας',
};

export function getUserById(userId: string): AppUser | null {
  return getUsers().find((u) => u.id === userId) ?? null;
}

export function updateUser(
  userId: string,
  patch: Partial<
    Pick<
      AppUser,
      | 'fullName'
      | 'email'
      | 'password'
      | 'role'
      | 'active'
      | 'permissions'
      | 'athleteId'
      | 'coachId'
      | 'financeOwnEntriesOnly'
    >
  >,
): { success: boolean; data?: AppUser; error?: string } {
  const users = getUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index < 0) return { success: false, error: 'Ο χρήστης δεν βρέθηκε' };

  if (patch.email) {
    const nextEmail = patch.email.trim().toLowerCase();
    if (!nextEmail.includes('@')) {
      return { success: false, error: 'Μη έγκυρο email' };
    }
    if (users.some((u) => u.id !== userId && u.email.toLowerCase() === nextEmail)) {
      return { success: false, error: 'Το email χρησιμοποιείται ήδη' };
    }
    patch = { ...patch, email: nextEmail };
  }

  users[index] = { ...users[index], ...patch };
  saveUsers(users);

  const session = getSession();
  if (session?.id === userId) {
    setSessionFromUser(users[index]);
  }

  return { success: true, data: users[index] };
}

export function updateUserEmail(
  userId: string,
  email: string,
): { success: boolean; data?: AppUser; error?: string } {
  return updateUser(userId, { email });
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = getSession();
  if (!session) return { success: false, error: 'Δεν υπάρχει ενεργή σύνδεση' };

  const current = input.currentPassword.trim();
  const next = input.newPassword.trim();
  const confirm = input.confirmPassword.trim();

  if (!current) return { success: false, error: 'Συμπληρώστε τον τρέχοντα κωδικό' };
  if (next.length < 6) {
    return { success: false, error: 'Ο νέος κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες' };
  }
  if (next !== confirm) return { success: false, error: 'Η επιβεβαίωση κωδικού δεν ταιριάζει' };

  const user = getUserById(session.id);
  if (!user) return { success: false, error: 'Ο χρήστης δεν βρέθηκε' };
  if (!(await verifyPassword(current, user.password))) {
    return { success: false, error: 'Ο τρέχων κωδικός είναι λάθος' };
  }
  if (current === next) {
    return { success: false, error: 'Ο νέος κωδικός πρέπει να είναι διαφορετικός' };
  }

  const hashed = await hashPassword(next);
  const result = updateUser(user.id, { password: hashed });
  if (!result.success) return { success: false, error: result.error ?? 'Σφάλμα ενημέρωσης' };
  return { success: true };
}

export function deleteUser(userId: string): { success: boolean; error?: string } {
  const session = getSession();
  if (session?.id === userId) {
    return { success: false, error: 'Δεν μπορείτε να διαγράψετε τον ενεργό λογαριασμό' };
  }
  const users = getUsers();
  const target = users.find((u) => u.id === userId);
  if (!target) return { success: false, error: 'Ο χρήστης δεν βρέθηκε' };
  if (target.role === 'platform_admin') {
    return { success: false, error: 'Δεν επιτρέπεται διαγραφή διαχειριστή πλατφόρμας' };
  }
  saveUsers(users.filter((u) => u.id !== userId));
  return { success: true };
}

export function impersonateUser(
  userId: string,
): { success: boolean; data?: AppUser; error?: string } {
  if (!isPlatformAdmin()) {
    return { success: false, error: 'Μόνο Platform Admin μπορεί να κάνει impersonation' };
  }
  const user = getUsers().find((u) => u.id === userId && u.active);
  if (!user) return { success: false, error: 'Ο χρήστης δεν βρέθηκε' };
  setSessionFromUser(user);
  recordLoginActivity(user, 'impersonate');
  return { success: true, data: user };
}

/** Hash plaintext password when creating users (club invites / parents). */
export async function prepareStoredPassword(plain: string): Promise<string> {
  return hashPassword(plain.trim());
}

/** Μετατρέπει όλους τους plaintext κωδικούς σε PBKDF2 hash. */
export async function migratePlaintextPasswords(): Promise<number> {
  ensurePlatformAdmin();
  const users = getUsers();
  let count = 0;
  const next: AppUser[] = [];
  for (const user of users) {
    if (user.password && !isPasswordHashed(user.password)) {
      next.push({ ...user, password: await hashPassword(user.password) });
      count += 1;
    } else {
      next.push(user);
    }
  }
  if (count > 0) saveUsers(next);
  return count;
}
