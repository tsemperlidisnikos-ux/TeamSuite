import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { transactionSchema, type TransactionInput } from '../../schemas';
import type { AthleteTransaction } from '../../types';
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

export async function getTransactions() {
  return apiClient(() => getData().transactions ?? []);
}

export async function createTransaction(input: TransactionInput) {
  return apiClient(async () => {
    const parsed = transactionSchema.parse(input);
    const transaction: AthleteTransaction = {
      ...parsed,
      id: createId('txn'),
      createdAt: localDateTimeIso(),
      updatedAt: Date.now(),
      allocatesChargeId: parsed.allocatesChargeId ?? null,
    };
    mutateData((data) => {
      if (!data.transactions) data.transactions = [];
      if (transaction.type === 'payment') {
        const cutoff = Date.now() - 20 * 60 * 1000;
        const pending = (data.onlineCheckouts ?? []).find((row) => {
          if (row.athleteId !== transaction.athleteId) return false;
          const ts = Date.parse(row.createdAt);
          return Number.isFinite(ts) ? ts >= cutoff : false;
        });
        if (pending && (parsed.paymentMethod === 'viva' || parsed.paymentMethod === 'stripe' || parsed.paymentMethod === 'eurobank')) {
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
      data.transactions.push(transaction);
    });

    let current = transaction;
    if (transaction.type === 'payment' && !transaction.allocatesChargeId) {
      const { autoAllocatePayment } = await import('./paymentMatchingService');
      try {
        await autoAllocatePayment(transaction.id);
      } catch {
        // Δεν υπάρχει ανοιχτή χρέωση — το έσοδο δημιουργείται χωρίς tags χρέωσης.
      }
      current =
        getData().transactions.find((t) => t.id === transaction.id) ?? transaction;
    }

    if (current.type === 'payment') {
      mutateData((data) => {
        syncRevenuesForPaymentInData(data, current.id);
      });
      current =
        getData().transactions.find((t) => t.id === current.id) ?? current;
    }

    return current;
  });
}

export async function updateTransaction(id: string, input: TransactionInput) {
  return apiClient(async () => {
    const parsed = transactionSchema.parse(input);
    let updated: AthleteTransaction | undefined;
    mutateData((data) => {
      if (!data.transactions) data.transactions = [];
      const index = data.transactions.findIndex((t) => t.id === id);
      if (index === -1) throw new Error('Η κίνηση δεν βρέθηκε');
      updated = {
        ...data.transactions[index],
        ...parsed,
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
  return apiClient(async () => {
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
    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush();
    return { id };
  });
}
