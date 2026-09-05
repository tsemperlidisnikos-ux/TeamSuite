import { apiClient } from '../apiClient';
import { syncAuthHeaders } from '../syncAuth';
import { getClubData } from '../../data/repository';
import { stripHeavyMedia } from '../../data/mediaStrip';
import type { AppData } from '../../types';
import {
  decryptSensitivePayloadFromCloud,
  encryptSensitivePayloadForCloud,
} from '../../utils/sensitiveCrypto';
import { ensureAmkaFieldKeyFetcherWired } from './amkaFieldKeyService';

ensureAmkaFieldKeyFetcherWired();

function isAppDataPayload(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return Array.isArray(data.students) && Array.isArray(data.classes);
}

export async function pushClubMirror(
  clubId: string,
  opts?: { baseUpdatedAt?: string | null },
) {
  return apiClient(async () => {
    const local = getClubData(clubId);
    const payload = await encryptSensitivePayloadForCloud(stripHeavyMedia(local), clubId);
    const response = await fetch('/api/sync/mirror', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify({
        clubId,
        payload,
        baseUpdatedAt: opts?.baseUpdatedAt ?? null,
      }),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      code?: string;
      updatedAt?: string;
      conflict?: boolean;
      payload?: unknown;
    };

    if (response.status === 401) {
      const { logoutIfSessionReplaced } = await import('../sessionReplaced');
      logoutIfSessionReplaced(json.error, json.code);
    }

    if (response.status === 409 || json.conflict) {
      const err = new Error(json.error || 'Mirror conflict') as Error & {
        conflict?: boolean;
        remoteUpdatedAt?: string;
        remotePayload?: AppData;
      };
      err.conflict = true;
      err.remoteUpdatedAt = json.updatedAt;
      if (isAppDataPayload(json.payload)) {
        err.remotePayload = await decryptSensitivePayloadFromCloud(json.payload, clubId);
      }
      throw err;
    }

    if (!response.ok || !json.ok) {
      throw new Error(
        json.error ||
          (response.status === 404
            ? 'Το sync API είναι διαθέσιμο μόνο στο production (Vercel).'
            : `Sync HTTP ${response.status}`),
      );
    }
    return { updatedAt: json.updatedAt ?? null };
  });
}

export async function pullClubMirror(clubId: string) {
  return apiClient(async () => {
    const response = await fetch(`/api/sync/mirror?clubId=${encodeURIComponent(clubId)}`, {
      headers: syncAuthHeaders(false),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      code?: string;
      updatedAt?: string;
      payload?: unknown;
      durable?: boolean;
    };
    if (response.status === 401) {
      const { logoutIfSessionReplaced } = await import('../sessionReplaced');
      logoutIfSessionReplaced(json.error, json.code);
    }
    if (response.status === 404) {
      throw new Error(
        json.error === 'No mirror for club'
          ? 'Δεν υπάρχει αποθηκευμένο mirror για αυτόν τον σύλλογο. Κάντε πρώτα Push.'
          : 'Το sync API είναι διαθέσιμο μόνο στο production (Vercel).',
      );
    }
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Pull HTTP ${response.status}`);
    }
    if (!isAppDataPayload(json.payload)) {
      throw new Error('Το mirror δεν περιέχει έγκυρα δεδομένα συλλόγου.');
    }
    const payload = await decryptSensitivePayloadFromCloud(json.payload, clubId);
    return {
      updatedAt: json.updatedAt ?? null,
      durable: json.durable !== false,
      payload,
    };
  });
}

export async function upsertClubStudents(clubId: string, students: AppData['students']) {
  return apiClient(async () => {
    const encrypted = await encryptSensitivePayloadForCloud({ students }, clubId);
    const response = await fetch('/api/sync/mirror-students', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify({
        clubId,
        students: encrypted.students ?? [],
      }),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      code?: string;
      updatedAt?: string;
      studentCount?: number;
    };
    if (response.status === 401) {
      const { logoutIfSessionReplaced } = await import('../sessionReplaced');
      logoutIfSessionReplaced(json.error, json.code);
    }
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Upsert HTTP ${response.status}`);
    }
    return {
      updatedAt: json.updatedAt ?? null,
      studentCount: json.studentCount ?? students.length,
    };
  });
}
