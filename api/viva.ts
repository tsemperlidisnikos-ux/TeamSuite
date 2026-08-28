import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  addSettlement,
  allowRateLimit,
  assertPlatformAdminOrSecret,
  consumeSettlement,
  isDurableStoreEnabled,
  listOpenSettlements,
  requestAddress,
} from './lib/serverStore.js';

/**
 * Unified Viva API (Hobby plan serverless limit).
 * op=create-order|settlements|webhook
 * Legacy paths rewritten in vercel.json.
 */

type CreateOrderBody = {
  clientId?: string;
  clientSecret?: string;
  sourceCode?: string;
  environment?: 'demo' | 'live';
  amount?: number;
  customer?: { email?: string; fullName?: string };
  merchantTrns?: string;
};

function resolveOp(req: VercelRequest): string {
  const q = String(req.query.op ?? '').trim().toLowerCase();
  if (q) return q;
  const url = String(req.url ?? '');
  if (url.includes('webhook')) return 'webhook';
  if (url.includes('settlements')) return 'settlements';
  if (url.includes('create-order')) return 'create-order';
  if (req.method === 'GET') return 'settlements';
  return 'create-order';
}

function vivaHosts(env: 'demo' | 'live') {
  if (env === 'live') {
    return {
      accounts: 'https://accounts.vivapayments.com',
      api: 'https://api.vivapayments.com',
      checkout: 'https://www.vivapayments.com/web/checkout',
    };
  }
  return {
    accounts: 'https://demo-accounts.vivapayments.com',
    api: 'https://demo-api.vivapayments.com',
    checkout: 'https://demo.vivapayments.com/web/checkout',
  };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function assertVivaWebhookAuthorized(req: VercelRequest): boolean {
  const secret = (process.env.VIVA_WEBHOOK_SECRET || '').trim();
  if (!secret) return false;

  const headerKey = String(
    req.headers['x-viva-signature'] ??
      req.headers['x-ss360-viva-key'] ??
      req.headers['x-ss360-sync-key'] ??
      '',
  ).trim();
  const auth = String(req.headers.authorization ?? '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const queryKey = String(req.query.key ?? req.query.secret ?? '').trim();
  const provided = headerKey || bearer || queryKey;
  if (provided && safeEqual(provided, secret)) return true;

  if (headerKey && /^[a-f0-9]{32,}$/i.test(headerKey)) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const digest = createHmac('sha256', secret).update(raw).digest('hex');
    if (safeEqual(digest, headerKey.toLowerCase())) return true;
  }

  return false;
}

async function handleCreateOrder(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!(await allowRateLimit(`viva-order:${requestAddress(req)}`, 20, 300))) {
    return res.status(429).json({ ok: false, error: 'Πολλά αιτήματα πληρωμής. Δοκιμάστε ξανά αργότερα.' });
  }

  const body = (req.body ?? {}) as CreateOrderBody;
  const clientId = String(body.clientId ?? '').trim();
  const clientSecret = String(body.clientSecret ?? '').trim();
  const sourceCode = String(body.sourceCode ?? '').trim();
  const environment = body.environment === 'live' ? 'live' : 'demo';
  const amount = Number(body.amount);

  if (!clientId || !clientSecret || !sourceCode) {
    return res.status(400).json({ ok: false, error: 'Ελλιπή Viva credentials' });
  }
  if (!Number.isFinite(amount) || amount < 30) {
    return res.status(400).json({ ok: false, error: 'Μη έγκυρο ποσό (ελάχιστο 30 λεπτά)' });
  }

  const hosts = vivaHosts(environment);

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch(`${hosts.accounts}/connect/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !tokenJson.access_token) {
      return res.status(502).json({
        ok: false,
        error:
          tokenJson.error_description ||
          tokenJson.error ||
          'Αποτυχία αυθεντικοποίησης Viva',
      });
    }

    const orderRes = await fetch(`${hosts.api}/checkout/v2/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        customerTrns: body.merchantTrns || 'SportSuite360 payment',
        merchantTrns: body.merchantTrns || 'SportSuite360 payment',
        sourceCode,
        customer: {
          email: body.customer?.email || undefined,
          fullName: body.customer?.fullName || undefined,
        },
      }),
    });

    const orderJson = (await orderRes.json()) as {
      orderCode?: number | string;
      message?: string;
      ErrorCode?: number;
      ErrorText?: string;
    };

    if (!orderRes.ok || orderJson.orderCode == null) {
      return res.status(502).json({
        ok: false,
        error: orderJson.ErrorText || orderJson.message || 'Αποτυχία δημιουργίας Viva order',
      });
    }

    const orderCode = orderJson.orderCode;
    const checkoutUrl = `${hosts.checkout}?ref=${encodeURIComponent(String(orderCode))}`;
    return res.status(200).json({ ok: true, orderCode, checkoutUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Σφάλμα Viva';
    return res.status(502).json({ ok: false, error: message });
  }
}

async function handleSettlements(req: VercelRequest, res: VercelResponse) {
  if (!assertPlatformAdminOrSecret(req, res)) return;
  if (req.method === 'GET') {
    const settlements = await listOpenSettlements();
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      settlements: settlements.map((s) => ({
        orderCode: s.orderCode,
        transactionId: s.transactionId,
        amountCents: s.amountCents,
        createdAt: s.createdAt,
        clubHint: s.clubHint,
      })),
    });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as { orderCode?: string };
    const orderCode = String(body.orderCode ?? '').trim();
    if (!orderCode) {
      return res.status(400).json({ ok: false, error: 'orderCode required' });
    }
    const consumed = await consumeSettlement(orderCode);
    return res.status(200).json({ ok: true, consumed: Boolean(consumed) });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

async function handleWebhook(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'viva-webhook',
      durable: isDurableStoreEnabled(),
      authRequired: Boolean((process.env.VIVA_WEBHOOK_SECRET || '').trim()),
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!(await allowRateLimit(`viva-webhook:${requestAddress(req)}`, 60, 60))) {
    return res.status(429).json({ ok: false, error: 'Πολλά webhook requests.' });
  }

  if (!assertVivaWebhookAuthorized(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized webhook' });
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const eventData = (body.EventData ?? body.eventData ?? body) as Record<string, unknown>;
    const orderCode = String(
      eventData.OrderCode ?? eventData.orderCode ?? body.OrderCode ?? '',
    ).trim();
    const transactionId = String(
      eventData.TransactionId ?? eventData.transactionId ?? body.TransactionId ?? '',
    ).trim();
    const amountRaw = eventData.Amount ?? eventData.amount ?? body.Amount ?? 0;
    const amountCents = Math.round(Number(amountRaw) || 0);
    const status = String(eventData.StatusId ?? eventData.statusId ?? body.StatusId ?? 'F');

    if (!orderCode && !transactionId) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (status && status !== 'F' && status !== 'Finished' && status !== 'paid') {
      return res.status(200).json({ ok: true, ignored: true, status });
    }

    const settlement = await addSettlement({
      orderCode: orderCode || transactionId,
      transactionId: transactionId || orderCode,
      amountCents: amountCents > 0 ? amountCents : 0,
      status,
      clubHint: String(eventData.MerchantTrns ?? eventData.CustomerTrns ?? ''),
    });

    return res.status(200).json({
      ok: true,
      settlementId: settlement.id,
      durable: isDurableStoreEnabled(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    return res.status(500).json({ ok: false, error: message });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = resolveOp(req);
  if (op === 'create-order') return handleCreateOrder(req, res);
  if (op === 'settlements') return handleSettlements(req, res);
  if (op === 'webhook') return handleWebhook(req, res);
  return res.status(400).json({ ok: false, error: 'Unknown op. Use create-order|settlements|webhook' });
}
