import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  allowRateLimit,
  assertSyncAuthorized,
  getSyncAuthContext,
  loadAccountBundle,
  loadClubNotifyConfig,
  requestAddress,
} from './lib/serverStore.js';

type StoredSms = {
  enabled?: boolean;
  provider?: string;
  apiKey?: string;
  sender?: string;
  httpUrl?: string;
};

function smsIsUsable(sms: StoredSms | null | undefined): sms is StoredSms {
  if (!sms?.enabled) return false;
  const key = String(sms.apiKey ?? '').trim();
  if (!key || key === '********') return false;
  if (sms.provider === 'http') return Boolean(String(sms.httpUrl ?? '').trim());
  return true;
}

async function resolveClubSms(clubId: string): Promise<StoredSms | null> {
  const configured = await loadClubNotifyConfig(clubId);
  if (smsIsUsable(configured?.sms)) return configured.sms!;

  const bundle = await loadAccountBundle();
  const clubs = Array.isArray(bundle?.clubs) ? bundle.clubs : [];
  for (const row of clubs) {
    if (!row || typeof row !== 'object') continue;
    const club = row as { id?: string; sms?: StoredSms };
    if (club.id !== clubId) continue;
    if (smsIsUsable(club.sms)) return club.sms;
  }
  return null;
}

async function deliverSms(sms: StoredSms, to: string, text: string): Promise<void> {
  const apiKey = String(sms.apiKey ?? '').trim();
  const sender = String(sms.sender ?? '').trim() || 'TeamSuite';
  if (sms.provider === 'http') {
    const url = String(sms.httpUrl ?? '').trim();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ to, message: text, text, sender_id: sender }),
    });
    if (!res.ok) {
      throw new Error(`HTTP SMS ${res.status}`);
    }
    return;
  }
  const res = await fetch('https://api.sms.to/sms/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to,
      message: text,
      sender_id: sender.slice(0, 11),
    }),
  });
  if (!res.ok) {
    let detail = `SMS.to ${res.status}`;
    try {
      const json = (await res.json()) as { message?: string };
      if (json.message) detail = json.message;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!(await assertSyncAuthorized(req, res))) return;
  if (!(await allowRateLimit(`sms:${requestAddress(req)}`, 40, 300))) {
    return res.status(429).json({ ok: false, error: 'Πολλά αιτήματα SMS. Δοκιμάστε ξανά αργότερα.' });
  }

  const body = (req.body ?? {}) as { clubId?: string; to?: string; text?: string };
  const clubId = String(body.clubId ?? '').trim();
  const auth = getSyncAuthContext(req);
  if (!clubId || (!auth.viaSecret && auth.claims?.role !== 'platform_admin' && auth.claims?.clubId !== clubId)) {
    return res.status(403).json({ ok: false, error: 'Απαιτείται έγκυρος σύλλογος αποστολής' });
  }
  const sms = await resolveClubSms(clubId);
  const to = String(body.to ?? '').trim();
  const text = String(body.text ?? '').trim();
  if (!smsIsUsable(sms)) {
    return res.status(400).json({ ok: false, error: 'Ελλιπείς ρυθμίσεις SMS' });
  }
  if (to.length < 8 || !text) {
    return res.status(400).json({ ok: false, error: 'Ελλιπή στοιχεία μηνύματος' });
  }
  try {
    await deliverSms(sms, to, text.slice(0, 480));
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Αποτυχία αποστολής SMS',
    });
  }
}
