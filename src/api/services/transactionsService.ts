import { apiClient, type ApiResult } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { transactionSchema, type TransactionInput } from '../../schemas';
import type { AppData, AthleteTransaction } from '../../types';
import { localDateTimeIso } from '../../utils/dates';
import { rememberDeletedTransaction } from '../../utils/feeChargeKeys';
import { voidReceiptIssuesForTransactionInData } from '../../utils/receiptBook';
import {
  removeRevenuesForPaymentInData,
  syncRevenuesForPaymentInData,
} from './athletePaymentRevenueBridge';
import { assertPaymentDoesNotOverpay } from './paymentMatchingService';

function paymentIdempotencyKey(
  row: Pick<AthleteTransaction, 'athleteId' | 'amount' | 'allocatesChargeId' | 'month' | 'year' | 'createdAt' | 'type'>,
): string {
  const minute = String(row.createdAt ?? '').slice(0, 16);
  return [
    row.type,
    row.athleteId,
    Number(row.amount).toFixed(2),
    row.allocatesChargeId ?? '',
    row.month,
    row.year,
    minute,
  ].join('|');
}

function assertCanAddPayment(data: AppData, transaction: AthleteTransaction) {
  const cutoff = Date.now() - 20 * 60 * 1000;
  const pending = (data.onlineCheckouts ?? []).find((row) => {
    if (row.athleteId !== transaction.athleteId) return false;
    const ts = Date.parse(row.createdAt);
    return Number.isFinite(ts) ? ts >= cutoff : false;
  });
  if (
    pending &&
    (transaction.paymentMethod === 'viva' ||
      transaction.paymentMethod === 'stripe' ||
      transaction.paymentMethod === 'eurobank')
  ) {
    throw new Error(
      'Υπάρχει εκκρεμές online checkout (τελευταία 20 λεπτά). Ολοκληρώστε το ή καταχωρήστε μετρητά/έμβασμα.',
    );
  }
  const fingerprint = paymentIdempotencyKey(transaction);
  const duplicate = data.transactions.find((row) => {
    if (row.type !== 'payment' || row.athleteId !== transaction.athleteId) return false;
    return paymentIdempotencyKey(row) === fingerprint;
  });
  if (duplicate) {
    throw new Error('Η ίδια πληρωμή καταχωρήθηκε ήδη (ίδιο ποσό / χρέωση / λεπτό).');
  }
  assertPaymentDoesNotOverpay(data, transaction);
}

function transactionDateTime(
  input: Pick<TransactionInput, 'day' | 'month' | 'year'>,
  timeSource = localDateTimeIso(),
): string {
  if (input.day == null) return timeSource;
  const date = [
    input.year,
    String(input.month).padStart(2, '0'),
    String(input.day).padStart(2, '0'),
  ].join('-');
  const time = timeSource.includes('T')
    ? timeSource.slice(timeSource.indexOf('T'))
    : localDateTimeIso().slice(10);
  return `${date}${time}`;
}

function buildTransaction(input: TransactionInput): AthleteTransaction {
  const parsed = transactionSchema.parse(input);
  const { day, ...fields } = parsed;
  return {
    ...fields,
    id: createId('txn'),
    createdAt: transactionDateTime(parsed),
    updatedAt: Date.now(),
    allocatesChargeId: parsed.allocatesChargeId ?? null,
  };
}

export async function getTransactions() {
  return apiClient(() => getData().transactions ?? []);
}

export async function createTransaction(input: TransactionInput): Promise<ApiResult<AthleteTransaction>> {
  const result = await createTransactions([input]);
  if (!result.success || !result.data?.[0]) {
    return { success: false, error: result.error ?? 'Σφάλμα αποθήκευσης' };
  }
  return { success: true, data: result.data[0] };
}

/** Τοπική αποθήκευση χωρίς αναμονή πλήρους encrypted mirror (το club-ops φεύγει από το mutateData). */
export async function createTransactions(inputs: TransactionInput[]) {
  return apiClient(async () => {
    if (!inputs.length) return [] as AthleteTransaction[];
    const created = inputs.map(buildTransaction);
    mutateData((data) => {
      if (!data.transactions) data.transactions = [];
      for (const transaction of created) {
        if (transaction.type === 'payment') {
          assertCanAddPayment(data, transaction);
        }
        data.transactions.push(transaction);
      }
    });

    const payments = created.filter((row) => row.type === 'payment');
    if (!payments.length) return created;

    const { autoAllocatePayment } = await import('./paymentMatchingService');
    for (const transaction of payments) {
      if (transaction.allocatesChargeId) continue;
      try {
        await autoAllocatePayment(transaction.id);
      } catch {
        // Δεν υπάρχει ανοιχτή χρέωση — το έσοδο δημιουργείται χωρίς tags χρέωσης.
      }
    }

    mutateData((data) => {
      for (const transaction of payments) {
        syncRevenuesForPaymentInData(data, transaction.id);
      }
    });

    const latest = getData().transactions ?? [];
    return created.map((row) => latest.find((item) => item.id === row.id) ?? row);
  });
}

export async function updateTransaction(id: string, input: TransactionInput) {
  return apiClient(() => {
    const parsed = transactionSchema.parse(input);
    let updated: AthleteTransaction | undefined;
    mutateData((data) => {
      if (!data.transactions) data.transactions = [];
      const index = data.transactions.findIndex((t) => t.id === id);
      if (index === -1) throw new Error('Η κίνηση δεν βρέθηκε');
      const current = data.transactions[index];
      const { day, ...fields } = parsed;
      updated = {
        ...current,
        ...fields,
        createdAt:
          day == null
            ? current.createdAt
            : transactionDateTime(parsed, current.createdAt),
        updatedAt: Date.now(),
      };
      data.transactions[index] = updated;
      if (updated.type === 'payment') {
        syncRevenuesForPaymentInData(data, id);
      } else {
        removeRevenuesForPaymentInData(data, id);
      }
    });
    return updated!;
  });
}

export async function deleteTransaction(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      const removed = (data.transactions ?? []).find((t) => t.id === id);
      data.transactions = (data.transactions ?? []).filter((t) => t.id !== id);
      const remembered = rememberDeletedTransaction(
        data.deletedTransactionIds,
        data.suppressedFeeChargeKeys,
        removed,
      );
      data.deletedTransactionIds = remembered.deletedTransactionIds;
      data.suppressedFeeChargeKeys = remembered.suppressedFeeChargeKeys;
      removeRevenuesForPaymentInData(data, id);
      data.revenues = data.revenues.filter((r) => !r.description.includes(`(${id})`));
      voidReceiptIssuesForTransactionInData(data, id);
    });
    return { id };
  });
}
