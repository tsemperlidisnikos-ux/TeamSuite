import { apiClient } from '../apiClient';
import { createId, getData, mutateData, mutateDataKeys } from '../../data/repository';
import type { ReceiptIssueKind, ReceiptIssueRecord, ReceiptNumberRange } from '../../types';
import { localDateTimeIso } from '../../utils/dates';
import {
  formatReceiptLabel,
  hasReceiptRangeStarted,
  issueForTransaction,
  markReceiptIssueVoidedInData,
  normalizeReceiptIssues,
  normalizeReceiptRanges,
  previewNextReceipt,
  receiptIssueKey,
  validateReceiptNumberForIssue,
  validateReceiptRanges,
} from '../../utils/receiptBook';
import { upsertRentalBookingRevenueInData } from './rentalRevenueBridge';

/** Μόνο οι συλλογές που αγγίζει η έκδοση/ενημέρωση απόδειξης — όχι structuredClone όλου του συλλόγου. */
const RECEIPT_MUTATE_KEYS = [
  'receiptIssues',
  'receiptNextBySeries',
  'transactions',
] as const satisfies ReadonlyArray<keyof import('../../types').AppData>;

export async function saveReceiptRanges(ranges: ReceiptNumberRange[]) {
  return apiClient(async () => {
    const checked = validateReceiptRanges(ranges);
    if (!checked.ok) throw new Error(checked.error);
    const currentData = getData();
    const savedRanges = normalizeReceiptRanges(currentData.receiptNumberRanges);
    const changedStartedRange = savedRanges.find((saved) => {
      const retained = checked.ranges.find((next) => next.id === saved.id);
      const unchanged =
        retained &&
        retained.series === saved.series &&
        retained.from === saved.from &&
        retained.to === saved.to;
      return (
        !unchanged &&
        hasReceiptRangeStarted(saved, currentData.receiptIssues, currentData.receiptNextBySeries)
      );
    });
    if (changedStartedRange) {
      throw new Error(
        `Η σειρά ${changedStartedRange.series} ${changedStartedRange.from}–${changedStartedRange.to} έχει ήδη ξεκινήσει και δεν μπορεί να διαγραφεί ή να αλλάξει.`,
      );
    }
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
  issuedAt?: string | null;
}) {
  return apiClient(async () => {
    const holder: { value: ReceiptIssueRecord | null } = { value: null };
    mutateDataKeys(RECEIPT_MUTATE_KEYS, (data) => {
      const ranges = normalizeReceiptRanges(data.receiptNumberRanges);
      // Already-normalized list once — avoid re-sort inside nested helpers.
      const issues = normalizeReceiptIssues(data.receiptIssues);
      const taken = new Set(issues.map((row) => receiptIssueKey(row.series, row.number)));
      const existing =
        issueForTransaction(issues, input.transactionId) ??
        issues.find((row) => row.id === input.transactionId) ??
        null;
      const now = input.issuedAt?.trim() || localDateTimeIso();
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
        while (taken.has(receiptIssueKey(key, number))) {
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
        const txId = input.transactionId;
        const txs = data.transactions ?? [];
        const idx = txs.findIndex((row) => row.id === txId);
        if (idx >= 0) {
          txs[idx] = {
            ...txs[idx],
            receiptSeries: allocated.series,
            receiptSeq: allocated.number,
            receiptNumber: formatReceiptLabel(allocated.series, allocated.number),
          };
          data.transactions = txs;
        }
      }
    });
    if (!holder.value) throw new Error('Αποτυχία έκδοσης αριθμού απόδειξης.');
    // Τοπική έκδοση άμεσα· club-ops + debounced mirror από mutateData (χωρίς αναμονή full mirror).
    void import('./clubOpsSyncService').then((m) => m.scheduleClubOpsSlice());
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
      const keys = txId.startsWith('rent_')
        ? ([
            'receiptIssues',
            'rentalBookings',
            'revenues',
            'deletedRevenueIds',
          ] as const)
        : (['receiptIssues'] as const);
      mutateDataKeys(keys, (data) => {
        markReceiptIssueVoidedInData(data, id);
        if (txId.startsWith('rent_')) {
          const bookingId = txId.slice(5);
          const bookings = data.rentalBookings ?? [];
          const idx = bookings.findIndex((row) => row.id === bookingId);
          if (idx >= 0) {
            const booking = {
              ...bookings[idx],
              paymentCollected: false,
              paidOn: undefined,
              paidAt: undefined,
              updatedAt: Date.now(),
            };
            bookings[idx] = booking;
            data.rentalBookings = bookings;
            upsertRentalBookingRevenueInData(data, booking);
          }
        }
      });
    }

    // Τοπική ακύρωση άμεσα· sync στο παρασκήνιο (όπως έκδοση).
    void import('./clubOpsSyncService').then((m) => m.scheduleClubOpsSlice());
    const issued = normalizeReceiptIssues(getData().receiptIssues).find((row) => row.id === id);
    if (!issued) throw new Error('Αποτυχία ακύρωσης απόδειξης.');
    return issued;
  });
}
