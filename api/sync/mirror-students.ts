import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  assertClubTenantAccess,
  isDurableStoreEnabled,
  upsertMirrorStudents,
} from '../lib/serverStore.js';

/**
 * Add or update athletes on the club mirror without replacing the whole document.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as { clubId?: string; students?: unknown };
  const clubId = String(body.clubId ?? '').trim();
  if (!clubId) return res.status(400).json({ ok: false, error: 'clubId required' });
  if (!Array.isArray(body.students) || body.students.length === 0) {
    return res.status(400).json({ ok: false, error: 'students required' });
  }
  if (!(await assertClubTenantAccess(req, res, clubId))) return;

  if (!isDurableStoreEnabled()) {
    return res.status(503).json({
      ok: false,
      durable: false,
      error: 'Το cloud sync δεν είναι ενεργό.',
    });
  }

  const result = await upsertMirrorStudents(clubId, body.students);
  if (result.ok === false) {
    return res.status(404).json({ ok: false, error: result.error });
  }

  return res.status(200).json({
    ok: true,
    clubId,
    durable: true,
    updatedAt: result.updatedAt,
    studentCount: result.studentCount,
  });
}
