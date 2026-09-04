import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  appendGdprConsentLog,
  assertClubTenantAccess,
  assertSyncAuthorized,
  getDurableStoreBackend,
  getSyncAuthContext,
  isDurableStoreEnabled,
  accountBundleExists,
  loadAccountBundleRaw,
  listMirrorKeys,
  loadMirror,
  saveMirror,
  snapshotAllMirrors,
  diagnoseDurableStorage,
} from './lib/serverStore.js';
import { uploadClubMirrorsToGoogleDrive } from './lib/googleDriveBackup.js';

/**
 * Unified GDPR API (Hobby plan: one serverless function).
 * op=data|consent|correct|retention
 *
 * GET    /api/gdpr?op=data&clubId=&athleteId=|&email=
 * DELETE /api/gdpr?op=data  body { clubId, athleteId?, email? }
 * POST   /api/gdpr?op=consent | body.kind=cookie|athlete
 * POST   /api/gdpr?op=correct body { clubId, athleteId, patch }
 * GET/POST /api/gdpr?op=retention  (CRON_SECRET)
 */

type MirrorPayload = {
  students?: Array<Record<string, unknown>>;
  transactions?: Array<Record<string, unknown>>;
  attendance?: Array<Record<string, unknown>>;
  parentLinks?: Array<Record<string, unknown>>;
  progressReports?: Array<Record<string, unknown>>;
  photos?: Array<Record<string, unknown>>;
  amkaAccessLogs?: Array<{ at?: string }>;
  gdprAuditLogs?: Array<Record<string, unknown>>;
  dataRetentionMonths?: number;
};

function clientIp(req: VercelRequest): string {
  const xf = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  return xf || String(req.headers['x-real-ip'] ?? '') || '';
}

function resolveOp(req: VercelRequest): string {
  const q = String(req.query.op ?? req.query.action ?? '').trim().toLowerCase();
  if (q) return q;
  const body = (req.body ?? {}) as { op?: string; kind?: string };
  if (body.op) return String(body.op).trim().toLowerCase();
  if (body.kind === 'cookie' || body.kind === 'athlete' || body.kind === 'revoke') {
    return 'consent';
  }
  if (req.method === 'GET' || req.method === 'DELETE') return 'data';
  return 'consent';
}

function matchStudent(
  student: Record<string, unknown>,
  athleteId?: string,
  email?: string,
): boolean {
  if (athleteId && String(student.id) === athleteId) return true;
  const want = (email || '').trim().toLowerCase();
  if (!want) return false;
  const fields = [student.email, student.fatherEmail, student.motherEmail];
  return fields.some((v) => String(v ?? '').trim().toLowerCase() === want);
}

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

async function handleData(req: VercelRequest, res: VercelResponse) {
  const clubId = String(
    req.method === 'GET' ? req.query.clubId ?? '' : (req.body as { clubId?: string })?.clubId ?? '',
  ).trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'clubId required' });
  if (!(await assertClubTenantAccess(req, res, clubId))) return;

  const athleteId = String(
    req.method === 'GET'
      ? req.query.athleteId ?? ''
      : (req.body as { athleteId?: string })?.athleteId ?? '',
  ).trim();
  const email = String(
    req.method === 'GET'
      ? req.query.email ?? ''
      : (req.body as { email?: string })?.email ?? '',
  ).trim();
  if (!athleteId && !email) {
    return res.status(400).json({ ok: false, error: 'athleteId or email required' });
  }

  const mirror = await loadMirror(clubId);
  if (!mirror) return res.status(404).json({ ok: false, error: 'No mirror for club' });
  const payload = (mirror.payload ?? {}) as MirrorPayload;
  const students = Array.isArray(payload.students) ? payload.students : [];
  const matched = students.filter((s) =>
    matchStudent(s, athleteId || undefined, email || undefined),
  );

  if (req.method === 'GET') {
    if (!matched.length) return res.status(404).json({ ok: false, error: 'Subject not found' });
    const ids = new Set(matched.map((s) => String(s.id)));
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      exportedAt: new Date().toISOString(),
      students: matched,
      transactions: (payload.transactions ?? []).filter((t) => ids.has(String(t.athleteId))),
      attendance: (payload.attendance ?? []).filter((a) => ids.has(String(a.studentId))),
      parentLinks: (payload.parentLinks ?? []).filter((l) => ids.has(String(l.athleteId))),
      progressReports: (payload.progressReports ?? []).filter((r) =>
        ids.has(String(r.athleteId)),
      ),
      photos: (payload.photos ?? []).filter((p) => {
        const athleteIds = p.athleteIds;
        return Array.isArray(athleteIds) && athleteIds.some((id) => ids.has(String(id)));
      }),
    });
  }

  if (req.method === 'DELETE') {
    if (!matched.length) return res.status(404).json({ ok: false, error: 'Subject not found' });
    const erasedIds = new Set(matched.map((s) => String(s.id)));
    for (const student of matched) {
      student.firstName = 'Διαγραμμένο';
      student.lastName = 'Υποκείμενο';
      student.email = '';
      student.fatherEmail = '';
      student.motherEmail = '';
      student.phone = '';
      student.guardianPhone = '';
      student.amka = '';
      student.allergies = '';
      student.chronicConditions = '';
      student.medication = '';
      student.bloodType = '';
      student.doctorName = '';
      student.doctorPhone = '';
      student.photoUrl = null;
      student.status = 'inactive';
      student.gdprConsent = 'locked';
      student.gdprItems = {
        personalData: false,
        photoUse: false,
        gallery: false,
        communication: false,
        medical: false,
        amkaHealthCard: false,
      };
    }
    payload.photos = (payload.photos ?? []).filter((p) => {
      const athleteIds = p.athleteIds;
      if (!Array.isArray(athleteIds)) return true;
      return !athleteIds.some((id) => erasedIds.has(String(id)));
    });
    if (!Array.isArray(payload.gdprAuditLogs)) payload.gdprAuditLogs = [];
    payload.gdprAuditLogs.unshift({
      id: `gdpr_${Date.now()}`,
      at: new Date().toISOString(),
      action: 'erase',
      subjectAthleteId: athleteId || undefined,
      subjectEmail: email || undefined,
      ip: clientIp(req),
      detail: `Cloud erase ${erasedIds.size}`,
    });
    const result = await saveMirror(clubId, payload, { baseUpdatedAt: mirror.updatedAt });
    if (!result.ok) {
      return res.status(409).json({ ok: false, conflict: true, error: 'Mirror conflict' });
    }
    return res.status(200).json({
      ok: true,
      erased: erasedIds.size,
      durable: isDurableStoreEnabled(),
      updatedAt: result.updatedAt,
    });
  }

  res.setHeader('Allow', 'GET, DELETE');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

async function handleConsent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const kind = String(body.kind ?? 'athlete');
  const revoke =
    String(req.query.revoke ?? '') === '1' ||
    body.revoke === true ||
    kind === 'revoke';

  if (kind === 'cookie') {
    await appendGdprConsentLog({
      at: new Date().toISOString(),
      kind: 'cookie',
      clubId: body.clubId ? String(body.clubId) : null,
      userId: body.userId ? String(body.userId) : null,
      email: body.email ? String(body.email) : null,
      consent: body.consent ?? null,
      ip: clientIp(req),
    });
    return res.status(200).json({ ok: true, logged: true, durable: isDurableStoreEnabled() });
  }

  if (!(await assertSyncAuthorized(req, res))) return;

  const clubId = String(body.clubId ?? '').trim();
  const ctx = getSyncAuthContext(req);
  if (
    clubId &&
    ctx.claims?.clubId &&
    ctx.claims.clubId !== clubId &&
    ctx.claims.role !== 'platform_admin' &&
    !ctx.viaSecret
  ) {
    return res.status(403).json({ ok: false, error: 'Forbidden: club mismatch' });
  }
  if (!clubId) return res.status(400).json({ ok: false, error: 'clubId required' });

  const athleteId = String(body.athleteId ?? '').trim();
  if (!athleteId) return res.status(400).json({ ok: false, error: 'athleteId required' });

  const mirror = await loadMirror(clubId);
  if (!mirror) return res.status(404).json({ ok: false, error: 'No mirror for club' });
  const payload = (mirror.payload ?? {}) as MirrorPayload;
  const student = (payload.students ?? []).find((s) => String(s.id) === athleteId);
  if (!student) return res.status(404).json({ ok: false, error: 'Athlete not found' });

  if (revoke) {
    student.gdprItems = {
      personalData: false,
      photoUse: false,
      gallery: false,
      communication: false,
      medical: false,
      amkaHealthCard: false,
    };
    student.gdprConsent = 'locked';
  } else {
    const items = (body.items ?? {}) as Record<string, unknown>;
    student.gdprItems = {
      personalData: Boolean(items.personalData),
      photoUse: Boolean(items.photoUse),
      gallery: Boolean(items.gallery),
      communication: Boolean(items.communication),
      medical: Boolean(items.medical),
      amkaHealthCard: Boolean(items.amkaHealthCard),
    };
    student.gdprConsent = 'pending';
  }

  if (!Array.isArray(payload.gdprAuditLogs)) payload.gdprAuditLogs = [];
  payload.gdprAuditLogs.unshift({
    id: `gdpr_${Date.now()}`,
    at: new Date().toISOString(),
    action: revoke ? 'consent_revoke' : 'consent',
    subjectAthleteId: athleteId,
    ip: clientIp(req),
  });

  const result = await saveMirror(clubId, payload, { baseUpdatedAt: mirror.updatedAt });
  if (!result.ok) {
    return res.status(409).json({ ok: false, conflict: true, error: 'Mirror conflict' });
  }

  await appendGdprConsentLog({
    at: new Date().toISOString(),
    kind: revoke ? 'revoke' : 'athlete',
    clubId,
    athleteId,
    ip: clientIp(req),
    consent: student.gdprItems ?? null,
  });

  return res.status(200).json({
    ok: true,
    revoked: revoke,
    durable: isDurableStoreEnabled(),
    updatedAt: result.updatedAt,
  });
}

const ALLOWED_CORRECT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'address',
  'city',
  'postalCode',
  'fatherEmail',
  'motherEmail',
  'guardianPhone',
  'motherPhone',
] as const;

async function handleCorrect(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!(await assertSyncAuthorized(req, res))) return;

  const body = (req.body ?? {}) as {
    clubId?: string;
    athleteId?: string;
    patch?: Record<string, unknown>;
  };
  const clubId = String(body.clubId ?? '').trim();
  const athleteId = String(body.athleteId ?? '').trim();
  if (!clubId || !athleteId) {
    return res.status(400).json({ ok: false, error: 'clubId and athleteId required' });
  }

  const ctx = getSyncAuthContext(req);
  if (
    ctx.claims?.clubId &&
    ctx.claims.clubId !== clubId &&
    ctx.claims.role !== 'platform_admin' &&
    !ctx.viaSecret
  ) {
    return res.status(403).json({ ok: false, error: 'Forbidden: club mismatch' });
  }

  const mirror = await loadMirror(clubId);
  if (!mirror) return res.status(404).json({ ok: false, error: 'No mirror for club' });
  const payload = (mirror.payload ?? {}) as MirrorPayload;
  const student = (payload.students ?? []).find((s) => String(s.id) === athleteId);
  if (!student) return res.status(404).json({ ok: false, error: 'Athlete not found' });

  const patch = body.patch ?? {};
  const applied: string[] = [];
  for (const key of ALLOWED_CORRECT_FIELDS) {
    if (patch[key] === undefined) continue;
    student[key] = String(patch[key] ?? '');
    applied.push(key);
  }
  if (!applied.length) {
    return res.status(400).json({ ok: false, error: 'No allowed fields in patch' });
  }

  if (!Array.isArray(payload.gdprAuditLogs)) payload.gdprAuditLogs = [];
  payload.gdprAuditLogs.unshift({
    id: `gdpr_${Date.now()}`,
    at: new Date().toISOString(),
    action: 'correct',
    subjectAthleteId: athleteId,
    detail: applied.join(','),
  });

  const result = await saveMirror(clubId, payload, { baseUpdatedAt: mirror.updatedAt });
  if (!result.ok) {
    return res.status(409).json({ ok: false, conflict: true, error: 'Mirror conflict' });
  }
  return res.status(200).json({
    ok: true,
    applied,
    durable: isDurableStoreEnabled(),
    updatedAt: result.updatedAt,
  });
}

async function handleRetention(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET?.trim();
  const isVercelProd = process.env.VERCEL_ENV === 'production';
  if (isVercelProd && !secret) {
    return res.status(503).json({
      ok: false,
      error: 'Retention cron locked: configure CRON_SECRET',
    });
  }
  if (secret) {
    const auth = String(req.headers.authorization ?? '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.query.secret ?? '');
    if (token !== secret) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  const clubs = await listMirrorKeys();
  let cleanedAthletes = 0;
  let removedPhotos = 0;
  let prunedLogs = 0;
  let clubsProcessed = 0;

  for (const clubId of clubs) {
    const mirror = await loadMirror(clubId);
    if (!mirror) continue;
    const payload = (mirror.payload ?? {}) as MirrorPayload;
    const months = Number(payload.dataRetentionMonths) || 36;
    const athleteCutoff = monthsAgoIso(months).slice(0, 10);
    const photoCutoff = monthsAgoIso(24);
    const logCutoff = monthsAgoIso(12);

    let changed = false;
    for (const student of payload.students ?? []) {
      if (String(student.status) !== 'inactive') continue;
      const ref = String(student.enrolledAt ?? '').slice(0, 10);
      if (!ref || ref > athleteCutoff) continue;
      for (const field of [
        'amka',
        'doctorName',
        'doctorPhone',
        'bloodType',
        'allergies',
        'chronicConditions',
        'medication',
      ]) {
        if (String(student[field] ?? '').trim()) {
          student[field] = '';
          changed = true;
        }
      }
      cleanedAthletes += 1;
    }

    const beforePhotos = payload.photos?.length ?? 0;
    payload.photos = (payload.photos ?? []).filter(
      (p) => String(p.createdAt ?? '') >= photoCutoff,
    );
    const photoDiff = beforePhotos - (payload.photos.length ?? 0);
    if (photoDiff > 0) {
      removedPhotos += photoDiff;
      changed = true;
    }

    const beforeAmka = payload.amkaAccessLogs?.length ?? 0;
    payload.amkaAccessLogs = (payload.amkaAccessLogs ?? []).filter(
      (l) => String(l.at ?? '') >= logCutoff,
    );
    const beforeGdpr = payload.gdprAuditLogs?.length ?? 0;
    payload.gdprAuditLogs = (payload.gdprAuditLogs ?? []).filter(
      (l) => String(l.at ?? '') >= logCutoff,
    );
    const logDiff =
      beforeAmka +
      beforeGdpr -
      ((payload.amkaAccessLogs?.length ?? 0) + (payload.gdprAuditLogs?.length ?? 0));
    if (logDiff > 0) {
      prunedLogs += logDiff;
      changed = true;
    }

    if (!changed) continue;
    const saved = await saveMirror(clubId, payload, { baseUpdatedAt: null });
    if (saved.ok) clubsProcessed += 1;
  }

  return res.status(200).json({
    ok: true,
    durable: isDurableStoreEnabled(),
    clubs: clubs.length,
    clubsProcessed,
    cleanedAthletes,
    removedPhotos,
    prunedLogs,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = resolveOp(req);

  if (op === 'health') {
    const configured = isDurableStoreEnabled();
    const diag = configured ? await diagnoseDurableStorage() : null;
    const accountExists = Boolean(diag?.exists);
    const accountReadable = Boolean(diag?.readable);
    const storageReadable = !configured || !accountExists || accountReadable;
    const storageHint =
      configured && !storageReadable
        ? 'Blob auth or read failed — see diag. Prefer OIDC (BLOB_STORE_ID) or refresh BLOB_READ_WRITE_TOKEN, then redeploy.'
        : undefined;
    return res.status(storageReadable ? 200 : 503).json({
      ok: storageReadable,
      service: 'teamsuite-api',
      durable: configured,
      durableBackend: getDurableStoreBackend(),
      storageReadable,
      accountExists,
      diag,
      hint: storageHint,
      error: storageReadable ? undefined : 'Durable storage is configured but not readable',
      time: new Date().toISOString(),
    });
  }

  if (op === 'backup') {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const secret = process.env.CRON_SECRET?.trim();
    const isVercelProd = process.env.VERCEL_ENV === 'production';
    if (isVercelProd && !secret) {
      return res.status(503).json({
        ok: false,
        error: 'Backup cron locked: configure CRON_SECRET',
      });
    }
    if (secret) {
      const auth = String(req.headers.authorization ?? '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.query.secret ?? '');
      if (token !== secret) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
    }
    const result = await snapshotAllMirrors();
    const googleDrive = await uploadClubMirrorsToGoogleDrive();
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      ...result,
      googleDrive,
    });
  }

  if (op === 'data') return handleData(req, res);
  if (op === 'consent') return handleConsent(req, res);
  if (op === 'correct') return handleCorrect(req, res);
  if (op === 'retention') return handleRetention(req, res);
  return res.status(400).json({
    ok: false,
    error: 'Unknown op. Use health|backup|data|consent|correct|retention',
  });
}
