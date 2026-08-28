import { getUsers, type AppUser } from '../auth/auth';
import { getClubById, getClubs, isMaskedOrBlankSecret, type Club } from '../auth/clubs';
import { isQuotaError, stripHeavyMedia } from '../data/mediaStrip';
import { exportAllClubsData, getData } from '../data/repository';
import { loadStore } from '../data/store';
import { loadPlatformConfig } from '../platform/platformConfig';
import type { AppData } from '../types';
import { localDateIso, localDateTimeIso } from './dates';

export const BACKUP_JSON_FILENAME = 'academyhub-backup.json';
const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024;

export type BackupScope = 'platform' | 'club';

export type BackupPayload = {
  exportedAt: string;
  /** platform = full admin dump · club = single tenant only */
  scope?: BackupScope;
  sourceClubId?: string;
  appData?: AppData;
  /** Multi-tenant map clubId → AppData (newer backups). */
  appDataByClub?: Record<string, AppData>;
  platformConfig?: ReturnType<typeof loadPlatformConfig>;
  users?: ReturnType<typeof getUsers>;
  clubs?: ReturnType<typeof getClubs>;
};

export { isQuotaError, stripHeavyMedia };

function isBlankSecret(value: string | null | undefined): boolean {
  return isMaskedOrBlankSecret(value);
}

/** Strip credentials so downloadable archives are not secret-bearing. */
export function redactUserForBackup(user: AppUser): AppUser {
  return { ...user, password: '' };
}

export function redactClubForBackup(club: Club): Club {
  return {
    ...club,
    smtp: club.smtp
      ? {
          ...club.smtp,
          password: '',
        }
      : club.smtp,
    viva: club.viva
      ? {
          ...club.viva,
          clientSecret: '',
        }
      : club.viva,
    // Send log can contain recipient emails — omit from file backups.
    smtpSendLog: undefined,
  };
}

export function redactBackupPayload(payload: BackupPayload): BackupPayload {
  return {
    ...payload,
    users: payload.users?.map(redactUserForBackup),
    clubs: payload.clubs?.map(redactClubForBackup),
  };
}

/** When restoring a redacted backup, keep existing SMTP/Viva secrets. */
export function mergeClubsPreservingSecrets(
  incoming: Club[],
  existing: Club[],
): Club[] {
  const prevById = new Map(existing.map((c) => [c.id, c]));
  return incoming.map((club) => {
    const prev = prevById.get(club.id);
    if (!prev) return club;
    return {
      ...club,
      smtp: club.smtp
        ? {
            ...club.smtp,
            password: isBlankSecret(club.smtp.password)
              ? (prev.smtp?.password ?? '')
              : club.smtp.password,
          }
        : prev.smtp,
      viva: club.viva
        ? {
            ...club.viva,
            clientSecret: isBlankSecret(club.viva.clientSecret)
              ? (prev.viva?.clientSecret ?? '')
              : club.viva.clientSecret,
          }
        : prev.viva,
      smtpSendLog: club.smtpSendLog ?? prev.smtpSendLog,
    };
  });
}

/** When restoring a redacted backup, keep existing password hashes. */
export function mergeUsersPreservingPasswords(
  incoming: AppUser[],
  existing: AppUser[],
): AppUser[] {
  const prevById = new Map(existing.map((u) => [u.id, u]));
  return incoming.map((user) => {
    const prev = prevById.get(user.id);
    if (!prev) return user;
    if (!isBlankSecret(user.password)) return user;
    return prev.password ? { ...user, password: prev.password } : user;
  });
}

/** Filesystem-safe club name for backup filenames (preserves Greek letters). */
export function slugifyClubNameForBackup(name: string, fallback: string): string {
  const trimmed = String(name ?? '').trim();
  const slug = trimmed
    .replace(/[^\w\u0370-\u03ff-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return slug || fallback;
}

/** Prefix for club JSON downloads: includes readable club name + date suffix from downloadBackupJson. */
export function clubBackupFilenamePrefix(clubId: string): string {
  const club = getClubById(clubId);
  const slug = slugifyClubNameForBackup(club?.name ?? '', clubId.slice(0, 12));
  return `TeamSuite-${slug}`;
}

export function buildBackupPayload(): BackupPayload {
  return redactBackupPayload({
    exportedAt: localDateTimeIso(),
    scope: 'platform',
    appData: loadStore() ?? getData(),
    appDataByClub: exportAllClubsData(),
    platformConfig: loadPlatformConfig(),
    users: getUsers(),
    clubs: getClubs(),
  });
}

/** Backup μόνο για έναν σύλλογο (δεδομένα χρήστη/tenant) — χωρίς platformConfig/άλλους. */
export function buildClubBackupPayload(clubId: string): BackupPayload {
  const all = exportAllClubsData();
  const clubData = all[clubId];
  const club = getClubs().find((c) => c.id === clubId);
  return redactBackupPayload({
    exportedAt: localDateTimeIso(),
    scope: 'club',
    sourceClubId: clubId,
    appData: clubData,
    appDataByClub: clubData ? { [clubId]: clubData } : {},
    clubs: club ? [club] : [],
    users: getUsers().filter((u) => u.clubId === clubId),
  });
}

/** Download backup as plain JSON (recommended — reliable across browsers and devices). */
export function downloadBackupJson(
  payload: BackupPayload = buildBackupPayload(),
  filenamePrefix = 'academyhub-backup',
): string {
  const safe = redactBackupPayload(payload);
  const json = JSON.stringify(safe, null, 2);
  const filename = `${filenamePrefix}-${localDateIso()}.json`;
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

function parseBackupJson(text: string): BackupPayload {
  if (text.length > MAX_BACKUP_FILE_BYTES) {
    throw new Error('Το backup είναι υπερβολικά μεγάλο. Μέγιστο μέγεθος 50MB.');
  }
  const cleaned = text.replace(/^\uFEFF/, '').trim();
  let parsed: BackupPayload;
  try {
    parsed = JSON.parse(cleaned) as BackupPayload;
  } catch {
    throw new Error('Το αρχείο JSON του backup δεν είναι έγκυρο.');
  }
  if (!parsed.appData && !parsed.appDataByClub && !parsed.platformConfig && !parsed.users && !parsed.clubs) {
    throw new Error('Το αρχείο δεν είναι έγκυρο backup της εφαρμογής.');
  }
  if (parsed.appData && !isAppDataShape(parsed.appData)) {
    throw new Error('Το backup περιέχει μη έγκυρα δεδομένα συλλόγου.');
  }
  if (parsed.appDataByClub) {
    if (typeof parsed.appDataByClub !== 'object' || Array.isArray(parsed.appDataByClub)) {
      throw new Error('Το backup περιέχει μη έγκυρο multi-tenant σχήμα.');
    }
    for (const data of Object.values(parsed.appDataByClub)) {
      if (!isAppDataShape(data)) throw new Error('Το backup περιέχει μη έγκυρα δεδομένα συλλόγου.');
    }
  }
  return parsed;
}

function isAppDataShape(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return Array.isArray(data.students) && Array.isArray(data.classes);
}

export function formatBackupError(err: unknown): string {
  if (isQuotaError(err)) {
    return (
      'Ο χώρος του browser γέμισε (localStorage). ' +
      'Καθαρίστε δεδομένα ιστότοπου για teamsuite-seven.vercel.app και ξαναδοκιμάστε.'
    );
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Μη έγκυρο αρχείο backup.';
}

function clubIdsInPayload(payload: BackupPayload): string[] {
  const ids = new Set<string>();
  if (payload.sourceClubId) ids.add(payload.sourceClubId);
  for (const id of Object.keys(payload.appDataByClub ?? {})) ids.add(id);
  for (const club of payload.clubs ?? []) {
    if (club?.id) ids.add(club.id);
  }
  return [...ids];
}

/**
 * Reject platform-wide / multi-tenant archives when restoring from club Settings.
 * Prevents accidental (or malicious) cross-tenant data import.
 */
export function assertClubScopedRestore(
  payload: BackupPayload,
  _targetClubId: string,
): void {
  if (payload.scope === 'platform' || payload.platformConfig) {
    throw new Error(
      'Αυτό είναι πλήρες backup πλατφόρμας. Η επαναφορά γίνεται μόνο από Platform Admin → Backup.',
    );
  }

  const mapKeys = Object.keys(payload.appDataByClub ?? {});
  if (mapKeys.length > 1) {
    throw new Error(
      'Το αρχείο περιέχει δεδομένα πολλών συλλόγων. Χρησιμοποιήστε Platform Admin ή club-only backup.',
    );
  }

  if ((payload.clubs?.length ?? 0) > 1) {
    throw new Error(
      'Το αρχείο περιέχει περισσότερους από έναν συλλόγους. Απορρίφθηκε για ασφάλεια.',
    );
  }

  const tenantUserClubIds = new Set(
    (payload.users ?? [])
      .filter((u) => u.clubId && u.role !== 'platform_admin')
      .map((u) => u.clubId as string),
  );
  if (tenantUserClubIds.size > 1) {
    throw new Error('Το backup περιέχει χρήστες πολλών συλλόγων και απορρίφθηκε.');
  }

  const clubIds = clubIdsInPayload(payload);
  if (clubIds.length > 1) {
    throw new Error(
      'Το αρχείο περιέχει περισσότερους από έναν συλλόγους. Απορρίφθηκε για ασφάλεια.',
    );
  }
}

/**
 * Platform Admin full restore: reject single-club archives (use club restore instead).
 */
export function assertPlatformScopedRestore(payload: BackupPayload): void {
  if (payload.scope === 'club') {
    throw new Error(
      'Αυτό είναι backup ενός συλλόγου. Χρησιμοποιήστε «Επαναφορά συλλόγου».',
    );
  }

  const mapKeys = Object.keys(payload.appDataByClub ?? {});
  const hasPlatformBits =
    Boolean(payload.platformConfig) ||
    payload.scope === 'platform' ||
    mapKeys.length > 1 ||
    (payload.clubs?.length ?? 0) > 1 ||
    (payload.users?.some((u) => u.role === 'platform_admin') ?? false);

  if (!hasPlatformBits && (payload.appData || mapKeys.length === 1)) {
    throw new Error(
      'Το αρχείο μοιάζει με backup συλλόγου. Χρησιμοποιήστε «Επαναφορά συλλόγου».',
    );
  }
}

/** Club ids present in a backup (hints for Platform Admin). */
export function listBackupClubIds(payload: BackupPayload): string[] {
  return clubIdsInPayload(payload);
}

/**
 * Pick AppData for restore into the current club.
 * Never silently picks another tenant's richest dataset.
 */
export function pickAppDataForRestore(
  payload: BackupPayload,
  targetClubId: string | null,
): AppData | null {
  const map = payload.appDataByClub ?? {};
  const mapKeys = Object.keys(map);

  if (targetClubId && map[targetClubId]) {
    return map[targetClubId]!;
  }

  // Explicit single-tenant club backup (possibly different clubId after re-register).
  if (payload.scope === 'club' && mapKeys.length === 1) {
    return map[mapKeys[0]!]!;
  }

  if (mapKeys.length === 1 && (!payload.scope || payload.scope === 'club')) {
    return map[mapKeys[0]!]!;
  }

  if (mapKeys.length === 0 && payload.appData) {
    return payload.appData;
  }

  if (mapKeys.length > 1) {
    if (targetClubId) {
      throw new Error(
        'Το backup δεν περιέχει δεδομένα για τον επιλεγμένο σύλλογο. Επιλέξτε άλλον ή full restore.',
      );
    }
    throw new Error(
      'Το backup περιέχει πολλούς συλλόγους. Επιλέξτε σύλλογο για στοχευμένη επαναφορά ή full restore.',
    );
  }

  return payload.appData ?? null;
}

export async function readBackupFile(file: File): Promise<BackupPayload> {
  const name = file.name.toLowerCase();

  if (file.size > MAX_BACKUP_FILE_BYTES) {
    throw new Error('Το backup είναι υπερβολικά μεγάλο. Μέγιστο μέγεθος 50MB.');
  }

  if (
    name.endsWith('.json') ||
    file.type === 'application/json' ||
    file.type === 'text/json'
  ) {
    return parseBackupJson(await file.text());
  }

  const text = await file.text();
  if (text.trim().startsWith('{')) return parseBackupJson(text);
  throw new Error('Επιλέξτε αρχείο .json από «Λήψη backup».');
}
