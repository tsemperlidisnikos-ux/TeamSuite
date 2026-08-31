import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import type { ReceiptIssueRecord, ReceiptNumberRange } from '../../types';
import { localDateTimeIso } from '../../utils/dates';
import {
  formatReceiptLabel,
  issueForTransaction,
  normalizeReceiptIssues,
  normalizeReceiptRanges,
  previewNextReceipt,
  validateReceiptRanges,
} from '../../utils/receiptBook';

export async function saveReceiptRanges(ranges: ReceiptNumberRange[]) {
  return apiClient(async () => {
    const checked = validateReceiptRanges(ranges);
    if (!checked.ok) throw new Error(checked.error);
    mutateData((data) => {
      data.receiptNumberRanges = checked.ranges;
      data.receiptIssues = normalizeReceiptIssues(data.receiptIssues);
    });
    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush();
    return getData().receiptNumberRanges ?? [];
  });
}

export async function allocateReceiptIssue(input: {
  series: string;
  transactionId?: string | null;
  athleteId?: string | null;
  emailed?: boolean;
}) {
  return apiClient(async () => {
    const holder: { value: ReceiptIssueRecord | null } = { value: null };
    mutateData((data) => {
      const ranges = normalizeReceiptRanges(data.receiptNumberRanges);
      const issues = normalizeReceiptIssues(data.receiptIssues);
      const existing = issueForTransaction(issues, input.transactionId);
      const now = localDateTimeIso();
      if (existing) {
        holder.value = {
          ...existing,
          emailedAt: input.emailed ? existing.emailedAt || now : existing.emailedAt,
        };
        data.receiptIssues = issues.map((row) =>
          row.id === existing.id ? holder.value! : row,
        );
      } else {
        const next = previewNextReceipt(input.series, ranges, issues);
        if (!next.ok) throw new Error(next.error);
        holder.value = {
          id: createId('ris'),
          series: next.series,
          number: next.number,
          transactionId: input.transactionId ?? null,
          athleteId: input.athleteId ?? null,
          issuedAt: now,
          emailedAt: input.emailed ? now : null,
          voidedAt: null,
          voidReason: null,
        };
        data.receiptIssues = [...issues, holder.value];
      }
      const allocated = holder.value;
      if (allocated && input.transactionId) {
        const tx = (data.transactions ?? []).find((row) => row.id === input.transactionId);
        if (tx) {
          tx.receiptSeries = allocated.series;
          tx.receiptSeq = allocated.number;
          tx.receiptNumber = formatReceiptLabel(allocated.series, allocated.number);
        }
      }
    });
    if (!holder.value) throw new Error('Αποτυχία έκδοσης αριθμού απόδειξης.');
    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush();
    return holder.value;
  });
}
