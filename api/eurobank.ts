import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomBytes } from 'node:crypto';
import { allowRateLimit, requestAddress } from './lib/serverStore.js';

/**
 * Eurobank e-commerce στην Ελλάδα περνά συνήθως από Cardlink / Nexi hosted VPOS.
 * Δημιουργεί πεδία POST προς το shophandlermpi με SHA-256 digest (Cardlink v2).
 */
type Body = {
  merchantId?: string;
  secretKey?: string;
  environment?: 'demo' | 'live';
  amount?: number;
  orderDesc?: string;
  payerEmail?: string;
  confirmUrl?: string;
  cancelUrl?: string;
};

function gatewayUrl(env: 'demo' | 'live'): string {
  return env === 'live'
    ? 'https://vpos.eurocommerce.gr/vpos/shophandlermpi'
    : 'https://eurocommerce-test.cardlink.gr/vpos/shophandlermpi';
}

function digestV2(fields: Record<string, string>, secret: string): string {
  const keys = Object.keys(fields)
    .filter((k) => k !== 'digest' && fields[k] !== '')
    .sort((a, b) => a.localeCompare(b));
  const concatenated = keys.map((k) => fields[k]).join('') + secret;
  return createHash('sha256').update(concatenated, 'utf8').digest('base64');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = requestAddress(req);
  if (!allowRateLimit(`eurobank:${ip}`, 20, 60_000)) {
    return res.status(429).json({ ok: false, error: 'Πολλές προσπάθειες. Δοκιμάστε αργότερα.' });
  }

  const body = (req.body ?? {}) as Body;
  const merchantId = String(body.merchantId ?? '').trim();
  const secretKey = String(body.secretKey ?? '').trim();
  const env = body.environment === 'live' ? 'live' : 'demo';
  const amountCents = Math.round(Number(body.amount) || 0);
  if (!merchantId || !secretKey) {
    return res.status(400).json({ ok: false, error: 'Συμπληρώστε Merchant ID και Secret Key Eurobank.' });
  }
  if (!Number.isFinite(amountCents) || amountCents < 30) {
    return res.status(400).json({ ok: false, error: 'Το ποσό πρέπει να είναι τουλάχιστον 0,30 €.' });
  }
  const confirmUrl = String(body.confirmUrl ?? '').trim();
  const cancelUrl = String(body.cancelUrl ?? '').trim();
  if (!confirmUrl || !cancelUrl) {
    return res.status(400).json({ ok: false, error: 'Λείπουν confirm/cancel URL.' });
  }

  const orderid = `TS${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.slice(0, 20);
  const confirmWithOrder = confirmUrl.includes('s=')
    ? confirmUrl.replace('ORDERID', orderid)
    : `${confirmUrl}${confirmUrl.includes('?') ? '&' : '?'}s=${encodeURIComponent(orderid)}`;
  const orderAmount = (amountCents / 100).toFixed(2);
  const fields: Record<string, string> = {
    version: '2',
    mid: merchantId,
    orderid,
    orderDesc: String(body.orderDesc ?? 'TeamSuite πληρωμή').slice(0, 128),
    orderAmount,
    currency: '978',
    payerEmail: String(body.payerEmail ?? '').trim(),
    billCountry: 'GR',
    confirmUrl: confirmWithOrder,
    cancelUrl,
  };
  if (!fields.payerEmail) delete fields.payerEmail;
  fields.digest = digestV2(fields, secretKey);

  return res.status(200).json({
    ok: true,
    orderCode: orderid,
    checkoutUrl: gatewayUrl(env),
    method: 'POST',
    fields,
  });
}
