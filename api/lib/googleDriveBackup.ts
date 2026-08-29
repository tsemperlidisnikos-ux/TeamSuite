import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { kvGet, kvSet } from './durableKv.js';
import { fieldCryptoSecret } from './fieldCrypto.js';
import { listMirrorKeys, loadAccountBundle, loadMirror } from './serverStore.js';

const SETTINGS_KEY = 'ss360:google-drive-backup';
const OAUTH_STATE_KEY = 'ss360:google-drive-oauth-state';
const ROOT_FOLDER_NAME = 'TeamSuite-Backups';
const DRIVE_SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export type GoogleDrivePublicStatus = {
  oauthConfigured: boolean;
  connected: boolean;
  enabled: boolean;
  email: string;
  rootFolderId: string;
  rootFolderName: string;
  rootFolderUrl: string;
  excludeClubIds: string[];
  lastUploadAt: string | null;
  lastError: string | null;
  lastClubs: string[];
  redirectUri: string;
};

type StoredSettings = {
  enabled: boolean;
  refreshTokenEnc: string;
  email: string;
  rootFolderId: string;
  rootFolderName: string;
  excludeClubIds: string[];
  lastUploadAt: string | null;
  lastError: string | null;
  lastClubs: string[];
};

type OauthState = { nonce: string; exp: number };

let memorySettings: StoredSettings | null = null;
let memoryOauth: OauthState | null = null;

function oauthClient() {
  const clientId = (process.env.GOOGLE_DRIVE_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? '').trim();
  return { clientId, clientSecret, ok: Boolean(clientId && clientSecret) };
}

export function googleDriveRedirectUri(req?: { headers?: Record<string, unknown> }): string {
  const fromEnv = (process.env.GOOGLE_DRIVE_REDIRECT_URI ?? '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const proto = String(req?.headers?.['x-forwarded-proto'] ?? 'https').split(',')[0]?.trim() || 'https';
  const host =
    String(req?.headers?.['x-forwarded-host'] ?? req?.headers?.host ?? '')
      .split(',')[0]
      ?.trim() || (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim();
  if (!host) return 'https://teamsuite-seven.vercel.app/api/google-drive?op=callback';
  const hostname = host.replace(/^https?:\/\//, '');
  return `${proto}://${hostname}/api/google-drive?op=callback`;
}

function encKey(): Buffer | null {
  const secret = fieldCryptoSecret();
  if (!secret) return null;
  return createHmac('sha256', secret).update('teamsuite-google-drive-v1').digest();
}

function encryptSecret(plain: string): string {
  const key = encKey();
  if (!key) throw new Error('Λείπει SS360_SESSION_SECRET για κρυπτογράφηση του Drive token.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gdv1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

function decryptSecret(packed: string): string {
  if (!packed.startsWith('gdv1.')) return packed;
  const key = encKey();
  if (!key) throw new Error('Λείπει SS360_SESSION_SECRET για ανάγνωση του Drive token.');
  const parts = packed.split('.');
  const iv = Buffer.from(parts[1] ?? '', 'base64url');
  const tag = Buffer.from(parts[2] ?? '', 'base64url');
  const data = Buffer.from(parts[3] ?? '', 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

async function loadSettings(): Promise<StoredSettings | null> {
  const stored = (await kvGet<StoredSettings>(SETTINGS_KEY)) ?? memorySettings;
  return stored ?? null;
}

async function saveSettings(next: StoredSettings): Promise<void> {
  memorySettings = next;
  await kvSet(SETTINGS_KEY, next);
}

function folderUrl(id: string): string {
  return id ? `https://drive.google.com/drive/folders/${id}` : '';
}

export async function getGoogleDrivePublicStatus(
  req?: { headers?: Record<string, unknown> },
): Promise<GoogleDrivePublicStatus> {
  const { ok } = oauthClient();
  const saved = await loadSettings();
  return {
    oauthConfigured: ok,
    connected: Boolean(saved?.refreshTokenEnc),
    enabled: saved?.enabled !== false,
    email: saved?.email ?? '',
    rootFolderId: saved?.rootFolderId ?? '',
    rootFolderName: saved?.rootFolderName ?? ROOT_FOLDER_NAME,
    rootFolderUrl: folderUrl(saved?.rootFolderId ?? ''),
    excludeClubIds: saved?.excludeClubIds ?? [],
    lastUploadAt: saved?.lastUploadAt ?? null,
    lastError: saved?.lastError ?? null,
    lastClubs: saved?.lastClubs ?? [],
    redirectUri: googleDriveRedirectUri(req),
  };
}

function signState(nonce: string, exp: number): string {
  const secret = fieldCryptoSecret() || 'teamsuite-drive-oauth';
  const payload = `${nonce}.${exp}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(JSON.stringify({ nonce, exp, sig })).toString('base64url');
}

function readState(raw: string): { nonce: string; exp: number } | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      nonce?: string;
      exp?: number;
      sig?: string;
    };
    if (!parsed.nonce || !parsed.exp || !parsed.sig) return null;
    const secret = fieldCryptoSecret() || 'teamsuite-drive-oauth';
    const expected = createHmac('sha256', secret)
      .update(`${parsed.nonce}.${parsed.exp}`)
      .digest('base64url');
    if (expected !== parsed.sig) return null;
    if (Date.now() > parsed.exp) return null;
    return { nonce: parsed.nonce, exp: parsed.exp };
  } catch {
    return null;
  }
}

export async function buildGoogleAuthUrl(req: {
  headers?: Record<string, unknown>;
}): Promise<string> {
  const { clientId, ok } = oauthClient();
  if (!ok) {
    throw new Error('Ορίστε GOOGLE_DRIVE_CLIENT_ID και GOOGLE_DRIVE_CLIENT_SECRET στο Vercel.');
  }
  const nonce = randomBytes(16).toString('hex');
  const exp = Date.now() + 15 * 60 * 1000;
  memoryOauth = { nonce, exp };
  await kvSet(OAUTH_STATE_KEY, memoryOauth);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleDriveRedirectUri(req),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: signState(nonce, exp),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCode(
  code: string,
  req: { headers?: Record<string, unknown> },
): Promise<{ refresh_token?: string; access_token: string }> {
  const { clientId, clientSecret, ok } = oauthClient();
  if (!ok) throw new Error('Λείπουν τα Google OAuth secrets.');
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleDriveRedirectUri(req),
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || 'Αποτυχία ανταλλαγής Google token.');
  }
  return { access_token: json.access_token, refresh_token: json.refresh_token };
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret, ok } = oauthClient();
  if (!ok) throw new Error('Λείπουν τα Google OAuth secrets.');
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await response.json()) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || 'Λήξη σύνδεσης Google Drive. Συνδεθείτε ξανά.');
  }
  return json.access_token;
}

async function driveFetch(
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...init, headers });
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function sanitizeDriveFolderName(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

async function findChild(
  accessToken: string,
  parentId: string,
  name: string,
  folder: boolean,
): Promise<string | null> {
  const mime = folder
    ? "mimeType = 'application/vnd.google-apps.folder'"
    : "mimeType != 'application/vnd.google-apps.folder'";
  const q = `'${parentId}' in parents and name = '${escapeDriveQuery(name)}' and ${mime} and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?pageSize=5&fields=files(id,name)&q=${encodeURIComponent(q)}`;
  const response = await driveFetch(accessToken, url);
  const json = (await response.json()) as { files?: Array<{ id: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message || 'Αποτυχία αναζήτησης στο Drive.');
  return json.files?.[0]?.id ?? null;
}

async function createFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const response = await driveFetch(accessToken, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  });
  const json = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !json.id) throw new Error(json.error?.message || 'Αποτυχία δημιουργίας φακέλου Drive.');
  return json.id;
}

async function ensureFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  if (parentId) {
    const existing = await findChild(accessToken, parentId, name, true);
    if (existing) return existing;
  }
  return createFolder(accessToken, name, parentId);
}

async function uploadJsonFile(
  accessToken: string,
  parentId: string,
  fileName: string,
  jsonText: string,
): Promise<void> {
  const existing = await findChild(accessToken, parentId, fileName, false);
  if (existing) {
    const response = await driveFetch(
      accessToken,
      `https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: jsonText,
      },
    );
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err.error?.message || 'Αποτυχία ενημέρωσης αρχείου στο Drive.');
    }
    return;
  }

  const boundary = `teamsuite_${randomBytes(8).toString('hex')}`;
  const meta = JSON.stringify({ name: fileName, parents: [parentId] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${jsonText}\r\n` +
    `--${boundary}--`;
  const response = await driveFetch(
    accessToken,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message || 'Αποτυχία ανεβάσματος στο Drive.');
  }
}

async function userEmail(accessToken: string): Promise<string> {
  const response = await driveFetch(accessToken, 'https://www.googleapis.com/oauth2/v2/userinfo');
  const json = (await response.json()) as { email?: string };
  return json.email ?? '';
}

export async function completeGoogleDriveOAuth(
  code: string,
  state: string,
  req: { headers?: Record<string, unknown> },
): Promise<void> {
  const parsed = readState(state);
  if (!parsed) throw new Error('Άκυρο ή ληγμένο OAuth state. Δοκιμάστε ξανά τη σύνδεση.');
  const savedState = (await kvGet<OauthState>(OAUTH_STATE_KEY)) ?? memoryOauth;
  if (!savedState || savedState.nonce !== parsed.nonce) {
    throw new Error('Το OAuth state δεν ταιριάζει. Δοκιμάστε ξανά τη σύνδεση.');
  }

  const tokens = await exchangeCode(code, req);
  const previous = await loadSettings();
  const refresh = tokens.refresh_token || (previous ? decryptSecret(previous.refreshTokenEnc) : '');
  if (!refresh) throw new Error('Η Google δεν έδωσε refresh token. Ξανασυνδεθείτε με prompt consent.');

  const access = tokens.access_token;
  const email = await userEmail(access);
  const rootName = previous?.rootFolderName || ROOT_FOLDER_NAME;
  const rootFolderId =
    previous?.rootFolderId && previous.rootFolderId
      ? previous.rootFolderId
      : await ensureFolder(access, rootName);

  await saveSettings({
    enabled: previous?.enabled !== false,
    refreshTokenEnc: encryptSecret(refresh),
    email,
    rootFolderId,
    rootFolderName: rootName,
    excludeClubIds: previous?.excludeClubIds ?? [],
    lastUploadAt: previous?.lastUploadAt ?? null,
    lastError: null,
    lastClubs: previous?.lastClubs ?? [],
  });
}

export async function disconnectGoogleDrive(): Promise<void> {
  await saveSettings({
    enabled: false,
    refreshTokenEnc: '',
    email: '',
    rootFolderId: '',
    rootFolderName: ROOT_FOLDER_NAME,
    excludeClubIds: [],
    lastUploadAt: null,
    lastError: null,
    lastClubs: [],
  });
}

export async function updateGoogleDriveSettings(patch: {
  enabled?: boolean;
  excludeClubIds?: string[];
  rootFolderId?: string;
  rootFolderName?: string;
}): Promise<GoogleDrivePublicStatus> {
  const current = await loadSettings();
  if (!current?.refreshTokenEnc) throw new Error('Δεν υπάρχει συνδεδεμένο Google Drive.');
  await saveSettings({
    ...current,
    enabled: patch.enabled ?? current.enabled,
    excludeClubIds: patch.excludeClubIds ?? current.excludeClubIds,
    rootFolderId: (patch.rootFolderId ?? current.rootFolderId).trim() || current.rootFolderId,
    rootFolderName: sanitizeDriveFolderName(
      patch.rootFolderName ?? current.rootFolderName,
      ROOT_FOLDER_NAME,
    ),
  });
  return getGoogleDrivePublicStatus();
}

function clubNameMap(bundle: Awaited<ReturnType<typeof loadAccountBundle>>): Map<string, string> {
  const map = new Map<string, string>();
  const clubs = Array.isArray(bundle?.clubs) ? bundle!.clubs : [];
  for (const raw of clubs) {
    if (!raw || typeof raw !== 'object') continue;
    const club = raw as { id?: string; name?: string };
    if (club.id) map.set(club.id, String(club.name || club.id));
  }
  return map;
}

export type GoogleDriveUploadResult = {
  skipped?: boolean;
  reason?: string;
  dateKey?: string;
  clubs?: string[];
  error?: string;
};

export async function uploadClubMirrorsToGoogleDrive(opts?: {
  ignoreEnabled?: boolean;
}): Promise<GoogleDriveUploadResult> {
  const settings = await loadSettings();
  if (!settings?.refreshTokenEnc) return { skipped: true, reason: 'not_connected' };
  if (settings.enabled === false && !opts?.ignoreEnabled) {
    return { skipped: true, reason: 'disabled' };
  }

  try {
    const refresh = decryptSecret(settings.refreshTokenEnc);
    const access = await refreshAccessToken(refresh);
    const rootId =
      settings.rootFolderId || (await ensureFolder(access, settings.rootFolderName || ROOT_FOLDER_NAME));
    if (!settings.rootFolderId || settings.rootFolderId !== rootId) {
      await saveSettings({ ...settings, rootFolderId: rootId, lastError: null });
    }

    const names = clubNameMap(await loadAccountBundle());
    const dateKey = new Date().toISOString().slice(0, 10);
    const exclude = new Set(settings.excludeClubIds ?? []);
    const uploaded: string[] = [];

    for (const clubId of await listMirrorKeys()) {
      if (exclude.has(clubId)) continue;
      const mirror = await loadMirror(clubId);
      if (!mirror) continue;
      const folderName = sanitizeDriveFolderName(names.get(clubId) || clubId, clubId);
      const clubFolderId = await ensureFolder(access, folderName, rootId);
      const body = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          scope: 'club',
          sourceClubId: clubId,
          clubName: names.get(clubId) || clubId,
          sourceUpdatedAt: mirror.updatedAt,
          appData: mirror.payload,
        },
        null,
        2,
      );
      await uploadJsonFile(access, clubFolderId, `${dateKey}.json`, body);
      uploaded.push(clubId);
    }

    const next: StoredSettings = {
      ...settings,
      rootFolderId: rootId,
      lastUploadAt: new Date().toISOString(),
      lastError: null,
      lastClubs: uploaded,
    };
    await saveSettings(next);
    return { dateKey, clubs: uploaded };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Αποτυχία αποστολής στο Google Drive.';
    if (settings) {
      await saveSettings({ ...settings, lastError: message });
    }
    return { error: message };
  }
}

export async function writeGoogleDriveTestFile(): Promise<GoogleDriveUploadResult> {
  const settings = await loadSettings();
  if (!settings?.refreshTokenEnc) return { skipped: true, reason: 'not_connected' };
  const refresh = decryptSecret(settings.refreshTokenEnc);
  const access = await refreshAccessToken(refresh);
  const rootId =
    settings.rootFolderId || (await ensureFolder(access, settings.rootFolderName || ROOT_FOLDER_NAME));
  await uploadJsonFile(
    access,
    rootId,
    '_teamsuite-connection.json',
    JSON.stringify(
      {
        ok: true,
        at: new Date().toISOString(),
        message: 'TeamSuite Drive connection test',
      },
      null,
      2,
    ),
  );
  const upload = await uploadClubMirrorsToGoogleDrive({ ignoreEnabled: true });
  return { ...upload, dateKey: upload.dateKey };
}
