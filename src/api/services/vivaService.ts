import { apiClient } from '../apiClient';
import { getClubById, getClubViva, clubAllowsOnlineProvider } from '../../auth/clubs';
import { localDateTimeIso } from '../../utils/dates';
import { addVivaPending } from '../../utils/vivaPending';

export type CreateVivaPaymentInput = {
  clubId: string;
  amountEuro: number;
  athleteId?: string;
  athleteName?: string;
  customerEmail?: string;
  customerFullName?: string;
  merchantTrns?: string;
};

export async function createVivaCheckout(input: CreateVivaPaymentInput) {
  return apiClient(async () => {
    const viva = getClubViva(input.clubId);
    const club = getClubById(input.clubId);
    if (!viva.enabled) {
      throw new Error('Οι online πληρωμές Viva δεν είναι ενεργές για τον σύλλογο.');
    }
    if (!clubAllowsOnlineProvider(input.clubId, 'viva')) {
      throw new Error('Ο διαχειριστής πλατφόρμας δεν έχει επιτρέψει Viva για αυτόν τον σύλλογο.');
    }
    if (!viva.clientId || !viva.clientSecret || !viva.sourceCode) {
      throw new Error('Συμπληρώστε Client ID, Client Secret και Source Code στις Ρυθμίσεις → Viva.');
    }
    const amountCents = Math.round(input.amountEuro * 100);
    if (!Number.isFinite(amountCents) || amountCents < 30) {
      throw new Error('Το ποσό πληρωμής πρέπει να είναι τουλάχιστον 0,30 €.');
    }

    const response = await fetch('/api/viva/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: viva.clientId,
        clientSecret: viva.clientSecret,
        sourceCode: viva.sourceCode,
        environment: viva.environment,
        amount: amountCents,
        customer: {
          email: input.customerEmail || undefined,
          fullName: input.customerFullName || undefined,
        },
        merchantTrns:
          input.merchantTrns ||
          `TeamSuite · ${club?.name ?? 'club'} · ${amountCents}c`,
      }),
    });

    let payload: {
      ok?: boolean;
      error?: string;
      orderCode?: string | number;
      checkoutUrl?: string;
    } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = {};
    }

    if (!response.ok || !payload.ok || !payload.checkoutUrl) {
      const err =
        payload.error ||
        (response.status === 404
          ? 'Το Viva checkout διαθέσιμο μόνο στο production server (Vercel API).'
          : `Αποτυχία δημιουργίας πληρωμής (HTTP ${response.status})`);
      throw new Error(err);
    }

    const orderCode = String(payload.orderCode ?? '');
    if (input.athleteId && orderCode) {
      addVivaPending({
        clubId: input.clubId,
        orderCode,
        athleteId: input.athleteId,
        amountEuro: input.amountEuro,
        athleteName: input.athleteName || input.customerFullName || 'Αθλητής',
        createdAt: localDateTimeIso(),
        provider: 'viva',
      });
    }

    return {
      orderCode,
      checkoutUrl: payload.checkoutUrl,
    };
  });
}
