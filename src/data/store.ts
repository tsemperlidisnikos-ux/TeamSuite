import { getSession, isPlatformAdmin } from '../auth/auth';
import { getClubs } from '../auth/clubs';
import { notifyAppDataChanged } from './appDataEvents';
import { getPreviewClubId } from '../platform/platformConfig';
import type { AppData } from '../types';
import {
  decryptStudentAmkaFields,
  encryptStudentAmkaFields,
  isAmkaEncrypted,
} from '../utils/amkaCrypto';
import { ensureAmkaFieldKeyFetcherWired } from '../api/services/amkaFieldKeyService';
import { isQuotaError, stripHeavyMedia } from './mediaStrip';
import { seedData } from './seed';
import {
  idbReadClubMap,
  idbWriteClubMap,
  mergeClubMapsPreferRicher,
  type ClubDataMap as IdbClubMap,
} from './clubMapIdb';

ensureAmkaFieldKeyFetcherWired();

const LEGACY_KEY = 'academyhub-data-v12';
const BY_CLUB_KEY = 'academyhub-data-by-club-v1';
const LEGACY_MIGRATED_FLAG = 'academyhub-legacy-migrated-v1';
const ISOLATION_DEDUPE_FLAG = 'academyhub-isolation-dedupe-v1';

export const APP_DATA_STORAGE_KEYS = [LEGACY_KEY, BY_CLUB_KEY] as const;

type ClubDataMap = IdbClubMap;

/** In-memory plaintext map (AMKA decrypted). Disk holds AES-encrypted AMKA. */
let memoryMap: ClubDataMap | null = null;
let amkaHydratePromise: Promise<void> | null = null;
let persistSeq = 0;
let persistChain: Promise<void> = Promise.resolve();
let idbHydratePromise: Promise<void> | null = null;

/**
 * Active club for domain data.
 * Preview applies only for platform admins. Club users always use session.clubId.
 */
export function resolveActiveClubId(): string {
  if (isPlatformAdmin()) {
    const preview = getPreviewClubId();
    if (preview) return preview;
  }

  const sessionClub = getSession()?.clubId;
  if (sessionClub) return sessionClub;

  if (!getSession()) {
    const clubs = getClubs();
    if (clubs[0]?.id) return clubs[0].id;
  }

  return '_default';
}

function readClubMapFromDisk(): ClubDataMap {
  try {
    const raw = localStorage.getItem(BY_CLUB_KEY);
    if (raw) return JSON.parse(raw) as ClubDataMap;
  } catch {
    /* ignore */
  }
  return {};
}

function writeClubMapToDisk(map: ClubDataMap): void {
  localStorage.setItem(BY_CLUB_KEY, JSON.stringify(map));
}

function clubMapHasEncryptedAmka(map: ClubDataMap): boolean {
  for (const data of Object.values(map)) {
    for (const student of data.students ?? []) {
      if (isAmkaEncrypted(student.amka)) return true;
    }
  }
  return false;
}

async function encryptMapForDisk(map: ClubDataMap): Promise<ClubDataMap> {
  const forDisk = structuredClone(map);
  for (const [clubId, data] of Object.entries(forDisk)) {
    await encryptStudentAmkaFields(data.students ?? [], clubId);
  }
  return forDisk;
}

async function decryptMapInPlace(map: ClubDataMap): Promise<boolean> {
  let changed = false;
  for (const [clubId, data] of Object.entries(map)) {
    if (await decryptStudentAmkaFields(data.students ?? [], clubId)) {
      changed = true;
    }
  }
  return changed;
}

function writeMapBestEffort(map: ClubDataMap): void {
  try {
    writeClubMapToDisk(map);
    return;
  } catch (err) {
    if (!isQuotaError(err)) throw err;
  }

  const stripped: ClubDataMap = {};
  for (const [id, data] of Object.entries(map)) {
    stripped[id] = stripHeavyMedia(data);
  }
  try {
    writeClubMapToDisk(stripped);
    return;
  } catch (err) {
    if (!isQuotaError(err)) throw err;
  }

  console.error(
    'Ο χώρος του browser γέμισε στο localStorage. Τα δεδομένα αποθηκεύονται στο IndexedDB.',
  );
}

/** Resolves after the latest localStorage write (including AMKA encrypt rewrite). */
export function whenClubMapPersisted(): Promise<void> {
  return persistChain.catch(() => undefined);
}

function saveClubMapSafe(map: ClubDataMap, _priorityClubId?: string): void {
  memoryMap = map;
  try {
    writeMapBestEffort(map);
  } catch (err) {
    console.error(err);
  }

  const seq = ++persistSeq;
  persistChain = persistChain.then(async () => {
    if (seq !== persistSeq) return;
    try {
      const snapshot = memoryMap ?? map;
      const forDisk = await encryptMapForDisk(snapshot);
      if (seq !== persistSeq) return;
      writeMapBestEffort(forDisk);
      if (seq !== persistSeq) return;
      await idbWriteClubMap(stripMapMedia(forDisk));
    } catch (err) {
      console.error(err);
    }
  });
}

function stripMapMedia(map: ClubDataMap): ClubDataMap {
  const out: ClubDataMap = {};
  for (const [id, data] of Object.entries(map)) {
    out[id] = stripHeavyMedia(data);
  }
  return out;
}

function emptyClubData(): AppData {
  return structuredClone(seedData);
}

/**
 * One-time: copy legacy single-blob into the first active club only when the
 * by-club map is still empty. Never clone legacy into later clubs.
 */
function migrateLegacyIfNeeded(map: ClubDataMap, clubId: string): ClubDataMap {
  if (Object.keys(map).length > 0) return map;
  if (localStorage.getItem(LEGACY_MIGRATED_FLAG)) return map;

  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) {
      localStorage.setItem(LEGACY_MIGRATED_FLAG, '1');
      return map;
    }
    const parsed = JSON.parse(legacy) as AppData;
    const next = { ...map, [clubId]: parsed };
    saveClubMapSafe(next, clubId);
    localStorage.setItem(LEGACY_MIGRATED_FLAG, '1');
    return next;
  } catch {
    localStorage.setItem(LEGACY_MIGRATED_FLAG, '1');
    return map;
  }
}

/**
 * One-time: if a newer club's athlete IDs exactly match an older club's,
 * treat it as a leaked legacy clone and reset the newer club to empty.
 */
function purgeDuplicatedClubBuckets(map: ClubDataMap): ClubDataMap {
  if (localStorage.getItem(ISOLATION_DEDUPE_FLAG)) return map;

  const clubs = getClubs()
    .slice()
    .sort((a, b) => {
      const byDate = (a.createdAt || '').localeCompare(b.createdAt || '');
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    });

  const next = { ...map };
  let changed = false;
  const fingerprintOwner = new Map<string, string>();

  for (const club of clubs) {
    const data = next[club.id];
    const students = data?.students ?? [];
    if (students.length === 0) continue;

    const fingerprint = students
      .map((s) => s.id)
      .sort()
      .join(',');
    const owner = fingerprintOwner.get(fingerprint);
    if (owner && owner !== club.id) {
      next[club.id] = emptyClubData();
      changed = true;
      continue;
    }
    if (!owner) fingerprintOwner.set(fingerprint, club.id);
  }

  if (changed) saveClubMapSafe(next);
  localStorage.setItem(ISOLATION_DEDUPE_FLAG, '1');
  return next;
}

function scheduleAmkaHydration(map: ClubDataMap): void {
  if (!clubMapHasEncryptedAmka(map)) return;
  if (amkaHydratePromise) return;
  amkaHydratePromise = (async () => {
    const changed = await decryptMapInPlace(map);
    amkaHydratePromise = null;
    if (changed) {
      memoryMap = map;
      notifyAppDataChanged();
    }
  })();
}

/** Wait until encrypted AMKA values in memory are decrypted (if any). */
export async function ensureAmkaPlaintextReady(): Promise<void> {
  loadClubMap();
  await ensureClubMapIdbReady();
  if (amkaHydratePromise) await amkaHydratePromise;
}

/** Φορτώνει μεγαλύτερο μητρώο από IndexedDB όταν το localStorage του Chrome είναι κομμένο. */
export async function ensureClubMapIdbReady(): Promise<void> {
  if (!idbHydratePromise) {
    idbHydratePromise = (async () => {
      const fromIdb = await idbReadClubMap();
      if (!fromIdb) return;
      const disk = memoryMap ?? readClubMapFromDisk();
      const merged = mergeClubMapsPreferRicher(disk, fromIdb);
      memoryMap = merged;
      notifyAppDataChanged();
    })();
  }
  await idbHydratePromise;
}

function loadClubMap(): ClubDataMap {
  if (memoryMap) {
    scheduleAmkaHydration(memoryMap);
    return memoryMap;
  }
  let map = readClubMapFromDisk();
  const clubId = resolveActiveClubId();
  map = migrateLegacyIfNeeded(map, clubId);
  map = purgeDuplicatedClubBuckets(map);
  memoryMap = map;
  scheduleAmkaHydration(map);
  void ensureClubMapIdbReady();
  return map;
}

/** Drop memory map so next load re-reads disk (e.g. after storage event). */
export function clearStoreMemory(): void {
  memoryMap = null;
  amkaHydratePromise = null;
  idbHydratePromise = null;
}

export function loadStore(): AppData | null {
  const clubId = resolveActiveClubId();
  const map = loadClubMap();
  return map[clubId] ?? null;
}

export function saveStore(data: AppData): void {
  const clubId = resolveActiveClubId();
  const map = loadClubMap();
  map[clubId] = data;
  saveClubMapSafe(map, clubId);
}

/** Remove a club's AppData bucket. */
export function removeClubStore(clubId: string): void {
  const map = loadClubMap();
  if (!(clubId in map)) return;
  delete map[clubId];
  saveClubMapSafe(map);
  notifyAppDataChanged();
}

/** Create or replace a club bucket with empty seed data (new registrations). */
export function resetClubStore(clubId: string): void {
  const map = loadClubMap();
  map[clubId] = emptyClubData();
  saveClubMapSafe(map, clubId);
}

/** Write AppData into a specific club bucket (cross-device restore). */
export function writeClubStore(clubId: string, data: AppData): void {
  const map = loadClubMap();
  map[clubId] = data;
  saveClubMapSafe(map, clubId);
}

/**
 * Restore into one club and drop other club buckets if needed for quota.
 * Used when moving a club backup from localhost → Vercel.
 */
export function writeClubStoreExclusive(clubId: string, data: AppData): void {
  try {
    writeClubStore(clubId, data);
  } catch (err) {
    if (!isQuotaError(err) && !(err instanceof Error && /χώρος του browser/.test(err.message))) {
      throw err;
    }
    saveClubMapSafe({ [clubId]: stripHeavyMedia(data) }, clubId);
  }
}

/** Ensure a club bucket exists without copying another club's data. */
export function ensureClubStore(clubId: string): void {
  const map = loadClubMap();
  if (map[clubId]) return;
  map[clubId] = emptyClubData();
  saveClubMapSafe(map, clubId);
}

/** All club datasets (for full platform backup). */
export function loadAllClubStores(): ClubDataMap {
  const map = loadClubMap();
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && Object.keys(map).length === 0) {
      const clubId = resolveActiveClubId();
      return { [clubId]: JSON.parse(legacy) as AppData };
    }
  } catch {
    /* ignore */
  }
  return map;
}

export function replaceAllClubStores(map: ClubDataMap): void {
  saveClubMapSafe(map);
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
