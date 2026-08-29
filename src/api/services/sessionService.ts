import { applyPlatformBranding } from '../../platform/platformConfig';
import { apiClient } from '../apiClient';
import { syncAuthHeaders } from '../syncAuth';

const TOKEN_KEY = 'teamsuite-session-token-v1';

export type ServerSessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  clubId?: string | null;
  active?: boolean;
};

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export async function serverLogin(email: string, password: string) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password }),
    });
    let json: {
      ok?: boolean;
      error?: string;
      code?: string;
      token?: string;
      user?: ServerSessionUser;
      branding?: {
        appearanceTheme?: string;
        appName?: string;
        appLogoUrl?: string | null;
      };
    } = {};
    try {
      json = (await response.json()) as typeof json;
    } catch {
      json = {};
    }
    if (!response.ok || !json.ok || !json.token || !json.user) {
      throw new Error(
        json.error || json.code || `Session login HTTP ${response.status}`,
      );
    }
    setSessionToken(json.token);
    if (json.branding) {
      applyPlatformBranding(json.branding);
    }
    return { token: json.token, user: json.user };
  });
}

export type SessionVerifyFailureCode = 'invalid' | 'expired_usage' | 'transient';

export type SessionVerifyResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  code?: SessionVerifyFailureCode;
};

function classifyVerifyFailure(
  status: number,
  error: string,
  transient?: boolean,
): SessionVerifyFailureCode {
  if (transient) return 'transient';
  if (status === 403 || /περίοδος χρήσης|usage/i.test(error)) return 'expired_usage';
  // Rate limits, storage blips, and network-ish 5xx must not wipe a valid JWT.
  if (status === 429 || status === 503 || status >= 500) return 'transient';
  if (/temporarily unavailable|δεν διαβάστηκε|δοκιμάστε ξανά/i.test(error)) {
    return 'transient';
  }
  return 'invalid';
}

export async function serverVerifySession(): Promise<SessionVerifyResult> {
  const token = getSessionToken();
  if (!token) {
    return { success: false, error: 'No session token', code: 'invalid' };
  }

  try {
    const response = await fetch('/api/sync/account?kind=session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', token }),
    });
    let json: { ok?: boolean; error?: string; user?: unknown; transient?: boolean } = {};
    try {
      json = (await response.json()) as {
        ok?: boolean;
        error?: string;
        user?: unknown;
        transient?: boolean;
      };
    } catch {
      /* non-JSON body */
    }

    if (!response.ok || !json.ok) {
      const message = json.error || `Verify HTTP ${response.status}`;
      const code = classifyVerifyFailure(response.status, message, json.transient);
      // Only clear the JWT when the server says the session itself is bad.
      // Only clear the JWT when the server says the session itself is bad.
      if (code === 'invalid' || code === 'expired_usage') {
        setSessionToken(null);
      }
      return { success: false, error: message, code };
    }

    return { success: true, data: json.user };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Άγνωστο σφάλμα';
    return { success: false, error: message, code: 'transient' };
  }
}

export async function requestPasswordReset(email: string) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'forgot',
        email,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      }),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      error?: string;
      message?: string;
      emailed?: boolean;
    };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Forgot HTTP ${response.status}`);
    }
    return {
      message: json.message ?? 'OK',
      emailed: Boolean(json.emailed),
    };
  });
}

export async function resetPasswordWithToken(resetToken: string, newPassword: string) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset', resetToken, newPassword }),
    });
    const json = (await response.json()) as { ok?: boolean; error?: string; email?: string };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Reset HTTP ${response.status}`);
    }
    return { email: json.email ?? null };
  });
}

const CLOUD_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
] as const;

export function parseImageDataUrl(
  dataUrl: string,
): { contentType: string; dataBase64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  let contentType = match[1].trim().toLowerCase();
  if (contentType === 'image/jpg') contentType = 'image/jpeg';
  return { contentType, dataBase64: dataUrl.trim() };
}

function withMediaCacheBust(url: string): string {
  try {
    const parsed = url.startsWith('http://') || url.startsWith('https://')
      ? new URL(url)
      : new URL(url, 'https://teamsuite.invalid');
    parsed.searchParams.set('v', String(Date.now()));
    if (url.startsWith('http://') || url.startsWith('https://')) return parsed.toString();
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export async function uploadClubPhotoBlob(input: {
  clubId: string;
  fileName: string;
  contentType: string;
  dataBase64: string;
}) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=media', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify(input),
    });
    let json: { ok?: boolean; error?: string; url?: string } = {};
    const text = await response.text();
    if (text.trim()) {
      try {
        json = JSON.parse(text) as typeof json;
      } catch {
        throw new Error(`Media upload: μη έγκυρη απάντηση (HTTP ${response.status}).`);
      }
    }
    if (!response.ok || !json.ok || !json.url) {
      throw new Error(
        json.error ||
          (text.trim()
            ? `Media upload HTTP ${response.status}`
            : `Κενή απάντηση στο ανέβασμα φωτογραφίας (HTTP ${response.status}).`),
      );
    }
    return { url: json.url };
  });
}

export async function updateCloudClubLogo(clubId: string, logoUrl: string | null) {
  return apiClient(async () => {
    const response = await fetch('/api/sync/account?kind=club-profile', {
      method: 'PATCH',
      headers: syncAuthHeaders(),
      body: JSON.stringify({ clubId, logoUrl }),
    });
    const json = (await response.json()) as { ok?: boolean; error?: string; updatedAt?: string };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Club profile HTTP ${response.status}`);
    }
    return { updatedAt: json.updatedAt ?? null };
  });
}

/** Store club logo as a public HTTPS URL so every browser sees the same file after login. */
export async function persistClubLogoToCloud(clubId: string, logoUrl: string | null) {
  return apiClient(async () => {
    let next = logoUrl?.trim() || null;
    if (next?.startsWith('data:')) {
      const parsed = parseImageDataUrl(next);
      if (!parsed) throw new Error('Μη έγκυρη εικόνα λογοτύπου.');
      if (!CLOUD_IMAGE_TYPES.includes(parsed.contentType as (typeof CLOUD_IMAGE_TYPES)[number])) {
        throw new Error('Υποστηρίζονται JPG, PNG, WEBP, GIF ή SVG.');
      }
      const uploaded = await uploadClubPhotoBlob({
        clubId,
        fileName: parsed.contentType === 'image/svg+xml' ? 'club-logo.svg' : 'club-logo.jpg',
        contentType: parsed.contentType,
        dataBase64: parsed.dataBase64,
      });
      if (!uploaded.success || !uploaded.data?.url) {
        throw new Error(uploaded.error ?? 'Αποτυχία αποθήκευσης λογοτύπου στο cloud.');
      }
      next = withMediaCacheBust(uploaded.data.url);
    }
    const cloud = await updateCloudClubLogo(clubId, next);
    if (!cloud.success) {
      throw new Error(cloud.error ?? 'Αποτυχία cloud αποθήκευσης λογοτύπου.');
    }
    return { logoUrl: next };
  });
}
