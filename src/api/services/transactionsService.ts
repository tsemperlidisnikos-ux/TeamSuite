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
      allocatesChargeId: parsed.allocatesChargeId ?? null,
    };
    mutateData((data) => {
      if (!data.transactions) data.transactions = [];
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
