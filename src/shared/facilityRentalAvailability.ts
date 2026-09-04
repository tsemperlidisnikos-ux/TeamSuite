import { FACILITY_TIME_LAYOUTS } from '../utils/facilityHours.js';
import type {
  Facility,
  FacilityRentalRule,
  Match,
  RentalBooking,
  RentalCourtShare,
  RentalSettings,
  ScheduleSlot,
  Training,
} from '../types/index.js';

export type { Facility, RentalBooking, RentalCourtShare };

export const RENTAL_WEEKDAYS = [
  { value: 1, label: 'Δευ' },
  { value: 2, label: 'Τρί' },
  { value: 3, label: 'Τετ' },
  { value: 4, label: 'Πέμ' },
  { value: 5, label: 'Παρ' },
  { value: 6, label: 'Σάβ' },
  { value: 0, label: 'Κυρ' },
] as const;

export const RENTAL_SLOT_OPTIONS = [60, 90, 120] as const;

const MATCH_MINUTES = 120;

export type RentalOccupancySource = {
  facilities?: Facility[];
  schedule?: ScheduleSlot[];
  trainings?: Training[];
  matches?: Match[];
  rentalSettings?: RentalSettings;
  rentalBookings?: RentalBooking[];
};

export type OccupancyBlock = {
  startMin: number;
  endMin: number;
  reason: string;
  share: RentalCourtShare | 'blocked';
};

export type RentalSlot = {
  startTime: string;
  endTime: string;
  available: boolean;
  reason: string;
  remainingHalves: number;
};

export function emptyRentalSettings(): RentalSettings {
  return { publicEnabled: false, notes: '', rules: [], heroImageUrl: null, photoLook: 'g' };
}

export function minutesOf(hhmm: string): number {
  const [h, m] = String(hhmm || '0:0').split(':').map((n) => Number(n));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function formatMinutes(total: number): string {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function weekdayOfIsoDate(date: string): number {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getDay();
}

function layoutBounds(layoutId: string | undefined): { start: string; end: string; stepMin: number } {
  const layout =
    FACILITY_TIME_LAYOUTS.find((item) => item.id === layoutId) ?? FACILITY_TIME_LAYOUTS[0];
  return { start: layout.start, end: layout.end, stepMin: layout.stepMin };
}

export function defaultRuleForFacility(facility: Facility): FacilityRentalRule {
  const bounds = layoutBounds(facility.timeLayout);
  return {
    facilityId: facility.id,
    enabled: false,
    slotMinutes: 60,
    windows: [
      {
        days: [1, 2, 3, 4, 5, 6, 0],
        startTime: bounds.start,
        endTime: bounds.end === '00:00' ? '00:00' : bounds.end,
      },
    ],
    hourlyRate: 0,
    hourlyRateFull: 0,
    hourlyRateHalf: 0,
    lockerRoomAvailable: false,
    lockerRoomFee: 0,
  };
}

export function normalizeRentalRule(rule: FacilityRentalRule): FacilityRentalRule {
  const full = Number(rule.hourlyRateFull) > 0 ? Number(rule.hourlyRateFull) : Number(rule.hourlyRate) || 0;
  const half = Number(rule.hourlyRateHalf);
  const fee = Number(rule.lockerRoomFee);
  return {
    ...rule,
    hourlyRate: full,
    hourlyRateFull: full,
    hourlyRateHalf: Number.isFinite(half) && half >= 0 ? half : 0,
    lockerRoomAvailable: Boolean(rule.lockerRoomAvailable),
    lockerRoomFee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
    slotMinutes: rule.slotMinutes || 60,
    windows: rule.windows?.length
      ? rule.windows
      : [{ days: [1, 2, 3, 4, 5], startTime: '18:00', endTime: '22:00' }],
  };
}

export function ruleForFacility(
  settings: RentalSettings | undefined,
  facilityId: string,
  facility?: Facility,
): FacilityRentalRule {
  const existing = settings?.rules.find((r) => r.facilityId === facilityId);
  if (existing) return normalizeRentalRule(existing);
  if (facility) return defaultRuleForFacility(facility);
  return {
    facilityId,
    enabled: false,
    slotMinutes: 60,
    windows: [{ days: [1, 2, 3, 4, 5], startTime: '18:00', endTime: '22:00' }],
    hourlyRate: 0,
    hourlyRateFull: 0,
    hourlyRateHalf: 0,
    lockerRoomAvailable: false,
    lockerRoomFee: 0,
  };
}

function sameLocation(location: string | undefined, facilityName: string): boolean {
  return String(location ?? '').trim().toLowerCase() === facilityName.trim().toLowerCase();
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function occupancyForDate(
  source: RentalOccupancySource,
  facility: Facility,
  date: string,
): OccupancyBlock[] {
  const day = weekdayOfIsoDate(date);
  const name = facility.name;
  const blocks: OccupancyBlock[] = [];

  for (const slot of source.schedule ?? []) {
    if (slot.dayOfWeek !== day) continue;
    if (!sameLocation(slot.location, name)) continue;
    const startMin = minutesOf(slot.startTime);
    let endMin = minutesOf(slot.endTime);
    if (endMin <= startMin) endMin += 24 * 60;
    blocks.push({ startMin, endMin, reason: 'Προπόνηση τμήματος', share: 'blocked' });
  }

  for (const training of source.trainings ?? []) {
    if (training.date !== date) continue;
    if (!sameLocation(training.location, name)) continue;
    const startMin = minutesOf(training.startTime);
    let endMin = minutesOf(training.endTime);
    if (!training.endTime) endMin = startMin + 60;
    if (endMin <= startMin) endMin += 24 * 60;
    blocks.push({ startMin, endMin, reason: 'Προπόνηση', share: 'blocked' });
  }

  for (const match of source.matches ?? []) {
    if (match.date !== date) continue;
    if (match.status === 'cancelled') continue;
    if (match.venue === 'away') continue;
    if (!sameLocation(match.location, name)) continue;
    const startMin = minutesOf(match.time || '00:00');
    blocks.push({
      startMin,
      endMin: startMin + MATCH_MINUTES,
      reason: 'Αγώνας',
      share: 'blocked',
    });
  }

  for (const booking of source.rentalBookings ?? []) {
    if (booking.status === 'cancelled') continue;
    if (booking.date !== date) continue;
    if (booking.facilityId !== facility.id && !sameLocation(booking.facilityName, name)) continue;
    const startMin = minutesOf(booking.startTime);
    let endMin = minutesOf(booking.endTime);
    if (endMin <= startMin) endMin += 24 * 60;
    blocks.push({
      startMin,
      endMin,
      reason: booking.courtShare === 'half' ? 'Κράτηση μισού γηπέδου' : 'Κράτηση ολόκληρου γηπέδου',
      share: booking.courtShare === 'half' ? 'half' : 'full',
    });
  }

  return blocks.sort((a, b) => a.startMin - b.startMin);
}

function windowEndMinutes(startMin: number, endTime: string): number {
  let endMin = minutesOf(endTime);
  if (endTime === '00:00' || endMin <= startMin) endMin += 24 * 60;
  return endMin;
}

function occupancyForRange(
  occupied: OccupancyBlock[],
  startMin: number,
  endMin: number,
): { blocked: boolean; full: boolean; halfCount: number; reason: string } {
  let blocked = false;
  let full = false;
  let halfCount = 0;
  let reason = '';
  for (const block of occupied) {
    if (!overlaps(startMin, endMin, block.startMin, block.endMin)) continue;
    if (block.share === 'blocked') {
      blocked = true;
      reason = block.reason;
      break;
    }
    if (block.share === 'full') {
      full = true;
      reason = block.reason;
    } else if (block.share === 'half') {
      halfCount += 1;
      reason = block.reason;
    }
  }
  return { blocked, full, halfCount, reason };
}

export function listRentalSlots(
  source: RentalOccupancySource,
  facility: Facility,
  date: string,
  courtShare: RentalCourtShare = 'full',
): RentalSlot[] {
  const settings = source.rentalSettings ?? emptyRentalSettings();
  const rule = ruleForFacility(settings, facility.id, facility);
  if (!rule.enabled) return [];
  const day = weekdayOfIsoDate(date);
  const occupied = occupancyForDate(source, facility, date);
  const slotMinutes = rule.slotMinutes || 60;
  const slots: RentalSlot[] = [];
  const seen = new Set<string>();

  for (const window of rule.windows) {
    if (!window.days.includes(day)) continue;
    const startMin = minutesOf(window.startTime);
    const endMin = windowEndMinutes(startMin, window.endTime);
    for (let t = startMin; t + slotMinutes <= endMin; t += slotMinutes) {
      const startTime = formatMinutes(t);
      const endTime = formatMinutes(t + slotMinutes);
      const key = `${startTime}-${endTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const occ = occupancyForRange(occupied, t, t + slotMinutes);
      const remainingHalves = occ.blocked || occ.full ? 0 : Math.max(0, 2 - occ.halfCount);
      let available = remainingHalves > 0;
      let reason = '';
      if (occ.blocked || occ.full) {
        available = false;
        reason = occ.reason || 'Μη διαθέσιμο';
      } else if (courtShare === 'full' && remainingHalves < 2) {
        available = false;
        reason = occ.halfCount > 0 ? 'Δεσμευμένο μισό γήπεδο' : 'Μη διαθέσιμο';
      } else if (courtShare === 'half' && remainingHalves < 1) {
        available = false;
        reason = occ.reason || 'Μη διαθέσιμο';
      }
      slots.push({
        startTime,
        endTime,
        available,
        reason,
        remainingHalves,
      });
    }
  }

  return slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function facilityByLocation(source: RentalOccupancySource, location: string): Facility | undefined {
  const name = String(location ?? '').trim();
  if (!name) return undefined;
  return (source.facilities ?? []).find((item) => sameLocation(name, item.name));
}

/** Προπόνηση / πρόγραμμα: το γήπεδο πρέπει να είναι ελεύθερο από ενοικιάσεις. */
export function slotConflictsWithRentals(
  source: RentalOccupancySource,
  location: string,
  date: string,
  startTime: string,
  endTime: string,
): { ok: true } | { ok: false; reason: string } {
  const facility = facilityByLocation(source, location);
  if (!facility || !date || !startTime) return { ok: true };
  const startMin = minutesOf(startTime);
  let endMin = minutesOf(endTime);
  if (!endTime) endMin = startMin + 60;
  if (endMin <= startMin) endMin += 24 * 60;
  const rentalBlocks = occupancyForDate(source, facility, date).filter(
    (block) => block.share === 'full' || block.share === 'half',
  );
  const occ = occupancyForRange(rentalBlocks, startMin, endMin);
  if (occ.full || occ.halfCount > 0) {
    return {
      ok: false,
      reason: `Υπάρχει κράτηση στο γήπεδο στις ${date} αυτή την ώρα${occ.reason ? ` (${occ.reason})` : ''}.`,
    };
  }
  return { ok: true };
}

export function weeklySlotConflictsWithRentals(
  source: RentalOccupancySource,
  location: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
): { ok: true } | { ok: false; reason: string } {
  const facility = facilityByLocation(source, location);
  if (!facility || !startTime) return { ok: true };
  const startMin = minutesOf(startTime);
  let endMin = minutesOf(endTime);
  if (!endTime) endMin = startMin + 60;
  if (endMin <= startMin) endMin += 24 * 60;
  for (const booking of source.rentalBookings ?? []) {
    if (booking.status === 'cancelled') continue;
    if (booking.facilityId !== facility.id && !sameLocation(booking.facilityName, facility.name)) {
      continue;
    }
    if (weekdayOfIsoDate(booking.date) !== dayOfWeek) continue;
    const bookingStart = minutesOf(booking.startTime);
    let bookingEnd = minutesOf(booking.endTime);
    if (bookingEnd <= bookingStart) bookingEnd += 24 * 60;
    if (!overlaps(startMin, endMin, bookingStart, bookingEnd)) continue;
    return {
      ok: false,
      reason: `Υπάρχει κράτηση στις ${booking.date} (${booking.startTime}–${booking.endTime}).`,
    };
  }
  return { ok: true };
}

export function slotIsFree(
  source: RentalOccupancySource,
  facility: Facility,
  date: string,
  startTime: string,
  endTime: string,
  courtShare: RentalCourtShare = 'full',
): { ok: true } | { ok: false; reason: string } {
  const settings = source.rentalSettings ?? emptyRentalSettings();
  const rule = ruleForFacility(settings, facility.id, facility);
  if (!rule.enabled) return { ok: false, reason: 'Το γήπεδο δεν είναι διαθέσιμο για ενοικίαση.' };
  const day = weekdayOfIsoDate(date);
  const startMin = minutesOf(startTime);
  let endMin = minutesOf(endTime);
  if (endMin <= startMin) endMin += 24 * 60;
  const inWindow = rule.windows.some((window) => {
    if (!window.days.includes(day)) return false;
    const winStart = minutesOf(window.startTime);
    const winEnd = windowEndMinutes(winStart, window.endTime);
    return startMin >= winStart && endMin <= winEnd;
  });
  if (!inWindow) return { ok: false, reason: 'Η ώρα είναι εκτός δηλωμένου ωραρίου ενοικίασης.' };
  const occ = occupancyForRange(occupancyForDate(source, facility, date), startMin, endMin);
  if (occ.blocked || occ.full) {
    return { ok: false, reason: `Η ώρα δεν είναι διαθέσιμη (${occ.reason}).` };
  }
  if (courtShare === 'full' && occ.halfCount > 0) {
    return { ok: false, reason: 'Η ώρα έχει ήδη μισό γήπεδο κρατημένο.' };
  }
  if (courtShare === 'half' && occ.halfCount >= 2) {
    return { ok: false, reason: 'Τα δύο μισά του γηπέδου είναι ήδη κρατημένα.' };
  }
  return { ok: true };
}

export function bookingAmount(
  rule: FacilityRentalRule,
  startTime: string,
  endTime: string,
  courtShare: RentalCourtShare = 'full',
): number {
  const normalized = normalizeRentalRule(rule);
  const startMin = minutesOf(startTime);
  let endMin = minutesOf(endTime);
  if (endMin <= startMin) endMin += 24 * 60;
  const hours = (endMin - startMin) / 60;
  const rate = courtShare === 'half' ? normalized.hourlyRateHalf : normalized.hourlyRateFull;
  return Math.round(Math.max(0, hours) * rate * 100) / 100;
}

export function courtShareLabel(share: RentalCourtShare | undefined): string {
  return share === 'half' ? 'Μισό γήπεδο' : 'Ολόκληρο γήπεδο';
}

export function lockerRoomFeeAmount(
  rule: FacilityRentalRule | null | undefined,
  useLockerRoom: boolean,
): number {
  if (!useLockerRoom) return 0;
  const fee = Number(rule?.lockerRoomFee) || 0;
  return fee > 0 ? Math.round(fee * 100) / 100 : 0;
}

export function bookingTotalAmount(
  rule: FacilityRentalRule,
  startTime: string,
  endTime: string,
  courtShare: RentalCourtShare = 'full',
  useLockerRoom = false,
): number {
  const base = bookingAmount(rule, startTime, endTime, courtShare);
  return Math.round((base + lockerRoomFeeAmount(rule, useLockerRoom)) * 100) / 100;
}
