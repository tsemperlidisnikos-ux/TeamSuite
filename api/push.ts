import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  allowRateLimit,
  assertClubTenantAccess,
  assertSyncAuthorized,
  getSyncAuthContext,
  requestAddress,
} from './lib/serverStore.js';
import {
  loadClubSubscriptions,
  removeSubscription,
  resolveVapidKeys,
  sendWebPush,
  upsertSubscription,
} from './lib/webPush.js';

function resolveOp(req: VercelRequest): string {
  const q = String(req.query.op ?? '').trim().toLowerCase();
  if (q) return q;
  const body = (req.body ?? {}) as { op?: string };
  return String(body.op ?? '').trim().toLowerCase();
}

function canSendPush(role: string | undefined): boolean {
  return (
    role === 'platform_admin' ||
    role === 'admin' ||
    role === 'secretariat' ||
    role === 'coach' ||
    role === 'staff'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = resolveOp(req);

  if (req.method === 'GET' && op === 'subscribers') {
    const clubId = String(req.query.clubId ?? '').trim();
    if (!(await assertClubTenantAccess(req, res, clubId))) return;
    const auth = getSyncAuthContext(req);
    if (!auth.viaSecret && !canSendPush(auth.claims?.role)) {
      return res.status(403).json({ ok: false, error: 'Δεν επιτρέπεται λίστα ειδοποιήσεων.' });
    }
    const rows = await loadClubSubscriptions(clubId);
    const userIds = [...new Set(rows.map((row) => row.userId).filter(Boolean))];
    return res.status(200).json({ ok: true, userIds });
  }

  if (req.method === 'GET' && (op === 'vapid' || op === '')) {
    if (!(await allowRateLimit(`push-vapid:${requestAddress(req)}`, 40, 300))) {
      return res.status(429).json({ ok: false, error: 'Πολλά αιτήματα. Δοκιμάστε ξανά αργότερα.' });
    }
    try {
      const vapid = await resolveVapidKeys();
      return res.status(200).json({ ok: true, publicKey: vapid.publicKey });
    } catch {
      return res.status(503).json({
        ok: false,
        error: 'Οι ειδοποιήσεις δεν είναι διαθέσιμες ακόμα (λείπει αποθήκευση cloud).',
      });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as {
    clubId?: string;
    subscription?: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    endpoint?: string;
    userIds?: string[];
    title?: string;
    body?: string;
    url?: string;
  };
  const clubId = String(body.clubId ?? req.query.clubId ?? '').trim();

  if (op === 'subscribe') {
    if (!(await assertClubTenantAccess(req, res, clubId))) return;
    if (!(await allowRateLimit(`push-sub:${requestAddress(req)}`, 20, 300))) {
      return res.status(429).json({ ok: false, error: 'Πολλά αιτήματα εγγραφής ειδοποιήσεων.' });
    }
    const auth = getSyncAuthContext(req);
    const userId = auth.claims?.sub ?? '';
    const endpoint = String(body.subscription?.endpoint ?? '').trim();
    const p256dh = String(body.subscription?.keys?.p256dh ?? '').trim();
    const authKey = String(body.subscription?.keys?.auth ?? '').trim();
    if (!userId || !endpoint.startsWith('https://') || !p256dh || !authKey) {
      return res.status(400).json({ ok: false, error: 'Ελλιπή στοιχεία εγγραφής ειδοποιήσεων.' });
    }
    await upsertSubscription({
      endpoint,
      keys: { p256dh, auth: authKey },
      userId,
      role: auth.claims?.role ?? 'parent',
      clubId,
      createdAt: new Date().toISOString(),
    });
    return res.status(200).json({ ok: true });
  }

  if (op === 'unsubscribe') {
    if (!(await assertClubTenantAccess(req, res, clubId))) return;
    const auth = getSyncAuthContext(req);
    const removed = await removeSubscription({
      clubId,
      userId: auth.claims?.sub,
      endpoint: String(body.endpoint ?? body.subscription?.endpoint ?? '').trim() || undefined,
    });
    return res.status(200).json({ ok: true, removed });
  }

  if (op === 'send') {
    if (!(await assertSyncAuthorized(req, res))) return;
    if (!(await assertClubTenantAccess(req, res, clubId))) return;
    if (!(await allowRateLimit(`push-send:${requestAddress(req)}`, 30, 300))) {
      return res.status(429).json({ ok: false, error: 'Πολλά αιτήματα αποστολής ειδοποιήσεων.' });
    }
    const auth = getSyncAuthContext(req);
    if (!auth.viaSecret && !canSendPush(auth.claims?.role)) {
      return res.status(403).json({ ok: false, error: 'Δεν επιτρέπεται αποστολή ειδοποιήσεων.' });
    }
    const userIds = Array.isArray(body.userIds) ? body.userIds.map((id) => String(id).trim()).filter(Boolean) : [];
    const title = String(body.title ?? '').trim();
    const text = String(body.body ?? '').trim();
    if (!title || !text || userIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'Ελλιπή στοιχεία ειδοποίησης.' });
    }
    const result = await sendWebPush({
      clubId,
      userIds,
      title,
      body: text,
      url: String(body.url ?? '/app/parent').trim() || '/app/parent',
    });
    return res.status(200).json({ ok: true, ...result });
  }

  return res.status(400).json({ ok: false, error: 'Άγνωστη ενέργεια' });
}
