import type { AppData, RentalBooking, Revenue } from '../../types';
import { rememberDeletedId } from '../../data/financeSyncMerge';

export const RENTAL_INCOME_SUBCATEGORY = 'ΕΝΟΙΚΙΑΣΗ ΓΗΠΕΔΟΥ';

export function rentalRevenueId(bookingId: string): string {
  return `rev_rent_${bookingId}`;
}

export function upsertRentalBookingRevenueInData(data: AppData, booking: RentalBooking): void {
  if (!data.revenues) data.revenues = [];
  const id = rentalRevenueId(booking.id);
  if (booking.status !== 'confirmed' || !(Number(booking.amount) > 0)) {
    const removed = data.revenues.filter(
      (row) => row.id === id || row.linkedRentalBookingId === booking.id,
    );
    if (removed.length) {
      data.revenues = data.revenues.filter(
        (row) => row.id !== id && row.linkedRentalBookingId !== booking.id,
      );
      for (const row of removed) {
        data.deletedRevenueIds = rememberDeletedId(data.deletedRevenueIds, row.id);
      }
    }
    return;
  }
  const next: Revenue = {
    id,
    date: booking.date,
    amount: Number(booking.amount) || 0,
    category: 'events',
    description: `Ενοικίαση ${booking.facilityName} (${booking.startTime}–${booking.endTime})`,
    paymentStatus: 'paid',
    subcategory: RENTAL_INCOME_SUBCATEGORY,
    notes: `${booking.customerName} · ${booking.customerPhone}`.trim(),
    paymentMethod:
      booking.paymentProvider === 'viva'
        ? 'viva'
        : booking.paymentProvider === 'stripe'
          ? 'stripe'
          : booking.source === 'public'
            ? 'card'
            : 'cash',
    linkedRentalBookingId: booking.id,
  };
  const index = data.revenues.findIndex(
    (row) => row.id === id || row.linkedRentalBookingId === booking.id,
  );
  if (index >= 0) {
    data.revenues[index] = { ...data.revenues[index], ...next, id: data.revenues[index].id };
  } else {
    data.revenues.push(next);
  }
}

export function syncRentalRevenuesInData(data: AppData): void {
  for (const booking of data.rentalBookings ?? []) {
    upsertRentalBookingRevenueInData(data, booking);
  }
}
