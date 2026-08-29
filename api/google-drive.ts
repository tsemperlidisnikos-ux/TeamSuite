import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertPlatformAdminOrSecret } from './lib/serverStore.js';
import {
  buildGoogleAuthUrl,
  completeGoogleDriveOAuth,
  disconnectGoogleDrive,
  getGoogleDrivePublicStatus,
  googleDriveRedirectUri,
  updateGoogleDriveSettings,
  uploadClubMirrorsToGoogleDrive,
  writeGoogleDriveTestFile,
} from './lib/googleDriveBackup.js';

function appOrigin(req: VercelRequest): string {
  const redirect = googleDriveRedirectUri(req);
  return redirect.replace(/\/api\/google-drive\?op=callback$/i, '') || 'https://teamsuite-seven.vercel.app';
}

function opOf(req: VercelRequest): string {
  const fromQuery = String(req.query.op ?? '').trim();
  if (fromQuery) return fromQuery;
  const url = String(req.url ?? '');
  if (url.includes('/callback')) return 'callback';
  return '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = opOf(req);

  if (op === 'callback') {
    const code = String(req.query.code ?? '').trim();
    const state = String(req.query.state ?? '').trim();
    const origin = appOrigin(req);
    try {
      if (!code) throw new Error('Λείπει ο κωδικός Google.');
      await completeGoogleDriveOAuth(code, state, req);
      res.statusCode = 302;
      res.setHeader('Location', `${origin}/platform?tab=backup&drive=ok`);
      return res.end();
    } catch (err) {
      const message = encodeURIComponent(err instanceof Error ? err.message : 'Αποτυχία σύνδεσης Drive.');
      res.statusCode = 302;
      res.setHeader('Location', `${origin}/platform?tab=backup&drive=error&driveMsg=${message}`);
      return res.end();
    }
  }

  if (!assertPlatformAdminOrSecret(req, res)) return;

  if (op === 'status' && req.method === 'GET') {
    const status = await getGoogleDrivePublicStatus(req);
    return res.status(200).json({ ok: true, ...status });
  }

  if (op === 'start' && req.method === 'POST') {
    try {
      const url = await buildGoogleAuthUrl(req);
      return res.status(200).json({ ok: true, url });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Αποτυχία έναρξης Google OAuth.',
      });
    }
  }

  if (op === 'disconnect' && req.method === 'POST') {
    await disconnectGoogleDrive();
    return res.status(200).json({ ok: true, ...(await getGoogleDrivePublicStatus(req)) });
  }

  if (op === 'settings' && req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
      const status = await updateGoogleDriveSettings({
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        excludeClubIds: Array.isArray(body.excludeClubIds)
          ? body.excludeClubIds.map((id: unknown) => String(id))
          : undefined,
        rootFolderId: typeof body.rootFolderId === 'string' ? body.rootFolderId : undefined,
        rootFolderName: typeof body.rootFolderName === 'string' ? body.rootFolderName : undefined,
      });
      return res.status(200).json({ ok: true, ...status });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Αποτυχία αποθήκευσης ρυθμίσεων Drive.',
      });
    }
  }

  if (op === 'test' && req.method === 'POST') {
    const result = await writeGoogleDriveTestFile();
    if (result.error) return res.status(400).json({ ok: false, ...result });
    return res.status(200).json({ ok: true, ...result, ...(await getGoogleDrivePublicStatus(req)) });
  }

  if (op === 'upload' && req.method === 'POST') {
    const result = await uploadClubMirrorsToGoogleDrive();
    if (result.error) return res.status(400).json({ ok: false, ...result });
    return res.status(200).json({ ok: true, ...result, ...(await getGoogleDrivePublicStatus(req)) });
  }

  return res.status(400).json({
    ok: false,
    error: 'Unknown op. Use status|start|callback|disconnect|settings|test|upload',
  });
}
