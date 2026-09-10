import { transactionIsSuppressed } from '../utils/feeChargeKeys';
import {
  normalizeReceiptIssues,
  normalizeReceiptRanges,
} from '../utils/receiptBook';
import type { AppData, ReceiptIssueRecord } from '../types';
import { mergeByIdPreferringUpdatedAt } from './entityFieldMerge';

export const FINANCE_TOMBSTONE_CAP = 5000;

export function rememberDeletedId(ids: string[] | undefined, id: string): string[] {
  const next = [...(ids ?? [])];
  const trimmed = id.trim();
  if (!trimmed) return next.slice(-FINANCE_TOMBSTONE_CAP);
  if (!next.includes(trimmed)) next.push(trimmed);
  return next.slice(-FINANCE_TOMBSTONE_CAP);
}

export function rememberDeletedIds(ids: string[] | undefined, extra: string[]): string[] {
  let next = ids ?? [];
  for (const id of extra) next = rememberDeletedId(next, id);
  return next;
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

function mergeReceiptIssues(
  local: ReceiptIssueRecord[] | undefined,
  cloud: ReceiptIssueRecord[] | undefined,
): ReceiptIssueRecord[] {
  const map = new Map<string, ReceiptIssueRecord>();
  const keyOf = (row: ReceiptIssueRecord) => `${row.series}:${row.number}`;
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

export function mergeClosedFinanceMonths(
  local: AppData,
  cloud: AppData,
): { closed: string[]; lockRev: Record<string, number> } {
  const localClosed = new Set(local.closedFinanceMonths ?? []);
  const cloudClosed = new Set(cloud.closedFinanceMonths ?? []);
  const localRev = local.financeMonthLockRev ?? {};
  const cloudRev = cloud.financeMonthLockRev ?? {};
  const months = new Set<string>([
    ...localClosed,
    ...cloudClosed,
    ...Object.keys(localRev),
    ...Object.keys(cloudRev),
  ]);
  const closed: string[] = [];
  const lockRev: Record<string, number> = {};
  for (const month of months) {
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const lAt = Number(localRev[month]) || 0;
    const cAt = Number(cloudRev[month]) || 0;
    if (lAt === 0 && cAt === 0) {
      if (localClosed.has(month) || cloudClosed.has(month)) closed.push(month);
      continue;
    }
    const useLocal = lAt >= cAt;
    const isClosed = useLocal ? localClosed.has(month) : cloudClosed.has(month);
    lockRev[month] = Math.max(lAt, cAt);
    if (isClosed) closed.push(month);
  }
  closed.sort();
  return { closed, lockRev };
}

type FinanceMergeOpts = {
  preferLocal: boolean;
  treatCloudOnlyTxAsDeleted: boolean;
};

/** Overlay finance collections onto `target` (usually a clone of local or cloud). */
export function applyFinanceCollections(
  target: AppData,
  local: AppData,
  cloud: AppData,
  opts: FinanceMergeOpts,
): void {
  const deletedTx = unionIdSet(local.deletedTransactionIds, cloud.deletedTransactionIds);
  const suppressed = unionIdSet(local.suppressedFeeChargeKeys, cloud.suppressedFeeChargeKeys);
  const deletedRevenues = unionIdSet(local.deletedRevenueIds, cloud.deletedRevenueIds);
  const deletedExpenses = unionIdSet(local.deletedExpenseIds, cloud.deletedExpenseIds);
  const deletedCash = unionIdSet(local.deletedCashAccountIds, cloud.deletedCashAccountIds);
  const deletedBudgets = unionIdSet(local.deletedBudgetIds, cloud.deletedBudgetIds);

  const localTxnIds = new Set((local.transactions ?? []).map((t) => t.id));
  if (opts.treatCloudOnlyTxAsDeleted) {
    for (const tx of cloud.transactions ?? []) {
      if (!localTxnIds.has(tx.id)) deletedTx.add(tx.id);
    }
  }

  target.transactions = mergeByIdPreferringUpdatedAt(
    local.transactions,
    cloud.transactions,
    deletedTx,
    opts.preferLocal,
  ).filter((tx) => !transactionIsSuppressed(tx, deletedTx, suppressed));
  target.deletedTransactionIds = [...deletedTx].slice(-FINANCE_TOMBSTONE_CAP);
  target.suppressedFeeChargeKeys = [...suppressed].slice(-FINANCE_TOMBSTONE_CAP);
  target.deletedRevenueIds = [...deletedRevenues].slice(-FINANCE_TOMBSTONE_CAP);
  target.deletedExpenseIds = [...deletedExpenses].slice(-FINANCE_TOMBSTONE_CAP);
  target.deletedCashAccountIds = [...deletedCash].slice(-FINANCE_TOMBSTONE_CAP);
  target.deletedBudgetIds = [...deletedBudgets].slice(-FINANCE_TOMBSTONE_CAP);

  target.expenses = mergeByIdPreferringUpdatedAt(
    local.expenses,
    cloud.expenses,
    deletedExpenses,
    opts.preferLocal,
  );
  target.revenues = mergeByIdPreferringUpdatedAt(
    local.revenues,
    cloud.revenues,
    deletedRevenues,
    opts.preferLocal,
  ).filter((row) => !row.linkedTransactionId || !deletedTx.has(row.linkedTransactionId));
  target.cashAccounts = mergeByIdPreferringUpdatedAt(
    local.cashAccounts,
    cloud.cashAccounts,
    deletedCash,
    opts.preferLocal,
  );
  target.budgets = mergeByIdPreferringUpdatedAt(
    local.budgets,
    cloud.budgets,
    deletedBudgets,
    opts.preferLocal,
  );
  target.feeChargeTemplates = mergeByIdPreferringUpdatedAt(
    local.feeChargeTemplates,
    cloud.feeChargeTemplates,
    new Set(),
    opts.preferLocal,
  );
  target.receiptNumberRanges = mergeById(
    normalizeReceiptRanges(local.receiptNumberRanges),
    normalizeReceiptRanges(cloud.receiptNumberRanges),
    new Set(),
    opts.preferLocal,
  );
  target.receiptIssues = mergeReceiptIssues(local.receiptIssues, cloud.receiptIssues);

  const months = mergeClosedFinanceMonths(local, cloud);
  target.closedFinanceMonths = months.closed;
  target.financeMonthLockRev = months.lockRev;

  const checkoutMap = new Map<string, NonNullable<AppData['onlineCheckouts']>[number]>();
  const checkoutOrder = opts.preferLocal
    ? [...(cloud.onlineCheckouts ?? []), ...(local.onlineCheckouts ?? [])]
    : [...(local.onlineCheckouts ?? []), ...(cloud.onlineCheckouts ?? [])];
  for (const row of checkoutOrder) {
    const code = String(row.orderCode ?? '').trim();
    if (code) checkoutMap.set(code, row);
  }
  target.onlineCheckouts = [...checkoutMap.values()].slice(-100);

  const nextBySeries: Record<string, number> = {
    ...(cloud.receiptNextBySeries ?? {}),
    ...(local.receiptNextBySeries ?? {}),
  };
  for (const key of new Set([
    ...Object.keys(local.receiptNextBySeries ?? {}),
    ...Object.keys(cloud.receiptNextBySeries ?? {}),
  ])) {
    nextBySeries[key] = Math.max(
      Number(local.receiptNextBySeries?.[key]) || 0,
      Number(cloud.receiptNextBySeries?.[key]) || 0,
    );
  }
  target.receiptNextBySeries = nextBySeries;
}

export function mergeFinanceOntoLocal(
  local: AppData,
  cloud: AppData,
  preferLocal: boolean,
): AppData {
  const next = structuredClone(local);
  applyFinanceCollections(next, local, cloud, {
    preferLocal,
    treatCloudOnlyTxAsDeleted: false,
  });
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
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    return JSON.stringify(Object.fromEntries(keys.map((key) => [key, rec[key]])));
  }
  return JSON.stringify(value);
}

export function financeCollectionsChanged(a: AppData, b: AppData): boolean {
  if (byIdJson(a.transactions) !== byIdJson(b.transactions)) return true;
  if (byIdJson(a.revenues) !== byIdJson(b.revenues)) return true;
  if (byIdJson(a.expenses) !== byIdJson(b.expenses)) return true;
  if (byIdJson(a.cashAccounts) !== byIdJson(b.cashAccounts)) return true;
  if (byIdJson(a.budgets) !== byIdJson(b.budgets)) return true;
  if (byIdJson(a.feeChargeTemplates) !== byIdJson(b.feeChargeTemplates)) return true;
  if (byIdJson(a.receiptNumberRanges) !== byIdJson(b.receiptNumberRanges)) return true;
  if (sortedJson(a.closedFinanceMonths ?? []) !== sortedJson(b.closedFinanceMonths ?? [])) return true;
  if (sortedJson(a.financeMonthLockRev ?? {}) !== sortedJson(b.financeMonthLockRev ?? {})) return true;
  if (sortedJson(a.receiptIssues ?? []) !== sortedJson(b.receiptIssues ?? [])) return true;
  if (sortedJson(a.deletedRevenueIds ?? []) !== sortedJson(b.deletedRevenueIds ?? [])) return true;
  if (sortedJson(a.deletedExpenseIds ?? []) !== sortedJson(b.deletedExpenseIds ?? [])) return true;
  if (sortedJson(a.deletedCashAccountIds ?? []) !== sortedJson(b.deletedCashAccountIds ?? [])) return true;
  if (sortedJson(a.deletedBudgetIds ?? []) !== sortedJson(b.deletedBudgetIds ?? [])) return true;
  if (sortedJson(a.deletedTransactionIds ?? []) !== sortedJson(b.deletedTransactionIds ?? [])) return true;
  if (sortedJson(a.suppressedFeeChargeKeys ?? []) !== sortedJson(b.suppressedFeeChargeKeys ?? [])) {
    return true;
  }
  if (sortedJson(a.onlineCheckouts ?? []) !== sortedJson(b.onlineCheckouts ?? [])) return true;
  if (sortedJson(a.receiptNextBySeries ?? {}) !== sortedJson(b.receiptNextBySeries ?? {})) return true;
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

/** Local finance that still needs a push after merge. */
export function localFinanceNeedsPush(local: AppData, cloud: AppData): boolean {
  if (hasLocalOnlyRows(local.transactions, cloud.transactions)) return true;
  if (hasLocalOnlyRows(local.revenues, cloud.revenues)) return true;
  if (hasLocalOnlyRows(local.expenses, cloud.expenses)) return true;
  if (hasLocalOnlyRows(local.cashAccounts, cloud.cashAccounts)) return true;
  if (hasLocalOnlyRows(local.budgets, cloud.budgets)) return true;
  if (hasLocalOnlyRows(local.feeChargeTemplates, cloud.feeChargeTemplates)) return true;
  if (hasLocalOnlyRows(local.receiptNumberRanges, cloud.receiptNumberRanges)) return true;
  if (hasLocalOnlyIds(local.deletedTransactionIds, cloud.deletedTransactionIds)) return true;
  if (hasLocalOnlyIds(local.deletedRevenueIds, cloud.deletedRevenueIds)) return true;
  if (hasLocalOnlyIds(local.deletedExpenseIds, cloud.deletedExpenseIds)) return true;
  if (hasLocalOnlyIds(local.deletedCashAccountIds, cloud.deletedCashAccountIds)) return true;
  if (hasLocalOnlyIds(local.deletedBudgetIds, cloud.deletedBudgetIds)) return true;
  if (hasLocalOnlyIds(local.suppressedFeeChargeKeys, cloud.suppressedFeeChargeKeys)) return true;
  const localRev = local.financeMonthLockRev ?? {};
  const cloudRev = cloud.financeMonthLockRev ?? {};
  for (const month of new Set([...Object.keys(localRev), ...(local.closedFinanceMonths ?? [])])) {
    if ((Number(localRev[month]) || 0) > (Number(cloudRev[month]) || 0)) return true;
    if (
      (local.closedFinanceMonths ?? []).includes(month) &&
      !(cloud.closedFinanceMonths ?? []).includes(month) &&
      !(Number(cloudRev[month]) > 0)
    ) {
      return true;
    }
  }
  return false;
}
