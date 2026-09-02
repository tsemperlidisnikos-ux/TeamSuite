import type { VercelRequest, VercelResponse } from '@vercel/node';
import { allowRateLimit, requestAddress } from './lib/serverStore.js';

type Body = {
  secretKey?: string;
  amount?: number;
  currency?: string;
  description?: string;
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
  sessionId?: string;
};

function resolveOp(req: VercelRequest): string {
  const q = String(req.query.op ?? '').trim().toLowerCase();
  if (q) return q;
  if (String(req.url ?? '').includes('verify')) return 'verify';
  return 'create-session';
}

async function stripeForm(
  secretKey: string,
  path: string,
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { ok: response.ok, status: response.status, json };
}

async function stripeGet(
  secretKey: string,
  path: string,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { ok: response.ok, status: response.status, json };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = requestAddress(req);
  if (!allowRateLimit(`stripe:${ip}`, 20, 60_000)) {
    return res.status(429).json({ ok: false, error: 'Πολλές προσπάθειες. Δοκιμάστε αργότερα.' });
  }

  const body = (req.body ?? {}) as Body;
  const secretKey = String(body.secretKey ?? '').trim();
  if (!secretKey.startsWith('sk_')) {
    return res.status(400).json({ ok: false, error: 'Μη έγκυρο Stripe Secret Key (sk_test_ / sk_live_).' });
  }

  const op = resolveOp(req);
  if (op === 'verify') {
    const sessionId = String(body.sessionId ?? '').trim();
    if (!sessionId.startsWith('cs_')) {
      return res.status(400).json({ ok: false, error: 'Λείπει το session id.' });
    }
    const got = await stripeGet(secretKey, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (!got.ok) {
      const msg =
        typeof got.json.error === 'object' && got.json.error && 'message' in (got.json.error as object)
          ? String((got.json.error as { message?: string }).message)
          : `Stripe HTTP ${got.status}`;
      return res.status(got.status).json({ ok: false, error: msg });
    }
    const paid = got.json.payment_status === 'paid' || got.json.status === 'complete';
    return res.status(200).json({
      ok: true,
      paid,
      sessionId: got.json.id,
      paymentIntent: got.json.payment_intent ?? null,
    });
  }

  const amount = Math.round(Number(body.amount) || 0);
  if (!Number.isFinite(amount) || amount < 50) {
    return res.status(400).json({ ok: false, error: 'Το ποσό Stripe πρέπει να είναι τουλάχιστον 0,50 €.' });
  }
  const successUrl = String(body.successUrl ?? '').trim();
  const cancelUrl = String(body.cancelUrl ?? '').trim();
  if (!successUrl || !cancelUrl) {
    return res.status(400).json({ ok: false, error: 'Λείπουν success/cancel URL.' });
  }

  const params: Record<string, string> = {
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': (body.currency || 'eur').toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]':
      String(body.description ?? 'TeamSuite πληρωμή').slice(0, 120),
  };
  const email = String(body.customerEmail ?? '').trim();
  if (email.includes('@')) params.customer_email = email;

  const created = await stripeForm(secretKey, '/v1/checkout/sessions', params);
  if (!created.ok || typeof created.json.url !== 'string') {
    const msg =
      typeof created.json.error === 'object' && created.json.error && 'message' in (created.json.error as object)
        ? String((created.json.error as { message?: string }).message)
        : `Αποτυχία Stripe (HTTP ${created.status})`;
    return res.status(created.status || 400).json({ ok: false, error: msg });
  }

  return res.status(200).json({
    ok: true,
    sessionId: created.json.id,
    checkoutUrl: created.json.url,
  });
}
