import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvGet, kvSet } from './lib/durableKv.js';
import {
  assertSyncAuthorized,
  getSyncAuthContext,
  isDurableStoreEnabled,
} from './lib/serverStore.js';

type TrackMeta = {
  clubId: string;
  announcementId: string;
  email: string;
};

type AnnouncementTrackStore = {
  clubId: string;
  announcementId: string;
  sent: string[];
  failed: Array<{ email: string; error?: string }>;
  opens: Record<string, string>;
  updatedAt: string;
};

const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function tokenKey(token: string) {
  return `teamsuite:email-trk:${token}`;
}

function statsKey(clubId: string, announcementId: string) {
  return `teamsuite:email-stats:${clubId}:${announcementId}`;
}

function clubIndexKey(clubId: string) {
  return `teamsuite:email-stats-index:${clubId}`;
}

async function loadStats(clubId: string, announcementId: string): Promise<AnnouncementTrackStore> {
  const existing = await kvGet<AnnouncementTrackStore>(statsKey(clubId, announcementId));
  if (existing) return existing;
  return {
    clubId,
    announcementId,
    sent: [],
    failed: [],
    opens: {},
    updatedAt: new Date().toISOString(),
  };
}

async function saveStats(store: AnnouncementTrackStore): Promise<void> {
  store.updatedAt = new Date().toISOString();
  await kvSet(statsKey(store.clubId, store.announcementId), store);
  const index = (await kvGet<string[]>(clubIndexKey(store.clubId))) ?? [];
  if (!index.includes(store.announcementId)) {
    await kvSet(clubIndexKey(store.clubId), [store.announcementId, ...index].slice(0, 200));
  }
}

function sendPixel(res: VercelResponse) {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.status(200).end(PIXEL_GIF);
}

function requestOrigin(req: VercelRequest): string {
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0]?.trim() || 'https';
  const host =
    String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
      .split(',')[0]
      ?.trim() || '';
  if (!host) return 'https://teamsuite-seven.vercel.app';
  return `${proto}://${host}`;
}

async function recordOpen(token: string): Promise<TrackMeta | null> {
  if (!isDurableStoreEnabled()) return null;
  const meta = await kvGet<TrackMeta>(tokenKey(token));
  if (!meta?.clubId || !meta.announcementId || !meta.email) return meta;
  const store = await loadStats(meta.clubId, meta.announcementId);
  const email = meta.email.trim().toLowerCase();
  if (!store.opens[email]) {
    store.opens[email] = new Date().toISOString();
    await saveStats(store);
  }
  return meta;
}

/**
 * GET  ?t=TOKEN              — tracking pixel (public, often blocked)
 * GET  ?t=TOKEN&click=1      — link click → record open + redirect to portal
 * GET  ?clubId=&stats=1      — stats for club (auth)
 * POST register tokens / delivery results (auth)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const token = String(req.query.t ?? '').trim();
    if (token) {
      const isClick =
        String(req.query.click ?? '') === '1' ||
        String(req.query.a ?? '').toLowerCase() === 'click';
      try {
        const meta = await recordOpen(token);
        if (isClick) {
          const origin = requestOrigin(req);
          const ann = meta?.announcementId
            ? `&announcement=${encodeURIComponent(meta.announcementId)}`
            : '';
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
          return res.redirect(302, `${origin}/app/parent?fromEmail=1${ann}`);
        }
      } catch (err) {
        console.warn('[email-track] open failed', err instanceof Error ? err.message : err);
        if (isClick) {
          return res.redirect(302, `${requestOrigin(req)}/app/parent`);
        }
      }
      return sendPixel(res);
    }

    const clubId = String(req.query.clubId ?? '').trim();
    const wantStats = String(req.query.stats ?? '') === '1';
    if (wantStats && clubId) {
      if (!(await assertSyncAuthorized(req, res))) return;
      const auth = getSyncAuthContext(req);
      if (!auth.viaSecret && auth.claims?.role !== 'platform_admin' && auth.claims?.clubId !== clubId) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
      if (!isDurableStoreEnabled()) {
        return res.status(200).json({ ok: true, stats: {} });
      }
      const announcementId = String(req.query.announcementId ?? '').trim();
      if (announcementId) {
        const store = await loadStats(clubId, announcementId);
        return res.status(200).json({
          ok: true,
          stats: {
            [announcementId]: {
              sentCount: store.sent.length,
              failedCount: store.failed.length,
              openedCount: Object.keys(store.opens).length,
              opens: store.opens,
              sent: store.sent,
              failed: store.failed,
              updatedAt: store.updatedAt,
            },
          },
        });
      }
      const index = (await kvGet<string[]>(clubIndexKey(clubId))) ?? [];
      const stats: Record<string, unknown> = {};
      for (const id of index.slice(0, 80)) {
        const store = await loadStats(clubId, id);
        stats[id] = {
          sentCount: store.sent.length,
          failedCount: store.failed.length,
          openedCount: Object.keys(store.opens).length,
          opens: store.opens,
          sent: store.sent,
          failed: store.failed,
          updatedAt: store.updatedAt,
        };
      }
      return res.status(200).json({ ok: true, stats });
    }

    return res.status(400).json({ ok: false, error: 'Missing t or stats query' });
  }

  if (req.method === 'POST') {
    if (!(await assertSyncAuthorized(req, res))) return;
    if (!isDurableStoreEnabled()) {
      return res.status(503).json({ ok: false, error: 'Durable store unavailable' });
    }
    const body = (req.body ?? {}) as {
      clubId?: string;
      announcementId?: string;
      tokens?: Array<{ email: string; token: string }>;
      sent?: string[];
      failed?: Array<{ email: string; error?: string }>;
    };
    const clubId = String(body.clubId ?? '').trim();
    const announcementId = String(body.announcementId ?? '').trim();
    const auth = getSyncAuthContext(req);
    if (!clubId || !announcementId) {
      return res.status(400).json({ ok: false, error: 'clubId and announcementId required' });
    }
    if (!auth.viaSecret && auth.claims?.role !== 'platform_admin' && auth.claims?.clubId !== clubId) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const store = await loadStats(clubId, announcementId);
    if (Array.isArray(body.sent)) {
      store.sent = [...new Set([...store.sent, ...body.sent.map((e) => e.trim().toLowerCase())])];
    }
    if (Array.isArray(body.failed)) {
      const map = new Map(store.failed.map((f) => [f.email.toLowerCase(), f]));
      for (const row of body.failed) {
        const email = String(row.email ?? '').trim().toLowerCase();
        if (!email) continue;
        map.set(email, { email, error: row.error });
      }
      store.failed = [...map.values()];
    }
    for (const row of body.tokens ?? []) {
      const email = String(row.email ?? '').trim().toLowerCase();
      const token = String(row.token ?? '').trim();
      if (!email || !token) continue;
      await kvSet(tokenKey(token), { clubId, announcementId, email } satisfies TrackMeta);
    }
    await saveStats(store);
    return res.status(200).json({
      ok: true,
      sentCount: store.sent.length,
      failedCount: store.failed.length,
      openedCount: Object.keys(store.opens).length,
    });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
