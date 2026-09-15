import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import type { ReceiptIssueKind, ReceiptIssueRecord, ReceiptNumberRange } from '../../types';
import { localDateTimeIso } from '../../utils/dates';
import {
  formatReceiptLabel,
  issueForTransaction,
  markReceiptIssueVoidedInData,
  normalizeReceiptIssues,
  normalizeReceiptRanges,
  previewNextReceipt,
  validateReceiptNumberForIssue,
  validateReceiptRanges,
} from '../../utils/receiptBook';
import { upsertRentalBookingRevenueInData } from './rentalRevenueBridge';

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

function inferReceiptKind(input: {
  kind?: ReceiptIssueKind | null;
  transactionId?: string | null;
  athleteId?: string | null;
}): ReceiptIssueKind {
  if (input.kind === 'subscription' || input.kind === 'rental' || input.kind === 'other') {
    return input.kind;
  }
  if (String(input.transactionId ?? '').startsWith('rent_')) return 'rental';
  if (input.athleteId) return 'subscription';
  return 'other';
}

function snapshotFields(input: {
  amount?: number | null;
  receivedFrom?: string | null;
  reason?: string | null;
  kind?: ReceiptIssueKind | null;
  transactionId?: string | null;
  athleteId?: string | null;
}): Pick<ReceiptIssueRecord, 'amount' | 'receivedFrom' | 'reason' | 'kind'> {
  const amount = Number(input.amount);
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    receivedFrom: String(input.receivedFrom ?? '').trim() || null,
    reason: String(input.reason ?? '').trim() || null,
    kind: inferReceiptKind(input),
  };
}

export async function allocateReceiptIssue(input: {
  series: string;
  number?: number | null;
  transactionId?: string | null;
  athleteId?: string | null;
  emailed?: boolean;
  amount?: number | null;
  receivedFrom?: string | null;
  reason?: string | null;
  kind?: ReceiptIssueKind | null;
}) {
  return apiClient(async () => {
    const holder: { value: ReceiptIssueRecord | null } = { value: null };
    mutateData((data) => {
      const ranges = normalizeReceiptRanges(data.receiptNumberRanges);
      const issues = normalizeReceiptIssues(data.receiptIssues);
      const existing =
        issueForTransaction(issues, input.transactionId) ??
        issues.find((row) => row.id === input.transactionId) ??
        null;
      const now = localDateTimeIso();
      const snap = snapshotFields(input);
      if (existing) {
        holder.value = {
          ...existing,
          emailedAt: input.emailed ? existing.emailedAt || now : existing.emailedAt,
          amount: snap.amount || existing.amount,
          receivedFrom: snap.receivedFrom || existing.receivedFrom,
          reason: snap.reason || existing.reason,
          kind: snap.kind || existing.kind,
        };
        data.receiptIssues = issues.map((row) =>
          row.id === existing.id ? holder.value! : row,
        );
      } else {
        const requested = Math.floor(Number(input.number) || 0);
        const next =
          requested >= 1
            ? validateReceiptNumberForIssue(
                input.series,
                requested,
                ranges,
                issues,
                { transactionId: input.transactionId, nextBySeries: data.receiptNextBySeries },
              )
            : previewNextReceipt(input.series, ranges, issues, data.receiptNextBySeries);
        if (!next.ok) throw new Error(next.error);
        const key = next.series;
        let number = next.number;
        while (issues.some((row) => row.series === key && row.number === number)) {
          number += 1;
        }
        const inRange = validateReceiptNumberForIssue(key, number, ranges, issues, {
          transactionId: input.transactionId,
          nextBySeries: data.receiptNextBySeries,
        });
        if (!inRange.ok) throw new Error(inRange.error);
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
          ...snap,
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
    await flushClubMirrorPush(undefined, { force: true });
    const { publishClubOpsSlice } = await import('./clubOpsSyncService');
    await publishClubOpsSlice();
    return holder.value;
  });
}

export async function voidReceiptIssue(issueId: string) {
  return apiClient(async () => {
    const id = String(issueId ?? '').trim();
    if (!id) throw new Error('Η απόδειξη δεν βρέθηκε.');
    const current = normalizeReceiptIssues(getData().receiptIssues).find((row) => row.id === id);
    if (!current) throw new Error('Η απόδειξη δεν βρέθηκε.');
    if (current.voidedAt) return current;

    const txId = String(current.transactionId ?? '').trim();
    const linkedPayment =
      txId &&
      !txId.startsWith('rent_') &&
      (getData().transactions ?? []).some((row) => row.id === txId);

    if (linkedPayment) {
      const { deleteTransaction } = await import('./transactionsService');
      const removed = await deleteTransaction(txId);
      if (!removed.success) throw new Error(removed.error ?? 'Αποτυχία διαγραφής πληρωμής.');
    } else {
      mutateData((data) => {
        markReceiptIssueVoidedInData(data, id);
        if (txId.startsWith('rent_')) {
          const bookingId = txId.slice(5);
          const booking = (data.rentalBookings ?? []).find((row) => row.id === bookingId);
          if (booking) {
            booking.paymentCollected = false;
            booking.paidOn = undefined;
            booking.paidAt = undefined;
            booking.updatedAt = Date.now();
            upsertRentalBookingRevenueInData(data, booking);
          }
        }
      });
    }

    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush(undefined, { force: true });
    const { publishClubOpsSlice } = await import('./clubOpsSyncService');
    await publishClubOpsSlice();
    const issued = normalizeReceiptIssues(getData().receiptIssues).find((row) => row.id === id);
    if (!issued) throw new Error('Αποτυχία ακύρωσης απόδειξης.');
    return issued;
  });
}
