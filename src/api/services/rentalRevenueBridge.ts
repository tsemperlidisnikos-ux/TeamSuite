import type { AppData, PaymentMethod, RentalBooking, Revenue } from '../../types';
import { rememberDeletedId } from '../../data/financeSyncMerge';
import { currentFinanceActor } from '../../utils/financeOwnEntries';

export const RENTAL_INCOME_SUBCATEGORY = 'ΕΝΟΙΚΙΑΣΗ ΓΗΠΕΔΟΥ';

export function rentalRevenueId(bookingId: string): string {
  return `rev_rent_${bookingId}`;
}

/** Νέα κράτηση χωρίς είσπραξη δεν μετράει στα έσοδα. Παλιές confirmed χωρίς το πεδίο μένουν ως έχουν. */
export function isRentalBookingCollected(booking: RentalBooking): boolean {
  if (booking.status === 'cancelled' || booking.status === 'pending_payment') return false;
  if (booking.paymentCollected === false) return false;
  if (booking.paymentCollected === true) return true;
  if (booking.paidOn || booking.paidAt) return true;
  return booking.status === 'confirmed';
}

export function rentalRevenueDate(booking: RentalBooking): string {
  const paidOn = String(booking.paidOn ?? '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return paidOn;
  const paidAt = String(booking.paidAt ?? '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return paidAt;
  return booking.date;
}

export function rentalPaymentMethodOf(booking: RentalBooking): PaymentMethod {
  if (booking.paymentMethod === 'cash' || booking.paymentMethod === 'card') return booking.paymentMethod;
  if (booking.paymentProvider === 'viva') return 'viva';
  if (booking.paymentProvider === 'stripe') return 'stripe';
  if (booking.source === 'public' && booking.paymentProvider !== 'venue') return 'card';
  return 'cash';
}

function removeRentalRevenue(data: AppData, bookingId: string, revenueId: string): void {
  const removed = (data.revenues ?? []).filter(
    (row) => row.id === revenueId || row.linkedRentalBookingId === bookingId,
  );
  if (!removed.length) return;
  data.revenues = data.revenues.filter(
    (row) => row.id !== revenueId && row.linkedRentalBookingId !== bookingId,
  );
  for (const row of removed) {
    data.deletedRevenueIds = rememberDeletedId(data.deletedRevenueIds, row.id);
  }
}

export function upsertRentalBookingRevenueInData(data: AppData, booking: RentalBooking): void {
  if (!data.revenues) data.revenues = [];
  const id = rentalRevenueId(booking.id);
  if (!isRentalBookingCollected(booking) || !(Number(booking.amount) > 0)) {
    removeRentalRevenue(data, booking.id, id);
    return;
  }
  const actor = currentFinanceActor();
  const next: Revenue = {
    id,
    date: rentalRevenueDate(booking),
    amount: Number(booking.amount) || 0,
    category: 'events',
    description: `Ενοικίαση ${booking.facilityName} (${booking.startTime}–${booking.endTime})`,
    paymentStatus: 'paid',
    subcategory: RENTAL_INCOME_SUBCATEGORY,
    notes: `${booking.customerName} · ${booking.customerPhone}`.trim(),
    paymentMethod: rentalPaymentMethodOf(booking),
    linkedRentalBookingId: booking.id,
    createdByUserId: actor?.userId,
    createdByEmail: actor?.email,
  };
  const index = data.revenues.findIndex(
    (row) => row.id === id || row.linkedRentalBookingId === booking.id,
  );
  if (index >= 0) {
    data.revenues[index] = {
      ...data.revenues[index],
      ...next,
      id: data.revenues[index].id,
      createdByUserId: data.revenues[index].createdByUserId ?? next.createdByUserId,
      createdByEmail: data.revenues[index].createdByEmail ?? next.createdByEmail,
    };
  } else {
    data.revenues.push(next);
  }
}

export function syncRentalRevenuesInData(data: AppData): void {
  for (const booking of data.rentalBookings ?? []) {
    upsertRentalBookingRevenueInData(data, booking);
  }
}
