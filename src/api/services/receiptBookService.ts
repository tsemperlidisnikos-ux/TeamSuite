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
        const key = next.series;
        const cursor = Math.floor(Number(data.receiptNextBySeries?.[key]) || 0);
        let number = Math.max(next.number, cursor);
        const spanMax = Math.max(
          ...ranges.filter((row) => row.series === key).map((row) => row.to),
          0,
        );
        if (spanMax > 0 && number > spanMax) {
          throw new Error(
            `Η σειρά ${key} έφτασε στο όριο. Προσθέστε νέο εύρος στις Ρυθμίσεις → Αποδείξεις.`,
          );
        }
        if (issues.some((row) => row.series === key && row.number === number)) {
          number += 1;
        }
        holder.value = {
          id: createId('ris'),
          series: key,
          number,
          transactionId: input.transactionId ?? null,
          athleteId: input.athleteId ?? null,
          issuedAt: now,
          emailedAt: input.emailed ? now : null,
          voidedAt: null,
          voidReason: null,
        };
        data.receiptIssues = [...issues, holder.value];
        data.receiptNextBySeries = {
          ...(data.receiptNextBySeries ?? {}),
          [key]: number + 1,
        };
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
