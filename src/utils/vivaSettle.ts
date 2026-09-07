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

  const receiptNote = await emailOnlineFeeReceipt({
    clubId: opts.clubId,
    athleteId: pending.athleteId,
    athleteName: pending.athleteName,
    amountEuro: pending.amountEuro,
    transactionId: result.data?.id,
    providerLabel: label,
    fallbackNumber: opts.transactionId
      ? `${prefix}-${opts.transactionId}`
      : `${prefix}-${pending.orderCode}`,
  });

  return {
    settled: true,
    message: `Καταχωρήθηκε πληρωμή ${label} ${pending.amountEuro.toFixed(2)} € για ${pending.athleteName}.${receiptNote}`,
  };
}

async function emailOnlineFeeReceipt(input: {
  clubId: string;
  athleteId: string;
  athleteName: string;
  amountEuro: number;
  transactionId?: string;
  providerLabel: string;
  fallbackNumber: string;
}): Promise<string> {
  try {
    const { getData } = await import('../data/repository');
    const { getClubById, getClubSmtp } = await import('../auth/clubs');
    const { getAppLogoUrl } = await import('../platform/platformConfig');
    const { amountToGreekWords } = await import('./amountToGreekWords');
    const {
      buildPaymentReceiptEmail,
      parentReceiptEmails,
    } = await import('./paymentReceiptEmail');
    const { seriesOptions } = await import('./receiptBook');
    const { formatDate } = await import('./labels');
    const receiptBookService = await import('../api/services/receiptBookService');
    const emailService = await import('../api/services/emailService');

    const data = getData();
    const athlete = data.students.find((s) => s.id === input.athleteId);
    const recipients = parentReceiptEmails({
      fatherEmail: athlete?.fatherEmail,
      motherEmail: athlete?.motherEmail,
    });
    const smtp = getClubSmtp(input.clubId);
    if (!smtp.enabled || recipients.length === 0) {
      return recipients.length === 0
        ? ' Δεν στάλθηκε απόδειξη (λείπουν email γονέων).'
        : ' Δεν στάλθηκε απόδειξη (SMTP ανενεργό).';
    }

    const club = getClubById(input.clubId);
    let series = '';
    let number = input.fallbackNumber;
    const options = seriesOptions(data.receiptNumberRanges, data.receiptIssues).filter(
      (row) => !row.blocked && row.next != null,
    );
    if (options[0] && input.transactionId) {
      const issued = await receiptBookService.allocateReceiptIssue({
        series: options[0].series,
        transactionId: input.transactionId,
        athleteId: input.athleteId,
        emailed: true,
      });
      if (issued.success && issued.data) {
        series = issued.data.series;
        number = String(issued.data.number);
      }
    }

    const amount = input.amountEuro.toFixed(2).replace('.', ',');
    const message = buildPaymentReceiptEmail({
      clubName: club?.name?.trim() || 'Σύλλογος',
      logoUrl: club?.logoUrl?.trim() || getAppLogoUrl() || null,
      draft: {
        date: formatDate(localDateIso()),
        series,
        number,
        amount,
        receivedFrom: input.athleteName,
        address: [athlete?.address, athlete?.city].filter(Boolean).join(', '),
        amountWords: amountToGreekWords(amount),
        reason: `Online πληρωμή συνδρομής (${input.providerLabel})`,
      },
    });

    let sent = 0;
    for (const to of recipients) {
      const mail = await emailService.sendClubEmail({
        clubId: input.clubId,
        to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        athleteId: input.athleteId,
        transactional: true,
      });
      if (mail.success) sent += 1;
    }
    if (sent === 0) return ' Η απόδειξη δεν στάλθηκε με email.';
    return ` Στάλθηκε απόδειξη σε ${sent} παραλήπτη/ες.`;
  } catch {
    return '';
  }
}
