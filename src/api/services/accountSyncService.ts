import { apiClient } from '../apiClient';
import { syncAuthHeaders } from '../syncAuth';
import { getSession, getUsers, saveUsers, type AppUser } from '../../auth/auth';
import { getClubs, mergeClubCatalog, saveClubs, type Club } from '../../auth/clubs';
import {
  applyPlatformBranding,
  clearStampedRoleDefaultPermissions,
  loadPlatformConfig,
  savePlatformConfig,
  type PlatformConfig,
} from '../../platform/platformConfig';

export type AccountBundlePayload = {
  users: AppUser[];
  clubs: Club[];
  platformConfig?: PlatformConfig | null;
  platformBranding?: {
    appearanceTheme?: PlatformConfig['appearanceTheme'];
    appName?: string;
    appLogoUrl?: string | null;
  } | null;
  updatedAt?: string | null;
  durable?: boolean;
};

function syncErrorMessage(json: { error?: string }, fallback: string) {
  const error = (json.error ?? '').trim();
  if (error === 'No account bundle') {
    return 'Δεν βρέθηκε cloud account. Ο Platform Admin πρέπει να κάνει Push από Backup.';
  }
  return error || fallback;
}

async function parseSyncJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const clipped = text.replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new Error(
      clipped
        ? `Το cloud δεν απάντησε σωστά (${response.status}): ${clipped}`
        : `Account sync HTTP ${response.status}`,
    );
  }
}

function payloadForAccountPush() {
  const session = getSession();
  if (session?.role === 'platform_admin') {
    return {
      users: getUsers(),
      clubs: getClubs(),
      platformConfig: loadPlatformConfig(),
    };
  }
  return {
    users: getUsers(),
    clubs: [] as Club[],
    platformConfig: null,
  };
}

export async function pushAccountBundle() {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify(payloadForAccountPush()),
    });
    const json = await parseSyncJson<{ ok?: boolean; error?: string; updatedAt?: string }>(response);
    if (!response.ok || !json.ok) {
      throw new Error(syncErrorMessage(json, `Account push HTTP ${response.status}`));
    }
    return { updatedAt: json.updatedAt ?? null };
  });
}

export async function upsertCloudUser(user: AppUser) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=user', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify({ user }),
    });
    const json = await parseSyncJson<{ ok?: boolean; error?: string; updatedAt?: string }>(response);
    if (!response.ok || !json.ok) {
      throw new Error(syncErrorMessage(json, `Account user HTTP ${response.status}`));
    }
    return { updatedAt: json.updatedAt ?? null };
  });
}

export async function removeCloudUser(userId: string) {
  return apiClient(async () => {
    const response = await fetch(
      `/api/sync/account?kind=user&id=${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: syncAuthHeaders(),
        body: JSON.stringify({ id: userId }),
      },
    );
    const json = await parseSyncJson<{ ok?: boolean; error?: string; updatedAt?: string }>(response);
    if (response.status === 404) {
      return { updatedAt: json.updatedAt ?? null };
    }
    if (!response.ok || !json.ok) {
      throw new Error(syncErrorMessage(json, `Account user delete HTTP ${response.status}`));
    }
    return { updatedAt: json.updatedAt ?? null };
  });
}

export async function pullAccountBundle() {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account', {
      headers: syncAuthHeaders(false),
    });
    const json = await parseSyncJson<{
      ok?: boolean;
      error?: string;
      users?: AppUser[];
      clubs?: Club[];
      platformConfig?: PlatformConfig | null;
      platformBranding?: AccountBundlePayload['platformBranding'];
      updatedAt?: string;
      durable?: boolean;
    }>(response);
    if (response.status === 404) {
      throw new Error('Δεν υπάρχει cloud account bundle. Κάντε πρώτα Push.');
    }
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Account pull HTTP ${response.status}`);
    }
    if (!Array.isArray(json.users) || !Array.isArray(json.clubs)) {
      throw new Error('Μη έγκυρο account bundle.');
    }
    return {
      users: json.users,
      clubs: json.clubs,
      platformConfig: json.platformConfig ?? null,
      platformBranding: json.platformBranding ?? null,
      updatedAt: json.updatedAt ?? null,
      durable: json.durable !== false,
    } satisfies AccountBundlePayload;
  });
}

/** Εφαρμόζει cloud users/clubs/config τοπικά (source of truth). */
export function applyAccountBundle(
  bundle: AccountBundlePayload,
  options?: { mergeLocalUsers?: boolean },
) {
  if (bundle.durable === false) return;
  if (bundle.platformConfig) {
    savePlatformConfig(bundle.platformConfig);
  } else if (bundle.platformBranding) {
    applyPlatformBranding(bundle.platformBranding);
  }

  const cleanedUsers = clearStampedRoleDefaultPermissions(bundle.users).map((user) => {
    // Tenant pulls omit password hashes — keep any existing local hash.
    if (user.password) return user;
    const local = getUsers().find((row) => row.id === user.id);
    return local?.password ? { ...user, password: local.password } : user;
  });

  if (options?.mergeLocalUsers) {
    const cloudUsers = cleanedUsers;
    const localUsers = clearStampedRoleDefaultPermissions(getUsers());
    const byId = new Map(cloudUsers.map((u) => [u.id, u]));
    const cloudEmails = new Set(cloudUsers.map((u) => u.email.toLowerCase()));
    for (const local of localUsers) {
      if (byId.has(local.id)) continue;
      if (cloudEmails.has(local.email.toLowerCase())) continue;
      byId.set(local.id, local);
    }
    saveUsers([...byId.values()]);
  } else {
    saveUsers(cleanedUsers);
  }
  saveClubs(mergeClubCatalog(getClubs(), bundle.clubs));
}
