import * as transactionsService from '../api/services/transactionsService';
import { localDateIso } from './dates';
import { resolveVivaPending } from './vivaPending';

export async function settleVivaReturn(opts: {
  clubId: string;
  orderCode?: string | null;
  transactionId?: string | null;
}): Promise<{ settled: boolean; message: string }> {
  const pending = resolveVivaPending({
    clubId: opts.clubId,
    orderCode: opts.orderCode,
  });
  if (!pending) {
    return {
      settled: false,
      message: opts.transactionId
        ? `Επιστροφή από Viva (txn ${opts.transactionId}). Δεν βρέθηκε εκκρεμής πληρωμή για αυτόματη καταχώρηση.`
        : 'Δεν βρέθηκε εκκρεμής πληρωμή Viva.',
    };
  }

  const now = new Date();
  const result = await transactionsService.createTransaction({
    athleteId: pending.athleteId,
    amount: pending.amountEuro,
    receiptNumber: opts.transactionId
      ? `VIVA-${opts.transactionId}`
      : `VIVA-${pending.orderCode}`,
    type: 'payment',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    paymentMethod: 'viva',
    comments: `Online πληρωμή Viva · ${pending.athleteName} · ${localDateIso()}`,
  });

  if (!result.success) {
    return {
      settled: false,
      message: result.error ?? 'Αποτυχία καταχώρησης πληρωμής Viva',
    };
  }

  return {
    settled: true,
    message: `Καταχωρήθηκε πληρωμή Viva ${pending.amountEuro.toFixed(2)} € για ${pending.athleteName}.`,
  };
}
