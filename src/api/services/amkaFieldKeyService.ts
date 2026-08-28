import { setAmkaFieldKeyFetcher } from '../../utils/amkaCrypto';
import { syncAuthHeaders, isSyncSessionConfigured } from '../syncAuth';

let wired = false;

/** Wire AMKA/PII crypto to fetch club field keys from the server (JWT required). */
export function ensureAmkaFieldKeyFetcherWired(): void {
  if (wired) return;
  wired = true;
  setAmkaFieldKeyFetcher(async (clubId: string) => {
    if (!isSyncSessionConfigured()) return null;
    const response = await fetch(
      `/api/sync/account?kind=field-key&clubId=${encodeURIComponent(clubId)}`,
      { headers: syncAuthHeaders(false), cache: 'no-store' },
    );
    const json = (await response.json()) as {
      ok?: boolean;
      keyMaterial?: string;
      error?: string;
    };
    if (!response.ok || !json.ok || typeof json.keyMaterial !== 'string') {
      return null;
    }
    return json.keyMaterial;
  });
}
