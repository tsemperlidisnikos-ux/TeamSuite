import * as accountSyncService from '../api/services/accountSyncService';
import * as backendSyncService from '../api/services/backendSyncService';
import { getSession } from '../auth/auth';
import { stripHeavyMedia } from './mediaStrip';
import { resolveActiveClubId, whenClubMapPersisted } from './store';
import type { AppData, ClothingPackageDef, DiscountReasonDef, SizeChart } from '../types';
import {
  defaultClothingPackages,
  normalizeClothingPackages,
} from '../utils/clothingPackages';
import {
  clubDiscountReasons,
} from '../utils/discountReasons';
import { emptyRentalSettings } from '../shared/facilityRentalAvailability';
import {
  applyFinanceCollections,
  financeCollectionsChanged,
  localFinanceNeedsPush,
} from './financeSyncMerge';
import {
  applyOpsCollections,
  localOpsNeedsPush,
  opsCollectionsChanged,
} from './opsSyncMerge';
import {
  applyContentCollections,
  contentCollectionsChanged,
  localContentNeedsPush,
} from './clubContentSyncMerge';
import { stampMissingUpdatedAt } from './stampUpdatedAt';
import { mergeByIdPreferringUpdatedAt } from './entityFieldMerge';

const AUTO_SYNC_KEY = 'academyhub-auto-sync-v1';
const LAST_SYNC_KEY = 'academyhub-last-sync-v1';
const CLOUD_PREFERRED_KEY = 'academyhub-cloud-preferred-v1';
const DIRTY_KEY = 'academyhub-club-dirty-v1';
const LAST_ERROR_KEY = 'academyhub-club-sync-error-v1';

export const CLUB_SYNC_STATUS_EVENT = 'teamsuite-club-sync-status';
export const CLUB_WRITE_CONFLICT_EVENT = 'teamsuite-write-conflict';

export type ClubWriteConflict = {
  clubId: string;
  cloudByName: string;
  cloudAt: number;
  localByName: string;
  localAt: number;
};

const CONFLICT_KEY = 'teamsuite-write-conflict-v1';

function emitClubSyncStatus(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CLUB_SYNC_STATUS_EVENT));
}

function emitClubWriteConflict(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CLUB_WRITE_CONFLICT_EVENT));
  emitClubSyncStatus();
}

export function getClubWriteConflict(clubId?: string | null): ClubWriteConflict | null {
  const id = clubId ?? resolveActiveClubId();
  if (!id) return null;
  const map = readMap<Record<string, ClubWriteConflict>>(CONFLICT_KEY);
  return map[id] ?? null;
}

function setClubWriteConflict(row: ClubWriteConflict): void {
  const map = readMap<Record<string, ClubWriteConflict>>(CONFLICT_KEY);
  map[row.clubId] = row;
  writeMap(CONFLICT_KEY, map);
  emitClubWriteConflict();
}

function clearClubWriteConflict(clubId: string): void {
  const map = readMap<Record<string, ClubWriteConflict>>(CONFLICT_KEY);
  if (!map[clubId]) return;
  delete map[clubId];
  writeMap(CONFLICT_KEY, map);
  emitClubWriteConflict();
}

function isForeignCloudWrite(cloud: AppData, userId: string | undefined): boolean {
  const cloudUser = String(cloud.lastWrittenByUserId ?? '').trim();
  if (!cloudUser || !userId || cloudUser === userId) return false;
  const cloudAt = Number(cloud.localWrittenAt) || 0;
  return cloudAt > 0;
}

function shouldHoldWriteConflict(clubId: string, local: AppData, cloud: AppData): boolean {
  void local;
  if (!isClubMirrorDirty(clubId)) return false;
  const sessionId = getSession()?.id;
  if (!isForeignCloudWrite(cloud, sessionId)) return false;
  const last = getLastSyncAt(clubId);
  const lastMs = last ? Date.parse(last) : 0;
  const cloudAt = Number(cloud.localWrittenAt) || 0;
  if (!Number.isFinite(cloudAt) || cloudAt <= lastMs) return false;
  return true;
}

function rememberWriteConflict(clubId: string, local: AppData, cloud: AppData): void {
  setClubWriteConflict({
    clubId,
    cloudByName: cloud.lastWrittenByName?.trim() || 'άλλος χρήστης',
    cloudAt: Number(cloud.localWrittenAt) || Date.now(),
    localByName: local.lastWrittenByName?.trim() || 'αυτός ο υπολογιστής',
    localAt: Number(local.localWrittenAt) || Date.now(),
  });
}

type AutoSyncMap = Record<string, boolean>;
type LastSyncMap = Record<string, string>;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pulling = false;
let lastPullAttemptAt = 0;
let pushQueue: Promise<unknown> = Promise.resolve();

type ClubSyncProgress = { percent: number; inFlight: boolean };

const syncProgressByClub: Record<string, ClubSyncProgress> = {};
const syncProgressTimers: Record<string, ReturnType<typeof setInterval>> = {};

export function getClubSyncProgress(clubId?: string | null): ClubSyncProgress {
  const id = clubId ?? resolveActiveClubId();
  if (!id) return { percent: 100, inFlight: false };
  return syncProgressByClub[id] ?? { percent: getLastSyncError(id) ? 0 : 100, inFlight: false };
}

function setClubSyncProgress(clubId: string, percent: number, inFlight: boolean): void {
  syncProgressByClub[clubId] = {
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    inFlight,
  };
  emitClubSyncStatus();
}

function stopClubSyncProgressTimer(clubId: string): void {
  const timer = syncProgressTimers[clubId];
  if (!timer) return;
  clearInterval(timer);
  delete syncProgressTimers[clubId];
}

function beginClubSyncProgress(clubId: string): void {
  stopClubSyncProgressTimer(clubId);
  setClubSyncProgress(clubId, 6, true);
  syncProgressTimers[clubId] = setInterval(() => {
    const current = syncProgressByClub[clubId]?.percent ?? 6;
    if (current >= 90) return;
    const step = current < 30 ? 8 : current < 60 ? 4 : 2;
    setClubSyncProgress(clubId, Math.min(90, current + step), true);
  }, 300);
}

function endClubSyncProgress(clubId: string, ok: boolean): void {
  stopClubSyncProgressTimer(clubId);
  setClubSyncProgress(clubId, ok ? 100 : 0, false);
}

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

export const STALE_MIRROR_MS = 24 * 60 * 60 * 1000;

/** Πόσο παλιό είναι το τελευταίο επιτυχές Push (ms). null = δεν έγινε ποτέ. */
export function lastSuccessfulPushAgeMs(clubId?: string | null): number | null {
  const at = getLastSyncAt(clubId);
  if (!at) return null;
  const ts = Date.parse(at);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Date.now() - ts);
}

export function isMirrorPushStale(clubId?: string | null): boolean {
  const age = lastSuccessfulPushAgeMs(clubId);
  if (age == null) return false;
  return age >= STALE_MIRROR_MS;
}

function setLastSyncAt(clubId: string, at: string): void {
  const map = readMap<LastSyncMap>(LAST_SYNC_KEY);
  map[clubId] = at;
  writeMap(LAST_SYNC_KEY, map);
  emitClubSyncStatus();
}

/** Το club-ops ανέβασε νεότερη revision — το επόμενο full push χρησιμοποιεί αυτό ως βάση. */
export function noteClubMirrorRevision(clubId: string, updatedAt: string): void {
  if (!clubId || !updatedAt) return;
  setLastSyncAt(clubId, updatedAt);
}

export function clearLastSyncAt(clubId: string): void {
  const map = readMap<LastSyncMap>(LAST_SYNC_KEY);
  delete map[clubId];
  writeMap(LAST_SYNC_KEY, map);
}

export function isClubMirrorDirty(clubId: string): boolean {
  return readMap<Record<string, boolean>>(DIRTY_KEY)[clubId] === true;
}

export function getLastSyncError(clubId: string): string | null {
  const msg = readMap<Record<string, string>>(LAST_ERROR_KEY)[clubId];
  return msg?.trim() || null;
}

function setLastSyncError(clubId: string, message: string | null): void {
  const map = readMap<Record<string, string>>(LAST_ERROR_KEY);
  if (message) map[clubId] = message;
  else delete map[clubId];
  writeMap(LAST_ERROR_KEY, map);
  emitClubSyncStatus();
}

export function markClubMirrorDirty(clubId: string): void {
  const map = readMap<Record<string, boolean>>(DIRTY_KEY);
  map[clubId] = true;
  writeMap(DIRTY_KEY, map);
  emitClubSyncStatus();
}

function clearClubMirrorDirty(clubId: string): void {
  const map = readMap<Record<string, boolean>>(DIRTY_KEY);
  delete map[clubId];
  writeMap(DIRTY_KEY, map);
  emitClubSyncStatus();
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

async function maybePushAccountBundle(keepalive?: boolean) {
  const { getSession, isPlatformAdmin } = await import('../auth/auth');
  const { getSessionToken } = await import('../api/services/sessionService');
  if (!isPlatformAdmin() || !getSessionToken() || getSession()?.role !== 'platform_admin') {
    return { success: true as const, skipped: true, error: null };
  }
  const result = await accountSyncService.pushAccountBundle({ keepalive });
  if (!result.success) {
    const err = result.error ?? '';
    if (err.includes('Μόνο Platform Admin')) {
      return { success: true as const, skipped: true, error: null };
    }
    return { success: false as const, skipped: false, error: err || 'Account push failed' };
  }
  return { success: true as const, skipped: false, error: null };
}

export async function flushClubMirrorPush(
  clubId?: string | null,
  opts?: { force?: boolean; keepalive?: boolean },
) {
  const id = clubId ?? resolveActiveClubId();
  if (!id || id === '_default') {
    return { success: true as const, data: null, error: null };
  }
  if (!opts?.force && !isAutoSyncEnabled(id)) {
    return { success: true as const, data: null, error: null };
  }

  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  const run = async () => {
    beginClubSyncProgress(id);
    try {
      await whenClubMapPersisted();
      const result = await pushClubAndAccounts(id, getLastSyncAt(id), { keepalive: opts?.keepalive });
      endClubSyncProgress(id, Boolean(result.success));
      return result;
    } catch (error) {
      endClubSyncProgress(id, false);
      throw error;
    }
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

async function pushClubAndAccounts(
  id: string,
  baseUpdatedAt: string | null,
  opts?: { keepalive?: boolean },
) {
  let result = await backendSyncService.pushClubMirror(id, {
    baseUpdatedAt: baseUpdatedAt,
    keepalive: opts?.keepalive,
  });

  for (let attempt = 0; attempt < 3 && !result.success; attempt++) {
    const pull = await backendSyncService.pullClubMirror(id);
    if (!pull.success || !pull.data?.payload || pull.data.durable === false) break;
    const { getClubData, replaceClubData } = await import('./repository');
    const local = getClubData(id);
    const cloud = pull.data.payload;
    if (shouldHoldWriteConflict(id, local, cloud)) {
      rememberWriteConflict(id, local, cloud);
      return {
        success: false as const,
        data: null,
        error:
          'Άλλος χρήστης αποθήκευσε στο cloud. Επιλέξτε αν θα κρατήσετε τις αλλαγές σας ή του άλλου.',
      };
    }
    const merged = mergeLocalPreferredForPush(local, cloud);
    const { syncRentalRevenuesInData } = await import('../api/services/rentalRevenueBridge');
    syncRentalRevenuesInData(merged);
    replaceClubData(id, merged, { skipCloudPush: true });
    result = await backendSyncService.pushClubMirror(id, {
      baseUpdatedAt: pull.data.updatedAt ?? null,
      keepalive: opts?.keepalive,
    });
  }

  await maybePushAccountBundle(opts?.keepalive);
  if (result.success) {
    setLastSyncAt(id, result.data?.updatedAt ?? new Date().toISOString());
    clearClubMirrorDirty(id);
    clearClubWriteConflict(id);
    setLastSyncError(id, null);
  } else if (result.error) {
    setLastSyncError(id, result.error);
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

function cloudHasMissingLocalStudents(local: AppData, cloud: AppData): boolean {
  const localIds = new Set((local.students ?? []).map((s) => s.id));
  const deleted = new Set(local.deletedStudentIds ?? []);
  return (cloud.students ?? []).some((s) => !localIds.has(s.id) && !deleted.has(s.id));
}

function activeStudentCount(data: AppData | undefined): number {
  return (data?.students ?? []).filter((s) => (s.status ?? 'active') === 'active').length;
}

/** Cloud has a richer roster — including a single extra athlete (45 vs 46). */
function cloudRosterShouldReplace(local: AppData, cloud: AppData): boolean {
  const localN = local.students?.length ?? 0;
  const cloudN = cloud.students?.length ?? 0;
  const localA = activeStudentCount(local);
  const cloudA = activeStudentCount(cloud);
  if (cloudHasMissingLocalStudents(local, cloud)) return true;
  if (cloudN > localN) return true;
  if (cloudA > localA) return true;
  if (cloudN < 30) return false;
  return cloudN >= localN + 20 || (localN > 0 && cloudN >= localN * 2);
}

/**
 * This browser has the fuller copy (περισσότεροι αθλητές ή ενεργοί).
 * Auto-pull must not replace it with a smaller/stale cloud snapshot from another device.
 */
function localRosterShouldKeep(local: AppData, cloud: AppData): boolean {
  if (cloudRosterShouldReplace(local, cloud)) return false;
  const localN = local.students?.length ?? 0;
  const cloudN = cloud.students?.length ?? 0;
  const localA = activeStudentCount(local);
  const cloudA = activeStudentCount(cloud);
  if (hasLocalOnlyRows(local.students, cloud.students)) return true;
  if (localN > cloudN) return true;
  if (localA > cloudA) return true;
  if (localN >= cloudN + 20) return true;
  if (localN >= 30 && cloudN > 0 && localN >= cloudN * 2) return true;
  if (Math.abs(localN - cloudN) < 20 && localA >= cloudA + 10) return true;
  return false;
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
  if (hasLocalOnlyRows(local.revenues, cloud.revenues)) return true;
  if (hasLocalOnlyRows(local.expenses, cloud.expenses)) return true;
  if (hasLocalOnlyRows(local.cashAccounts, cloud.cashAccounts)) return true;
  if (hasLocalOnlyRows(local.budgets, cloud.budgets)) return true;
  if (hasLocalOnlyRows(local.feeChargeTemplates, cloud.feeChargeTemplates)) return true;
  if (localFinanceNeedsPush(local, cloud)) return true;
  if (localOpsNeedsPush(local, cloud)) return true;
  if (localContentNeedsPush(local, cloud)) return true;

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

  const localRent = JSON.stringify({
    publicEnabled: Boolean(local.rentalSettings?.publicEnabled),
    notes: local.rentalSettings?.notes ?? '',
    rules: local.rentalSettings?.rules ?? [],
  });
  const cloudRent = JSON.stringify({
    publicEnabled: Boolean(cloud.rentalSettings?.publicEnabled),
    notes: cloud.rentalSettings?.notes ?? '',
    rules: cloud.rentalSettings?.rules ?? [],
  });
  if (localRent !== cloudRent) return true;
  if (hasLocalOnlyRows(local.rentalBookings, cloud.rentalBookings)) return true;
  if (hasLocalOnlyRows(local.schedule, cloud.schedule)) return true;
  if (hasLocalOnlyRows(local.trainings, cloud.trainings)) return true;
  if (hasLocalOnlyRows(local.matches, cloud.matches)) return true;
  if (hasLocalOnlyRows(local.products, cloud.products)) return true;
  if (hasLocalOnlyRows(local.stockMovements, cloud.stockMovements)) return true;
  if (hasLocalOnlyRows(local.athleteChangeLogs, cloud.athleteChangeLogs)) return true;

  if (
    local.sizeChart &&
    sizeChartCount(local.sizeChart) > sizeChartCount(cloud.sizeChart) &&
    JSON.stringify(local.sizeChart) !== JSON.stringify(cloud.sizeChart ?? null)
  ) {
    return true;
  }

  return false;
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
  stampMissingUpdatedAt(local);
  stampMissingUpdatedAt(cloud);
  const deletedStudents = new Set([
    ...(local.deletedStudentIds ?? []),
    ...(cloud.deletedStudentIds ?? []),
  ]);
  const next = structuredClone(cloud);
  const localWrittenAt = Number(local.localWrittenAt) || 0;
  const cloudWrittenAt = Number(cloud.localWrittenAt) || 0;
  const preferLocalStudents =
    !cloudRosterShouldReplace(local, cloud) &&
    !cloudHasMissingLocalStudents(local, cloud) &&
    activeStudentCount(local) >= activeStudentCount(cloud) &&
    (opts.preferLocal || localWrittenAt >= cloudWrittenAt);
  next.students = mergeByIdPreferringUpdatedAt(
    local.students,
    cloud.students,
    deletedStudents,
    preferLocalStudents,
  );
  next.localWrittenAt = Math.max(localWrittenAt, cloudWrittenAt) || local.localWrittenAt || cloud.localWrittenAt;
  next.deletedStudentIds = [...deletedStudents].slice(-5000);
  applyFinanceCollections(next, local, cloud, {
    preferLocal: opts.preferLocal,
    treatCloudOnlyTxAsDeleted: opts.treatCloudOnlyTxAsDeleted,
  });
  applyOpsCollections(next, local, cloud, opts.preferLocal);
  applyContentCollections(next, local, cloud, opts.preferLocal);
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
  next.rentalSettings = mergeRentalSettings(local.rentalSettings, cloud.rentalSettings, opts.preferLocal);
  const pickHtml = (a?: string, b?: string) => {
    const left = (a ?? '').trim();
    const right = (b ?? '').trim();
    if (opts.preferLocal) return left || right;
    return right || left;
  };
  next.termsOfUseHtml = pickHtml(local.termsOfUseHtml, cloud.termsOfUseHtml);
  next.dpaHtml = pickHtml(local.dpaHtml, cloud.dpaHtml);
  next.retentionPolicyHtml = pickHtml(local.retentionPolicyHtml, cloud.retentionPolicyHtml);
  if (opts.preferLocal) {
    next.lastWrittenByUserId = local.lastWrittenByUserId ?? cloud.lastWrittenByUserId;
    next.lastWrittenByName = local.lastWrittenByName ?? cloud.lastWrittenByName;
  } else {
    next.lastWrittenByUserId = cloud.lastWrittenByUserId ?? local.lastWrittenByUserId;
    next.lastWrittenByName = cloud.lastWrittenByName ?? local.lastWrittenByName;
  }
  return next;
}

/**
 * Sync athletes by id (not by replacing the whole club file):
 * pull cloud-only rows into this browser, then POST local-only rows to the server.
 */
export async function reconcileClubRoster(clubId?: string | null) {
  const id = clubId ?? resolveActiveClubId();
  if (!id || id === '_default') {
    return { success: true as const, pulled: false, uploaded: 0, error: null };
  }

  const { getSessionToken } = await import('../api/services/sessionService');
  const { isDemoSessionActive } = await import('../auth/auth');
  if (!getSessionToken() || isDemoSessionActive()) {
    return { success: true as const, pulled: false, uploaded: 0, error: null };
  }

  const result = await backendSyncService.pullClubMirror(id);
  if (!result.success || !result.data?.payload) {
    const msg = result.error ?? '';
    if (isMissingMirrorError(msg)) {
      return { success: true as const, pulled: false, uploaded: 0, error: null };
    }
    return {
      success: false as const,
      pulled: false,
      uploaded: 0,
      error: result.error ?? 'Αποτυχία pull',
    };
  }
  if (result.data.durable === false) {
    return { success: true as const, pulled: false, uploaded: 0, error: null };
  }

  const { getClubData, replaceClubData } = await import('./repository');
  const local = getClubData(id);
  const cloud = result.data.payload;
  const cloudRicher =
    cloudHasMissingLocalStudents(local, cloud) ||
    (cloud.students?.length ?? 0) > (local.students?.length ?? 0) ||
    activeStudentCount(cloud) > activeStudentCount(local);
  const dirty = isClubMirrorDirty(id);
  const cloudAt = result.data.updatedAt ?? new Date().toISOString();
  const mergedLive = mergeClubSnapshots(local, cloud, {
    preferLocal: dirty,
    treatCloudOnlyTxAsDeleted: false,
  });
  const liveChanged =
    financeCollectionsChanged(local, mergedLive) ||
    opsCollectionsChanged(local, mergedLive) ||
    contentCollectionsChanged(local, mergedLive) ||
    JSON.stringify(local.students) !== JSON.stringify(mergedLive.students) ||
    JSON.stringify(local.sizeChart) !== JSON.stringify(mergedLive.sizeChart) ||
    JSON.stringify(local.discountReasons ?? []) !== JSON.stringify(mergedLive.discountReasons ?? []) ||
    JSON.stringify(local.clothingPackages ?? []) !== JSON.stringify(mergedLive.clothingPackages ?? []) ||
    (local.termsOfUseHtml ?? '') !== (mergedLive.termsOfUseHtml ?? '');

  if (liveChanged || cloudRicher) {
    replaceClubData(id, mergedLive, { skipCloudPush: true });
    if (cloudRicher) setCloudPreferred(true);
  }
  const after = getClubData(id);
  if (
    dirty ||
    localHasUnsyncedEdits(after, cloud) ||
    localFinanceNeedsPush(after, cloud) ||
    localOpsNeedsPush(after, cloud) ||
    localContentNeedsPush(after, cloud)
  ) {
    markClubMirrorDirty(id);
  } else {
    setLastSyncAt(id, cloudAt);
  }
  void import('./rosterSyncHealth').then((m) => m.notifyRosterHealthChanged(id));

  const latest = getClubData(id);
  const cloudIds = new Set((cloud.students ?? []).map((row) => row.id));
  const cloudDeleted = new Set(cloud.deletedStudentIds ?? []);
  const missingOnCloud = (latest.students ?? []).filter(
    (row) => !cloudIds.has(row.id) && !cloudDeleted.has(row.id),
  );
  if (missingOnCloud.length === 0) {
    return { success: true as const, pulled: cloudRicher, uploaded: 0, error: null };
  }

  const up = await backendSyncService.upsertClubStudents(id, missingOnCloud);
  if (!up.success) {
    return {
      success: false as const,
      pulled: cloudRicher,
      uploaded: 0,
      error: up.error ?? 'Αποτυχία αποστολής αθλητή',
    };
  }
  setLastSyncAt(id, up.data?.updatedAt ?? new Date().toISOString());
  void import('./rosterSyncHealth').then((m) => m.notifyRosterHealthChanged(id));
  return {
    success: true as const,
    pulled: cloudRicher,
    uploaded: missingOnCloud.length,
    error: null,
  };
}

/**
 * Live poll: reconcile athletes by id, then push other dirty club edits if needed.
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

  pulling = true;
  try {
    const recon = await reconcileClubRoster(id);
    if (!recon.success) {
      return { success: false as const, pulled: recon.pulled, error: recon.error };
    }
    if (isClubMirrorDirty(id)) {
      const { getClubData } = await import('./repository');
      const pull = await backendSyncService.pullClubMirror(id);
      if (pull.success && pull.data?.payload && pull.data.durable !== false) {
        const local = getClubData(id);
        if (!localHasUnsyncedEdits(local, pull.data.payload)) {
          clearClubMirrorDirty(id);
          return { success: true as const, pulled: recon.pulled, error: null };
        }
      }
      const pushResult = await flushClubMirrorPush(id, { force: true });
      if (!pushResult.success && pushResult.error) {
        return { success: false as const, pulled: recon.pulled, error: pushResult.error };
      }
    }
    return { success: true as const, pulled: recon.pulled, error: null };
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
        if (localRosterShouldKeep(local, result.data.payload)) {
          if (shouldHoldWriteConflict(id, local, result.data.payload)) {
            rememberWriteConflict(id, local, result.data.payload);
            continue;
          }
          replaceClubData(id, mergeLocalPreferredForPush(local, result.data.payload), {
            skipCloudPush: true,
          });
          markClubMirrorDirty(id);
          await flushClubMirrorPush(id);
          continue;
        }
        const preferLocal = isClubMirrorDirty(id);
        if (preferLocal && shouldHoldWriteConflict(id, local, result.data.payload)) {
          rememberWriteConflict(id, local, result.data.payload);
          continue;
        }
        replaceClubData(
          id,
          preferLocal
            ? mergeClubSnapshots(local, stripHeavyMedia(result.data.payload), {
                preferLocal,
                treatCloudOnlyTxAsDeleted: false,
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
  const cloud = result.data.payload;
  if (localRosterShouldKeep(local, cloud) || isClubMirrorDirty(id)) {
    if (shouldHoldWriteConflict(id, local, cloud)) {
      rememberWriteConflict(id, local, cloud);
      return;
    }
    replaceClubData(id, mergeLocalPreferredForPush(local, cloud), { skipCloudPush: true });
    markClubMirrorDirty(id);
    void flushClubMirrorPush(id);
    return;
  }
  if (cloudRosterShouldReplace(local, cloud)) {
    replaceClubData(id, applyCloudClubData(local, cloud), { skipCloudPush: true });
    setLastSyncAt(id, result.data.updatedAt ?? new Date().toISOString());
    clearClubMirrorDirty(id);
    return;
  }
  replaceClubData(id, applyCloudClubData(local, cloud), { skipCloudPush: true });
  setLastSyncAt(id, result.data.updatedAt ?? new Date().toISOString());
}

export async function resolveClubWriteConflict(
  clubId: string,
  choice: 'keep-local' | 'take-cloud',
) {
  const id = clubId;
  clearClubWriteConflict(id);
  const { getClubData, replaceClubData } = await import('./repository');
  const pull = await backendSyncService.pullClubMirror(id);
  const local = getClubData(id);
  const cloud = pull.success && pull.data?.payload && pull.data.durable !== false
    ? pull.data.payload
    : null;

  if (choice === 'take-cloud') {
    if (!cloud) {
      return { success: false as const, error: 'Δεν φορτώθηκε το cloud αντίγραφο.' };
    }
    replaceClubData(id, applyCloudClubData(local, cloud), { skipCloudPush: true });
    setLastSyncAt(id, pull.data?.updatedAt ?? new Date().toISOString());
    clearClubMirrorDirty(id);
    return { success: true as const, error: null };
  }

  if (cloud) {
    replaceClubData(id, mergeLocalPreferredForPush(local, cloud), { skipCloudPush: true });
  }
  markClubMirrorDirty(id);
  const pushed = await backendSyncService.pushClubMirror(id, { baseUpdatedAt: null });
  if (!pushed.success) {
    return { success: false as const, error: pushed.error ?? 'Αποτυχία αποστολής' };
  }
  setLastSyncAt(id, pushed.data?.updatedAt ?? new Date().toISOString());
  clearClubMirrorDirty(id);
  return { success: true as const, error: null };
}

/**
 * After restore (or logout): write local clubs + accounts to durable cloud.
 * `overwriteCloud` sends baseUpdatedAt=null so a previous empty mirror is replaced.
 */
export async function persistLocalStateToCloud(opts?: {
  clubIds?: string[];
  overwriteCloud?: boolean;
  keepalive?: boolean;
}) {
  await whenClubMapPersisted();
  const ids = opts?.clubIds?.length ? opts.clubIds : await clubIdsForSync();
  const unique = [...new Set(ids.filter((id) => id && id !== '_default'))];

  const account = await maybePushAccountBundle(opts?.keepalive);
  const errors: string[] = [];
  if (!account.success && account.error) {
    errors.push(account.error);
  }

  for (const id of unique) {
    if (opts?.overwriteCloud) clearLastSyncAt(id);
    const result = await flushClubMirrorPush(id, { keepalive: opts?.keepalive });
    if (!result.success && result.error) errors.push(`${id}: ${result.error}`);
  }

  if (errors.length) {
    return { success: false as const, error: errors.join(' · ') };
  }
  return { success: true as const, error: null };
}

/** Best-effort cloud flush so logout is never blocked by a hung push. */
export async function persistLocalStateToCloudBeforeLogout(timeoutMs = 12_000) {
  try {
    await Promise.race([
      persistLocalStateToCloud({ keepalive: true }),
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

  // Only the signed-in club — never pull every catalog club (that froze login for platform admin).
  const sessionClub = (clubId ?? '').trim();
  const ids = sessionClub ? [sessionClub] : [];

  for (const id of ids) {
    const recon = await reconcileClubRoster(id);
    if (!recon.success && clubId === id) {
      const msg = recon.error ?? '';
      if (isMissingMirrorError(msg)) {
        await flushClubMirrorPush(id, { force: true });
        if (id === clubId) pulledClub = true;
        continue;
      }
      return {
        success: false as const,
        data: null,
        error: recon.error ?? 'Αποτυχία sync',
      };
    }
    if (isClubMirrorDirty(id)) {
      await flushClubMirrorPush(id, { force: true });
    }
    if (id === clubId) pulledClub = true;
  }

  if (pulledAccount && account.success && account.data) {
    const { getSessionToken, persistClubLogoToCloud } = await import('../api/services/sessionService');
    const { getClubs, updateClubLogo } = await import('../auth/clubs');
    if (getSessionToken()) {
      const clubs = sessionClub
        ? getClubs().filter((club) => club.id === sessionClub)
        : [];
      for (const club of clubs) {
        const cloud = account.data.clubs.find((row) => row.id === club.id);
        const cloudLogo = (cloud?.logoUrl ?? '').trim();
        const localLogo = (club.logoUrl ?? '').trim();
        const durableCloud =
          Boolean(cloudLogo) &&
          !cloudLogo.startsWith('data:') &&
          !/vercel-storage\.com/i.test(cloudLogo);
        if (durableCloud && cloudLogo !== localLogo) {
          updateClubLogo(club.id, cloudLogo);
          continue;
        }
        const cloudNeedsLogo = !cloudLogo || cloudLogo.startsWith('data:') || /vercel-storage\.com/i.test(cloudLogo);
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
