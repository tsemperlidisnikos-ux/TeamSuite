import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import { buildRentalBookingEmail, buildRentalReceiptEmail } from '../src/utils/rentalBookingEmail.js';
import {
  allowRateLimit,
  assertSyncAuthorized,
  getSyncAuthContext,
  isDurableStoreEnabled,
  loadAccountBundle,
  loadMirror,
  loadPublicClubBySlug,
  loadClubNotifyConfig,
  mergeOpsSliceIntoPayload,
  requestAddress,
  saveMirrorWithRetry,
  saveMirror,
  assertClubTenantAccess,
  consumeSettlement,
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
import { clubMatchesPublicSlug } from '../src/utils/publicClubSlug.js';

function clubsFromBundle(bundle: { clubs?: unknown } | null | undefined): unknown[] {
  return Array.isArray(bundle?.clubs) ? bundle.clubs : [];
}

function requestPublicOrigin(req: VercelRequest, bodyOrigin?: string): string {
  const fromBody = String(bodyOrigin ?? '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(fromBody)) return fromBody;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0]!.trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'teamsuite-seven.vercel.app')
    .split(',')[0]!
    .trim();
  return `${proto}://${host}`;
}

function asSource(payload: unknown): RentalOccupancySource {
  if (!payload || typeof payload !== 'object') return {};
  return payload as RentalOccupancySource;
}

function todayAthensIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
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
  const clubs = clubsFromBundle(bundle);
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
  for (const item of clubs) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const registration =
      raw.publicRegistration && typeof raw.publicRegistration === 'object'
        ? (raw.publicRegistration as Record<string, unknown>)
        : null;
    if (
      !clubMatchesPublicSlug(
        {
          id: String(raw.id ?? ''),
          name: String(raw.name ?? ''),
          publicRegistration: { slug: String(registration?.slug ?? '') },
        },
        slug,
      )
    ) {
      continue;
    }
    const id = String(raw.id ?? '').trim();
    if (!id) continue;
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

async function clubVivaReady(clubId: string): Promise<{
  ready: boolean;
  clientId?: string;
  clientSecret?: string;
  sourceCode?: string;
  environment?: 'demo' | 'live';
}> {
  const bundle = await loadAccountBundle();
  const raw = clubsFromBundle(bundle).find(
    (item) => item && typeof item === 'object' && String((item as { id?: string }).id) === clubId,
  ) as { viva?: Record<string, unknown> } | undefined;
  const viva = raw?.viva ?? {};
  const clientId = String(viva.clientId ?? '').trim();
  const clientSecret = String(viva.clientSecret ?? '').trim();
  const sourceCode = String(viva.sourceCode ?? '').trim();
  if (!viva.enabled || !clientId || !clientSecret || clientSecret === '********' || !sourceCode) {
    return { ready: false };
  }
  return {
    ready: true,
    clientId,
    clientSecret,
    sourceCode,
    environment: viva.environment === 'live' ? 'live' : 'demo',
  };
}

async function createVivaCheckoutUrl(input: {
  clientId: string;
  clientSecret: string;
  sourceCode: string;
  environment: 'demo' | 'live';
  amountCents: number;
  merchantTrns: string;
  email?: string;
  fullName?: string;
  successUrl?: string;
  failureUrl?: string;
}): Promise<{ checkoutUrl: string; orderCode: string }> {
  const hosts =
    input.environment === 'live'
      ? {
          accounts: 'https://accounts.vivapayments.com',
          api: 'https://api.vivapayments.com',
          checkout: 'https://www.vivapayments.com/web/checkout',
        }
      : {
          accounts: 'https://demo-accounts.vivapayments.com',
          api: 'https://demo-api.vivapayments.com',
          checkout: 'https://demo.vivapayments.com/web/checkout',
        };
  const basic = Buffer.from(`${input.clientId}:${input.clientSecret}`).toString('base64');
  const tokenRes = await fetch(`${hosts.accounts}/connect/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error('Αποτυχία σύνδεσης Viva');
  }
  const orderRes = await fetch(`${hosts.api}/checkout/v2/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: input.amountCents,
      customerTrns: input.merchantTrns,
      merchantTrns: input.merchantTrns,
      sourceCode: input.sourceCode,
      successUrl: input.successUrl || undefined,
      failureUrl: input.failureUrl || undefined,
      failUrl: input.failureUrl || undefined,
      customer: {
        email: input.email || undefined,
        fullName: input.fullName || undefined,
      },
    }),
  });
  const orderJson = (await orderRes.json()) as { orderCode?: number | string };
  if (!orderRes.ok || orderJson.orderCode == null) {
    throw new Error('Αποτυχία δημιουργίας πληρωμής Viva');
  }
  const orderCode = String(orderJson.orderCode);
  return { orderCode, checkoutUrl: `${hosts.checkout}?ref=${encodeURIComponent(orderCode)}` };
}

async function emailRentalBooking(
  clubId: string,
  clubName: string,
  booking: RentalBooking,
  extraTo?: string,
  kind: 'confirm' | 'receipt' = 'confirm',
) {
  const notify = await loadClubNotifyConfig(clubId);
  if (!notify?.smtp?.enabled || !notify.smtp.host || !notify.smtp.username || !notify.smtp.password) {
    return;
  }
  const mail =
    kind === 'receipt'
      ? buildRentalReceiptEmail({
          clubName,
          booking,
          paymentLabel: 'Online πληρωμή',
        })
      : buildRentalBookingEmail({ clubName, booking });
  const transporter = nodemailer.createTransport({
    host: notify.smtp.host,
    port: Number(notify.smtp.port) || 587,
    secure: Number(notify.smtp.port) === 465,
    auth: { user: notify.smtp.username, pass: notify.smtp.password },
  });
  const recipients = [extraTo, notify.notifyEmail].filter((v) => String(v ?? '').includes('@'));
  for (const to of [...new Set(recipients)]) {
    try {
      await transporter.sendMail({
        from: `"${notify.smtp.fromName || clubName}" <${notify.smtp.username}>`,
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    } catch {
      /* ignore */
    }
  }
}

type RentPayload = RentalOccupancySource & Record<string, unknown>;

class RentApplyError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

async function commitRentPayload(
  clubId: string,
  apply: (payload: RentPayload) => void,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  for (let i = 0; i < 5; i++) {
    const mirror = await loadMirror(clubId);
    const payload = {
      ...(asSource(mirror?.payload) as Record<string, unknown>),
    } as RentPayload;
    payload.rentalBookings = [...(payload.rentalBookings ?? [])];
    if (Array.isArray(payload.revenues)) {
      payload.revenues = [...(payload.revenues as unknown[])];
    }
    try {
      apply(payload);
    } catch (err) {
      if (err instanceof RentApplyError) {
        return { ok: false, error: err.message, status: err.status };
      }
      throw err;
    }
    const saved = await saveMirror(clubId, payload, {
      baseUpdatedAt: mirror?.updatedAt ?? null,
    });
    if (saved.ok !== false) return { ok: true };
  }
  return {
    ok: false,
    status: 409,
    error: 'Κάποιος άλλος ενημέρωσε τις κρατήσεις. Ξαναδοκιμάστε.',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'PUT') {
    const body = (req.body ?? {}) as {
      clubId?: string;
      occupancy?: RentalOccupancySource;
    };
    const clubId = String(body.clubId ?? '').trim();
    if (!clubId) return res.status(400).json({ ok: false, error: 'clubId required' });
    if (!(await assertClubTenantAccess(req, res, clubId))) return;
    const occupancy = body.occupancy && typeof body.occupancy === 'object' ? body.occupancy : null;
    if (!occupancy) return res.status(400).json({ ok: false, error: 'occupancy required' });
    const saved = await saveMirrorWithRetry(clubId, (prev) => {
      const merged = mergeOpsSliceIntoPayload(prev, occupancy as Record<string, unknown>);
      return {
        ...merged,
        facilities: occupancy.facilities ?? prev.facilities,
        rentalSettings: occupancy.rentalSettings ?? prev.rentalSettings,
      };
    });
    if (saved.ok === false) {
      return res.status(409).json({
        ok: false,
        conflict: true,
        error: 'Κάποιος άλλος ενημέρωσε τις κρατήσεις. Ξαναδοκιμάστε.',
      });
    }
    return res.status(200).json({ ok: true, durable: isDurableStoreEnabled(), updatedAt: saved.updatedAt });
  }

  if (req.method === 'GET') {
    const clubId = String(req.query.clubId ?? '').trim();
    if (clubId) {
      if (!(await assertSyncAuthorized(req, res))) return;
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
        payOnline: (await clubVivaReady(club.clubId)).ready,
      },
      slots,
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, PUT');
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
  if (body.confirmPayment === true || body.confirmPayment === 'true') {
    const bookingId = String(body.bookingId ?? '').trim();
    if (!slug || !bookingId) {
      return res.status(400).json({ ok: false, error: 'Λείπει κράτηση πληρωμής.' });
    }
    const club = await resolveBySlug(slug);
    if (!club) return res.status(404).json({ ok: false, error: 'Ο σύνδεσμος δεν βρέθηκε.' });
    let confirmed: RentalBooking | null = null;
    const saved = await commitRentPayload(club.clubId, (payload) => {
      const list = payload.rentalBookings ?? [];
      const index = list.findIndex((item) => item.id === bookingId);
      if (index < 0) throw new RentApplyError('Η κράτηση δεν βρέθηκε.', 404);
      const current = list[index]!;
      if (current.status === 'cancelled') {
        throw new RentApplyError('Η κράτηση έχει ακυρωθεί.');
      }
      if (current.status === 'confirmed' && current.paymentCollected !== false) {
        confirmed = current;
        return;
      }
      if (current.status !== 'pending_payment') {
        throw new RentApplyError('Η κράτηση δεν εκκρεμεί για online πληρωμή.');
      }
      confirmed = {
        ...current,
        status: 'confirmed',
        paymentProvider: current.paymentProvider ?? 'viva',
        paymentCollected: true,
        paymentMethod: 'viva',
        paidOn: todayAthensIso(),
        paidAt: new Date().toISOString(),
      };
      list[index] = confirmed;
      payload.rentalBookings = list;
      if (!Array.isArray(payload.revenues)) payload.revenues = [];
      const rentRevId = `rev_rent_${confirmed.id}`;
      const rentRev = {
        id: rentRevId,
        date: confirmed.paidOn,
        amount: Number(confirmed.amount) || 0,
        category: 'events',
        description: `Ενοικίαση ${confirmed.facilityName} (${confirmed.startTime}–${confirmed.endTime})`,
        paymentStatus: 'paid',
        subcategory: 'ΕΝΟΙΚΙΑΣΗ ΓΗΠΕΔΟΥ',
        notes: `${confirmed.customerName} · ${confirmed.customerPhone}`.trim(),
        paymentMethod: 'viva',
        linkedRentalBookingId: confirmed.id,
      };
      const revList = payload.revenues as Array<Record<string, unknown>>;
      const revIdx = revList.findIndex(
        (row) => row.id === rentRevId || row.linkedRentalBookingId === confirmed!.id,
      );
      if (revIdx >= 0) revList[revIdx] = { ...revList[revIdx], ...rentRev };
      else revList.push(rentRev);
      payload.revenues = revList;
    });
    if (saved.ok === false) {
      return res.status(saved.status).json({ ok: false, error: saved.error });
    }
    if (confirmed?.paymentRef) {
      try {
        await consumeSettlement(confirmed.paymentRef);
      } catch {
        /* webhook μπορεί να μην έχει φτάσει ακόμα */
      }
    }
    if (confirmed && confirmed.status === 'confirmed') {
      await emailRentalBooking(club.clubId, club.name, confirmed, confirmed.customerEmail, 'receipt');
    }
    return res.status(200).json({ ok: true, bookingId: confirmed?.id ?? bookingId, paid: true });
  }

  const facilityId = String(body.facilityId ?? '').trim();
  const date = String(body.date ?? '').trim();
  const startTime = String(body.startTime ?? '').trim();
  const endTime = String(body.endTime ?? '').trim();
  const courtShare = String(body.courtShare ?? 'full') === 'half' ? 'half' : 'full';
  const customerName = String(body.customerName ?? '').trim();
  const customerPhone = String(body.customerPhone ?? '').trim();
  const customerEmail = String(body.customerEmail ?? '').trim();
  const notes = String(body.notes ?? '').trim();
  const payOnline = body.payOnline === true || body.payOnline === 'true';
  const useLockerRoomRequested = body.useLockerRoom === true || body.useLockerRoom === 'true';
  if (!slug || !facilityId || !date || !startTime || !endTime) {
    return res.status(400).json({ ok: false, error: 'Συμπληρώστε γήπεδο, ημερομηνία και ώρα.' });
  }
  if (customerName.length < 2 || customerPhone.length < 6) {
    return res.status(400).json({ ok: false, error: 'Ονοματεπώνυμο και τηλέφωνο είναι υποχρεωτικά.' });
  }
  if (payOnline && !customerEmail.includes('@')) {
    return res.status(400).json({ ok: false, error: 'Για online πληρωμή απαιτείται email.' });
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
  const useLockerRoom = Boolean(useLockerRoomRequested) && Boolean(rule.lockerRoomAvailable);
  const amount =
    bookingAmount(rule, startTime, endTime, courtShare) +
    lockerRoomFeeAmount(rule, useLockerRoom);
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
    amount,
    source: 'public',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    createdByName: 'Δημόσιο link',
    paymentProvider: 'venue',
    paymentCollected: false,
  };

  if (payOnline && amount < 0.3) {
    return res.status(400).json({ ok: false, error: 'Το ποσό είναι πολύ μικρό για online πληρωμή.' });
  }

  if (payOnline && amount >= 0.3) {
    const viva = await clubVivaReady(club.clubId);
    if (!viva.ready || !viva.clientId || !viva.clientSecret || !viva.sourceCode) {
      return res.status(400).json({ ok: false, error: 'Οι online πληρωμές δεν είναι ενεργές.' });
    }
    booking.status = 'pending_payment';
    booking.paymentProvider = 'viva';
    try {
      const origin = requestPublicOrigin(req, String(body.returnOrigin ?? ''));
      const embed = body.embed === true || body.embed === 'true' || body.embed === 1;
      const returnQs = new URLSearchParams({
        pay: '1',
        s: '1',
        bid: booking.id,
        slug,
      });
      if (embed) returnQs.set('embed', '1');
      const failQs = new URLSearchParams({ pay: '0', slug });
      if (embed) failQs.set('embed', '1');
      const checkout = await createVivaCheckoutUrl({
        clientId: viva.clientId,
        clientSecret: viva.clientSecret,
        sourceCode: viva.sourceCode,
        environment: viva.environment ?? 'demo',
        amountCents: Math.round(amount * 100),
        merchantTrns: `Ενοικίαση ${booking.id}`,
        email: customerEmail,
        fullName: customerName,
        successUrl: `${origin}/rent/${encodeURIComponent(slug)}?${returnQs.toString()}`,
        failureUrl: `${origin}/rent/${encodeURIComponent(slug)}?${failQs.toString()}`,
      });
      booking.paymentRef = checkout.orderCode;
      const saved = await commitRentPayload(club.clubId, (fresh) => {
        const facilityNow = (fresh.facilities ?? []).find((f) => f.id === facilityId);
        if (!facilityNow) throw new RentApplyError('Το γήπεδο δεν βρέθηκε.', 400);
        const checkNow = slotIsFree(fresh, facilityNow, date, startTime, endTime, courtShare);
        if (checkNow.ok === false) throw new RentApplyError(checkNow.reason);
        fresh.rentalBookings = [booking, ...(fresh.rentalBookings ?? [])];
      });
      if (saved.ok === false) {
        return res.status(saved.status).json({ ok: false, error: saved.error });
      }
      return res.status(200).json({
        ok: true,
        bookingId: booking.id,
        checkoutUrl: checkout.checkoutUrl,
        pendingPayment: true,
      });
    } catch (err) {
      return res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Αποτυχία πληρωμής.',
      });
    }
  }

  const saved = await commitRentPayload(club.clubId, (fresh) => {
    const facilityNow = (fresh.facilities ?? []).find((f) => f.id === facilityId);
    if (!facilityNow) throw new RentApplyError('Το γήπεδο δεν βρέθηκε.', 400);
    const checkNow = slotIsFree(fresh, facilityNow, date, startTime, endTime, courtShare);
    if (checkNow.ok === false) throw new RentApplyError(checkNow.reason);
    fresh.rentalBookings = [booking, ...(fresh.rentalBookings ?? [])];
  });
  if (saved.ok === false) {
    return res.status(saved.status).json({ ok: false, error: saved.error });
  }
  await emailRentalBooking(club.clubId, club.name, booking, customerEmail);
  return res.status(200).json({ ok: true, bookingId: booking.id });
}
