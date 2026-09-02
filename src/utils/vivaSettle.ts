import * as transactionsService from '../api/services/transactionsService';
import { verifyStripeSession } from '../api/services/stripeService';
import { localDateIso } from './dates';
import { resolveVivaPending } from './vivaPending';
import type { PaymentMethod } from '../types';

export async function settleVivaReturn(opts: {
  clubId: string;
  orderCode?: string | null;
  transactionId?: string | null;
  providerHint?: 'viva' | 'stripe' | 'eurobank' | null;
}): Promise<{ settled: boolean; message: string }> {
  return settleOnlineReturn(opts);
}

export async function settleOnlineReturn(opts: {
  clubId: string;
  orderCode?: string | null;
  transactionId?: string | null;
  providerHint?: 'viva' | 'stripe' | 'eurobank' | null;
}): Promise<{ settled: boolean; message: string }> {
  const pending = resolveVivaPending({
    clubId: opts.clubId,
    orderCode: opts.orderCode,
  });
  if (!pending) {
    return {
      settled: false,
      message: opts.transactionId
        ? `Επιστροφή από πληρωμή (txn ${opts.transactionId}). Δεν βρέθηκε εκκρεμής πληρωμή για αυτόματη καταχώρηση.`
        : 'Δεν βρέθηκε εκκρεμής online πληρωμή.',
    };
  }

  const provider = pending.provider ?? opts.providerHint ?? 'viva';
  if (provider === 'stripe') {
    const paid = await verifyStripeSession({ clubId: opts.clubId, sessionId: pending.orderCode });
    if (!paid) {
      return { settled: false, message: 'Η συνεδρία Stripe δεν επιβεβαιώθηκε ως πληρωμένη.' };
    }
  }

  const method: PaymentMethod =
    provider === 'stripe' ? 'stripe' : provider === 'eurobank' ? 'eurobank' : 'viva';
  const label =
    provider === 'stripe' ? 'Stripe' : provider === 'eurobank' ? 'Eurobank' : 'Viva';
  const prefix = provider === 'stripe' ? 'STRIPE' : provider === 'eurobank' ? 'EUROBANK' : 'VIVA';

  const now = new Date();
  const result = await transactionsService.createTransaction({
    athleteId: pending.athleteId,
    amount: pending.amountEuro,
    receiptNumber: opts.transactionId
      ? `${prefix}-${opts.transactionId}`
      : `${prefix}-${pending.orderCode}`,
    type: 'payment',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    paymentMethod: method,
    comments: `Online πληρωμή ${label} · ${pending.athleteName} · ${localDateIso()}`,
  });

  if (!result.success) {
    return {
      settled: false,
      message: result.error ?? `Αποτυχία καταχώρησης πληρωμής ${label}`,
    };
  }

  return {
    settled: true,
    message: `Καταχωρήθηκε πληρωμή ${label} ${pending.amountEuro.toFixed(2)} € για ${pending.athleteName}.`,
  };
}
