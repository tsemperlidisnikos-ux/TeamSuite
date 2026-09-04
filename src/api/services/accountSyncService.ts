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
  applyingCloudAccount = true;
  try {
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
    }
  } finally {
    applyingCloudAccount = false;
  }
}

const ACCOUNT_UPDATED_AT_KEY = 'teamsuite-account-bundle-at-v1';
let applyingCloudAccount = false;
let accountPushTimer: ReturnType<typeof setTimeout> | null = null;

function readAccountUpdatedAt(): string | null {
  try {
    return localStorage.getItem(ACCOUNT_UPDATED_AT_KEY);
  } catch {
    return null;
  }
}

function writeAccountUpdatedAt(at: string | null) {
  try {
    if (!at) localStorage.removeItem(ACCOUNT_UPDATED_AT_KEY);
    else localStorage.setItem(ACCOUNT_UPDATED_AT_KEY, at);
  } catch {
    /* ignore */
  }
}

function isCloudStampNewer(cloudAt: string | null | undefined, localAt: string | null): boolean {
  if (!cloudAt) return false;
  if (!localAt) return true;
  return cloudAt > localAt;
}

function financeCatalogSignature(config: PlatformConfig | null | undefined): string {
  if (!config) return '';
  return JSON.stringify({
    income: config.incomeCategories ?? [],
    expense: config.expenseCategories ?? [],
    incomeDescriptions: config.incomeDescriptions ?? {},
    expenseDescriptions: config.expenseDescriptions ?? {},
  });
}

function cloudFinanceCatalogDiffers(cloud: PlatformConfig | null | undefined): boolean {
  if (!cloud) return false;
  return financeCatalogSignature(cloud) !== financeCatalogSignature(loadPlatformConfig());
}

/** Debounced push of users/clubs/platformConfig (κατηγορίες εσόδων-εξόδων κ.λπ.). */
export function scheduleAccountBundlePush() {
  if (applyingCloudAccount) return;
  const session = getSession();
  if (session?.role !== 'platform_admin') return;

  if (accountPushTimer) clearTimeout(accountPushTimer);
  accountPushTimer = setTimeout(() => {
    accountPushTimer = null;
    void flushAccountBundlePush();
  }, 400);
}

export async function flushAccountBundlePush() {
  if (accountPushTimer) {
    clearTimeout(accountPushTimer);
    accountPushTimer = null;
  }
  const session = getSession();
  if (session?.role !== 'platform_admin') {
    return { success: true as const, skipped: true as const, error: null };
  }
  const result = await pushAccountBundle();
  if (result.success && result.data?.updatedAt) {
    writeAccountUpdatedAt(result.data.updatedAt);
  }
  return result;
}

/** Pull account bundle when cloud is newer so το 2ο laptop βλέπει κατηγορίες/ρυθμίσεις. */
export async function pullAccountBundleIfNewer() {
  const { getSessionToken } = await import('./sessionService');
  const { isDemoSessionActive } = await import('../../auth/auth');
  if (!getSessionToken() || isDemoSessionActive()) {
    return { success: true as const, pulled: false, error: null };
  }

  if (accountPushTimer) {
    await flushAccountBundlePush();
  }

  const result = await pullAccountBundle();
  if (!result.success || !result.data || result.data.durable === false) {
    return {
      success: result.success,
      pulled: false,
      error: result.error ?? null,
    };
  }

  const cloudAt = result.data.updatedAt ?? null;
  const localAt = readAccountUpdatedAt();
  const catalogDiff = cloudFinanceCatalogDiffers(result.data.platformConfig);
  if (!catalogDiff && localAt && !isCloudStampNewer(cloudAt, localAt)) {
    return { success: true as const, pulled: false, error: null };
  }
  if (!catalogDiff && !cloudAt && Boolean(localAt)) {
    return { success: true as const, pulled: false, error: null };
  }

  applyAccountBundle(result.data, { mergeLocalUsers: true });
  if (cloudAt) writeAccountUpdatedAt(cloudAt);
  return { success: true as const, pulled: true, error: null };
}
