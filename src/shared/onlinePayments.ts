export const ONLINE_PAYMENT_PROVIDERS = [
  { id: 'viva', label: 'Viva Wallet' },
  { id: 'eurobank', label: 'Eurobank' },
  { id: 'stripe', label: 'Stripe' },
] as const;

export type OnlinePaymentProviderId = (typeof ONLINE_PAYMENT_PROVIDERS)[number]['id'];

const IDS = new Set<string>(ONLINE_PAYMENT_PROVIDERS.map((p) => p.id));

/** `undefined` σε παλιούς συλλόγους = Viva (συμβατότητα). Κενός πίνακας = κανένας online τρόπος. */
export function normalizeOnlinePaymentProviders(raw: unknown): OnlinePaymentProviderId[] {
  if (!Array.isArray(raw)) return ['viva'];
  const next: OnlinePaymentProviderId[] = [];
  for (const item of raw) {
    const id = String(item ?? '').trim();
    if (!IDS.has(id)) continue;
    if (!next.includes(id as OnlinePaymentProviderId)) next.push(id as OnlinePaymentProviderId);
  }
  return next;
}

export function onlineProviderLabel(id: OnlinePaymentProviderId): string {
  return ONLINE_PAYMENT_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}
