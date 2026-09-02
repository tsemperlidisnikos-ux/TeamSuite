import { apiClient } from '../apiClient';
import {
  clubAllowsOnlineProvider,
  getClubById,
  getClubStripe,
} from '../../auth/clubs';
import { localDateTimeIso } from '../../utils/dates';
import { addVivaPending } from '../../utils/vivaPending';

export async function createStripeCheckout(input: {
  clubId: string;
  amountEuro: number;
  athleteId?: string;
  athleteName?: string;
  customerEmail?: string;
}) {
  return apiClient(async () => {
    if (!clubAllowsOnlineProvider(input.clubId, 'stripe')) {
      throw new Error('Ο διαχειριστής πλατφόρμας δεν έχει επιτρέψει Stripe για αυτόν τον σύλλογο.');
    }
    const stripe = getClubStripe(input.clubId);
    const club = getClubById(input.clubId);
    if (!stripe.enabled) throw new Error('Το Stripe δεν είναι ενεργό στις ρυθμίσεις του συλλόγου.');
    if (!stripe.secretKey.startsWith('sk_')) {
      throw new Error('Συμπληρώστε Secret Key στις Ρυθμίσεις → Stripe.');
    }
    const amountCents = Math.round(input.amountEuro * 100);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const path = typeof window !== 'undefined' ? window.location.pathname : '/';
    const successUrl = `${origin}${path}?pay=stripe&s={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}${path}?pay=stripe&cancel=1`;

    const response = await fetch('/api/stripe?op=create-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secretKey: stripe.secretKey,
        amount: amountCents,
        description: `TeamSuite · ${club?.name ?? 'club'} · ${input.athleteName ?? ''}`.trim(),
        customerEmail: input.customerEmail,
        successUrl,
        cancelUrl,
      }),
    });
    let payload: { ok?: boolean; error?: string; checkoutUrl?: string; sessionId?: string } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = {};
    }
    if (!response.ok || !payload.ok || !payload.checkoutUrl) {
      throw new Error(payload.error || `Αποτυχία Stripe (HTTP ${response.status})`);
    }
    const orderCode = String(payload.sessionId ?? '');
    if (input.athleteId && orderCode) {
      addVivaPending({
        clubId: input.clubId,
        orderCode,
        athleteId: input.athleteId,
        amountEuro: input.amountEuro,
        athleteName: input.athleteName || 'Αθλητής',
        createdAt: localDateTimeIso(),
        provider: 'stripe',
      });
    }
    return { checkoutUrl: payload.checkoutUrl, orderCode, method: 'GET' as const };
  });
}

export async function verifyStripeSession(input: { clubId: string; sessionId: string }) {
  const stripe = getClubStripe(input.clubId);
  const response = await fetch('/api/stripe?op=verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secretKey: stripe.secretKey, sessionId: input.sessionId }),
  });
  const payload = (await response.json()) as { ok?: boolean; paid?: boolean; error?: string };
  return Boolean(response.ok && payload.ok && payload.paid);
}
