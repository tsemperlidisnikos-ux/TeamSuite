import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPrivateMedia, isAllowedClubMediaPath } from './lib/durableKv.js';

/**
 * Serve club images from the private Blob store.
 * Pathnames are restricted to ss360-media/... so KV JSON cannot be fetched.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const pathname = String(req.query.p ?? '').trim();
  if (!pathname || !isAllowedClubMediaPath(pathname)) {
    return res.status(400).json({ ok: false, error: 'Invalid media path' });
  }
  const media = await getPrivateMedia(pathname);
  if (!media) {
    return res.status(404).json({ ok: false, error: 'Not found' });
  }
  res.setHeader('Content-Type', media.contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=300');
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).send(media.bytes);
}
