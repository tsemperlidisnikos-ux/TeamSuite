import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertClubTenantAccess,
  isDurableStoreEnabled,
  mergeOpsSliceIntoPayload,
  saveMirrorWithRetry,
} from '../lib/serverStore.js';

/**
 * PUT /api/sync/club-ops — γρήγορο patch προγράμματος, ανακοινώσεων, αιτήσεων, κρατήσεων
 * χωρίς να περιμένει πλήρες roster mirror.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const body = (req.body ?? {}) as {
    clubId?: string;
    slice?: Record<string, unknown>;
  };
  const clubId = String(body.clubId ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'clubId required' });
  if (!(await assertClubTenantAccess(req, res, clubId))) return;
  const slice = body.slice && typeof body.slice === 'object' ? body.slice : null;
  if (!slice) return res.status(400).json({ ok: false, error: 'slice required' });

  const saved = await saveMirrorWithRetry(clubId, (prev) => mergeOpsSliceIntoPayload(prev, slice));
  if (saved.ok === false) {
    return res.status(409).json({
      ok: false,
      conflict: true,
      error: 'Mirror conflict',
      updatedAt: saved.updatedAt,
    });
  }
  return res.status(200).json({ ok: true, durable: isDurableStoreEnabled(), updatedAt: saved.updatedAt });
}
