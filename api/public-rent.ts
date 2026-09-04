import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import {
  allowRateLimit,
  assertSyncAuthorized,
  getSyncAuthContext,
  isDurableStoreEnabled,
  loadAccountBundle,
  loadMirror,
  loadPublicClubBySlug,
  requestAddress,
  saveMirror,
} from './lib/serverStore.js';
import {
  emptyRentalSettings,
  listRentalSlots,
  ruleForFacility,
  slotIsFree,
  bookingAmount,
  lockerRoomFeeAmount,
} from '../src/shared/facilityRentalAvailability.js';
import type {
  Facility,
  RentalBooking,
  RentalOccupancySource,
} from '../src/shared/facilityRentalAvailability.js';

function asSource(payload: unknown): RentalOccupancySource {
  if (!payload || typeof payload !== 'object') return {};
  return payload as RentalOccupancySource;
}

function slugOfClub(raw: Record<string, unknown>): string {
  const registration =
    raw.publicRegistration && typeof raw.publicRegistration === 'object'
      ? (raw.publicRegistration as Record<string, unknown>)
      : null;
  return String(registration?.slug ?? '')
    .trim()
    .toLowerCase();
}

async function resolveBySlug(slug: string): Promise<{
  clubId: string;
  name: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
} | null> {
  const pub = await loadPublicClubBySlug(slug);
  if (pub) {
    return {
      clubId: pub.clubId,
      name: pub.name,
      logoUrl: pub.logoUrl ?? null,
      heroImageUrl: pub.heroImageUrl ?? null,
    };
  }
  const bundle = await loadAccountBundle();
  const clubs = Array.isArray(bundle?.clubs) ? bundle!.clubs : [];
  for (const item of clubs) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    if (slugOfClub(raw) !== slug) continue;
    const id = String(raw.id ?? '').trim();
    if (!id) continue;
    const registration =
      raw.publicRegistration && typeof raw.publicRegistration === 'object'
        ? (raw.publicRegistration as Record<string, unknown>)
        : null;
    return {
      clubId: id,
      name: String(raw.name ?? ''),
      logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
      heroImageUrl: typeof registration?.heroImageUrl === 'string' ? registration.heroImageUrl : null,
    };
  }
  return null;
}

function rentableFacilities(source: RentalOccupancySource): Facility[] {
  const settings = source.rentalSettings ?? emptyRentalSettings();
  return (source.facilities ?? []).filter((facility) => {
    if (!facility?.active) return false;
    return ruleForFacility(settings, facility.id, facility).enabled;
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const clubId = String(req.query.clubId ?? '').trim();
    if (clubId) {
      if (!assertSyncAuthorized(req, res)) return;
      const auth = getSyncAuthContext(req);
      if (
        !auth.viaSecret &&
        auth.claims?.role !== 'platform_admin' &&
        auth.claims?.clubId !== clubId
      ) {
        return res.status(403).json({ ok: false, error: 'Forbidden: club mismatch' });
      }
      const mirror = await loadMirror(clubId);
      const source = asSource(mirror?.payload);
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        bookings: (source.rentalBookings ?? []).filter((b) => b.status !== 'cancelled'),
      });
    }

    const slug = String(req.query.slug ?? '').trim().toLowerCase();
    if (!slug) return res.status(400).json({ ok: false, error: 'slug required' });
    const club = await resolveBySlug(slug);
    if (!club) {
      return res.status(404).json({ ok: false, error: 'Ο σύνδεσμος δεν βρέθηκε.' });
    }
    const mirror = await loadMirror(club.clubId);
    const source = asSource(mirror?.payload);
    const settings = source.rentalSettings ?? emptyRentalSettings();
    if (!settings.publicEnabled) {
      return res.status(200).json({
        ok: true,
        club: {
          clubId: club.clubId,
          slug,
          name: club.name,
          logoUrl: club.logoUrl,
          heroImageUrl: settings.heroImageUrl || club.heroImageUrl || club.logoUrl,
          notes: settings.notes,
          publicEnabled: false,
          photoLook: 'g',
          facilities: [],
        },
      });
    }
    const facilities = rentableFacilities(source);
    const date = String(req.query.date ?? '').trim();
    const facilityId = String(req.query.facilityId ?? '').trim();
    const facility = facilities.find((f) => f.id === facilityId) ?? facilities[0];
    const courtShare = String(req.query.courtShare ?? 'full') === 'half' ? 'half' : 'full';
    const slots =
      date && facility ? listRentalSlots(source, facility, date, courtShare) : [];
    const prices = facilities.map((item) => {
      const rule = ruleForFacility(settings, item.id, item);
      return {
        facilityId: item.id,
        hourlyRateFull: rule.hourlyRateFull,
        hourlyRateHalf: rule.hourlyRateHalf,
        lockerRoomAvailable: Boolean(rule.lockerRoomAvailable),
        lockerRoomFee: Number(rule.lockerRoomFee) || 0,
      };
    });
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      club: {
        clubId: club.clubId,
        slug,
        name: club.name,
        logoUrl: club.logoUrl,
        heroImageUrl: settings.heroImageUrl || club.heroImageUrl || club.logoUrl,
        notes: settings.notes,
        publicEnabled: true,
        photoLook: 'g',
        facilities: facilities.map((item) => ({
          id: item.id,
          name: item.name,
          active: item.active,
          sports: item.sports,
          timeLayout: item.timeLayout,
          sortOrder: item.sortOrder,
          photoUrl: item.photoUrl ?? null,
        })),
        prices,
      },
      slots,
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!(await allowRateLimit(`public-rent:${requestAddress(req)}`, 12, 300))) {
    return res.status(429).json({
      ok: false,
      error: 'Πολλά αιτήματα. Δοκιμάστε ξανά αργότερα.',
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const slug = String(body.slug ?? '').trim().toLowerCase();
  const facilityId = String(body.facilityId ?? '').trim();
  const date = String(body.date ?? '').trim();
  const startTime = String(body.startTime ?? '').trim();
  const endTime = String(body.endTime ?? '').trim();
  const courtShare = String(body.courtShare ?? 'full') === 'half' ? 'half' : 'full';
  const customerName = String(body.customerName ?? '').trim();
  const customerPhone = String(body.customerPhone ?? '').trim();
  const customerEmail = String(body.customerEmail ?? '').trim();
  const notes = String(body.notes ?? '').trim();
  const useLockerRoomRequested = body.useLockerRoom === true || body.useLockerRoom === 'true';
  if (!slug || !facilityId || !date || !startTime || !endTime) {
    return res.status(400).json({ ok: false, error: 'Συμπληρώστε γήπεδο, ημερομηνία και ώρα.' });
  }
  if (customerName.length < 2 || customerPhone.length < 6) {
    return res.status(400).json({ ok: false, error: 'Ονοματεπώνυμο και τηλέφωνο είναι υποχρεωτικά.' });
  }

  const club = await resolveBySlug(slug);
  if (!club) return res.status(404).json({ ok: false, error: 'Ο σύνδεσμος δεν βρέθηκε.' });
  const mirror = await loadMirror(club.clubId);
  const payload = asSource(mirror?.payload) as RentalOccupancySource & Record<string, unknown>;
  const settings = payload.rentalSettings ?? emptyRentalSettings();
  if (!settings.publicEnabled) {
    return res.status(403).json({ ok: false, error: 'Η δημόσια ενοικίαση δεν είναι ενεργή.' });
  }
  const facility = (payload.facilities ?? []).find((f) => f.id === facilityId);
  if (!facility) return res.status(400).json({ ok: false, error: 'Το γήπεδο δεν βρέθηκε.' });
  const check = slotIsFree(payload, facility, date, startTime, endTime, courtShare);
  if (check.ok === false) {
    return res.status(409).json({ ok: false, error: check.reason });
  }
  const rule = ruleForFacility(settings, facility.id, facility);
  const useLockerRoom = Boolean(useLockerRoomRequested);
  const booking: RentalBooking = {
    id: `rent_${randomBytes(6).toString('hex')}`,
    facilityId: facility.id,
    facilityName: facility.name,
    date,
    startTime,
    endTime,
    courtShare,
    useLockerRoom,
    customerName,
    customerPhone,
    customerEmail,
    notes,
    amount:
      bookingAmount(rule, startTime, endTime, courtShare) +
      lockerRoomFeeAmount(rule, useLockerRoom),
    source: 'public',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    createdByName: 'Δημόσιο link',
  };
  const list = Array.isArray(payload.rentalBookings) ? payload.rentalBookings : [];
  payload.rentalBookings = [booking, ...list];
  await saveMirror(club.clubId, payload);
  return res.status(200).json({ ok: true, bookingId: booking.id });
}
