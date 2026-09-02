import type { PaymentMethod } from '../types';

/** Επίσημοι τρόποι πληρωμής εφαρμογής. */
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Μετρητά' },
  { value: 'transfer', label: 'Κατάθεση' },
  { value: 'card', label: 'POS' },
  { value: 'viva', label: 'VIVA' },
  { value: 'eurobank', label: 'Eurobank' },
  { value: 'stripe', label: 'Stripe' },
] as const;

export const paymentMethodLabels: Record<string, string> = {
  cash: 'Μετρητά',
  transfer: 'Κατάθεση',
  card: 'POS',
  viva: 'VIVA',
  eurobank: 'Eurobank',
  stripe: 'Stripe',
  /** Παλιά τιμή — εμφανίζεται ως VIVA */
  other: 'VIVA',
};

export function paymentMethodLabel(method: string | undefined | null): string {
  if (!method) return '—';
  return paymentMethodLabels[method] ?? method;
}

export function normalizePaymentMethod(method: string | undefined | null): PaymentMethod {
  if (!method) return '';
  if (method === 'other') return 'viva';
  if ((PAYMENT_METHODS as readonly { value: string }[]).some((m) => m.value === method)) {
    return method as PaymentMethod;
  }
  return '';
}
