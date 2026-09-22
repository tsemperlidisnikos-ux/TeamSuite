import { getUsers } from '../../auth/auth';
import { getData } from '../../data/repository';
import { syncAuthHeaders } from '../syncAuth';
import {
  parentUserIdsForAnnouncement,
  parentUserIdsForAthletes,
  parentUserIdsForClass,
} from '../../utils/parentPushTargets';
import type { AnnouncementInput } from '../../schemas';

export type PushSendInput = {
  clubId: string;
  userIds: string[];
  title: string;
  body: string;
  url?: string;
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  const response = await fetch('/api/push?op=vapid', { method: 'GET' });
  const json = await readJson(response);
  const key = String(json.publicKey ?? '').trim();
  return response.ok && key ? key : null;
}

export async function registerParentServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function subscribeParentPush(clubId: string): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) {
    return { ok: false, error: 'Το κινητό δεν υποστηρίζει ειδοποιήσεις εφαρμογής.' };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: 'Δεν δόθηκε άδεια ειδοποιήσεων.' };
  }
  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) {
    return { ok: false, error: 'Οι ειδοποιήσεις δεν είναι διαθέσιμες στον διακομιστή.' };
  }
  const registration = await registerParentServiceWorker();
  if (!registration) {
    return { ok: false, error: 'Αποτυχία εγκατάστασης υπηρεσίας ειδοποιήσεων.' };
  }
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));
  const json = subscription.toJSON();
  const response = await fetch('/api/push', {
    method: 'POST',
    headers: syncAuthHeaders(),
    body: JSON.stringify({
      op: 'subscribe',
      clubId,
      subscription: {
        endpoint: json.endpoint,
        keys: json.keys,
      },
    }),
  });
  const body = await readJson(response);
  if (!response.ok) {
    return { ok: false, error: String(body.error ?? 'Αποτυχία εγγραφής ειδοποιήσεων.') };
  }
  return { ok: true };
}

export async function unsubscribeParentPush(clubId: string): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  const endpoint = subscription?.endpoint;
  if (subscription) await subscription.unsubscribe();
  await fetch('/api/push', {
    method: 'POST',
    headers: syncAuthHeaders(),
    body: JSON.stringify({ op: 'unsubscribe', clubId, endpoint }),
  }).catch(() => undefined);
}

export async function sendParentPush(input: PushSendInput): Promise<{ sent: number }> {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  if (!input.clubId || userIds.length === 0) return { sent: 0 };
  const response = await fetch('/api/push', {
    method: 'POST',
    headers: syncAuthHeaders(),
    body: JSON.stringify({
      op: 'send',
      clubId: input.clubId,
      userIds,
      title: input.title,
      body: input.body,
      url: input.url ?? '/app/parent',
    }),
  });
  const json = await readJson(response);
  return { sent: Number(json.sent ?? 0) };
}

function liveUsers() {
  return getUsers().map((user) => ({
    id: user.id,
    role: user.role,
    active: user.active,
  }));
}

export function announcementParentUserIds(input: {
  audienceRoles?: AnnouncementInput['audienceRoles'];
  classIds?: AnnouncementInput['classIds'];
  recipientIds?: AnnouncementInput['recipientIds'];
  status?: AnnouncementInput['status'];
  sportCategories?: string;
  teamsLabel?: string;
}): string[] {
  const data = getData();
  return parentUserIdsForAnnouncement({
    announcement: {
      status: input.status ?? 'published',
      audienceRoles: input.audienceRoles ?? [],
      classIds: input.classIds ?? [],
      recipientIds: input.recipientIds ?? [],
      sportCategories: input.sportCategories ?? '',
      teamsLabel: input.teamsLabel ?? '',
    },
    students: data.students ?? [],
    classes: data.classes ?? [],
    parentLinks: data.parentLinks ?? [],
    users: liveUsers(),
  });
}

export function classParentUserIds(classId: string): string[] {
  const data = getData();
  return parentUserIdsForClass({
    classId,
    students: data.students ?? [],
    parentLinks: data.parentLinks ?? [],
    users: liveUsers(),
  });
}

export function athleteParentUserIds(athleteIds: string[]): string[] {
  const data = getData();
  return parentUserIdsForAthletes({
    athleteIds,
    parentLinks: data.parentLinks ?? [],
    users: liveUsers(),
  });
}

