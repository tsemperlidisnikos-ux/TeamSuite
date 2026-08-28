import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';
import {
  appendPendingApplication,
  allowRateLimit,
  assertSyncAuthorized,
  getSyncAuthContext,
  isDurableStoreEnabled,
  listPendingApplications,
  loadClubNotifyConfig,
  loadMirror,
  loadPublicClubBySlug,
  requestAddress,
  saveMirror,
  type RemoteRegistrationApplication,
} from './lib/serverStore.js';

type Body = {
  slug?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  gender?: string;
  guardianName?: string;
  guardianPhone?: string;
  email?: string;
  classId?: string | null;
  kind?: 'full' | 'trial' | 'waitlist';
  notes?: string;
  acceptedTerms?: boolean;
  amka?: string;
  phone?: string;
  athleteEmail?: string;
  fatherFirstName?: string;
  motherFirstName?: string;
  fatherEmail?: string;
  motherEmail?: string;
  motherPhone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  county?: string;
  sport?: string;
  uniformSize?: string;
  gdprItems?: {
    personalData?: boolean;
    photoUse?: boolean;
    gallery?: boolean;
    communication?: boolean;
    medical?: boolean;
    amkaHealthCard?: boolean;
  };
  amkaConsentAt?: string;
  guardianSignature?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // Staff pull of remote pending applications
    if (!assertSyncAuthorized(req, res)) return;
    const clubId = String(req.query.clubId ?? '').trim();
    if (!clubId) {
      return res.status(400).json({ ok: false, error: 'clubId required' });
    }
    const auth = getSyncAuthContext(req);
    if (!auth.viaSecret && auth.claims?.role !== 'platform_admin' && auth.claims?.clubId !== clubId) {
      return res.status(403).json({ ok: false, error: 'Forbidden: club mismatch' });
    }
    const applications = await listPendingApplications(clubId);
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      applications,
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!(await allowRateLimit(`public-join:${requestAddress(req)}`, 10, 300))) {
    return res.status(429).json({ ok: false, error: 'Πολλά αιτήματα εγγραφής. Δοκιμάστε ξανά αργότερα.' });
  }

  const body = (req.body ?? {}) as Body;
  const slug = String(body.slug ?? '').trim().toLowerCase();
  if (!slug) return res.status(400).json({ ok: false, error: 'slug required' });
  if (!body.acceptedTerms) {
    return res.status(400).json({ ok: false, error: 'Πρέπει να αποδεχτείτε τη συγκατάθεση επεξεργασίας προσωπικών δεδομένων.' });
  }
  if (!String(body.guardianSignature ?? '').trim()) {
    return res.status(400).json({ ok: false, error: 'Απαιτείται υπογραφή γονέα ή κηδεμόνα.' });
  }

  const club = await loadPublicClubBySlug(slug);
  if (!club || !club.enabled) {
    return res.status(404).json({
      ok: false,
      error: 'Ο σύνδεσμος δεν βρέθηκε ή η δημόσια εγγραφή δεν είναι ενεργή.',
    });
  }

  const firstName = String(body.firstName ?? '').trim();
  const lastName = String(body.lastName ?? '').trim();
  const guardianName = String(body.guardianName ?? '').trim();
  const guardianPhone = String(body.guardianPhone ?? '').trim();
  const email = String(body.email ?? '').trim();
  const notes = String(body.notes ?? '').trim();
  const birthDate = String(body.birthDate ?? '').trim();
  const gender = String(body.gender ?? '');
  const amka = String(body.amka ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  const athleteEmail = String(body.athleteEmail ?? '').trim();
  const fatherFirstName = String(body.fatherFirstName ?? '').trim();
  const motherFirstName = String(body.motherFirstName ?? '').trim();
  const fatherEmail = String(body.fatherEmail ?? '').trim();
  const motherEmail = String(body.motherEmail ?? '').trim();
  const motherPhone = String(body.motherPhone ?? '').trim();
  const address = String(body.address ?? '').trim();
  const postalCode = String(body.postalCode ?? '').trim();
  const city = String(body.city ?? '').trim();
  const county = String(body.county ?? '').trim();
  const sport = String(body.sport ?? '').trim();
  const uniformSize = String(body.uniformSize ?? '').trim();
  const guardianSignature = String(body.guardianSignature ?? '').trim();
  const amkaConsentAt = String(body.amkaConsentAt ?? '').trim();
  const gdprItems = {
    personalData: Boolean(body.gdprItems?.personalData ?? body.acceptedTerms),
    photoUse: Boolean(body.gdprItems?.photoUse ?? body.acceptedTerms),
    gallery: Boolean(body.gdprItems?.gallery ?? body.acceptedTerms),
    communication: Boolean(body.gdprItems?.communication ?? body.acceptedTerms),
    medical: Boolean(body.gdprItems?.medical ?? body.acceptedTerms),
    amkaHealthCard: Boolean(body.gdprItems?.amkaHealthCard ?? Boolean(amkaConsentAt)),
  };
  if (!gdprItems.amkaHealthCard) {
    return res.status(400).json({ ok: false, error: 'Απαιτείται ρητή συγκατάθεση για τη συλλογή του ΑΜΚΑ.' });
  }
  let kind = (body.kind ?? 'full') as 'full' | 'trial' | 'waitlist';
  const classId = body.classId ? String(body.classId) : null;

  const requiredError = validateRemotePublicJoinFields({
    amka,
    firstName,
    lastName,
    birthDate,
    gender,
    athleteEmail,
    phone,
    fatherFirstName,
    motherFirstName,
    fatherEmail,
    motherEmail,
    guardianPhone,
    motherPhone,
    address,
    postalCode,
    city,
    county,
    sport,
    uniformSize,
    notes,
  });
  if (requiredError) {
    return res.status(400).json({ ok: false, error: requiredError });
  }
  if (!guardianName) {
    return res.status(400).json({ ok: false, error: 'Συμπληρώστε πατρώνυμο.' });
  }
  if (kind === 'trial' && !club.allowTrial) {
    return res.status(400).json({ ok: false, error: 'Η δοκιμαστική προπόνηση δεν επιτρέπεται.' });
  }
  if (kind === 'waitlist' && !club.allowWaitlist) {
    return res.status(400).json({ ok: false, error: 'Η λίστα αναμονής δεν επιτρέπεται.' });
  }

  const mirror = await loadMirror(club.clubId);
  const payload =
    mirror?.payload && typeof mirror.payload === 'object'
      ? (mirror.payload as Record<string, unknown>)
      : null;

  if (classId && payload && Array.isArray(payload.classes) && Array.isArray(payload.students)) {
    const cls = (payload.classes as Array<{ id: string; maxStudents?: number }>).find(
      (c) => c.id === classId,
    );
    const activeCount = (
      payload.students as Array<{
        classId?: string | null;
        classIds?: string[];
        status?: string;
      }>
    ).filter((s) => {
      if (s.status === 'inactive') return false;
      const ids = [...(s.classIds ?? []), ...(s.classId ? [s.classId] : [])];
      return ids.includes(classId);
    }).length;
    const max = cls?.maxStudents ?? 0;
    if (max > 0 && activeCount >= max && club.allowWaitlist) {
      kind = 'waitlist';
    }
  }

  const shouldCreateAthlete =
    club.autoApprove && kind !== 'waitlist' && (kind === 'full' || kind === 'trial');

  const createdAt = new Date().toISOString().slice(0, 10);
  const applicationId = `rapp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let athleteId: string | null = null;

  if (shouldCreateAthlete && payload && Array.isArray(payload.students)) {
    athleteId = `stu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cls = Array.isArray(payload.classes)
      ? (payload.classes as Array<{ id: string; monthlyFee?: number; sport?: string }>).find(
          (c) => c.id === classId,
        )
      : null;
    const athlete = {
      id: athleteId,
      firstName,
      lastName,
      email: athleteEmail || fatherEmail || email,
      phone,
      birthDate,
      guardianName,
      guardianPhone,
      classId,
      classIds: classId ? [classId] : [],
      status: kind === 'trial' ? 'trial' : 'active',
      monthlyFee: cls?.monthlyFee ?? 0,
      enrolledAt: createdAt,
      gender,
      clubName: club.name,
      sport: sport || (cls?.sport ?? ''),
      sports: sport ? [sport] : [],
      healthCard: false,
      comments: notes || 'Δημόσια εγγραφή',
      gdprConsent:
        gdprItems.personalData &&
        gdprItems.photoUse &&
        gdprItems.gallery &&
        gdprItems.communication
          ? 'full'
          : 'pending',
      gdprItems,
      amka,
      amkaConsentAt: amkaConsentAt || (amka ? createdAt : ''),
      fatherFirstName,
      motherFirstName,
      fatherEmail,
      motherEmail,
      motherPhone,
      address,
      postalCode,
      city,
      county,
      uniformSize,
    };
    payload.students = [athlete, ...(payload.students as unknown[])];
  }

  const application: RemoteRegistrationApplication = {
    id: applicationId,
    firstName,
    lastName,
    birthDate,
    gender,
    guardianName,
    guardianPhone,
    email,
    classId,
    kind,
    status: shouldCreateAthlete ? 'approved' : 'pending',
    notes,
    createdAt,
    athleteId,
    amka,
    phone,
    athleteEmail,
    fatherFirstName,
    motherFirstName,
    fatherEmail,
    motherEmail,
    motherPhone,
    address,
    postalCode,
    city,
    county,
    sport,
    uniformSize,
    gdprItems,
    amkaConsentAt: amkaConsentAt || (amka ? createdAt : ''),
    guardianSignature,
  };

  await appendPendingApplication(club.clubId, application);

  if (payload) {
    const apps = Array.isArray(payload.registrationApplications)
      ? (payload.registrationApplications as RemoteRegistrationApplication[])
      : [];
    payload.registrationApplications = [application, ...apps.filter((a) => a.id !== application.id)];
    await saveMirror(club.clubId, payload);
  }

  const notify = await loadClubNotifyConfig(club.clubId);
  let clubEmailSent = false;
  let guardianEmailSent = false;

  if (notify?.smtp?.enabled && notify.smtp.host && notify.smtp.username && notify.smtp.password) {
    const kindLabel =
      kind === 'trial' ? 'Δοκιμαστική' : kind === 'waitlist' ? 'Λίστα αναμονής' : 'Πλήρης εγγραφή';
    const clubTo = (notify.notifyEmail || notify.smtp.username || '').trim();
    if (clubTo.includes('@')) {
      clubEmailSent = await sendMail(notify.smtp, {
        to: clubTo,
        subject: `Νέα αίτηση εγγραφής · ${lastName} ${firstName}`,
        text: [
          `Νέα αίτηση δημόσιας εγγραφής στον σύλλογο ${club.name}.`,
          '',
          `Αθλητής: ${lastName} ${firstName}`,
          `Τύπος: ${kindLabel}`,
          `Τηλ. κηδεμόνα: ${guardianPhone}`,
          email ? `Email: ${email}` : '',
          '',
          'Άνοιξε Αθλητές για έγκριση ή απόρριψη.',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    }

    if (email.includes('@')) {
      guardianEmailSent = await sendMail(notify.smtp, {
        to: email,
        subject: `Επιβεβαίωση αίτησης · ${club.name}`,
        text: [
          `Αγαπητέ/ή ${guardianName},`,
          '',
          `Λάβαμε την αίτηση εγγραφής για τον/την ${firstName} ${lastName} στον σύλλογο ${club.name}.`,
          shouldCreateAthlete
            ? 'Η εγγραφή καταχωρήθηκε.'
            : kind === 'waitlist'
              ? 'Η αίτηση μπήκε στη λίστα αναμονής.'
              : 'Η αίτηση εκκρεμεί έγκριση από τον σύλλογο.',
          '',
          'Ευχαριστούμε.',
          club.name,
        ].join('\n'),
      });
    }
  }

  const mode = shouldCreateAthlete ? 'athlete' : 'application';
  return res.status(200).json({
    ok: true,
    durable: isDurableStoreEnabled(),
    mode,
    kind,
    athleteId,
    clubEmailSent,
    guardianEmailSent,
    applicationId,
    message:
      mode === 'athlete'
        ? 'Η εγγραφή ολοκληρώθηκε.'
        : kind === 'waitlist'
          ? 'Η αίτηση μπήκε στη λίστα αναμονής.'
          : 'Η αίτηση υποβλήθηκε και εκκρεμεί έγκριση.',
  });
}

function validateRemotePublicJoinFields(input: {
  amka: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  athleteEmail: string;
  phone: string;
  fatherFirstName: string;
  motherFirstName: string;
  fatherEmail: string;
  motherEmail: string;
  guardianPhone: string;
  motherPhone: string;
  address: string;
  postalCode: string;
  city: string;
  county: string;
  sport: string;
  uniformSize: string;
  notes: string;
}): string | null {
  if (!input.amka.trim()) return 'Συμπληρώστε ΑΜΚΑ.';
  if (input.firstName.trim().length < 2) return 'Συμπληρώστε όνομα.';
  if (input.lastName.trim().length < 2) return 'Συμπληρώστε επώνυμο.';
  if (!input.birthDate.trim()) return 'Συμπληρώστε ημερομηνία γέννησης.';
  if (!input.gender.trim()) return 'Επιλέξτε φύλο.';
  if (!input.athleteEmail.includes('@')) return 'Συμπληρώστε email αθλητή.';
  if (!input.phone.trim()) return 'Συμπληρώστε τηλέφωνο αθλητή.';
  if (!input.fatherFirstName.trim()) return 'Συμπληρώστε πατρώνυμο.';
  if (!input.motherFirstName.trim()) return 'Συμπληρώστε μητρώνυμο.';
  if (!input.fatherEmail.includes('@')) return 'Συμπληρώστε email πατρός.';
  if (!input.motherEmail.includes('@')) return 'Συμπληρώστε email μητρός.';
  if (!input.guardianPhone.trim()) return 'Συμπληρώστε τηλέφωνο πατρός.';
  if (!input.motherPhone.trim()) return 'Συμπληρώστε τηλέφωνο μητρός.';
  if (!input.address.trim()) return 'Συμπληρώστε διεύθυνση.';
  if (!input.postalCode.trim()) return 'Συμπληρώστε Τ.Κ.';
  if (!input.city.trim()) return 'Συμπληρώστε πόλη.';
  if (!input.county.trim()) return 'Συμπληρώστε νομό.';
  if (!input.sport.trim()) return 'Επιλέξτε άθλημα.';
  if (!input.uniformSize.trim()) return 'Επιλέξτε μέγεθος στολής.';
  return null;
}

async function sendMail(
  smtp: {
    host: string;
    port: string;
    username: string;
    password: string;
    fromName: string;
  },
  message: { to: string; subject: string; text: string },
): Promise<boolean> {
  try {
    const port = Number(smtp.port) || 587;
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port,
      secure: port === 465,
      auth: { user: smtp.username, pass: smtp.password },
    });
    const fromName = (smtp.fromName || 'SPORTSUITE 360').replace(/[\r\n]/g, '');
    await transporter.sendMail({
      from: `"${fromName}" <${smtp.username}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return true;
  } catch {
    return false;
  }
}
