import nodemailer from 'nodemailer';
import { buildRentalBookingEmail } from '../src/utils/rentalBookingEmail.js';
import {
  allowRateLimit,
  assertSyncAuthorized,
  getSyncAuthContext,
  isDurableStoreEnabled,
  loadAccountBundle,
  loadMirror,
  loadPublicClubBySlug,
  loadClubNotifyConfig,
  requestAddress,
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

async function clubVivaReady(clubId: string): Promise<{
  ready: boolean;
  clientId?: string;
  clientSecret?: string;
  sourceCode?: string;
  environment?: 'demo' | 'live';
}> {
  const bundle = await loadAccountBundle();
  const raw = (bundle?.clubs ?? []).find(
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

async function emailRentalBooking(clubId: string, clubName: string, booking: RentalBooking, extraTo?: string) {
  const notify = await loadClubNotifyConfig(clubId);
  if (!notify?.smtp?.enabled || !notify.smtp.host || !notify.smtp.username || !notify.smtp.password) {
    return;
  }
  const mail = buildRentalBookingEmail({ clubName, booking });
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
    const mirror = await loadMirror(clubId);
    const prev = asSource(mirror?.payload) as RentalOccupancySource & Record<string, unknown>;
    const next = {
      ...prev,
      facilities: occupancy.facilities ?? prev.facilities,
      schedule: occupancy.schedule ?? prev.schedule,
      trainings: occupancy.trainings ?? prev.trainings,
      matches: occupancy.matches ?? prev.matches,
      rentalSettings: occupancy.rentalSettings ?? prev.rentalSettings,
      rentalBookings: occupancy.rentalBookings ?? prev.rentalBookings,
    };
    await saveMirror(clubId, next);
    return res.status(200).json({ ok: true, durable: isDurableStoreEnabled() });
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
    const mirror = await loadMirror(club.clubId);
    const payload = asSource(mirror?.payload) as RentalOccupancySource & Record<string, unknown>;
    const list = Array.isArray(payload.rentalBookings) ? payload.rentalBookings : [];
    const index = list.findIndex((item) => item.id === bookingId);
    if (index < 0) return res.status(404).json({ ok: false, error: 'Η κράτηση δεν βρέθηκε.' });
    const current = list[index]!;
    if (current.status === 'cancelled') {
      return res.status(409).json({ ok: false, error: 'Η κράτηση έχει ακυρωθεί.' });
    }
    if (current.status === 'confirmed') {
      return res.status(200).json({ ok: true, bookingId: current.id, paid: true });
    }
    if (current.paymentRef) {
      try {
        await consumeSettlement(current.paymentRef);
      } catch {
        /* webhook μπορεί να μην έχει φτάσει ακόμα */
      }
    }
    const confirmed: RentalBooking = {
      ...current,
      status: 'confirmed',
      paymentProvider: current.paymentProvider ?? 'viva',
    };
    list[index] = confirmed;
    payload.rentalBookings = list;
    await saveMirror(club.clubId, payload);
    await emailRentalBooking(club.clubId, club.name, confirmed, confirmed.customerEmail);
    return res.status(200).json({ ok: true, bookingId: confirmed.id, paid: true });
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
      const checkout = await createVivaCheckoutUrl({
        clientId: viva.clientId,
        clientSecret: viva.clientSecret,
        sourceCode: viva.sourceCode,
        environment: viva.environment ?? 'demo',
        amountCents: Math.round(amount * 100),
        merchantTrns: `Ενοικίαση ${booking.id}`,
        email: customerEmail,
        fullName: customerName,
      });
      booking.paymentRef = checkout.orderCode;
      const list = Array.isArray(payload.rentalBookings) ? payload.rentalBookings : [];
      payload.rentalBookings = [booking, ...list];
      await saveMirror(club.clubId, payload);
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

  const list = Array.isArray(payload.rentalBookings) ? payload.rentalBookings : [];
  payload.rentalBookings = [booking, ...list];
  await saveMirror(club.clubId, payload);
  await emailRentalBooking(club.clubId, club.name, booking, customerEmail);
  return res.status(200).json({ ok: true, bookingId: booking.id });
}
