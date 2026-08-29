import { apiClient } from '../apiClient';
import { syncAuthHeaders } from '../syncAuth';

export type GoogleDriveStatus = {
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
  ok?: boolean;
  error?: string;
};

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Drive API HTTP ${response.status}`);
  }
}

export async function getGoogleDriveStatus() {
  return apiClient(async () => {
    const response = await fetch('/api/google-drive?op=status', { headers: syncAuthHeaders(false) });
    const json = await parseJson<GoogleDriveStatus>(response);
    if (!response.ok || json.ok === false) {
      throw new Error(json.error || 'Αποτυχία ανάγνωσης κατάστασης Drive.');
    }
    return json;
  });
}

export async function startGoogleDriveConnect() {
  return apiClient(async () => {
    const response = await fetch('/api/google-drive?op=start', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: '{}',
    });
    const json = await parseJson<GoogleDriveStatus & { url?: string }>(response);
    if (!response.ok || !json.url) {
      throw new Error(json.error || 'Αποτυχία έναρξης σύνδεσης Google.');
    }
    return json.url;
  });
}

export async function disconnectGoogleDrive() {
  return apiClient(async () => {
    const response = await fetch('/api/google-drive?op=disconnect', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: '{}',
    });
    const json = await parseJson<GoogleDriveStatus>(response);
    if (!response.ok) throw new Error(json.error || 'Αποτυχία αποσύνδεσης.');
    return json;
  });
}

export async function saveGoogleDriveSettings(patch: {
  enabled?: boolean;
  excludeClubIds?: string[];
  rootFolderId?: string;
}) {
  return apiClient(async () => {
    const response = await fetch('/api/google-drive?op=settings', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify(patch),
    });
    const json = await parseJson<GoogleDriveStatus>(response);
    if (!response.ok) throw new Error(json.error || 'Αποτυχία αποθήκευσης.');
    return json;
  });
}

export async function testGoogleDriveUpload() {
  return apiClient(async () => {
    const response = await fetch('/api/google-drive?op=test', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: '{}',
    });
    const json = await parseJson<GoogleDriveStatus & { clubs?: string[]; error?: string }>(response);
    if (!response.ok) throw new Error(json.error || 'Αποτυχία δοκιμής Drive.');
    return json;
  });
}
