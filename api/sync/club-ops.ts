import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertClubTenantAccess,
  isDurableStoreEnabled,
  loadMirror,
  mergeOpsSliceIntoPayload,
  saveMirror,
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

  const mirror = await loadMirror(clubId);
  const prev =
    mirror?.payload && typeof mirror.payload === 'object'
      ? (mirror.payload as Record<string, unknown>)
      : {};
  const next = mergeOpsSliceIntoPayload(prev, slice);
  await saveMirror(clubId, next);
  return res.status(200).json({ ok: true, durable: isDurableStoreEnabled() });
}
