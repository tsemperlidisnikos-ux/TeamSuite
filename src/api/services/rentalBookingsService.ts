import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { getSession } from '../../auth/auth';
import { getPreviewClubId } from '../../platform/platformConfig';
import { rentalBookingInputSchema, rentalSettingsSchema, type RentalBookingInput } from '../../schemas';
import type { RentalBooking, RentalSettings } from '../../types';
import { localDateTimeIso } from '../../utils/dates';
import { syncAuthHeaders } from '../syncAuth';
import { persistClubImageDataUrl } from './sessionService';
import {
  bookingAmount,
  emptyRentalSettings,
  lockerRoomFeeAmount,
  ruleForFacility,
  slotIsFree,
} from '../../shared/facilityRentalAvailability';

export async function saveRentalSettings(input: RentalSettings) {
  return apiClient(async () => {
    const parsed = rentalSettingsSchema.parse(input);
    const clubId = getPreviewClubId() ?? getSession()?.clubId ?? null;
    const heroRaw = parsed.heroImageUrl;
    let heroImageUrl: string | null | undefined;
    if (heroRaw === undefined) {
      heroImageUrl = undefined;
    } else if (heroRaw?.startsWith('data:')) {
      if (!clubId) {
        if (import.meta.env.DEV) heroImageUrl = heroRaw;
        else throw new Error('Δεν βρέθηκε σύλλογος για αποθήκευση φωτογραφίας.');
      } else {
        heroImageUrl = await persistClubImageDataUrl(clubId, heroRaw, 'rent-hero.jpg');
      }
    } else {
      heroImageUrl = heroRaw ?? null;
    }
    mutateData((data) => {
      data.rentalSettings = {
        publicEnabled: parsed.publicEnabled,
        notes: parsed.notes ?? '',
        heroImageUrl:
          heroImageUrl === undefined ? data.rentalSettings?.heroImageUrl ?? null : heroImageUrl,
        photoLook: 'g',
        rules: parsed.rules.map((rule) => ({
          ...rule,
          hourlyRate: rule.hourlyRateFull || rule.hourlyRate || 0,
          hourlyRateFull: rule.hourlyRateFull || rule.hourlyRate || 0,
          hourlyRateHalf: rule.hourlyRateHalf || 0,
          lockerRoomAvailable: Boolean(rule.lockerRoomAvailable),
          lockerRoomFee: Number(rule.lockerRoomFee) || 0,
        })),
      };
    });
    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush();
    return getData().rentalSettings ?? emptyRentalSettings();
  });
}

export async function createRentalBooking(
  input: RentalBookingInput,
  source: RentalBooking['source'] = 'secretariat',
) {
  return apiClient(() => {
    const parsed = rentalBookingInputSchema.parse(input);
    const data = getData();
    const facility = (data.facilities ?? []).find((f) => f.id === parsed.facilityId);
    if (!facility || !facility.active) throw new Error('Το γήπεδο δεν βρέθηκε.');
    const courtShare = parsed.courtShare === 'half' ? 'half' : 'full';
    const check = slotIsFree(
      data,
      facility,
      parsed.date,
      parsed.startTime,
      parsed.endTime,
      courtShare,
    );
    if (!check.ok) throw new Error(check.reason);
    const rule = ruleForFacility(data.rentalSettings, facility.id, facility);
    const useLockerRoom = Boolean(parsed.useLockerRoom);
    const baseAmount =
      bookingAmount(rule, parsed.startTime, parsed.endTime, courtShare) +
      lockerRoomFeeAmount(rule, useLockerRoom);
    const discount = Math.max(0, parsed.specialDiscount ?? 0);
    const amount =
      discount > 0
        ? Math.max(0, Math.round((baseAmount - discount) * 100) / 100)
        : parsed.amount > 0
          ? parsed.amount
          : baseAmount;
    const session = getSession();
    const booking: RentalBooking = {
      id: createId('rent'),
      facilityId: facility.id,
      facilityName: facility.name,
      date: parsed.date,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      courtShare,
      useLockerRoom,
      customerName: parsed.customerName.trim(),
      customerPhone: parsed.customerPhone.trim(),
      customerEmail: (parsed.customerEmail ?? '').trim(),
      notes: parsed.notes ?? '',
      amount,
      specialDiscount: discount,
      source,
      status: 'confirmed',
      createdAt: localDateTimeIso(),
      createdByName: session?.fullName || session?.email || 'Γραμματεία',
    };
    mutateData((store) => {
      if (!store.rentalBookings) store.rentalBookings = [];
      store.rentalBookings.unshift(booking);
    });
    return booking;
  });
}

export async function cancelRentalBooking(id: string) {
  return apiClient(() => {
    let updated: RentalBooking | undefined;
    mutateData((data) => {
      const list = data.rentalBookings ?? [];
      const index = list.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('Η κράτηση δεν βρέθηκε.');
      updated = { ...list[index], status: 'cancelled' };
      list[index] = updated;
      data.rentalBookings = list;
    });
    return updated!;
  });
}

export async function mergeRemoteRentalBookings(bookings: RentalBooking[]) {
  return apiClient(() => {
    mutateData((data) => {
      if (!data.rentalBookings) data.rentalBookings = [];
      const ids = new Set(data.rentalBookings.map((item) => item.id));
      for (const booking of bookings) {
        if (!booking?.id || ids.has(booking.id)) continue;
        data.rentalBookings.unshift(booking);
        ids.add(booking.id);
      }
    });
    return getData().rentalBookings ?? [];
  });
}

/** Τραβάει κρατήσεις από το δημόσιο link (mirror) στο τοπικό ημερολόγιο. */
export async function pullRemoteRentalBookings(clubId: string) {
  try {
    const response = await fetch(`/api/public-rent?clubId=${encodeURIComponent(clubId)}`, {
      headers: syncAuthHeaders(),
    });
    if (!response.ok) return { success: false as const, merged: 0 };
    const body = (await response.json()) as { ok?: boolean; bookings?: RentalBooking[] };
    if (!body.ok || !body.bookings?.length) return { success: true as const, merged: 0 };
    const before = new Set((getData().rentalBookings ?? []).map((item) => item.id));
    await mergeRemoteRentalBookings(body.bookings);
    const merged = body.bookings.filter((item) => item?.id && !before.has(item.id)).length;
    return { success: true as const, merged };
  } catch {
    return { success: false as const, merged: 0 };
  }
}

export async function syncRemoteRentalBookings() {
  const clubId = getPreviewClubId() ?? getSession()?.clubId ?? null;
  if (!clubId) return;
  await pullRemoteRentalBookings(clubId);
}
