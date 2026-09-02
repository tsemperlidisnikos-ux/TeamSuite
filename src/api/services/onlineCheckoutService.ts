import * as eurobankService from './eurobankService';
import * as stripeService from './stripeService';
import * as vivaService from './vivaService';
import {
  clubAllowsOnlineProvider,
  getClubEurobank,
  getClubStripe,
  getClubViva,
} from '../../auth/clubs';
import type { OnlinePaymentProviderId } from '../../shared/onlinePayments';
import { onlineProviderLabel } from '../../shared/onlinePayments';

export type ReadyOnlineProvider = {
  id: OnlinePaymentProviderId;
  label: string;
};

export function listReadyOnlineProviders(clubId: string | null | undefined): ReadyOnlineProvider[] {
  if (!clubId) return [];
  const ready: ReadyOnlineProvider[] = [];
  if (clubAllowsOnlineProvider(clubId, 'viva') && getClubViva(clubId).enabled) {
    ready.push({ id: 'viva', label: onlineProviderLabel('viva') });
  }
  if (clubAllowsOnlineProvider(clubId, 'eurobank') && getClubEurobank(clubId).enabled) {
    ready.push({ id: 'eurobank', label: onlineProviderLabel('eurobank') });
  }
  if (clubAllowsOnlineProvider(clubId, 'stripe') && getClubStripe(clubId).enabled) {
    ready.push({ id: 'stripe', label: onlineProviderLabel('stripe') });
  }
  return ready;
}

export async function startOnlineCheckout(input: {
  clubId: string;
  provider: OnlinePaymentProviderId;
  amountEuro: number;
  athleteId: string;
  athleteName: string;
  customerEmail?: string;
  customerFullName?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (input.provider === 'viva') {
    const result = await vivaService.createVivaCheckout({
      clubId: input.clubId,
      amountEuro: input.amountEuro,
      athleteId: input.athleteId,
      athleteName: input.athleteName,
      customerEmail: input.customerEmail,
      customerFullName: input.customerFullName,
      merchantTrns: `Οφειλή ${input.athleteName}`,
    });
    if (!result.success || !result.data?.checkoutUrl) {
      return { success: false, error: result.error ?? 'Αποτυχία Viva' };
    }
    window.location.href = result.data.checkoutUrl;
    return { success: true };
  }
  if (input.provider === 'stripe') {
    const result = await stripeService.createStripeCheckout(input);
    if (!result.success || !result.data?.checkoutUrl) {
      return { success: false, error: result.error ?? 'Αποτυχία Stripe' };
    }
    window.location.href = result.data.checkoutUrl;
    return { success: true };
  }
  const result = await eurobankService.createEurobankCheckout(input);
  if (!result.success || !result.data) {
    return { success: false, error: result.error ?? 'Αποτυχία Eurobank' };
  }
  eurobankService.postGatewayForm(result.data.checkoutUrl, result.data.fields);
  return { success: true };
}
