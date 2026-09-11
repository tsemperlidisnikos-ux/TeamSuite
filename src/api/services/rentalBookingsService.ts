import { apiClient } from '../apiClient';
import {
  bookingAmount,
  emptyRentalSettings,
  lockerRoomFeeAmount,
  occupancySliceForPublic,
  ruleForFacility,
  slotIsFree,
} from '../../shared/facilityRentalAvailability';
import { getClubData, createId, getData, mutateData } from '../../data/repository';
import { resolveActiveClubId } from '../../data/store';
import { getSession } from '../../auth/auth';
import { getPreviewClubId } from '../../platform/platformConfig';
import { rentalBookingInputSchema, rentalSettingsSchema, type RentalBookingInput } from '../../schemas';
import type { RentalBooking, RentalSettings } from '../../types';
import { localDateIso, localDateTimeIso } from '../../utils/dates';
import { syncAuthHeaders } from '../syncAuth';
import { persistClubImageDataUrl } from './sessionService';
import * as emailService from './emailService';
import { buildRentalBookingEmail, buildRentalReceiptEmail } from '../../utils/rentalBookingEmail';
import { getClubById } from '../../auth/clubs';
import { paymentMethodLabel } from '../../shared/paymentMethods';
import {
  isRentalBookingCollected,
  upsertRentalBookingRevenueInData,
} from './rentalRevenueBridge';
import { publishClubOpsSlice } from './clubOpsSyncService';
import { assertFinanceMonthOpen } from './financePeriodService';

export async function publishRentalOccupancy(clubId: string) {
  const data = resolveActiveClubId() === clubId ? getData() : getClubData(clubId);
  const occupancy = occupancySliceForPublic(data);
  const response = await fetch('/api/public-rent', {
    method: 'PUT',
    headers: syncAuthHeaders(),
    body: JSON.stringify({ clubId, occupancy }),
  });
  if (response.status === 503) return;
  const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || 'Αποτυχία ενημέρωσης δημόσιας διαθεσιμότητας.');
  }
}

async function emailRentalCustomer(clubId: string, booking: RentalBooking, kind: 'confirm' | 'receipt') {
  const to = (booking.customerEmail || '').trim();
  if (!to.includes('@')) return;
  const clubName = getClubById(clubId)?.name ?? '';
  const mail =
    kind === 'receipt'
      ? buildRentalReceiptEmail({
          clubName,
          booking,
          paymentLabel: paymentMethodLabel(booking.paymentMethod),
        })
      : buildRentalBookingEmail({ clubName, booking });
  try {
    await emailService.sendClubEmail({
      clubId,
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      transactional: true,
    });
  } catch {
    /* κράτηση έγκυρη και χωρίς email */
  }
}

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
    if (clubId) await publishRentalOccupancy(clubId);
    return getData().rentalSettings ?? emptyRentalSettings();
  });
}

export async function createRentalBooking(
  input: RentalBookingInput,
  source: RentalBooking['source'] = 'secretariat',
) {
  return apiClient(async () => {
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
    const paidNow = Boolean(parsed.paidNow);
    const paidOn = paidNow ? localDateIso() : undefined;
    if (paidNow) assertFinanceMonthOpen(paidOn!);
    const collectMethod = parsed.paymentMethod === 'card' ? 'card' : 'cash';
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
      paymentCollected: paidNow,
      paymentProvider: paidNow ? 'venue' : undefined,
      paymentMethod: paidNow ? collectMethod : undefined,
      paidOn,
      paidAt: paidNow ? localDateTimeIso() : undefined,
      updatedAt: Date.now(),
    };
    mutateData((store) => {
      if (!store.rentalBookings) store.rentalBookings = [];
      store.rentalBookings.unshift(booking);
      upsertRentalBookingRevenueInData(store, booking);
    });
    void publishClubOpsSlice();
    const clubId = getPreviewClubId() ?? getSession()?.clubId ?? null;
    if (clubId) {
      try {
        await publishRentalOccupancy(clubId);
      } catch {
        /* τοπική κράτηση μένει · το δημόσιο ενημερώνεται στο επόμενο save */
      }
      if (!paidNow) await emailRentalCustomer(clubId, booking, 'confirm');
    }
    return booking;
  });
}

export async function cancelRentalBooking(id: string) {
  return apiClient(async () => {
    let updated: RentalBooking | undefined;
    mutateData((data) => {
      const list = data.rentalBookings ?? [];
      const index = list.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('Η κράτηση δεν βρέθηκε.');
      updated = {
        ...list[index],
        status: 'cancelled',
        paymentCollected: false,
        updatedAt: Date.now(),
      };
      list[index] = updated;
      data.rentalBookings = list;
      upsertRentalBookingRevenueInData(data, updated);
    });
    void publishClubOpsSlice();
    const clubId = getPreviewClubId() ?? getSession()?.clubId ?? null;
    if (clubId) {
      try {
        await publishRentalOccupancy(clubId);
      } catch {
        /* ignore */
      }
    }
    return updated!;
  });
}

export async function collectRentalBooking(
  id: string,
  input: { paymentMethod: 'cash' | 'card'; paidOn?: string },
) {
  return apiClient(async () => {
    const paidOn = (input.paidOn || localDateIso()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new Error('Μη έγκυρη ημερομηνία είσπραξης.');
    assertFinanceMonthOpen(paidOn);
    let updated: RentalBooking | undefined;
    mutateData((data) => {
      const list = data.rentalBookings ?? [];
      const index = list.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('Η κράτηση δεν βρέθηκε.');
      const current = list[index];
      if (current.status === 'cancelled') throw new Error('Η κράτηση έχει ακυρωθεί.');
      if (!(Number(current.amount) > 0)) throw new Error('Δεν υπάρχει ποσό προς είσπραξη.');
      if (isRentalBookingCollected(current)) {
        updated = {
          ...current,
          paymentCollected: true,
          paidOn: current.paidOn || paidOn,
          paidAt: current.paidAt || localDateTimeIso(),
          paymentMethod: current.paymentMethod || input.paymentMethod,
          updatedAt: Date.now(),
        };
      } else {
        updated = {
          ...current,
          status: 'confirmed',
          paymentCollected: true,
          paymentProvider: 'venue',
          paymentMethod: input.paymentMethod,
          paidOn,
          paidAt: localDateTimeIso(),
          updatedAt: Date.now(),
        };
      }
      list[index] = updated;
      data.rentalBookings = list;
      upsertRentalBookingRevenueInData(data, updated);
    });
    await publishClubOpsSlice();
    const clubId = getPreviewClubId() ?? getSession()?.clubId ?? null;
    if (clubId) {
      const { flushClubMirrorPush } = await import('../../data/clubSync');
      await flushClubMirrorPush(clubId, { force: true });
    }
    return updated!;
  });
}

export async function mergeRemoteRentalBookings(bookings: RentalBooking[]) {
  return apiClient(() => {
    mutateData((data) => {
      if (!data.rentalBookings) data.rentalBookings = [];
      const byId = new Map(data.rentalBookings.map((item) => [item.id, item]));
      for (const booking of bookings) {
        if (!booking?.id) continue;
        const prev = byId.get(booking.id);
        const next = prev ? { ...prev, ...booking } : booking;
        byId.set(booking.id, next);
        upsertRentalBookingRevenueInData(data, next);
      }
      data.rentalBookings = [...byId.values()];
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
