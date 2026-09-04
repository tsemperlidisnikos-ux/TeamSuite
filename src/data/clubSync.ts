import * as accountSyncService from '../api/services/accountSyncService';
import * as backendSyncService from '../api/services/backendSyncService';
import { stripHeavyMedia } from './mediaStrip';
import { resolveActiveClubId, whenClubMapPersisted } from './store';
import type { AppData, ClothingPackageDef, DiscountReasonDef, ReceiptIssueRecord, SizeChart } from '../types';
import {
  defaultClothingPackages,
  normalizeClothingPackages,
} from '../utils/clothingPackages';
import {
  clubDiscountReasons,
} from '../utils/discountReasons';
import {
  normalizeReceiptIssues,
  normalizeReceiptRanges,
} from '../utils/receiptBook';
import { transactionIsSuppressed } from '../utils/feeChargeKeys';
import { emptyRentalSettings } from '../shared/facilityRentalAvailability';

const AUTO_SYNC_KEY = 'academyhub-auto-sync-v1';
const LAST_SYNC_KEY = 'academyhub-last-sync-v1';
const CLOUD_PREFERRED_KEY = 'academyhub-cloud-preferred-v1';
const DIRTY_KEY = 'academyhub-club-dirty-v1';

type AutoSyncMap = Record<string, boolean>;
type LastSyncMap = Record<string, string>;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pulling = false;
let lastPullAttemptAt = 0;
let pushQueue: Promise<unknown> = Promise.resolve();

const MIN_PULL_GAP_MS = 1_500;

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

function isClubMirrorDirty(clubId: string): boolean {
  return readMap<Record<string, boolean>>(DIRTY_KEY)[clubId] === true;
}

function markClubMirrorDirty(clubId: string): void {
  const map = readMap<Record<string, boolean>>(DIRTY_KEY);
  map[clubId] = true;
  writeMap(DIRTY_KEY, map);
}

function clearClubMirrorDirty(clubId: string): void {
  const map = readMap<Record<string, boolean>>(DIRTY_KEY);
  delete map[clubId];
  writeMap(DIRTY_KEY, map);
}

/** Debounced push of active club AppData + account bundle to cloud. */
export function scheduleClubMirrorPush(clubId?: string | null): void {
  const id = clubId ?? resolveActiveClubId();
  if (!id || id === '_default' || !isAutoSyncEnabled(id)) return;
  markClubMirrorDirty(id);

  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void flushClubMirrorPush(id);
  }, 400);
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
    await whenClubMapPersisted();
    return await pushClubAndAccounts(id, getLastSyncAt(id));
  };

  const queued = pushQueue.then(run, run);
  pushQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

function applyCloudClubData(local: AppData, cloud: AppData): AppData {
  const payload = stripHeavyMedia(cloud);
  return mergeClubSnapshots(local, payload, {
    preferLocal: false,
    treatCloudOnlyTxAsDeleted: false,
  });
}

/** Before push: keep local edits (π.χ. Ανενεργός από εισαγωγή) and still pick up cloud-only rows. */
function mergeLocalPreferredForPush(local: AppData, cloud: AppData): AppData {
  return mergeClubSnapshots(local, stripHeavyMedia(cloud), {
    preferLocal: true,
    treatCloudOnlyTxAsDeleted: false,
  });
}

async function pushClubAndAccounts(id: string, baseUpdatedAt: string | null) {
  let base = baseUpdatedAt;
  let result = await backendSyncService.pushClubMirror(id, { baseUpdatedAt: base });

  if (!result.success) {
    const err = result.error ?? '';
    const isConflict = err.toLowerCase().includes('conflict');
    if (isConflict) {
      const pull = await backendSyncService.pullClubMirror(id);
      if (pull.success && pull.data?.payload && pull.data.durable !== false) {
        const { getClubData, replaceClubData } = await import('./repository');
        const local = getClubData(id);
        const merged = mergeLocalPreferredForPush(local, pull.data.payload);
        replaceClubData(id, merged, { skipCloudPush: true });
        result = await backendSyncService.pushClubMirror(id, {
          baseUpdatedAt: pull.data.updatedAt ?? null,
        });
      }
    }
  }

  await maybePushAccountBundle();
  if (result.success) {
    setLastSyncAt(id, result.data?.updatedAt ?? new Date().toISOString());
    clearClubMirrorDirty(id);
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

/** Cloud has the real roster (π.χ. 1649) while this browser still has a small stale copy. */
function cloudRosterShouldReplace(local: AppData, cloud: AppData): boolean {
  const localN = local.students?.length ?? 0;
  const cloudN = cloud.students?.length ?? 0;
  if (cloudN < 30) return false;
  return cloudN >= localN + 20 || (localN > 0 && cloudN >= localN * 2);
}

function rowIds(rows: { id: string }[] | undefined): Set<string> {
  return new Set((rows ?? []).map((row) => row.id));
}

function hasLocalOnlyRows(localRows: { id: string }[] | undefined, cloudRows: { id: string }[] | undefined) {
  const cloudIds = rowIds(cloudRows);
  return (localRows ?? []).some((row) => !cloudIds.has(row.id));
}

function studentFieldsDiverge(
  localRows: AppData['students'] | undefined,
  cloudRows: AppData['students'] | undefined,
): boolean {
  const cloudById = new Map((cloudRows ?? []).map((row) => [row.id, row]));
  for (const local of localRows ?? []) {
    const cloud = cloudById.get(local.id);
    if (!cloud) continue;
    if ((local.status ?? 'active') !== (cloud.status ?? 'active')) return true;
    if ((local.firstName ?? '') !== (cloud.firstName ?? '')) return true;
    if ((local.lastName ?? '') !== (cloud.lastName ?? '')) return true;
  }
  return false;
}

function catalogSignature(rows: unknown[]): string {
  return JSON.stringify(rows);
}

function isDefaultDiscountCatalog(list: DiscountReasonDef[]): boolean {
  return list.length === 0;
}

function isDefaultClothingCatalog(list: ClothingPackageDef[]): boolean {
  return catalogSignature(list) === catalogSignature(defaultClothingPackages());
}

function localCatalogAhead<T extends { id: string }>(
  localRows: T[],
  cloudRows: T[],
  isDefault: (list: T[]) => boolean,
): boolean {
  if (catalogSignature(localRows) === catalogSignature(cloudRows)) return false;
  if (localRows.length === 0) return false;
  if (isDefault(localRows) && !isDefault(cloudRows) && cloudRows.length > 0) return false;
  return true;
}

function mergeIdCatalog<T extends { id: string }>(
  localRows: T[] | undefined,
  cloudRows: T[] | undefined,
  normalize: (list: T[] | undefined) => T[],
  isDefault: (list: T[]) => boolean,
  preferLocal: boolean,
): T[] {
  const local = normalize(localRows);
  const cloud = normalize(cloudRows);
  if (!local.length) return cloud;
  if (!cloud.length) return local;
  if (!isDefault(local) && isDefault(cloud)) return local;
  if (isDefault(local) && !isDefault(cloud)) return cloud;
  const map = new Map<string, T>();
  const first = preferLocal ? cloud : local;
  const second = preferLocal ? local : cloud;
  for (const row of first) map.set(row.id, row);
  for (const row of second) map.set(row.id, row);
  return [...map.values()];
}

function sizeChartCount(chart: SizeChart | undefined): number {
  if (!chart) return 0;
  return (chart.kids?.length ?? 0) + (chart.men?.length ?? 0) + (chart.women?.length ?? 0);
}

function mergeSizeCharts(
  local: SizeChart | undefined,
  cloud: SizeChart | undefined,
  preferLocal: boolean,
): SizeChart {
  if (preferLocal && local) return local;
  if (!cloud && local) return local;
  if (!local && cloud) return cloud;
  if (local && cloud && sizeChartCount(local) > sizeChartCount(cloud)) return local;
  return cloud ?? local ?? { kids: [], men: [], women: [] };
}

function localHasUnsyncedEdits(local: AppData, cloud: AppData): boolean {
  if (hasLocalOnlyRows(local.students, cloud.students)) return true;
  if (studentFieldsDiverge(local.students, cloud.students)) return true;
  if (hasLocalOnlyRows(local.classes, cloud.classes)) return true;
  if (hasLocalOnlyRows(local.coaches, cloud.coaches)) return true;
  if (hasLocalOnlyRows(local.staff, cloud.staff)) return true;
  if (hasLocalOnlyRows(local.transactions, cloud.transactions)) return true;

  const cloudDeletedTx = new Set(cloud.deletedTransactionIds ?? []);
  if ((local.deletedTransactionIds ?? []).some((id) => !cloudDeletedTx.has(id))) return true;

  const cloudSuppressed = new Set(cloud.suppressedFeeChargeKeys ?? []);
  if ((local.suppressedFeeChargeKeys ?? []).some((key) => !cloudSuppressed.has(key))) return true;

  const cloudDeletedStudents = new Set(cloud.deletedStudentIds ?? []);
  if ((local.deletedStudentIds ?? []).some((id) => !cloudDeletedStudents.has(id))) return true;

  const localReasons = clubDiscountReasons(local.discountReasons);
  const cloudReasons = clubDiscountReasons(cloud.discountReasons);
  if (localCatalogAhead(localReasons, cloudReasons, isDefaultDiscountCatalog)) return true;

  const localPackages = normalizeClothingPackages(local.clothingPackages);
  const cloudPackages = normalizeClothingPackages(cloud.clothingPackages);
  if (localCatalogAhead(localPackages, cloudPackages, isDefaultClothingCatalog)) return true;

  if (hasLocalOnlyRows(local.receiptNumberRanges, cloud.receiptNumberRanges)) return true;
  if (hasLocalOnlyRows(local.receiptIssues, cloud.receiptIssues)) return true;

  if (
    local.sizeChart &&
    sizeChartCount(local.sizeChart) > sizeChartCount(cloud.sizeChart) &&
    JSON.stringify(local.sizeChart) !== JSON.stringify(cloud.sizeChart ?? null)
  ) {
    return true;
  }

  return false;
}

function mergeReceiptIssues(
  local: ReceiptIssueRecord[] | undefined,
  cloud: ReceiptIssueRecord[] | undefined,
): ReceiptIssueRecord[] {
  const map = new Map<string, ReceiptIssueRecord>();
  const keyOf = (row: ReceiptIssueRecord) =>
    `${row.series}:${row.number}`;
  for (const row of normalizeReceiptIssues(cloud)) map.set(keyOf(row), row);
  for (const row of normalizeReceiptIssues(local)) {
    const key = keyOf(row);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    map.set(key, {
      ...prev,
      ...row,
      voidedAt: row.voidedAt || prev.voidedAt,
      voidReason: row.voidReason || prev.voidReason,
      emailedAt: row.emailedAt || prev.emailedAt,
      issuedAt: prev.issuedAt <= row.issuedAt ? prev.issuedAt : row.issuedAt,
    });
  }
  return [...map.values()];
}

function mergeById<T extends { id: string }>(
  localRows: T[] | undefined,
  cloudRows: T[] | undefined,
  deleted: Set<string>,
  preferLocal: boolean,
): T[] {
  const map = new Map<string, T>();
  const first = preferLocal ? cloudRows ?? [] : localRows ?? [];
  const second = preferLocal ? localRows ?? [] : cloudRows ?? [];
  for (const row of first) {
    if (!deleted.has(row.id)) map.set(row.id, row);
  }
  for (const row of second) {
    if (!deleted.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()];
}

function pickNonEmptyMediaUrl(
  primary?: string | null,
  fallback?: string | null,
): string | null {
  const a = (primary ?? '').trim();
  if (a) return a;
  const b = (fallback ?? '').trim();
  if (b) return b;
  return null;
}

function mergeFacilities(
  localRows: AppData['facilities'] | undefined,
  cloudRows: AppData['facilities'] | undefined,
  preferLocal: boolean,
): AppData['facilities'] {
  const merged = mergeById(localRows, cloudRows, new Set(), preferLocal);
  return merged.map((row) => {
    const local = (localRows ?? []).find((item) => item.id === row.id);
    const cloud = (cloudRows ?? []).find((item) => item.id === row.id);
    const primary = preferLocal ? local?.photoUrl : cloud?.photoUrl;
    const fallback = preferLocal ? cloud?.photoUrl : local?.photoUrl;
    return { ...row, photoUrl: pickNonEmptyMediaUrl(primary, fallback) };
  });
}

function mergeRentalSettings(
  local: AppData['rentalSettings'] | undefined,
  cloud: AppData['rentalSettings'] | undefined,
  preferLocal: boolean,
): AppData['rentalSettings'] {
  const primary = preferLocal ? local : cloud;
  const secondary = preferLocal ? cloud : local;
  return {
    ...emptyRentalSettings(),
    ...secondary,
    ...primary,
    photoLook: 'g',
    heroImageUrl: pickNonEmptyMediaUrl(primary?.heroImageUrl, secondary?.heroImageUrl),
  };
}

function mergeClubSnapshots(
  local: AppData,
  cloud: AppData,
  opts: { preferLocal: boolean; treatCloudOnlyTxAsDeleted: boolean },
): AppData {
  const deletedStudents = new Set([
    ...(local.deletedStudentIds ?? []),
    ...(cloud.deletedStudentIds ?? []),
  ]);
  const deleted = new Set([
    ...(local.deletedTransactionIds ?? []),
    ...(cloud.deletedTransactionIds ?? []),
  ]);
  const suppressed = new Set([
    ...(local.suppressedFeeChargeKeys ?? []),
    ...(cloud.suppressedFeeChargeKeys ?? []),
  ]);
  const localTxnIds = new Set((local.transactions ?? []).map((t) => t.id));
  if (opts.treatCloudOnlyTxAsDeleted) {
    for (const tx of cloud.transactions ?? []) {
      if (!localTxnIds.has(tx.id)) deleted.add(tx.id);
    }
  }

  const byId = new Map<string, (typeof local.transactions)[number]>();
  const ordered = opts.preferLocal
    ? [...(cloud.transactions ?? []), ...(local.transactions ?? [])]
    : [...(local.transactions ?? []), ...(cloud.transactions ?? [])];
  for (const tx of ordered) {
    if (transactionIsSuppressed(tx, deleted, suppressed)) continue;
    byId.set(tx.id, tx);
  }

  const next = structuredClone(cloud);
  const localWrittenAt = Number(local.localWrittenAt) || 0;
  const cloudWrittenAt = Number(cloud.localWrittenAt) || 0;
  const preferLocalStudents =
    !cloudRosterShouldReplace(local, cloud) &&
    (opts.preferLocal || localWrittenAt >= cloudWrittenAt);
  next.students = mergeById(
    local.students,
    cloud.students,
    deletedStudents,
    preferLocalStudents,
  );
  next.localWrittenAt = preferLocalStudents
    ? local.localWrittenAt ?? cloud.localWrittenAt
    : cloud.localWrittenAt ?? local.localWrittenAt;
  next.classes = mergeById(local.classes, cloud.classes, new Set(), opts.preferLocal);
  next.coaches = mergeById(local.coaches, cloud.coaches, new Set(), opts.preferLocal);
  next.staff = mergeById(local.staff, cloud.staff, new Set(), opts.preferLocal);
  next.associations = mergeById(local.associations, cloud.associations, new Set(), opts.preferLocal);
  next.sports = mergeById(local.sports, cloud.sports, new Set(), opts.preferLocal);
  next.facilities = mergeFacilities(local.facilities, cloud.facilities, opts.preferLocal);
  next.rentalSettings = mergeRentalSettings(local.rentalSettings, cloud.rentalSettings, opts.preferLocal);
  next.feeChargeTemplates = mergeById(
    local.feeChargeTemplates,
    cloud.feeChargeTemplates,
    new Set(),
    opts.preferLocal,
  );
  next.clubSeasons = mergeById(local.clubSeasons, cloud.clubSeasons, new Set(), opts.preferLocal);
  next.expenses = mergeById(local.expenses, cloud.expenses, new Set(), opts.preferLocal);
  next.transactions = [...byId.values()];
  next.deletedTransactionIds = [...deleted].slice(-5000);
  next.deletedStudentIds = [...deletedStudents].slice(-5000);
  next.suppressedFeeChargeKeys = [...suppressed].slice(-5000);
  next.revenues = mergeById(local.revenues, cloud.revenues, new Set(), opts.preferLocal).filter(
    (row) => !row.linkedTransactionId || !deleted.has(row.linkedTransactionId),
  );
  next.discountReasons = mergeIdCatalog(
    local.discountReasons,
    cloud.discountReasons,
    clubDiscountReasons,
    isDefaultDiscountCatalog,
    opts.preferLocal,
  );
  next.clothingPackages = mergeIdCatalog(
    local.clothingPackages,
    cloud.clothingPackages,
    normalizeClothingPackages,
    isDefaultClothingCatalog,
    opts.preferLocal,
  );
  next.sizeChart = mergeSizeCharts(local.sizeChart, cloud.sizeChart, opts.preferLocal);
  next.receiptNumberRanges = mergeIdCatalog(
    local.receiptNumberRanges,
    cloud.receiptNumberRanges,
    normalizeReceiptRanges,
    (list) => list.length === 0,
    opts.preferLocal,
  );
  next.receiptIssues = mergeReceiptIssues(local.receiptIssues, cloud.receiptIssues);
  return next;
}

/**
 * Pull club mirror from cloud when a newer revision exists.
 * Skips while a debounced push is pending (unless flushed first) or another pull is running.
 */
export async function pullClubMirrorIfNewer(clubId?: string | null | undefined) {
  const id = clubId ?? resolveActiveClubId();
  if (!id || id === '_default' || !isAutoSyncEnabled(id) || pulling) {
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

  if (isClubMirrorDirty(id)) {
    const pushResult = await flushClubMirrorPush(id);
    if (!pushResult.success && pushResult.error) {
      return { success: false as const, pulled: false, error: pushResult.error };
    }
    return { success: true as const, pulled: false, error: null };
  }

  await pushQueue;

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
    const { getClubData, replaceClubData } = await import('./repository');
    const local = getClubData(id);
    if (result.data.durable === false) {
      return { success: true as const, pulled: false, error: null };
    }
    const cloud = result.data.payload;
    const staleRoster = cloudRosterShouldReplace(local, cloud);
    if (!isCloudNewer(cloudAt, localAt) && !staleRoster) {
      return { success: true as const, pulled: false, error: null };
    }

    const preferLocal = isClubMirrorDirty(id) && !staleRoster;
    const nextData = preferLocal
      ? mergeLocalPreferredForPush(local, cloud)
      : applyCloudClubData(local, cloud);
    replaceClubData(id, nextData, { skipCloudPush: true });
    setLastSyncAt(id, cloudAt ?? new Date().toISOString());
    setCloudPreferred(true);
    if (!staleRoster && (preferLocal || localHasUnsyncedEdits(nextData, cloud))) {
      markClubMirrorDirty(id);
      void flushClubMirrorPush(id);
    }
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

/** Pull every club mirror so Platform Admin repairs run on durable data, not a preview club. */
export async function hydrateAllClubMirrorsFromCloud(): Promise<void> {
  const { getSessionToken } = await import('../api/services/sessionService');
  const { isDemoSessionActive } = await import('../auth/auth');
  if (!getSessionToken() || isDemoSessionActive()) return;

  const { getClubs } = await import('../auth/clubs');
  const { clubHasStoredData, getClubData, replaceClubData } = await import('./repository');

  pulling = true;
  try {
    for (const club of getClubs()) {
      const id = club.id;
      if (!id || id === '_default' || !isAutoSyncEnabled(id)) continue;
      const result = await backendSyncService.pullClubMirror(id);
      if (!result.success || !result.data?.payload || result.data.durable === false) continue;
      if (clubHasStoredData(id)) {
        const local = getClubData(id);
        if (cloudRosterShouldReplace(local, result.data.payload)) {
          replaceClubData(id, applyCloudClubData(local, result.data.payload), { skipCloudPush: true });
          setLastSyncAt(id, result.data.updatedAt ?? new Date().toISOString());
          clearClubMirrorDirty(id);
          continue;
        }
        const preferLocal = isClubMirrorDirty(id);
        replaceClubData(
          id,
          preferLocal
            ? mergeClubSnapshots(local, stripHeavyMedia(result.data.payload), {
                preferLocal,
                treatCloudOnlyTxAsDeleted: preferLocal,
              })
            : applyCloudClubData(local, result.data.payload),
          { skipCloudPush: true },
        );
        setLastSyncAt(id, result.data.updatedAt ?? new Date().toISOString());
        if (localHasUnsyncedEdits(local, result.data.payload)) {
          markClubMirrorDirty(id);
          await flushClubMirrorPush(id);
        } else {
          clearClubMirrorDirty(id);
        }
      } else {
        replaceClubData(id, stripHeavyMedia(result.data.payload), { skipCloudPush: true });
        setLastSyncAt(id, result.data.updatedAt ?? new Date().toISOString());
        clearClubMirrorDirty(id);
      }
    }
  } finally {
    pulling = false;
  }
}

/**
 * Always apply the cloud roster (Chrome often keeps a truncated localStorage copy
 * with a stale lastSync timestamp, so a "if newer" pull would skip).
 */
export async function ensureFreshCloudRoster(clubId?: string | null) {
  const id = clubId ?? resolveActiveClubId();
  if (!id || id === '_default' || !isAutoSyncEnabled(id)) return;
  const { getSessionToken } = await import('../api/services/sessionService');
  const { isDemoSessionActive } = await import('../auth/auth');
  if (!getSessionToken() || isDemoSessionActive()) return;

  await pushQueue;
  const result = await backendSyncService.pullClubMirror(id);
  if (!result.success || !result.data?.payload || result.data.durable === false) return;
  const { getClubData, replaceClubData } = await import('./repository');
  const local = getClubData(id);
  if (isClubMirrorDirty(id)) {
    replaceClubData(id, mergeLocalPreferredForPush(local, result.data.payload), { skipCloudPush: true });
    return;
  }
  replaceClubData(id, applyCloudClubData(local, result.data.payload), { skipCloudPush: true });
  setLastSyncAt(id, result.data.updatedAt ?? new Date().toISOString());
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

/** Best-effort cloud flush so logout is never blocked by a hung push. */
export async function persistLocalStateToCloudBeforeLogout(timeoutMs = 2000) {
  try {
    await Promise.race([
      persistLocalStateToCloud(),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    /* still continue to logout */
  }
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
      const cloud = result.data.payload;
      const preferLocal = isClubMirrorDirty(id);
      const treatCloudOnlyTxAsDeleted =
        preferLocal &&
        ((local.deletedTransactionIds?.length ?? 0) > 0 ||
          (local.suppressedFeeChargeKeys?.length ?? 0) > 0);
      const useCloudRoster = cloudRosterShouldReplace(local, cloud);
      const merged = useCloudRoster
        ? applyCloudClubData(local, cloud)
        : mergeClubSnapshots(local, stripHeavyMedia(cloud), {
            preferLocal,
            treatCloudOnlyTxAsDeleted,
          });
      replaceClubData(id, merged, { skipCloudPush: true });
      setLastSyncAt(id, result.data.updatedAt ?? new Date().toISOString());
      setCloudPreferred(true);
      if (useCloudRoster) {
        clearClubMirrorDirty(id);
      } else if (localHasUnsyncedEdits(merged, cloud) || isEmptyCloudOverwrite(merged, cloud)) {
        markClubMirrorDirty(id);
        await flushClubMirrorPush(id);
      } else {
        clearClubMirrorDirty(id);
      }
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
