import * as accountSyncService from '../api/services/accountSyncService';
import * as backendSyncService from '../api/services/backendSyncService';
import { resolveActiveClubId } from './store';

const AUTO_SYNC_KEY = 'academyhub-auto-sync-v1';
const LAST_SYNC_KEY = 'academyhub-last-sync-v1';
const CLOUD_PREFERRED_KEY = 'academyhub-cloud-preferred-v1';

type AutoSyncMap = Record<string, boolean>;
type LastSyncMap = Record<string, string>;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let pulling = false;
let lastPullAttemptAt = 0;

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

/** Debounced push of active club AppData + account bundle to cloud. */
export function scheduleClubMirrorPush(clubId?: string | null): void {
  const id = clubId ?? resolveActiveClubId();
  if (!id || !isAutoSyncEnabled(id)) return;

  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void flushClubMirrorPush(id);
  }, 2500);
}

export async function flushClubMirrorPush(clubId?: string | null) {
  const id = clubId ?? resolveActiveClubId();
  if (!id || !isAutoSyncEnabled(id) || pushing) {
    return { success: true as const, data: null, error: null };
  }
  pushing = true;
  const baseUpdatedAt = getLastSyncAt(id);
  let result = await backendSyncService.pushClubMirror(id, { baseUpdatedAt });

  // On conflict: adopt cloud revision, then skip overwrite this cycle.
  if (!result.success) {
    const err = result.error ?? '';
    const isConflict = err.toLowerCase().includes('conflict');
    if (isConflict) {
      const pull = await backendSyncService.pullClubMirror(id);
      if (pull.success && pull.data?.payload) {
        const { replaceData } = await import('./repository');
        replaceData(pull.data.payload);
        setLastSyncAt(id, pull.data.updatedAt ?? new Date().toISOString());
        pushing = false;
        return {
          success: false as const,
          data: null,
          error: 'Σύγκρουση sync: φορτώθηκαν τα νεότερα cloud δεδομένα.',
        };
      }
    }
  }

  await accountSyncService.pushAccountBundle();
  pushing = false;
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

function isCloudNewer(cloudUpdatedAt: string | null | undefined, localUpdatedAt: string | null): boolean {
  if (!cloudUpdatedAt) return true;
  if (!localUpdatedAt) return true;
  return cloudUpdatedAt > localUpdatedAt;
}

/**
 * Pull club mirror from cloud when a newer revision exists.
 * Skips while a debounced push is pending (unless flushed first) or another pull is running.
 */
export async function pullClubMirrorIfNewer(clubId?: string | null | undefined) {
  const id = clubId ?? resolveActiveClubId();
  if (!id || !isAutoSyncEnabled(id) || pushing || pulling) {
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

    const { replaceData } = await import('./repository');
    replaceData(result.data.payload);
    setLastSyncAt(id, cloudAt ?? new Date().toISOString());
    setCloudPreferred(true);
    return { success: true as const, pulled: true, error: null };
  } finally {
    pulling = false;
  }
}

/**
 * Cloud-first login sync:
 * 1) Pull users/clubs/config if available
 * 2) Pull club AppData mirror if available (source of truth when present)
 * Missing cloud data is OK on first device.
 */
export async function syncClubOnLogin(clubId: string | null | undefined) {
  let pulledAccount = false;
  let pulledClub = false;

  const account = await accountSyncService.pullAccountBundle();
  if (account.success && account.data) {
    // Κρατά τοπικούς λογαριασμούς που δεν έχουν ακόμα ανέβει στο cloud,
    // ώστε να μην «εξαφανίζονται» μετά από login άλλου χρήστη.
    accountSyncService.applyAccountBundle(account.data, { mergeLocalUsers: true });
    pulledAccount = true;
    const { getSessionToken, updateCloudClubLogo } = await import('../api/services/sessionService');
    if (getSessionToken()) {
      const { getClubs } = await import('../auth/clubs');
      for (const club of getClubs()) {
        const cloud = account.data.clubs.find((row) => row.id === club.id);
        if (club.logoUrl && !(cloud?.logoUrl ?? '').trim()) {
          void updateCloudClubLogo(club.id, club.logoUrl);
        }
      }
    }
  }

  if (!clubId) {
    return {
      success: true as const,
      data: { pulled: pulledAccount, pulledAccount, pulledClub },
      error: null,
    };
  }

  // Prefer cloud when available (source of truth). Auto-sync is on by default.
  const result = await backendSyncService.pullClubMirror(clubId);
  if (result.success && result.data?.payload) {
    const { replaceData } = await import('./repository');
    replaceData(result.data.payload);
    setLastSyncAt(clubId, result.data.updatedAt ?? new Date().toISOString());
    setCloudPreferred(true);
    pulledClub = true;
  } else {
    const msg = result.error ?? '';
    const missing = isMissingMirrorError(msg);
    if (!missing && !result.success && isAutoSyncEnabled(clubId)) {
      return {
        success: false as const,
        data: null,
        error: result.error ?? 'Αποτυχία sync',
      };
    }
    if (
      missing &&
      isAutoSyncEnabled(clubId) &&
      !msg.includes('μόνο στο production')
    ) {
      void flushClubMirrorPush(clubId);
    }
  }

  return {
    success: true as const,
    data: { pulled: pulledAccount || pulledClub, pulledAccount, pulledClub },
    error: null,
  };
}
