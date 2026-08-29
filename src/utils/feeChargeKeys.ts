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

export function suppressionKeysForTransaction(tx: {
  athleteId: string;
  month: number;
  year: number;
  comments: string;
}): string[] {
  return feeTagsInComments(tx.comments).map((tag) =>
    suppressionKey(tx.athleteId, tx.year, tx.month, tag),
  );
}

export function isFeeChargeSuppressed(
  keys: string[] | undefined,
  athleteId: string,
  year: number,
  month: number,
  tag: string,
): boolean {
  if (!keys?.length) return false;
  return keys.includes(suppressionKey(athleteId, year, month, tag));
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
