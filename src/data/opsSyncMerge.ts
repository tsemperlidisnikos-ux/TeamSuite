import type { AppData, AttendanceRecord } from '../types';
import { FINANCE_TOMBSTONE_CAP } from './financeSyncMerge';
import { mergeByIdPreferringUpdatedAt, mergeTwoRecords } from './entityFieldMerge';

function unionIdSet(...lists: Array<string[] | undefined>): Set<string> {
  const set = new Set<string>();
  for (const list of lists) {
    for (const id of list ?? []) {
      const trimmed = String(id).trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return set;
}

function attendanceSlotKey(row: AttendanceRecord): string {
  return `${row.classId}|${row.studentId}|${row.date}`;
}

function mergeAttendanceRows(
  localRows: AttendanceRecord[] | undefined,
  cloudRows: AttendanceRecord[] | undefined,
  deletedIds: Set<string>,
  preferLocalIfTie: boolean,
): { rows: AttendanceRecord[]; extraDeleted: string[] } {
  const extraDeleted: string[] = [];
  const bySlot = new Map<string, AttendanceRecord>();
  const ordered = preferLocalIfTie
    ? [...(cloudRows ?? []), ...(localRows ?? [])]
    : [...(localRows ?? []), ...(cloudRows ?? [])];
  for (const row of ordered) {
    if (deletedIds.has(row.id)) continue;
    const key = attendanceSlotKey(row);
    const prev = bySlot.get(key);
    if (!prev) {
      bySlot.set(key, row);
      continue;
    }
    const merged = mergeTwoRecords(prev, row, preferLocalIfTie);
    bySlot.set(key, merged);
    if (prev.id !== merged.id) extraDeleted.push(prev.id);
    if (row.id !== merged.id) extraDeleted.push(row.id);
  }
  return { rows: [...bySlot.values()], extraDeleted };
}

export function applyOpsCollections(
  target: AppData,
  local: AppData,
  cloud: AppData,
  preferLocal: boolean,
): void {
  const deletedClasses = unionIdSet(local.deletedClassIds, cloud.deletedClassIds);
  const deletedSchedule = unionIdSet(local.deletedScheduleIds, cloud.deletedScheduleIds);
  const deletedTrainings = unionIdSet(local.deletedTrainingIds, cloud.deletedTrainingIds);
  const deletedAttendance = unionIdSet(local.deletedAttendanceIds, cloud.deletedAttendanceIds);
  const deletedProducts = unionIdSet(local.deletedProductIds, cloud.deletedProductIds);
  const deletedStock = unionIdSet(local.deletedStockMovementIds, cloud.deletedStockMovementIds);
  const deletedMatches = unionIdSet(local.deletedMatchIds, cloud.deletedMatchIds);

  target.classes = mergeByIdPreferringUpdatedAt(local.classes, cloud.classes, deletedClasses, preferLocal);
  target.schedule = mergeByIdPreferringUpdatedAt(
    local.schedule,
    cloud.schedule,
    deletedSchedule,
    preferLocal,
  );
  target.trainings = mergeByIdPreferringUpdatedAt(
    local.trainings,
    cloud.trainings,
    deletedTrainings,
    preferLocal,
  );
  target.matches = mergeByIdPreferringUpdatedAt(
    local.matches,
    cloud.matches,
    deletedMatches,
    preferLocal,
  );
  target.products = mergeByIdPreferringUpdatedAt(
    local.products,
    cloud.products,
    deletedProducts,
    preferLocal,
  );
  target.stockMovements = mergeByIdPreferringUpdatedAt(
    local.stockMovements,
    cloud.stockMovements,
    deletedStock,
    preferLocal,
  );

  const attendance = mergeAttendanceRows(
    local.attendance,
    cloud.attendance,
    deletedAttendance,
    preferLocal,
  );
  for (const id of attendance.extraDeleted) deletedAttendance.add(id);
  target.attendance = attendance.rows;

  target.deletedClassIds = [...deletedClasses].slice(-FINANCE_TOMBSTONE_CAP);
  target.deletedScheduleIds = [...deletedSchedule].slice(-FINANCE_TOMBSTONE_CAP);
  target.deletedTrainingIds = [...deletedTrainings].slice(-FINANCE_TOMBSTONE_CAP);
  target.deletedAttendanceIds = [...deletedAttendance].slice(-FINANCE_TOMBSTONE_CAP);
  target.deletedProductIds = [...deletedProducts].slice(-FINANCE_TOMBSTONE_CAP);
  target.deletedStockMovementIds = [...deletedStock].slice(-FINANCE_TOMBSTONE_CAP);
  target.deletedMatchIds = [...deletedMatches].slice(-FINANCE_TOMBSTONE_CAP);
}

export function mergeOpsOntoLocal(local: AppData, cloud: AppData, preferLocal: boolean): AppData {
  const next = structuredClone(local);
  applyOpsCollections(next, local, cloud, preferLocal);
  return next;
}

function byIdJson(rows: Array<{ id: string }> | undefined): string {
  const map: Record<string, unknown> = {};
  for (const row of rows ?? []) map[row.id] = row;
  return JSON.stringify(map);
}

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify([...value].map((item) => sortedJson(item)).sort());
  }
  return JSON.stringify(value);
}

export function opsCollectionsChanged(a: AppData, b: AppData): boolean {
  if (byIdJson(a.classes) !== byIdJson(b.classes)) return true;
  if (byIdJson(a.schedule) !== byIdJson(b.schedule)) return true;
  if (byIdJson(a.trainings) !== byIdJson(b.trainings)) return true;
  if (byIdJson(a.matches) !== byIdJson(b.matches)) return true;
  if (byIdJson(a.products) !== byIdJson(b.products)) return true;
  if (byIdJson(a.stockMovements) !== byIdJson(b.stockMovements)) return true;
  if (byIdJson(a.attendance) !== byIdJson(b.attendance)) return true;
  if (sortedJson(a.deletedClassIds ?? []) !== sortedJson(b.deletedClassIds ?? [])) return true;
  if (sortedJson(a.deletedScheduleIds ?? []) !== sortedJson(b.deletedScheduleIds ?? [])) return true;
  if (sortedJson(a.deletedTrainingIds ?? []) !== sortedJson(b.deletedTrainingIds ?? [])) return true;
  if (sortedJson(a.deletedAttendanceIds ?? []) !== sortedJson(b.deletedAttendanceIds ?? [])) {
    return true;
  }
  if (sortedJson(a.deletedProductIds ?? []) !== sortedJson(b.deletedProductIds ?? [])) return true;
  if (sortedJson(a.deletedStockMovementIds ?? []) !== sortedJson(b.deletedStockMovementIds ?? [])) {
    return true;
  }
  if (sortedJson(a.deletedMatchIds ?? []) !== sortedJson(b.deletedMatchIds ?? [])) return true;
  return false;
}

function hasLocalOnlyRows<T extends { id: string }>(
  localRows: T[] | undefined,
  cloudRows: T[] | undefined,
): boolean {
  const cloudIds = new Set((cloudRows ?? []).map((row) => row.id));
  return (localRows ?? []).some((row) => !cloudIds.has(row.id));
}

function hasLocalOnlyIds(localIds: string[] | undefined, cloudIds: string[] | undefined): boolean {
  const cloud = new Set(cloudIds ?? []);
  return (localIds ?? []).some((id) => !cloud.has(id));
}

export function localOpsNeedsPush(local: AppData, cloud: AppData): boolean {
  if (hasLocalOnlyRows(local.classes, cloud.classes)) return true;
  if (hasLocalOnlyRows(local.schedule, cloud.schedule)) return true;
  if (hasLocalOnlyRows(local.trainings, cloud.trainings)) return true;
  if (hasLocalOnlyRows(local.matches, cloud.matches)) return true;
  if (hasLocalOnlyRows(local.products, cloud.products)) return true;
  if (hasLocalOnlyRows(local.stockMovements, cloud.stockMovements)) return true;
  if (hasLocalOnlyRows(local.attendance, cloud.attendance)) return true;
  if (hasLocalOnlyIds(local.deletedClassIds, cloud.deletedClassIds)) return true;
  if (hasLocalOnlyIds(local.deletedScheduleIds, cloud.deletedScheduleIds)) return true;
  if (hasLocalOnlyIds(local.deletedTrainingIds, cloud.deletedTrainingIds)) return true;
  if (hasLocalOnlyIds(local.deletedAttendanceIds, cloud.deletedAttendanceIds)) return true;
  if (hasLocalOnlyIds(local.deletedProductIds, cloud.deletedProductIds)) return true;
  if (hasLocalOnlyIds(local.deletedStockMovementIds, cloud.deletedStockMovementIds)) return true;
  if (hasLocalOnlyIds(local.deletedMatchIds, cloud.deletedMatchIds)) return true;
  return false;
}
