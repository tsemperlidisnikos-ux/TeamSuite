import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertClubTenantAccess,
  assertSyncAuthorized,
  isDurableStoreEnabled,
  listMirrorKeys,
  loadMirror,
  saveMirror,
} from '../lib/serverStore.js';

/**
 * Cloud mirror for club AppData (optimistic concurrency via baseUpdatedAt).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const clubId = String(req.query.clubId ?? '').trim();
    if (!clubId) {
      if (!(await assertSyncAuthorized(req, res))) return;
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        clubs: await listMirrorKeys(),
      });
    }
    if (!(await assertClubTenantAccess(req, res, clubId))) return;
    const mirror = await loadMirror(clubId);
    if (!mirror) return res.status(404).json({ ok: false, error: 'No mirror for club' });
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      clubId,
      ...mirror,
    });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as {
      clubId?: string;
      payload?: unknown;
      baseUpdatedAt?: string | null;
    };
    const clubId = String(body.clubId ?? '').trim();
    if (!clubId) return res.status(400).json({ ok: false, error: 'clubId required' });
    if (body.payload == null) return res.status(400).json({ ok: false, error: 'payload required' });
    if (!(await assertClubTenantAccess(req, res, clubId))) return;

    if (!isDurableStoreEnabled()) {
      return res.status(503).json({
        ok: false,
        durable: false,
        error:
          'Το cloud sync δεν είναι ενεργό: λείπει Vercel Blob/Redis. Τα δεδομένα μένουν μόνο σε αυτόν τον browser μέχρι να συνδεθεί store.',
      });
    }

    const result = await saveMirror(clubId, body.payload, {
      baseUpdatedAt: body.baseUpdatedAt ?? null,
    });

    if (result.ok === false) {
      return res.status(409).json({
        ok: false,
        conflict: true,
        error: 'Mirror conflict: cloud has a newer revision',
        updatedAt: result.updatedAt,
        payload: result.payload,
        durable: isDurableStoreEnabled(),
      });
    }

    return res.status(200).json({
      ok: true,
      clubId,
      durable: isDurableStoreEnabled(),
      updatedAt: result.updatedAt,
    });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
