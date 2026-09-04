import { apiClient } from '../apiClient';
import { syncAuthHeaders } from '../syncAuth';
import { getSession, isDemoSessionActive, isPresentationDemoEmail } from '../../auth/auth';
import { resolveActiveClubId } from '../../data/store';

export type ClubAuditAction = 'login' | 'logout' | 'change';

export type ClubAuditEvent = {
  id: string;
  at: string;
  clubId: string;
  clubName: string | null;
  userId: string;
  email: string;
  fullName: string;
  role: string;
  action: ClubAuditAction;
  summary: string;
};

export const PLATFORM_AUDIT_CLUB_ID = '_platform';

function clubNameOf(clubId: string): string | null {
  if (clubId === PLATFORM_AUDIT_CLUB_ID) return 'Πλατφόρμα';
  try {
    const raw = localStorage.getItem('academyhub-clubs-v1');
    if (!raw) return null;
    const clubs = JSON.parse(raw) as Array<{ id: string; name?: string }>;
    return clubs.find((c) => c.id === clubId)?.name ?? null;
  } catch {
    return null;
  }
}

export function recordClubAudit(input: {
  action: ClubAuditAction;
  summary: string;
  clubId?: string | null;
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    clubId?: string | null;
  } | null;
}): void {
  const session = input.user ?? getSession();
  if (!session) return;
  if (isDemoSessionActive() || isPresentationDemoEmail(session.email)) return;

  const clubId =
    (input.clubId ?? session.clubId ?? resolveActiveClubId() ?? PLATFORM_AUDIT_CLUB_ID).trim() ||
    PLATFORM_AUDIT_CLUB_ID;

  const event: ClubAuditEvent = {
    id: `ca_${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    clubId,
    clubName: clubNameOf(clubId),
    userId: session.id,
    email: session.email,
    fullName: session.fullName,
    role: session.role,
    action: input.action,
    summary: input.summary.slice(0, 500),
  };

  void pushClubAudit(event);
}

export async function pushClubAudit(event: ClubAuditEvent) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=club-audit', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify(event),
    });
    const json = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Club audit HTTP ${response.status}`);
    }
    return { id: event.id };
  });
}

export async function fetchClubAudit(clubId: string, limit = 400) {
  return apiClient(async () => {
    const response = await fetch(
      `/api/sync/account?kind=club-audit&clubId=${encodeURIComponent(clubId)}&limit=${encodeURIComponent(String(limit))}`,
      { headers: syncAuthHeaders(false) },
    );
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      durable?: boolean;
      events?: ClubAuditEvent[];
    };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Club audit HTTP ${response.status}`);
    }
    return {
      events: Array.isArray(json.events) ? json.events : [],
      durable: Boolean(json.durable),
    };
  });
}
