import { z } from 'zod';
import { apiClient } from '../apiClient';
import { syncAuthHeaders } from '../syncAuth';

const LOCAL_KEY = 'ss360-login-activity-local-v1';
const LOCAL_MAX = 200;
const CLUBS_KEY = 'academyhub-clubs-v1';

export type LoginActivityUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  clubId?: string | null;
};

export type LoginActivityEvent = {
  id: string;
  at: string;
  userId: string;
  email: string;
  fullName: string;
  role: string;
  clubId: string | null;
  clubName: string | null;
  source: 'login' | 'impersonate';
  userAgent?: string | null;
};

const loginActivitySchema = z.object({
  id: z.string().min(1),
  at: z.string().min(1),
  userId: z.string().min(1),
  email: z.string().min(1),
  fullName: z.string().min(1),
  role: z.string().min(1),
  clubId: z.string().nullable(),
  clubName: z.string().nullable(),
  source: z.enum(['login', 'impersonate']),
  userAgent: z.string().nullable().optional(),
});

/** Resolve club name without importing clubs.ts (avoids auth ↔ clubs cycle). */
function resolveClubName(clubId: string | null | undefined): string | null {
  if (!clubId) return null;
  try {
    const raw = localStorage.getItem(CLUBS_KEY);
    if (!raw) return null;
    const clubs = JSON.parse(raw) as Array<{ id: string; name?: string }>;
    return clubs.find((c) => c.id === clubId)?.name ?? null;
  } catch {
    return null;
  }
}

function readLocal(): LoginActivityEvent[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => loginActivitySchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data);
  } catch {
    return [];
  }
}

function writeLocal(events: LoginActivityEvent[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(events.slice(0, LOCAL_MAX)));
}

function appendLocal(event: LoginActivityEvent): void {
  const prev = readLocal();
  writeLocal([event, ...prev.filter((e) => e.id !== event.id)]);
}

export function buildLoginActivityEvent(
  user: LoginActivityUser,
  source: 'login' | 'impersonate',
): LoginActivityEvent {
  const clubName = resolveClubName(user.clubId);
  return {
    id: `la_${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    clubId: user.clubId ?? null,
    clubName: clubName ?? (user.role === 'platform_admin' ? 'Πλατφόρμα' : null),
    source,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
  };
}

/** Fire-and-forget: local mirror + cloud append. Never blocks login. */
export function recordLoginActivity(
  user: LoginActivityUser,
  source: 'login' | 'impersonate',
): void {
  const event = buildLoginActivityEvent(user, source);
  try {
    appendLocal(event);
  } catch {
    /* ignore quota */
  }
  void pushLoginActivity(event);
}

export async function pushLoginActivity(event: LoginActivityEvent) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=login-activity', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify(event),
    });
    const json = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Login activity HTTP ${response.status}`);
    }
    return { id: event.id };
  });
}

export async function fetchLoginActivity(limit = 100) {
  return apiClient(async () => {
    const response = await fetch(
      `/api/sync/account?kind=login-activity&limit=${encodeURIComponent(String(limit))}`,
      { headers: syncAuthHeaders(false) },
    );
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      durable?: boolean;
      events?: unknown;
    };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Login activity HTTP ${response.status}`);
    }
    const cloud = Array.isArray(json.events)
      ? json.events
          .map((item) => loginActivitySchema.safeParse(item))
          .filter((r) => r.success)
          .map((r) => r.data)
      : [];

    const local = readLocal();
    const byId = new Map<string, LoginActivityEvent>();
    for (const e of [...cloud, ...local]) {
      if (!byId.has(e.id)) byId.set(e.id, e);
    }
    const merged = [...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
    return { events: merged, durable: Boolean(json.durable) };
  });
}

function removeLocal(id?: string, all = false): void {
  try {
    if (all) {
      localStorage.removeItem(LOCAL_KEY);
      return;
    }
    if (!id) return;
    writeLocal(readLocal().filter((e) => e.id !== id));
  } catch {
    /* ignore */
  }
}

export async function deleteLoginActivityRecord(id: string) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=login-activity', {
      method: 'DELETE',
      headers: syncAuthHeaders(),
      body: JSON.stringify({ id }),
    });
    const json = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Login activity HTTP ${response.status}`);
    }
    removeLocal(id);
    return { id };
  });
}

export async function clearLoginActivityRecords() {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=login-activity', {
      method: 'DELETE',
      headers: syncAuthHeaders(),
      body: JSON.stringify({ all: true }),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      cleared?: number;
    };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Login activity HTTP ${response.status}`);
    }
    removeLocal(undefined, true);
    return { cleared: json.cleared ?? 0 };
  });
}
