import { getSessionToken } from './services/sessionService';

/**
 * Headers for durable sync APIs (/api/sync/*).
 * Browser clients authenticate with the server session JWT only.
 * SS360_SYNC_SECRET stays server-side (cron / ops) — never ship it as VITE_*.
 */
export function syncAuthHeaders(jsonBody = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (jsonBody) headers['Content-Type'] = 'application/json';
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** True when the browser has a server session token for sync APIs. */
export function isSyncSessionConfigured(): boolean {
  return Boolean(getSessionToken());
}

/** @deprecated Use isSyncSessionConfigured — client sync key was removed. */
export function isSyncClientKeyConfigured(): boolean {
  return isSyncSessionConfigured();
}
