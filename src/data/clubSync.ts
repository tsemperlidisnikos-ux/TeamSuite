import * as accountSyncService from '../api/services/accountSyncService';
import * as backendSyncService from '../api/services/backendSyncService';
import { appDataWeight } from './mediaStrip';
import { resolveActiveClubId, whenClubMapPersisted } from './store';
import type { AppData } from '../types';

const AUTO_SYNC_KEY = 'academyhub-auto-sync-v1';
const LAST_SYNC_KEY = 'academyhub-last-sync-v1';
const CLOUD_PREFERRED_KEY = 'academyhub-cloud-preferred-v1';

type AutoSyncMap = Record<string, boolean>;
type LastSyncMap = Record<string, string>;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let pulling = false;
let lastPullAttemptAt = 0;
let pushQueue: Promise<unknown> = Promise.resolve();

const MIN_PULL_GAP_MS = 15_000;

function readMap<T extends Record<string, unknown>>(key: string): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {} as T;
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

function writeMap(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function isCloudPreferred(): boolean {
  try {
    return localStorage.getItem(CLOUD_PREFERRED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setCloudPreferred(enabled: boolean): void {
  localStorage.setItem(CLOUD_PREFERRED_KEY, enabled ? '1' : '0');
}

/** Ενεργό από προεπιλογή για κάθε σύλλογο. Μόνο ρητό `false` το απενεργοποιεί. */
export function isAutoSyncEnabled(clubId?: string | null): boolean {
  const id = clubId ?? resolveActiveClubId();
  if (!id) return false;
  return readMap<AutoSyncMap>(AUTO_SYNC_KEY)[id] !== false;
}

export function setAutoSyncEnabled(clubId: string, enabled: boolean): void {
  const map = readMap<AutoSyncMap>(AUTO_SYNC_KEY);
  map[clubId] = enabled;
  writeMap(AUTO_SYNC_KEY, map);
}

export function getLastSyncAt(clubId?: string | null): string | null {
  const id = clubId ?? resolveActiveClubId();
  if (!id) return null;
  return readMap<LastSyncMap>(LAST_SYNC_KEY)[id] ?? null;
}

function setLastSyncAt(clubId: string, at: string): void {
  const map = readMap<LastSyncMap>(LAST_SYNC_KEY);
  map[clubId] = at;
  writeMap(LAST_SYNC_KEY, map);
}

export function clearLastSyncAt(clubId: string): void {
  const map = readMap<LastSyncMap>(LAST_SYNC_KEY);
  delete map[clubId];
  writeMap(LAST_SYNC_KEY, map);
}

/** Debounced push of active club AppData + account bundle to cloud. */
export function scheduleClubMirrorPush(clubId?: string | null): void {
  const id = clubId ?? resolveActiveClubId();
  if (!id || id === '_default' || !isAutoSyncEnabled(id)) return;

  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void flushClubMirrorPush(id);
  }, 800);
}

async function maybePushAccountBundle() {
  const { getSession, isPlatformAdmin } = await import('../auth/auth');
  const { getSessionToken } = await import('../api/services/sessionService');
  if (!isPlatformAdmin() || !getSessionToken() || getSession()?.role !== 'platform_admin') {
    return { success: true as const, skipped: true, error: null };
  }
  const result = await accountSyncService.pushAccountBundle();
  if (!result.success) {
    const err = result.error ?? '';
    if (err.includes('Μόνο Platform Admin')) {
      return { success: true as const, skipped: true, error: null };
    }
    return { success: false as const, skipped: false, error: err || 'Account push failed' };
  }
  return { success: true as const, skipped: false, error: null };
}

export async function flushClubMirrorPush(clubId?: string | null) {
  const id = clubId ?? resolveActiveClubId();
  if (!id || id === '_default' || !isAutoSyncEnabled(id)) {
    return { success: true as const, data: null, error: null };
  }

  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  const run = async () => {
    pushing = true;
    try {
      await whenClubMapPersisted();
      return await pushClubAndAccounts(id, getLastSyncAt(id));
    } finally {
      pushing = false;
    }
  };

  const queued = pushQueue.then(run, run);
  pushQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

async function pushClubAndAccounts(id: string, baseUpdatedAt: string | null) {
  let result = await backendSyncService.pushClubMirror(id, { baseUpdatedAt });

  if (!result.success) {
    const err = result.error ?? '';
    const isConflict = err.toLowerCase().includes('conflict');
    if (isConflict) {
      const pull = await backendSyncService.pullClubMirror(id);
      if (pull.success && pull.data?.payload && pull.data.durable !== false) {
        const { getClubData, replaceClubData } = await import('./repository');
        const local = getClubData(id);
        if (cloudWouldLoseLocalData(local, pull.data.payload)) {
          result = await backendSyncService.pushClubMirror(id, {
            baseUpdatedAt: pull.data.updatedAt ?? null,
          });
        } else {
          replaceClubData(id, pull.data.payload);
          setLastSyncAt(id, pull.data.updatedAt ?? new Date().toISOString());
          await maybePushAccountBundle();
          return {
            success: false as const,
            data: null,
            error: 'Σύγκρουση sync: φορτώθηκαν τα νεότερα cloud δεδομένα.',
          };
        }
      }
    }
  }

  await maybePushAccountBundle();
  if (result.success) {
    setLastSyncAt(id, result.data?.updatedAt ?? new Date().toISOString());
  }
  return result;
}

function isMissingMirrorError(message: string): boolean {
  return (
    message.includes('Δεν υπάρχει αποθηκευμένο mirror') ||
    message.includes('No mirror') ||
    message.includes('μόνο στο production')
  );
}

function isMissingAccountError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('no account bundle') ||
    m.includes('δεν βρέθηκε cloud account') ||
    m.includes('http 404')
  );
}

function isCloudNewer(cloudUpdatedAt: string | null | undefined, localUpdatedAt: string | null): boolean {
  if (!cloudUpdatedAt) return false;
  if (!localUpdatedAt) return true;
  return cloudUpdatedAt > localUpdatedAt;
}

function isEmptyCloudOverwrite(local: AppData, cloud: AppData): boolean {
  const localN = (local.students?.length ?? 0) + (local.classes?.length ?? 0);
  const cloudN = (cloud.students?.length ?? 0) + (cloud.classes?.length ?? 0);
  return localN > 0 && cloudN === 0;
}

function cloudWouldLoseLocalData(local: AppData, cloud: AppData): boolean {
  if (isEmptyCloudOverwrite(local, cloud)) return true;
  const cloudTxn = cloud.transactions?.length ?? 0;
  const localTxn = local.transactions?.length ?? 0;
  if (cloudTxn > localTxn) return false;
  const localW = appDataWeight(local);
  const cloudW = appDataWeight(cloud);
  return localW > 0 && localW > cloudW;
}

/**
 * Pull club mirror from cloud when a newer revision exists.
 * Skips while a debounced push is pending (unless flushed first) or another pull is running.
 */
export async function pullClubMirrorIfNewer(clubId?: string | null | undefined) {
  const id = clubId ?? resolveActiveClubId();
  if (!id || id === '_default' || !isAutoSyncEnabled(id) || pushing || pulling) {
    return { success: true as const, pulled: false, error: null };
  }

  const now = Date.now();
  if (now - lastPullAttemptAt < MIN_PULL_GAP_MS) {
    return { success: true as const, pulled: false, error: null };
  }
  lastPullAttemptAt = now;

  const { getSessionToken } = await import('../api/services/sessionService');
  const { isDemoSessionActive } = await import('../auth/auth');
  if (!getSessionToken() || isDemoSessionActive()) {
    return { success: true as const, pulled: false, error: null };
  }

  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
    const pushResult = await flushClubMirrorPush(id);
    if (!pushResult.success && pushResult.error) {
      return { success: false as const, pulled: false, error: pushResult.error };
    }
  }

  pulling = true;
  try {
    const localAt = getLastSyncAt(id);
    const result = await backendSyncService.pullClubMirror(id);
    if (!result.success || !result.data?.payload) {
      const msg = result.error ?? '';
      if (isMissingMirrorError(msg)) {
        return { success: true as const, pulled: false, error: null };
      }
      return {
        success: false as const,
        pulled: false,
        error: result.error ?? 'Αποτυχία pull',
      };
    }

    const cloudAt = result.data.updatedAt ?? null;
    if (!isCloudNewer(cloudAt, localAt)) {
      return { success: true as const, pulled: false, error: null };
    }

    const { getClubData, replaceClubData } = await import('./repository');
    const local = getClubData(id);
    if (
      result.data.durable === false ||
      cloudWouldLoseLocalData(local, result.data.payload)
    ) {
      return { success: true as const, pulled: false, error: null };
    }
    replaceClubData(id, result.data.payload);
    setLastSyncAt(id, cloudAt ?? new Date().toISOString());
    setCloudPreferred(true);
    return { success: true as const, pulled: true, error: null };
  } finally {
    pulling = false;
  }
}

async function clubIdsForSync(preferred?: string | null): Promise<string[]> {
  const { getClubs } = await import('../auth/clubs');
  const ids = getClubs()
    .map((club) => club.id)
    .filter((id) => id && id !== '_default');
  if (preferred && preferred !== '_default' && !ids.includes(preferred)) {
    ids.unshift(preferred);
  }
  return [...new Set(ids)];
}

/**
 * After restore (or logout): write local clubs + accounts to durable cloud.
 * `overwriteCloud` sends baseUpdatedAt=null so a previous empty mirror is replaced.
 */
export async function persistLocalStateToCloud(opts?: {
  clubIds?: string[];
  overwriteCloud?: boolean;
}) {
  await whenClubMapPersisted();
  const ids = opts?.clubIds?.length ? opts.clubIds : await clubIdsForSync();
  const unique = [...new Set(ids.filter((id) => id && id !== '_default'))];

  const account = await maybePushAccountBundle();
  const errors: string[] = [];
  if (!account.success && account.error) {
    errors.push(account.error);
  }

  for (const id of unique) {
    if (opts?.overwriteCloud) clearLastSyncAt(id);
    const result = await flushClubMirrorPush(id);
    if (!result.success && result.error) errors.push(`${id}: ${result.error}`);
  }

  if (errors.length) {
    return { success: false as const, error: errors.join(' · ') };
  }
  return { success: true as const, error: null };
}

/**
 * Login sync: keep richer local data, upload if cloud is empty/missing,
 * never replace a restored club with an empty mirror.
 */
export async function syncClubOnLogin(clubId: string | null | undefined) {
  let pulledAccount = false;
  let pulledClub = false;

  const account = await accountSyncService.pullAccountBundle();
  if (account.success && account.data && account.data.durable !== false) {
    accountSyncService.applyAccountBundle(account.data, { mergeLocalUsers: true });
    pulledAccount = true;
  } else if (!account.success && isMissingAccountError(account.error ?? '')) {
    await maybePushAccountBundle();
  }

  const ids = await clubIdsForSync(clubId);
  const { getClubData, replaceClubData } = await import('./repository');

  for (const id of ids) {
    if (!isAutoSyncEnabled(id)) continue;
    const result = await backendSyncService.pullClubMirror(id);
    if (result.success && result.data?.payload) {
      if (result.data.durable === false) continue;
      const local = getClubData(id);
      const neverSyncedHere = !getLastSyncAt(id);
      if (
        !neverSyncedHere &&
        cloudWouldLoseLocalData(local, result.data.payload)
      ) {
        await flushClubMirrorPush(id);
        continue;
      }
      replaceClubData(id, result.data.payload);
      setLastSyncAt(id, result.data.updatedAt ?? new Date().toISOString());
      setCloudPreferred(true);
      if (id === clubId) pulledClub = true;
      continue;
    }

    const msg = result.error ?? '';
    const missing = isMissingMirrorError(msg);
    if (!missing && !result.success && clubId === id) {
      return {
        success: false as const,
        data: null,
        error: result.error ?? 'Αποτυχία sync',
      };
    }
    if (missing && !msg.includes('μόνο στο production')) {
      await flushClubMirrorPush(id);
    }
  }

  if (pulledAccount && account.success && account.data) {
    const { getSessionToken, persistClubLogoToCloud } = await import('../api/services/sessionService');
    const { getClubs, updateClubLogo } = await import('../auth/clubs');
    if (getSessionToken()) {
      for (const club of getClubs()) {
        const cloud = account.data.clubs.find((row) => row.id === club.id);
        const cloudLogo = (cloud?.logoUrl ?? '').trim();
        const localLogo = (club.logoUrl ?? '').trim();
        const cloudNeedsLogo = !cloudLogo || cloudLogo.startsWith('data:');
        const localIsData = localLogo.startsWith('data:');
        if (localLogo && (cloudNeedsLogo || localIsData)) {
          const pushed = await persistClubLogoToCloud(club.id, localLogo);
          if (pushed.success && pushed.data?.logoUrl && pushed.data.logoUrl !== localLogo) {
            updateClubLogo(club.id, pushed.data.logoUrl);
          }
        }
      }
    }
  }

  return {
    success: true as const,
    data: { pulled: pulledAccount || pulledClub, pulledAccount, pulledClub },
    error: null,
  };
}
