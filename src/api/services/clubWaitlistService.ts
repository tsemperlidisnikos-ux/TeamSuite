import { z } from 'zod';
import { apiClient } from '../apiClient';
import { syncAuthHeaders } from '../syncAuth';

const LOCAL_KEY = 'sportsuite360-academy-waitlist-v1';
const LOCAL_MAX = 200;

export type ClubWaitlistStatus = 'pending' | 'approved' | 'rejected';

export type ClubWaitlistEntry = {
  id: string;
  clubName: string;
  adminFullName: string;
  email: string;
  phone: string;
  sport: string;
  levels: string[];
  createdAt: string;
  dpaAcceptedAt: string;
  status: ClubWaitlistStatus;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  clubId?: string | null;
};

export type ClubWaitlistSubmitInput = {
  clubName: string;
  adminFullName: string;
  email: string;
  phone: string;
  sport: string;
  levels: string[];
  dpaAcceptedAt: string;
};

const waitlistSchema = z.object({
  id: z.string().min(1),
  clubName: z.string().min(1),
  adminFullName: z.string().min(1),
  email: z.string().min(1),
  phone: z.string().min(1),
  sport: z.string().min(1),
  levels: z.array(z.string()).optional().default([]),
  createdAt: z.string().min(1),
  dpaAcceptedAt: z.string().min(1),
  status: z.enum(['pending', 'approved', 'rejected']).optional().default('pending'),
  approvedAt: z.string().nullable().optional(),
  rejectedAt: z.string().nullable().optional(),
  clubId: z.string().nullable().optional(),
});

function normalize(entry: z.infer<typeof waitlistSchema>): ClubWaitlistEntry {
  return {
    id: entry.id,
    clubName: entry.clubName,
    adminFullName: entry.adminFullName,
    email: entry.email,
    phone: entry.phone,
    sport: entry.sport,
    levels: entry.levels ?? [],
    createdAt: entry.createdAt,
    dpaAcceptedAt: entry.dpaAcceptedAt,
    status: entry.status ?? 'pending',
    approvedAt: entry.approvedAt ?? null,
    rejectedAt: entry.rejectedAt ?? null,
    clubId: entry.clubId ?? null,
  };
}

function readLocal(): ClubWaitlistEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => waitlistSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => normalize(r.data));
  } catch {
    return [];
  }
}

function writeLocal(entries: ClubWaitlistEntry[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(entries.slice(0, LOCAL_MAX)));
}

function upsertLocal(entry: ClubWaitlistEntry): void {
  const prev = readLocal();
  writeLocal([entry, ...prev.filter((e) => e.id !== entry.id)]);
}

function removeLocal(id: string): void {
  writeLocal(readLocal().filter((e) => e.id !== id));
}

function parseEntries(raw: unknown): ClubWaitlistEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => waitlistSchema.safeParse(item))
    .filter((r) => r.success)
    .map((r) => normalize(r.data));
}

export async function submitClubWaitlist(input: ClubWaitlistSubmitInput) {
  return apiClient(async () => {
    const entry: ClubWaitlistEntry = {
      id: `wl_${crypto.randomUUID()}`,
      clubName: input.clubName.trim(),
      adminFullName: input.adminFullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      sport: input.sport.trim(),
      levels: input.levels,
      createdAt: new Date().toISOString(),
      dpaAcceptedAt: input.dpaAcceptedAt,
      status: 'pending',
    };
    upsertLocal(entry);

    const response = await fetch('/api/sync/account?kind=club-waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      durable?: boolean;
      emailed?: boolean;
      emailError?: string | null;
    };
    if (response.status === 409) {
      throw new Error(json.error || 'Υπάρχει ήδη αίτηση με αυτό το email');
    }
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Αποτυχία αποθήκευσης αίτησης (HTTP ${response.status})`);
    }
    return {
      id: entry.id,
      durable: Boolean(json.durable),
      emailed: Boolean(json.emailed),
      emailError: json.emailError ?? null,
    };
  });
}

export async function fetchClubWaitlist(limit = 200) {
  return apiClient(async () => {
    const response = await fetch(
      `/api/sync/account?kind=club-waitlist&limit=${encodeURIComponent(String(limit))}`,
      { headers: syncAuthHeaders(false) },
    );
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      durable?: boolean;
      entries?: unknown;
    };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Waitlist HTTP ${response.status}`);
    }
    const cloud = parseEntries(json.entries)
      .filter((e) => e.status !== 'rejected')
      .slice(0, limit);
    writeLocal(cloud);
    return { entries: cloud, durable: Boolean(json.durable) };
  });
}

export async function updateClubWaitlistStatus(input: {
  id: string;
  action: 'approve' | 'reject';
  clubId?: string | null;
}) {
  return apiClient(async () => {
    const response = await fetch(
      `/api/sync/account?kind=club-waitlist&action=${encodeURIComponent(input.action)}`,
      {
        method: 'POST',
        headers: syncAuthHeaders(),
        body: JSON.stringify({
          action: input.action,
          id: input.id,
          clubId: input.clubId ?? null,
        }),
      },
    );
    const json = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      durable?: boolean;
      entry?: unknown;
    };
    if (input.action === 'reject') {
      if (response.status === 401 || response.status === 403) {
        throw new Error(json.error || 'Δεν έχετε δικαίωμα απόρριψης');
      }
      removeLocal(input.id);
      if (response.ok || response.status === 404) {
        return { entry: null, durable: Boolean(json.durable) };
      }
      throw new Error(json.error || `Waitlist update HTTP ${response.status}`);
    }
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Waitlist update HTTP ${response.status}`);
    }
    const parsed = waitlistSchema.safeParse(json.entry);
    if (parsed.success) {
      upsertLocal(normalize(parsed.data));
      return { entry: normalize(parsed.data), durable: Boolean(json.durable) };
    }
    return { entry: null, durable: Boolean(json.durable) };
  });
}
