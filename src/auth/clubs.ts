import { z } from 'zod';
import { fail, ok, type ApiResult } from '../api/apiClient';
import { localDateIso } from '../utils/dates';
import { getUsers, login, prepareStoredPassword, saveUsers, type AppUser } from './auth';
import {
  sanitizeClubBackupSchedule,
  type ClubBackupSchedule,
} from './clubBackupSchedule';
import { normalizeAppLocale, type AppLocale } from '../i18n/locale';
import {
  normalizeOnlinePaymentProviders,
  type OnlinePaymentProviderId,
} from '../shared/onlinePayments';

export interface ClubSmtpSettings {
  enabled: boolean;
  provider: 'gmail' | 'custom';
  host: string;
  port: string;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  security: 'starttls' | 'ssl' | 'none';
  requireAuth: boolean;
  /** True when a real App Password exists (local or cloud) even if the form field is empty. */
  passwordSet?: boolean;
}

export interface ClubSmtpSendLog {
  id: string;
  at: string;
  to: string;
  status: 'ok' | 'error';
  message: string;
}

export interface ClubVivaSettings {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  merchantId: string;
  sourceCode: string;
  environment: 'demo' | 'live';
}

export interface ClubStripeSettings {
  enabled: boolean;
  publishableKey: string;
  secretKey: string;
}

export interface ClubEurobankSettings {
  enabled: boolean;
  merchantId: string;
  secretKey: string;
  environment: 'demo' | 'live';
}

export interface ClubPublicRegistrationSettings {
  enabled: boolean;
  /** Άμεση εμφάνιση στη λίστα αθλητών (χωρίς έγκριση). */
  autoApprove: boolean;
  allowTrial: boolean;
  allowWaitlist: boolean;
  slug: string;
  /** Φωτογραφία κεφαλίδας φόρμας /join (fallback: logo συλλόγου). */
  heroImageUrl?: string | null;
  /** Email ειδοποίησης νέας αίτησης (fallback: admin / SMTP username). */
  notifyEmail?: string;
}

export interface Club {
  id: string;
  name: string;
  city: string;
  phone: string;
  adminUserId: string;
  createdAt: string;
  athleteLicenseLimit: number;
  athleteLicenseUsed: number;
  /** Πακέτο συνδρομής πλατφόρμας (GROWTH). */
  licensePackageId?: string | null;
  usageStartsOn?: string | null;
  usageEndsOn?: string | null;
  logoUrl?: string | null;
  vatNumber?: string;
  taxOffice?: string;
  address?: string;
  foundedYear?: string;
  website?: string;
  email?: string;
  smtp?: ClubSmtpSettings;
  smtpSendLog?: ClubSmtpSendLog[];
  viva?: ClubVivaSettings;
  stripe?: ClubStripeSettings;
  eurobank?: ClubEurobankSettings;
  /** Online πάροχοι που επιτρέπει ο Platform Admin. */
  onlinePaymentProviders?: OnlinePaymentProviderId[];
  publicRegistration?: ClubPublicRegistrationSettings;
  /** ISO timestamp αποδοχής DPA από τον σύλλογο. */
  dpaAcceptedAt?: string | null;
  /** Προγραμματισμένο backup συλλόγου (ημερομηνία/ώρα ή επανάληψη). */
  backupSchedule?: ClubBackupSchedule | null;
  /** Τίτλος προσαρμοσμένης χρέωσης στο προφίλ αθλητή (Ναι/Όχι) και στις χρεώσεις. */
  customChargeLabel?: string;
  /** Αποθηκευμένη τιμή (πάντα ελληνικά). */
  locale?: AppLocale;
}

const CLUBS_KEY = 'academyhub-clubs-v1';

export const clubRegistrationSchema = z
  .object({
    clubName: z.string().min(2, 'Το όνομα συλλόγου είναι υποχρεωτικό'),
    city: z.string().optional().default(''),
    phone: z.string().optional().default(''),
    adminFullName: z.string().min(2, 'Το ονοματεπώνυμο είναι υποχρεωτικό'),
    email: z.string().email('Μη έγκυρο email'),
    password: z.string().min(6, 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες'),
    confirmPassword: z.string().min(1, 'Επιβεβαιώστε τον κωδικό'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Οι κωδικοί δεν ταιριάζουν',
    path: ['confirmPassword'],
  });

export type ClubRegistrationInput = z.infer<typeof clubRegistrationSchema>;

export function getClubs(): Club[] {
  try {
    const raw = localStorage.getItem(CLUBS_KEY);
    if (!raw) return [];
    const clubs = JSON.parse(raw) as Club[];
    return clubs.map((c) => ({
      ...normalizeClubSecrets(c),
      athleteLicenseLimit: c.athleteLicenseLimit ?? 10,
      athleteLicenseUsed: c.athleteLicenseUsed ?? 0,
      licensePackageId: c.licensePackageId ?? null,
      backupSchedule: sanitizeClubBackupSchedule(c.backupSchedule),
      onlinePaymentProviders: normalizeOnlinePaymentProviders(c.onlinePaymentProviders),
      locale: normalizeAppLocale(c.locale),
    }));
  } catch {
    return [];
  }
}

function saveClubs(clubs: Club[]): void {
  localStorage.setItem(CLUBS_KEY, JSON.stringify(clubs.map(normalizeClubSecrets)));
}

export { saveClubs };

export function getClubById(clubId: string | null | undefined): Club | null {
  if (!clubId) return null;
  return getClubs().find((c) => c.id === clubId) ?? null;
}

export function clubAllowsOnlineProvider(
  clubId: string | null | undefined,
  provider: OnlinePaymentProviderId,
): boolean {
  const club = getClubById(clubId);
  if (!club) return false;
  return normalizeOnlinePaymentProviders(club.onlinePaymentProviders).includes(provider);
}

function isDurableLogoUrl(value: string | null | undefined): boolean {
  const next = value?.trim() || '';
  return next.startsWith('/api/club-media') || next.startsWith('https://');
}

/** Private Blob HTTPS URLs do not load in another browser; serve via /api/club-media. */
export function canonicalizeClubLogoUrl(
  clubId: string,
  logoUrl: string | null | undefined,
): string | null {
  const raw = logoUrl?.trim() || '';
  if (!raw) return null;
  if (/vercel-storage\.com/i.test(raw)) {
    return `/api/club-media?p=${encodeURIComponent(`ss360-media/${clubId}/club-logo`)}`;
  }
  return raw;
}

function pickMediaUrl(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null {
  if (isDurableLogoUrl(incoming) && !incoming?.includes('vercel-storage.com')) {
    return incoming!.trim();
  }
  if (isDurableLogoUrl(existing) && !existing?.includes('vercel-storage.com')) {
    if (!incoming?.trim() || incoming.startsWith('data:') || /vercel-storage\.com/i.test(incoming)) {
      return existing!.trim();
    }
  }
  const next = incoming?.trim() || '';
  if (next && !next.startsWith('data:')) return incoming ?? null;
  const prev = existing?.trim() || '';
  if (prev) return existing ?? null;
  return incoming ?? existing ?? null;
}

/** True for empty / masked secrets that must never overwrite a real stored password. */
export function isMaskedOrBlankSecret(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  return !v || v === '********';
}

/** App Password exists locally or is known to be stored in cloud (masked pull). */
export function smtpHasStoredSecret(smtp: ClubSmtpSettings | undefined | null): boolean {
  if (!smtp) return false;
  if (smtp.passwordSet) return true;
  const password = (smtp.password ?? '').trim();
  return password.length > 0;
}

function normalizeSmtpSecrets(smtp: ClubSmtpSettings): ClubSmtpSettings {
  const wasMasked = (smtp.password ?? '').trim() === '********';
  const password = isMaskedOrBlankSecret(smtp.password) ? '' : smtp.password;
  return {
    ...smtp,
    password,
    passwordSet: Boolean(smtp.passwordSet) || wasMasked || password.length > 0,
  };
}

function normalizeClubSecrets(club: Club): Club {
  if (!club.smtp) return club;
  return { ...club, smtp: normalizeSmtpSecrets(club.smtp) };
}

/**
 * Merge SMTP so cloud pull/push with masked (`********`) or empty password
 * never wipes a real App Password already stored locally or in the cloud.
 */
export function mergeSmtpSettings(
  incoming: ClubSmtpSettings | undefined,
  existing: ClubSmtpSettings | undefined,
): ClubSmtpSettings | undefined {
  if (!incoming && !existing) return undefined;
  if (!incoming) return existing ? normalizeSmtpSecrets(existing) : undefined;
  if (!existing) {
    return normalizeSmtpSecrets({
      ...incoming,
      password: isMaskedOrBlankSecret(incoming.password) ? '' : incoming.password,
    });
  }
  const password = isMaskedOrBlankSecret(incoming.password)
    ? isMaskedOrBlankSecret(existing.password)
      ? ''
      : existing.password
    : incoming.password;
  return normalizeSmtpSecrets({
    ...existing,
    ...incoming,
    password,
    passwordSet:
      Boolean(incoming.passwordSet) ||
      Boolean(existing.passwordSet) ||
      incoming.password === '********' ||
      !isMaskedOrBlankSecret(password),
  });
}

function mergeKeyedSecretSettings<T extends { secretKey?: string }>(
  incoming: T | undefined,
  existing: T | undefined,
  secretField: 'secretKey',
): T | undefined {
  if (!incoming && !existing) return undefined;
  if (!incoming) return existing;
  if (!existing) {
    if (isMaskedOrBlankSecret(incoming[secretField])) {
      return { ...incoming, [secretField]: '' };
    }
    return incoming;
  }
  const incomingSecret = incoming[secretField];
  const existingSecret = existing[secretField];
  return {
    ...existing,
    ...incoming,
    [secretField]: isMaskedOrBlankSecret(incomingSecret)
      ? isMaskedOrBlankSecret(existingSecret)
        ? ''
        : existingSecret
      : incomingSecret,
  };
}

/** Same preservation for Viva client secrets. */
export function mergeVivaSettings(
  incoming: ClubVivaSettings | undefined,
  existing: ClubVivaSettings | undefined,
): ClubVivaSettings | undefined {
  if (!incoming && !existing) return undefined;
  if (!incoming) return existing;
  if (!existing) {
    if (isMaskedOrBlankSecret(incoming.clientSecret)) {
      return { ...incoming, clientSecret: '' };
    }
    return incoming;
  }
  return {
    ...existing,
    ...incoming,
    clientSecret: isMaskedOrBlankSecret(incoming.clientSecret)
      ? isMaskedOrBlankSecret(existing.clientSecret)
        ? ''
        : existing.clientSecret
      : incoming.clientSecret,
  };
}

/**
 * Cloud pull/push δεν πρέπει να σβήνει logo (και συναφή media) όταν το
 * εισερχόμενο πακέτο τα έχει κενά — π.χ. Push από άλλο browser χωρίς το αρχείο.
 */
export function mergeClubCatalog(localClubs: Club[], incomingClubs: Club[]): Club[] {
  const localById = new Map(localClubs.map((club) => [club.id, club]));
  const merged: Club[] = incomingClubs.map((incoming) => {
    const local = localById.get(incoming.id);
    if (!local) {
      // New club from cloud — drop masked placeholders so UI asks for real secrets.
      return {
        ...incoming,
        logoUrl: canonicalizeClubLogoUrl(incoming.id, incoming.logoUrl),
        smtp: mergeSmtpSettings(incoming.smtp, undefined),
        viva: mergeVivaSettings(incoming.viva, undefined),
        stripe: mergeKeyedSecretSettings(incoming.stripe, undefined, 'secretKey'),
        eurobank: mergeKeyedSecretSettings(incoming.eurobank, undefined, 'secretKey'),
      };
    }
    return {
      ...local,
      ...incoming,
      athleteLicenseLimit: Math.max(
        Number(incoming.athleteLicenseLimit) || 0,
        Number(local.athleteLicenseLimit) || 0,
      ),
      logoUrl: canonicalizeClubLogoUrl(
        incoming.id,
        pickMediaUrl(incoming.logoUrl, local.logoUrl),
      ),
      smtp: mergeSmtpSettings(incoming.smtp, local.smtp),
      viva: mergeVivaSettings(incoming.viva, local.viva),
      stripe: mergeKeyedSecretSettings(incoming.stripe, local.stripe, 'secretKey'),
      eurobank: mergeKeyedSecretSettings(incoming.eurobank, local.eurobank, 'secretKey'),
      onlinePaymentProviders: normalizeOnlinePaymentProviders(
        incoming.onlinePaymentProviders ?? local.onlinePaymentProviders,
      ),
      smtpSendLog: incoming.smtpSendLog ?? local.smtpSendLog,
      publicRegistration:
        incoming.publicRegistration || local.publicRegistration
          ? {
              enabled: false,
              autoApprove: false,
              allowTrial: false,
              allowWaitlist: false,
              slug: '',
              ...(local.publicRegistration ?? {}),
              ...(incoming.publicRegistration ?? {}),
              heroImageUrl: pickMediaUrl(
                incoming.publicRegistration?.heroImageUrl,
                local.publicRegistration?.heroImageUrl,
              ),
            }
          : incoming.publicRegistration ?? local.publicRegistration,
    };
  });
  const seen = new Set(merged.map((club) => club.id));
  for (const local of localClubs) {
    if (!seen.has(local.id)) merged.push(local);
  }
  return merged;
}

/**
 * If the session points to a clubId that is missing from the clubs list
 * (e.g. after a bad backup restore of users/clubs), recreate a stub club
 * so Settings and data keep working.
 */
export function ensureSessionClub(
  session?: {
    id?: string;
    clubId?: string | null;
    email?: string;
    fullName?: string;
  } | null,
): Club | null {
  const clubId = session?.clubId ?? null;
  if (!clubId) return null;

  const existing = getClubById(clubId);
  if (existing) return existing;

  const email = (session?.email ?? '').toLowerCase();
  const isDemo =
    clubId === 'club_demo_showcase' ||
    email === 'demo@teamsuite.app' ||
    email.startsWith('demo@');

  const stub: Club = {
    id: clubId,
    name: isDemo ? 'DEMO' : 'Σύλλογος',
    city: isDemo ? 'Αθήνα' : '',
    phone: '',
    adminUserId: session?.id ?? '',
    createdAt: localDateIso(),
    athleteLicenseLimit: isDemo ? 100 : 10,
    athleteLicenseUsed: 0,
    locale: 'el',
  };

  saveClubs([...getClubs(), stub]);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return stub;
}

export async function provisionClub(input: {
  clubName: string;
  adminFullName: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
  dpaAcceptedAt?: string | null;
}): Promise<ApiResult<{ club: Club; user: AppUser }>> {
  const clubName = input.clubName.trim();
  const adminFullName = input.adminFullName.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();
  const phone = (input.phone ?? '').trim();
  const city = (input.city ?? '').trim();

  if (clubName.length < 2) return fail('Το όνομα συλλόγου είναι υποχρεωτικό');
  if (adminFullName.length < 2) return fail('Το ονοματεπώνυμο είναι υποχρεωτικό');
  if (!email.includes('@')) return fail('Μη έγκυρο email');
  if (password.length < 6) return fail('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες');

  const users = getUsers();
  if (users.some((u) => u.email.toLowerCase() === email)) {
    return fail('Υπάρχει ήδη λογαριασμός με αυτό το email');
  }

  const clubs = getClubs();
  if (clubs.some((c) => c.name.trim().toLowerCase() === clubName.toLowerCase())) {
    return fail('Υπάρχει ήδη σύλλογος με αυτό το όνομα');
  }

  const userId = `user_${Date.now()}`;
  const clubId = `club_${Date.now()}`;
  const hashedPassword = await prepareStoredPassword(password);

  const user: AppUser = {
    id: userId,
    email,
    password: hashedPassword,
    fullName: adminFullName,
    role: 'admin',
    active: true,
    clubId,
  };

  const club: Club = {
    id: clubId,
    name: clubName,
    city,
    phone,
    adminUserId: userId,
    createdAt: localDateIso(),
    athleteLicenseLimit: 10,
    athleteLicenseUsed: 0,
    onlinePaymentProviders: ['viva'],
    dpaAcceptedAt: input.dpaAcceptedAt || new Date().toISOString(),
    locale: 'el',
  };

  saveUsers([...users, user]);
  saveClubs([...clubs, club]);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok({ club, user });
}

export async function registerClub(
  input: ClubRegistrationInput,
): Promise<ApiResult<{ club: Club; user: AppUser }>> {
  const parsed = clubRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία');
  }

  const data = parsed.data;
  const provisioned = await provisionClub({
    clubName: data.clubName,
    adminFullName: data.adminFullName,
    email: data.email,
    password: data.password,
    phone: data.phone,
    city: data.city,
  });
  if (!provisioned.success || !provisioned.data) {
    return fail(provisioned.error ?? 'Αποτυχία δημιουργίας συλλόγου');
  }

  const sessionResult = await login(data.email.trim().toLowerCase(), data.password);
  if (!sessionResult.success) {
    return fail(sessionResult.error ?? 'Η εγγραφή ολοκληρώθηκε, αλλά απέτυχε η σύνδεση');
  }

  return ok(provisioned.data);
}

export function updateClubLicenses(
  clubId: string,
  input: {
    athleteLicenseLimit: number;
    athleteLicenseUsed: number;
    licensePackageId?: string | null;
    usageStartsOn?: string | null;
    usageEndsOn?: string | null;
    onlinePaymentProviders?: OnlinePaymentProviderId[];
  },
): ApiResult<Club> {
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return fail('Ο σύλλογος δεν βρέθηκε');
  const rawLimit = Number(input.athleteLicenseLimit);
  const rawUsed = Number(input.athleteLicenseUsed);
  if (!Number.isFinite(rawLimit) || rawLimit < 0) {
    return fail('Μη έγκυρο όριο αδειών');
  }
  if (!Number.isFinite(rawUsed) || rawUsed < 0) {
    return fail('Μη έγκυρος αριθμός χρησιμοποιημένων αδειών');
  }
  const usageStartsOn = input.usageStartsOn?.trim() || null;
  const usageEndsOn = input.usageEndsOn?.trim() || null;
  if (usageStartsOn && usageEndsOn && usageStartsOn > usageEndsOn) {
    return fail('Η ημερομηνία έναρξης πρέπει να είναι πριν από τη λήξη');
  }
  const limit = Math.max(0, Math.floor(rawLimit));
  const used = Math.max(0, Math.min(limit, Math.floor(rawUsed)));
  clubs[index] = {
    ...clubs[index],
    athleteLicenseLimit: limit,
    athleteLicenseUsed: used,
    licensePackageId:
      input.licensePackageId === undefined
        ? clubs[index].licensePackageId ?? null
        : input.licensePackageId,
    usageStartsOn,
    usageEndsOn,
    onlinePaymentProviders:
      input.onlinePaymentProviders === undefined
        ? clubs[index].onlinePaymentProviders
        : normalizeOnlinePaymentProviders(input.onlinePaymentProviders),
  };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(clubs[index]);
}

export function isClubUsageActive(club: Club, today = new Date().toISOString().slice(0, 10)): boolean {
  if (club.usageStartsOn && today < club.usageStartsOn) return false;
  if (club.usageEndsOn && today > club.usageEndsOn) return false;
  return true;
}

export function acceptClubDpa(clubId: string): ApiResult<Club> {
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return fail('Ο σύλλογος δεν βρέθηκε');
  if (clubs[index].dpaAcceptedAt) return ok(clubs[index]);
  clubs[index] = {
    ...clubs[index],
    dpaAcceptedAt: new Date().toISOString(),
  };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(clubs[index]);
}

export function updateClubLogo(
  clubId: string,
  logoUrl: string | null,
): ApiResult<Club> {
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return fail('Ο σύλλογος δεν βρέθηκε');
  clubs[index] = {
    ...clubs[index],
    logoUrl: canonicalizeClubLogoUrl(clubId, logoUrl),
  };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(clubs[index]);
}

export type ClubProfileInput = {
  name: string;
  vatNumber?: string;
  taxOffice?: string;
  address?: string;
  foundedYear?: string;
  website?: string;
  phone?: string;
  email?: string;
  city?: string;
  customChargeLabel?: string;
};

export function updateClubProfile(
  clubId: string,
  input: ClubProfileInput,
): ApiResult<Club> {
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return fail('Ο σύλλογος δεν βρέθηκε');
  const name = input.name.trim();
  if (name.length < 2) return fail('Το όνομα συλλόγου είναι υποχρεωτικό');
  clubs[index] = {
    ...clubs[index],
    name,
    vatNumber: (input.vatNumber ?? '').trim(),
    taxOffice: (input.taxOffice ?? '').trim(),
    address: (input.address ?? '').trim(),
    foundedYear: (input.foundedYear ?? '').trim(),
    website: (input.website ?? '').trim(),
    phone: (input.phone ?? '').trim(),
    email: (input.email ?? '').trim(),
    city: (input.city ?? clubs[index].city ?? '').trim(),
    customChargeLabel: (input.customChargeLabel ?? clubs[index].customChargeLabel ?? '').trim(),
  };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(clubs[index]);
}

export function updateClubBackupSchedule(
  clubId: string,
  schedule: ClubBackupSchedule | null,
): ApiResult<Club> {
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return fail('Ο σύλλογος δεν βρέθηκε');
  clubs[index] = {
    ...clubs[index],
    backupSchedule: schedule,
  };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(clubs[index]);
}

export const clubSmtpSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['gmail', 'custom']),
  host: z.string().optional().default(''),
  port: z.string().optional().default('587'),
  username: z.string().optional().default(''),
  password: z.string().optional().default(''),
  fromName: z.string().optional().default(''),
  fromEmail: z.string().optional().default(''),
  security: z.enum(['starttls', 'ssl', 'none']).optional().default('starttls'),
  requireAuth: z.boolean().optional().default(true),
  passwordSet: z.boolean().optional(),
});

export type ClubSmtpInput = z.infer<typeof clubSmtpSchema>;

export function getDefaultClubSmtp(): ClubSmtpSettings {
  return {
    enabled: false,
    provider: 'gmail',
    host: 'smtp.gmail.com',
    port: '587',
    username: '',
    password: '',
    fromName: '',
    fromEmail: '',
    security: 'starttls',
    requireAuth: true,
    passwordSet: false,
  };
}

export function getClubSmtp(clubId: string | null | undefined): ClubSmtpSettings {
  const club = getClubById(clubId);
  const merged = normalizeSmtpSecrets({
    ...getDefaultClubSmtp(),
    ...(club?.smtp ?? {}),
  });
  // Never put masked placeholders into form state — keep passwordSet so Save
  // does not treat the App Password as missing.
  merged.password = isMaskedOrBlankSecret(merged.password) ? '' : merged.password;
  return merged;
}

export function updateClubSmtp(
  clubId: string,
  input: ClubSmtpInput,
): ApiResult<Club> {
  const parsed = clubSmtpSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Μη έγκυρες ρυθμίσεις SMTP');
  }

  const data = parsed.data;
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return fail('Ο σύλλογος δεν βρέθηκε');

  const previous = clubs[index].smtp;
  const kept =
    previous?.password && !isMaskedOrBlankSecret(previous.password)
      ? previous.password
      : '';
  const password = isMaskedOrBlankSecret(data.password) ? kept : data.password;
  const passwordSet =
    !isMaskedOrBlankSecret(password) ||
    Boolean(previous?.passwordSet) ||
    Boolean(data.passwordSet);

  if (data.enabled) {
    if (!data.host.trim()) return fail('Συμπληρώστε SMTP host');
    if (!data.port.trim()) return fail('Συμπληρώστε port');
    if (!data.username.trim()) return fail('Συμπληρώστε Email / username');
    if (!password.trim() && !passwordSet) {
      return fail('Συμπληρώστε App Password / κωδικό SMTP');
    }
  }

  const smtp: ClubSmtpSettings = {
    enabled: data.enabled,
    provider: data.provider,
    host: data.host.trim(),
    port: data.port.trim(),
    username: data.username.trim(),
    password,
    fromName: data.fromName.trim(),
    fromEmail: (data.fromEmail ?? '').trim(),
    security: data.security ?? 'starttls',
    requireAuth: data.requireAuth ?? true,
    passwordSet,
  };

  clubs[index] = { ...clubs[index], smtp };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(clubs[index]);
}

export function appendClubSmtpSendLog(
  clubId: string,
  entry: Omit<ClubSmtpSendLog, 'id' | 'at'> & { at?: string },
): ApiResult<ClubSmtpSendLog[]> {
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return fail('Ο σύλλογος δεν βρέθηκε');

  const logEntry: ClubSmtpSendLog = {
    id: `smtp_${Date.now()}`,
    at: entry.at ?? new Date().toISOString(),
    to: entry.to,
    status: entry.status,
    message: entry.message,
  };

  const prev = clubs[index].smtpSendLog ?? [];
  const next = [logEntry, ...prev].slice(0, 30);
  clubs[index] = { ...clubs[index], smtpSendLog: next };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(next);
}

export function getClubSmtpSendLog(clubId: string | null | undefined): ClubSmtpSendLog[] {
  return getClubById(clubId)?.smtpSendLog ?? [];
}

export const VIVA_WEBHOOK_URL = '/api/viva/webhook';

export const clubVivaSchema = z.object({
  enabled: z.boolean(),
  clientId: z.string().optional().default(''),
  clientSecret: z.string().optional().default(''),
  merchantId: z.string().optional().default(''),
  sourceCode: z.string().optional().default(''),
  environment: z.enum(['demo', 'live']),
});

export type ClubVivaInput = z.infer<typeof clubVivaSchema>;

export function getDefaultClubViva(): ClubVivaSettings {
  return {
    enabled: false,
    clientId: '',
    clientSecret: '',
    merchantId: '',
    sourceCode: '',
    environment: 'demo',
  };
}

export function getClubViva(clubId: string | null | undefined): ClubVivaSettings {
  const club = getClubById(clubId);
  const merged = { ...getDefaultClubViva(), ...(club?.viva ?? {}) };
  if (merged.clientSecret === '********') merged.clientSecret = '';
  return merged;
}

export function updateClubViva(
  clubId: string,
  input: ClubVivaInput,
): ApiResult<Club> {
  const parsed = clubVivaSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Μη έγκυρες ρυθμίσεις Viva');
  }

  const data = parsed.data;
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return fail('Ο σύλλογος δεν βρέθηκε');

  if (data.enabled && !clubAllowsOnlineProvider(clubId, 'viva')) {
    return fail('Ο διαχειριστής πλατφόρμας δεν έχει επιτρέψει Viva για αυτόν τον σύλλογο.');
  }

  const previous = clubs[index].viva;
  const kept =
    previous?.clientSecret && !isMaskedOrBlankSecret(previous.clientSecret)
      ? previous.clientSecret
      : '';
  const clientSecret = isMaskedOrBlankSecret(data.clientSecret) ? kept : data.clientSecret;

  if (data.enabled) {
    if (!data.clientId.trim()) return fail('Συμπληρώστε Client ID');
    if (!clientSecret.trim()) return fail('Συμπληρώστε Client Secret');
    if (!data.sourceCode.trim()) return fail('Συμπληρώστε Source Code');
    if (!/^\d{4}$/.test(data.sourceCode.trim())) {
      return fail('Το Source Code πρέπει να έχει 4 ψηφία');
    }
  } else if (data.sourceCode.trim() && !/^\d{4}$/.test(data.sourceCode.trim())) {
    return fail('Το Source Code πρέπει να έχει 4 ψηφία');
  }

  const viva: ClubVivaSettings = {
    enabled: data.enabled,
    clientId: data.clientId.trim(),
    clientSecret,
    merchantId: data.merchantId.trim(),
    sourceCode: data.sourceCode.trim(),
    environment: data.environment,
  };

  clubs[index] = { ...clubs[index], viva };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(clubs[index]);
}

export function getDefaultClubStripe(): ClubStripeSettings {
  return { enabled: false, publishableKey: '', secretKey: '' };
}

export function getClubStripe(clubId: string | null | undefined): ClubStripeSettings {
  const club = getClubById(clubId);
  const merged = { ...getDefaultClubStripe(), ...(club?.stripe ?? {}) };
  if (merged.secretKey === '********') merged.secretKey = '';
  return merged;
}

const clubStripeSchema = z.object({
  enabled: z.boolean(),
  publishableKey: z.string().optional().default(''),
  secretKey: z.string().optional().default(''),
});

export function updateClubStripe(
  clubId: string,
  input: z.infer<typeof clubStripeSchema>,
): ApiResult<Club> {
  const parsed = clubStripeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Μη έγκυρες ρυθμίσεις Stripe');
  const data = parsed.data;
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return fail('Ο σύλλογος δεν βρέθηκε');
  if (data.enabled && !clubAllowsOnlineProvider(clubId, 'stripe')) {
    return fail('Ο διαχειριστής πλατφόρμας δεν έχει επιτρέψει Stripe για αυτόν τον σύλλογο.');
  }
  const previous = clubs[index].stripe;
  const kept =
    previous?.secretKey && !isMaskedOrBlankSecret(previous.secretKey) ? previous.secretKey : '';
  const secretKey = isMaskedOrBlankSecret(data.secretKey) ? kept : data.secretKey;
  if (data.enabled) {
    if (!data.publishableKey.trim().startsWith('pk_')) {
      return fail('Συμπληρώστε Publishable Key (pk_test_ ή pk_live_).');
    }
    if (!secretKey.trim().startsWith('sk_')) {
      return fail('Συμπληρώστε Secret Key (sk_test_ ή sk_live_).');
    }
  }
  const stripe: ClubStripeSettings = {
    enabled: data.enabled,
    publishableKey: data.publishableKey.trim(),
    secretKey,
  };
  clubs[index] = { ...clubs[index], stripe };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(clubs[index]);
}

export function getDefaultClubEurobank(): ClubEurobankSettings {
  return { enabled: false, merchantId: '', secretKey: '', environment: 'demo' };
}

export function getClubEurobank(clubId: string | null | undefined): ClubEurobankSettings {
  const club = getClubById(clubId);
  const merged = { ...getDefaultClubEurobank(), ...(club?.eurobank ?? {}) };
  if (merged.secretKey === '********') merged.secretKey = '';
  return merged;
}

const clubEurobankSchema = z.object({
  enabled: z.boolean(),
  merchantId: z.string().optional().default(''),
  secretKey: z.string().optional().default(''),
  environment: z.enum(['demo', 'live']),
});

export function updateClubEurobank(
  clubId: string,
  input: z.infer<typeof clubEurobankSchema>,
): ApiResult<Club> {
  const parsed = clubEurobankSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Μη έγκυρες ρυθμίσεις Eurobank');
  const data = parsed.data;
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return fail('Ο σύλλογος δεν βρέθηκε');
  if (data.enabled && !clubAllowsOnlineProvider(clubId, 'eurobank')) {
    return fail('Ο διαχειριστής πλατφόρμας δεν έχει επιτρέψει Eurobank για αυτόν τον σύλλογο.');
  }
  const previous = clubs[index].eurobank;
  const kept =
    previous?.secretKey && !isMaskedOrBlankSecret(previous.secretKey) ? previous.secretKey : '';
  const secretKey = isMaskedOrBlankSecret(data.secretKey) ? kept : data.secretKey;
  if (data.enabled) {
    if (!data.merchantId.trim()) return fail('Συμπληρώστε Merchant ID Eurobank.');
    if (!secretKey.trim()) return fail('Συμπληρώστε Secret Key Eurobank.');
  }
  const eurobank: ClubEurobankSettings = {
    enabled: data.enabled,
    merchantId: data.merchantId.trim(),
    secretKey,
    environment: data.environment,
  };
  clubs[index] = { ...clubs[index], eurobank };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(clubs[index]);
}

export function slugifyClubName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'club';
}

export function getDefaultPublicRegistration(
  clubName = '',
): ClubPublicRegistrationSettings {
  return {
    enabled: false,
    autoApprove: false,
    allowTrial: true,
    allowWaitlist: true,
    slug: slugifyClubName(clubName),
    heroImageUrl: null,
    notifyEmail: '',
  };
}

export function getClubPublicRegistration(
  clubId: string | null | undefined,
): ClubPublicRegistrationSettings {
  const club = getClubById(clubId);
  const defaults = getDefaultPublicRegistration(club?.name ?? '');
  return {
    ...defaults,
    ...(club?.publicRegistration ?? {}),
    slug: (club?.publicRegistration?.slug || defaults.slug).trim(),
  };
}

export const clubPublicRegistrationSchema = z.object({
  enabled: z.boolean(),
  autoApprove: z.boolean(),
  allowTrial: z.boolean(),
  allowWaitlist: z.boolean(),
  slug: z.string().optional().default(''),
  heroImageUrl: z.string().nullable().optional(),
  notifyEmail: z.string().optional().default(''),
});

export type ClubPublicRegistrationInput = z.infer<typeof clubPublicRegistrationSchema>;

export function getClubByJoinSlug(slug: string): Club | null {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  return (
    getClubs().find((c) => {
      const s = (c.publicRegistration?.slug || slugifyClubName(c.name)).toLowerCase();
      return s === normalized && Boolean(c.publicRegistration?.enabled);
    }) ?? null
  );
}

export function updateClubPublicRegistration(
  clubId: string,
  input: ClubPublicRegistrationInput,
): ApiResult<Club> {
  const parsed = clubPublicRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Μη έγκυρες ρυθμίσεις');
  }

  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === clubId);
  if (index < 0) return fail('Ο σύλλογος δεν βρέθηκε');

  const club = clubs[index];
  let slug = (parsed.data.slug || '').trim().toLowerCase();
  if (!slug) slug = slugifyClubName(club.name);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return fail('Το slug επιτρέπει μόνο λατινικά πεζά, αριθμούς και παύλες.');
  }

  const conflict = clubs.find(
    (c) =>
      c.id !== clubId &&
      (c.publicRegistration?.slug || slugifyClubName(c.name)).toLowerCase() === slug,
  );
  if (conflict) return fail('Το slug χρησιμοποιείται ήδη από άλλο σύλλογο.');

  if (parsed.data.enabled && !club.dpaAcceptedAt) {
    return fail(
      'Απαιτείται αποδοχή DPA (Ρυθμίσεις → GDPR) πριν ενεργοποιηθεί η δημόσια εγγραφή.',
    );
  }

  const publicRegistration: ClubPublicRegistrationSettings = {
    enabled: parsed.data.enabled,
    autoApprove: parsed.data.autoApprove,
    allowTrial: parsed.data.allowTrial,
    allowWaitlist: parsed.data.allowWaitlist,
    slug,
    heroImageUrl:
      parsed.data.heroImageUrl === undefined
        ? club.publicRegistration?.heroImageUrl ?? null
        : parsed.data.heroImageUrl,
    notifyEmail: (parsed.data.notifyEmail || '').trim(),
  };

  clubs[index] = { ...club, publicRegistration };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(clubs[index]);
}

export function deleteClub(clubId: string): ApiResult<true> {
  const clubs = getClubs().filter((c) => c.id !== clubId);
  saveClubs(clubs);
  return ok(true);
}

/** Διαγράφει σύλλογο + όλους τους χρήστες του (όχι DEMO). */
export function purgeClub(clubId: string): ApiResult<true> {
  const id = clubId.trim();
  if (!id) return fail('Λείπει ο σύλλογος');
  const club = getClubById(id);
  const isDemo =
    id === 'club_demo_showcase' ||
    (club?.name ?? '').trim().toUpperCase() === 'DEMO';
  if (isDemo) return fail('Ο σύλλογος DEMO δεν διαγράφεται');

  saveUsers(getUsers().filter((u) => u.role === 'platform_admin' || u.clubId !== id));
  saveClubs(getClubs().filter((c) => c.id !== id));
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
  return ok(true);
}
