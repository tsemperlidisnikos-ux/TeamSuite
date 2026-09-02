import { apiClient } from '../apiClient';
import {
  clubAllowsOnlineProvider,
  getClubById,
  getClubEurobank,
} from '../../auth/clubs';
import { localDateTimeIso } from '../../utils/dates';
import { addVivaPending } from '../../utils/vivaPending';

export async function createEurobankCheckout(input: {
  clubId: string;
  amountEuro: number;
  athleteId?: string;
  athleteName?: string;
  customerEmail?: string;
}) {
  return apiClient(async () => {
    if (!clubAllowsOnlineProvider(input.clubId, 'eurobank')) {
      throw new Error('Ο διαχειριστής πλατφόρμας δεν έχει επιτρέψει Eurobank για αυτόν τον σύλλογο.');
    }
    const eurobank = getClubEurobank(input.clubId);
    const club = getClubById(input.clubId);
    if (!eurobank.enabled) throw new Error('Η Eurobank δεν είναι ενεργή στις ρυθμίσεις του συλλόγου.');
    if (!eurobank.merchantId || !eurobank.secretKey) {
      throw new Error('Συμπληρώστε Merchant ID και Secret Key στις Ρυθμίσεις → Eurobank.');
    }
    const amountCents = Math.round(input.amountEuro * 100);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const path = typeof window !== 'undefined' ? window.location.pathname : '/';
    const confirmUrl = `${origin}${path}?pay=eurobank`;
    const cancelUrl = `${origin}${path}?pay=eurobank&cancel=1`;

    const response = await fetch('/api/eurobank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: eurobank.merchantId,
        secretKey: eurobank.secretKey,
        environment: eurobank.environment,
        amount: amountCents,
        orderDesc: `TeamSuite ${club?.name ?? ''} ${input.athleteName ?? ''}`.trim(),
        payerEmail: input.customerEmail,
        confirmUrl,
        cancelUrl,
      }),
    });
    let payload: {
      ok?: boolean;
      error?: string;
      checkoutUrl?: string;
      orderCode?: string;
      method?: string;
      fields?: Record<string, string>;
    } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = {};
    }
    if (!response.ok || !payload.ok || !payload.checkoutUrl || !payload.fields) {
      throw new Error(payload.error || `Αποτυχία Eurobank (HTTP ${response.status})`);
    }
    const orderCode = String(payload.orderCode ?? '');
    if (input.athleteId && orderCode) {
      addVivaPending({
        clubId: input.clubId,
        orderCode,
        athleteId: input.athleteId,
        amountEuro: input.amountEuro,
        athleteName: input.athleteName || 'Αθλητής',
        createdAt: localDateTimeIso(),
        provider: 'eurobank',
      });
    }
    return {
      checkoutUrl: payload.checkoutUrl,
      orderCode,
      method: 'POST' as const,
      fields: payload.fields,
    };
  });
}

export function postGatewayForm(action: string, fields: Record<string, string>): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  form.style.display = 'none';
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
