import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';
import {
  allowRateLimit,
  assertSyncAuthorized,
  getSyncAuthContext,
  loadAccountBundle,
  loadClubNotifyConfig,
  requestAddress,
} from './lib/serverStore.js';

type Body = {
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  listUnsubscribe?: string;
  clubId?: string;
};

type StoredSmtp = {
  enabled?: boolean;
  host?: string;
  port?: string | number;
  username?: string;
  password?: string;
  fromName?: string;
};

function smtpIsUsable(smtp: StoredSmtp | null | undefined): smtp is StoredSmtp {
  if (!smtp) return false;
  const password = String(smtp.password ?? '').trim();
  return Boolean(smtp.host && smtp.username && password && password !== '********');
}

async function resolveClubSendSmtp(clubId: string): Promise<StoredSmtp | null> {
  const configured = await loadClubNotifyConfig(clubId);
  if (smtpIsUsable(configured?.smtp)) return configured.smtp;

  const bundle = await loadAccountBundle();
  const clubs = Array.isArray(bundle?.clubs) ? bundle.clubs : [];
  for (const row of clubs) {
    if (!row || typeof row !== 'object') continue;
    const club = row as { id?: string; smtp?: StoredSmtp };
    if (club.id !== clubId) continue;
    if (smtpIsUsable(club.smtp)) return club.smtp;
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!assertSyncAuthorized(req, res)) return;
  if (!(await allowRateLimit(`email:${requestAddress(req)}`, 30, 300))) {
    return res.status(429).json({ ok: false, error: 'Πολλά αιτήματα email. Δοκιμάστε ξανά αργότερα.' });
  }

  const body = (req.body ?? {}) as Body;
  const clubId = String(body.clubId ?? '').trim();
  const auth = getSyncAuthContext(req);
  if (!clubId || (!auth.viaSecret && auth.claims?.role !== 'platform_admin' && auth.claims?.clubId !== clubId)) {
    return res.status(403).json({ ok: false, error: 'Απαιτείται έγκυρος σύλλογος αποστολής' });
  }
  const smtp = await resolveClubSendSmtp(clubId);
  const to = String(body.to ?? '').trim();
  const subject = String(body.subject ?? '').trim();
  const text = String(body.text ?? '').trim();
  const html = body.html ? String(body.html) : undefined;

  if (!smtpIsUsable(smtp)) {
    return res.status(400).json({ ok: false, error: 'Ελλιπείς ρυθμίσεις SMTP' });
  }
  if (!to.includes('@') || !subject || !text) {
    return res.status(400).json({ ok: false, error: 'Ελλιπή στοιχεία μηνύματος' });
  }

  const port = Number(smtp.port) || 587;
  const secure = port === 465;

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port,
      secure,
      auth: {
        user: smtp.username,
        pass: smtp.password,
      },
    });

    const fromName = (smtp.fromName || 'SPORTSUITE 360').replace(/[\r\n]/g, '');
    const listUnsubscribe = body.listUnsubscribe
      ? String(body.listUnsubscribe).replace(/[\r\n]/g, '')
      : '';
    const info = await transporter.sendMail({
      from: `"${fromName}" <${smtp.username}>`,
      to,
      subject,
      text,
      html: html || undefined,
      headers: listUnsubscribe
        ? {
            'List-Unsubscribe': listUnsubscribe,
          }
        : undefined,
    });

    return res.status(200).json({ ok: true, messageId: info.messageId ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Σφάλμα SMTP';
    return res.status(502).json({ ok: false, error: message });
  }
}
