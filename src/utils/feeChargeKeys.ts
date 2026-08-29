import type { AthleteTransaction } from '../types';

const FEE_TAG_RE = /\[fee:[^\]]+\]/g;

export function feeTagsInComments(comments: string): string[] {
  return comments.match(FEE_TAG_RE) ?? [];
}

export function suppressionKey(
  athleteId: string,
  year: number,
  month: number,
  tag: string,
): string {
  return `${athleteId}|${year}|${month}|${tag}`;
}

export function monthChargeSuppressionKey(
  athleteId: string,
  year: number,
  month: number,
): string {
  return `${athleteId}|${year}|${month}|*`;
}

export function suppressionKeysForTransaction(tx: {
  athleteId: string;
  month: number;
  year: number;
  comments: string;
  type?: string;
}): string[] {
  const keys = feeTagsInComments(tx.comments).map((tag) =>
    suppressionKey(tx.athleteId, tx.year, tx.month, tag),
  );
  if (tx.type === 'charge') {
    keys.push(monthChargeSuppressionKey(tx.athleteId, tx.year, tx.month));
  }
  return keys;
}

export function isFeeChargeSuppressed(
  keys: string[] | undefined,
  athleteId: string,
  year: number,
  month: number,
  tag: string,
): boolean {
  if (!keys?.length) return false;
  return (
    keys.includes(suppressionKey(athleteId, year, month, tag)) ||
    keys.includes(monthChargeSuppressionKey(athleteId, year, month))
  );
}

export function transactionIsSuppressed(
  tx: {
    id: string;
    athleteId: string;
    month: number;
    year: number;
    comments: string;
    type?: string;
  },
  deletedIds: Set<string>,
  suppressedKeys: Set<string>,
): boolean {
  if (deletedIds.has(tx.id)) return true;
  return suppressionKeysForTransaction(tx).some((key) => suppressedKeys.has(key));
}

export function rememberDeletedTransaction(
  deletedIds: string[] | undefined,
  suppressedKeys: string[] | undefined,
  tx: AthleteTransaction | undefined,
): { deletedTransactionIds: string[]; suppressedFeeChargeKeys: string[] } {
  const ids = [...(deletedIds ?? [])];
  const keys = [...(suppressedKeys ?? [])];
  if (!tx) {
    return { deletedTransactionIds: ids, suppressedFeeChargeKeys: keys };
  }
  if (!ids.includes(tx.id)) ids.push(tx.id);
  for (const key of suppressionKeysForTransaction(tx)) {
    if (!keys.includes(key)) keys.push(key);
  }
  return {
    deletedTransactionIds: ids.slice(-5000),
    suppressedFeeChargeKeys: keys.slice(-5000),
  };
}
