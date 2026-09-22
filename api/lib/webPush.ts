import webpush from 'web-push';
import { kvGet, kvSet } from './durableKv.js';

const VAPID_KEY = 'push-vapid-v1';

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId: string;
  role: string;
  clubId: string;
  createdAt: string;
};

export type PushClubStore = {
  subscriptions: PushSubscriptionRecord[];
};

type VapidKeys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

function envVapid(): VapidKeys | null {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || process.env.TEAMSUITE_VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || process.env.TEAMSUITE_VAPID_PRIVATE_KEY || '').trim();
  const subject = (
    process.env.VAPID_SUBJECT ||
    process.env.TEAMSUITE_VAPID_SUBJECT ||
    'mailto:support@teamsuite.app'
  ).trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export async function resolveVapidKeys(): Promise<VapidKeys> {
  const fromEnv = envVapid();
  if (fromEnv) return fromEnv;

  const stored = await kvGet<VapidKeys>(VAPID_KEY);
  if (stored?.publicKey && stored?.privateKey) {
    return {
      publicKey: stored.publicKey,
      privateKey: stored.privateKey,
      subject: stored.subject || 'mailto:support@teamsuite.app',
    };
  }

  const generated = webpush.generateVAPIDKeys();
  const next: VapidKeys = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject: 'mailto:support@teamsuite.app',
  };
  await kvSet(VAPID_KEY, next);
  return next;
}

function clubKey(clubId: string): string {
  return `push-subs-${clubId}`;
}

export async function loadClubSubscriptions(clubId: string): Promise<PushSubscriptionRecord[]> {
  const store = await kvGet<PushClubStore>(clubKey(clubId));
  return Array.isArray(store?.subscriptions) ? store.subscriptions : [];
}

export async function saveClubSubscriptions(
  clubId: string,
  subscriptions: PushSubscriptionRecord[],
): Promise<void> {
  await kvSet(clubKey(clubId), { subscriptions });
}

export async function upsertSubscription(record: PushSubscriptionRecord): Promise<void> {
  const rows = await loadClubSubscriptions(record.clubId);
  const next = rows.filter(
    (row) => row.endpoint !== record.endpoint && !(row.userId === record.userId && row.endpoint === record.endpoint),
  );
  next.push(record);
  await saveClubSubscriptions(record.clubId, next);
}

export async function removeSubscription(input: {
  clubId: string;
  userId?: string;
  endpoint?: string;
}): Promise<number> {
  const rows = await loadClubSubscriptions(input.clubId);
  const next = rows.filter((row) => {
    if (input.endpoint && row.endpoint === input.endpoint) return false;
    if (!input.endpoint && input.userId && row.userId === input.userId) return false;
    return true;
  });
  const removed = rows.length - next.length;
  if (removed > 0) await saveClubSubscriptions(input.clubId, next);
  return removed;
}

export async function sendWebPush(input: {
  clubId: string;
  userIds: string[];
  title: string;
  body: string;
  url?: string;
}): Promise<{ sent: number; failed: number; gone: number }> {
  const want = new Set(input.userIds.filter(Boolean));
  if (want.size === 0) return { sent: 0, failed: 0, gone: 0 };

  const vapid = await resolveVapidKeys();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const rows = await loadClubSubscriptions(input.clubId);
  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url || '/app/parent',
  });

  let sent = 0;
  let failed = 0;
  let gone = 0;
  const keep: PushSubscriptionRecord[] = [];
  const drop = new Set<string>();

  for (const row of rows) {
    if (!want.has(row.userId)) {
      keep.push(row);
      continue;
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: row.keys,
        },
        payload,
        { TTL: 60 * 60 * 12 },
      );
      sent += 1;
      keep.push(row);
    } catch (err) {
      const status = Number((err as { statusCode?: number })?.statusCode ?? 0);
      if (status === 404 || status === 410) {
        gone += 1;
        drop.add(row.endpoint);
      } else {
        failed += 1;
        keep.push(row);
      }
    }
  }

  if (drop.size > 0) {
    await saveClubSubscriptions(
      input.clubId,
      keep.filter((row) => !drop.has(row.endpoint)),
    );
  }

  return { sent, failed, gone };
}
