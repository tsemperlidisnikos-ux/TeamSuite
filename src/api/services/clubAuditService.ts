import { apiClient } from '../apiClient';
import { syncAuthHeaders } from '../syncAuth';
import { getSession, isDemoSessionActive, isPresentationDemoEmail } from '../../auth/auth';
import { resolveActiveClubId } from '../../data/store';
import { pullClubMirror, pushClubMirror } from './backendSyncService';
import { replaceClubData } from '../../data/repository';
import type { AppData } from '../../types';
import type { ClubAuditChange } from '../../data/clubAuditDiff';

export type ClubAuditAction = 'login' | 'logout' | 'change' | 'undo';

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
  undo?: { changes: ClubAuditChange[] } | null;
  undoReason?: string | null;
  revertedEventIds?: string[];
  snapshotId?: string | null;
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
  undo?: { changes: ClubAuditChange[] } | null;
  undoReason?: string | null;
  revertedEventIds?: string[];
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
    undo: input.undo ?? null,
    undoReason: input.undoReason ?? null,
    revertedEventIds: input.revertedEventIds ?? [],
  };

  void pushClubAudit(event);
}

const TOMBSTONES: Partial<Record<ClubAuditChange['collection'], keyof AppData>> = {
  attendance: 'deletedAttendanceIds',
  trainings: 'deletedTrainingIds',
  schedule: 'deletedScheduleIds',
  announcements: 'deletedAnnouncementIds',
  matches: 'deletedMatchIds',
  products: 'deletedProductIds',
  stockMovements: 'deletedStockMovementIds',
};

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function applyUndoChange(data: AppData, change: ClubAuditChange): void {
  const store = data as unknown as Record<string, unknown>;
  const rows = Array.isArray(store[change.collection])
    ? [...(store[change.collection] as Array<Record<string, unknown>>)]
    : [];
  const index = rows.findIndex((row) => String(row.id ?? '') === change.entityId);
  const current = index >= 0 ? rows[index] : null;
  if (!sameValue(current, change.after)) {
    throw new Error(
      `Η εγγραφή ${change.entityId} έχει αλλάξει μετά την καταγραφή. Η αναίρεση σταμάτησε για αποφυγή απώλειας νεότερων δεδομένων.`,
    );
  }
  if (change.before) {
    if (index >= 0) rows[index] = structuredClone(change.before);
    else rows.push(structuredClone(change.before));
  } else if (index >= 0) {
    rows.splice(index, 1);
  }
  store[change.collection] = rows;

  const tombstoneKey = TOMBSTONES[change.collection];
  if (!tombstoneKey) return;
  const deleted = new Set(
    Array.isArray(store[tombstoneKey as string])
      ? (store[tombstoneKey as string] as string[])
      : [],
  );
  if (change.before) deleted.delete(change.entityId);
  else deleted.add(change.entityId);
  store[tombstoneKey as string] = [...deleted];
}

export async function undoClubAuditEvents(
  clubId: string,
  events: ClubAuditEvent[],
  reason: string,
) {
  return apiClient(async () => {
    if (!clubId || clubId === PLATFORM_AUDIT_CLUB_ID) {
      throw new Error('Επιλέξτε σύλλογο για αναίρεση.');
    }
    if (!events.length || events.some((event) => event.action !== 'change' || !event.undo?.changes.length)) {
      throw new Error('Μία ή περισσότερες επιλεγμένες κινήσεις δεν υποστηρίζουν αναίρεση.');
    }
    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      throw new Error('Γράψτε αιτιολογία αναίρεσης τουλάχιστον 5 χαρακτήρων.');
    }
    const remote = await pullClubMirror(clubId);
    if (!remote.success || !remote.data) {
      throw new Error(remote.error ?? 'Αποτυχία φόρτωσης των τρεχόντων δεδομένων του συλλόγου.');
    }
    const next = structuredClone(remote.data.payload);
    const newestFirst = [...events].sort((a, b) => b.at.localeCompare(a.at));
    for (const event of newestFirst) {
      for (const change of [...event.undo!.changes].reverse()) applyUndoChange(next, change);
    }
    const snapshot = await createClubUndoSnapshot({
      clubId,
      eventIds: events.map((event) => event.id),
      reason: cleanReason,
      expectedUpdatedAt: remote.data.updatedAt,
    });
    if (!snapshot.success || !snapshot.data) {
      throw new Error(
        snapshot.error ?? 'Η αναίρεση σταμάτησε επειδή απέτυχε το αυτόματο snapshot.',
      );
    }
    replaceClubData(clubId, next, { skipCloudPush: true });
    const pushed = await pushClubMirror(clubId, { baseUpdatedAt: remote.data.updatedAt });
    if (!pushed.success) {
      replaceClubData(clubId, remote.data.payload, { skipCloudPush: true });
      throw new Error(pushed.error ?? 'Αποτυχία συγχρονισμού της αναίρεσης.');
    }

    const session = getSession();
    if (session) {
      const auditEvent: ClubAuditEvent = {
        id: `ca_${crypto.randomUUID()}`,
        at: new Date().toISOString(),
        clubId,
        clubName: clubNameOf(clubId),
        userId: session.id,
        email: session.email,
        fullName: session.fullName,
        role: session.role,
        action: 'undo',
        summary: `Αναίρεση ${events.length} ${events.length === 1 ? 'κίνησης' : 'κινήσεων'} · Αιτιολογία: ${cleanReason}`.slice(0, 500),
        undo: null,
        undoReason: 'Η αναίρεση καταγράφεται μόνιμα και δεν αναιρείται αυτόματα.',
        revertedEventIds: events.map((event) => event.id),
        snapshotId: snapshot.data.id,
      };
      const logged = await pushClubAudit(auditEvent);
      if (!logged.success) throw new Error(logged.error ?? 'Η αναίρεση έγινε, αλλά απέτυχε η καταγραφή της.');
    }
    return { reverted: events.map((event) => event.id), snapshotId: snapshot.data.id };
  });
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

export async function deleteClubAuditRecord(clubId: string, id: string) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=club-audit', {
      method: 'DELETE',
      headers: syncAuthHeaders(),
      body: JSON.stringify({ clubId, id }),
    });
    const json = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Club audit HTTP ${response.status}`);
    }
    return { id };
  });
}

export async function clearClubAuditRecords(clubId: string) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=club-audit', {
      method: 'DELETE',
      headers: syncAuthHeaders(),
      body: JSON.stringify({ clubId, all: true }),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      cleared?: number;
    };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Club audit HTTP ${response.status}`);
    }
    return { cleared: json.cleared ?? 0 };
  });
}

async function createClubUndoSnapshot(input: {
  clubId: string;
  eventIds: string[];
  reason: string;
  expectedUpdatedAt: string | null;
}) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=club-audit-snapshot', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify(input),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      id?: string;
      snapshotAt?: string;
      mirrorUpdatedAt?: string;
      durable?: boolean;
    };
    if (!response.ok || !json.ok || !json.id) {
      throw new Error(json.error || `Undo snapshot HTTP ${response.status}`);
    }
    if (!json.durable) {
      throw new Error('Το cloud store δεν είναι ενεργό. Η αναίρεση σταμάτησε επειδή δεν μπορεί να δημιουργηθεί ασφαλές snapshot.');
    }
    return {
      id: json.id,
      snapshotAt: json.snapshotAt ?? null,
      mirrorUpdatedAt: json.mirrorUpdatedAt ?? null,
    };
  });
}
