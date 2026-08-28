import { del, get, head, list, put } from '@vercel/blob';
import { Redis } from '@upstash/redis';

function redisClient(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function blobRwToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN || undefined;
}

/** OIDC is preferred on Vercel when the store is connected (BLOB_STORE_ID). */
function blobUsesOidc(): boolean {
  return Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN);
}

function isBlobConfigured(): boolean {
  return blobUsesOidc() || Boolean(blobRwToken());
}

/**
 * Auth options for @vercel/blob.
 * Prefer OIDC (no explicit token) so a stale BLOB_READ_WRITE_TOKEN cannot bypass it.
 * Fall back to RW token for local/CI outside Vercel.
 */
function blobAuth(): { token?: string } {
  if (blobUsesOidc()) return {};
  const token = blobRwToken();
  return token ? { token } : {};
}

function assertBlobConfigured(): void {
  if (!isBlobConfigured()) {
    throw new Error('Blob storage not configured (BLOB_STORE_ID/OIDC or BLOB_READ_WRITE_TOKEN)');
  }
}

export function isDurableKvEnabled(): boolean {
  return Boolean(redisClient() || isBlobConfigured());
}

export function durableKvBackend(): 'redis' | 'blob' | 'memory' {
  if (redisClient()) return 'redis';
  if (isBlobConfigured()) return 'blob';
  return 'memory';
}

/** Path χωρίς % / : ώστε το Blob get/put να συμφωνούν. */
function blobPath(key: string): string {
  const safe = key
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `ss360-kv/${safe || 'key'}.json`;
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

async function parseBlobJson<T>(stream: ReadableStream<Uint8Array> | null): Promise<T | null> {
  if (!stream) return null;
  const text = await streamToText(stream);
  if (!text) return null;
  return JSON.parse(text) as T;
}

function blobStoreBaseHost(): string | null {
  const storeId = (process.env.BLOB_STORE_ID || '').replace(/^store_/, '').trim();
  if (storeId) return `${storeId.toLowerCase()}.private.blob.vercel-storage.com`;
  // Fallback: known production store (sportsuite360-data) when env lost after reconnect.
  return '20is6btjkyhvzkg7.private.blob.vercel-storage.com';
}

async function fetchPrivateBlobJson<T>(url: string): Promise<T | null> {
  const auth = blobAuth();
  const headers: Record<string, string> = { Accept: 'application/json,*/*' };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`blob fetch ${res.status}`);
  }
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

async function blobGetByPath<T>(pathname: string): Promise<T | null> {
  const auth = blobAuth();
  try {
    const result = await get(pathname, {
      access: 'private',
      ...auth,
      useCache: false,
    });
    if (result && result.statusCode === 200 && result.stream) {
      return parseBlobJson<T>(result.stream);
    }
  } catch {
    /* fall through */
  }

  // Fallback 1: head → authenticated URL fetch
  try {
    const meta = await head(pathname, auth);
    if (meta?.url) {
      const fromHead = await fetchPrivateBlobJson<T>(meta.url);
      if (fromHead != null) return fromHead;
    }
  } catch {
    /* fall through */
  }

  // Fallback 2: construct private blob URL from store id + pathname
  try {
    const host = blobStoreBaseHost();
    if (!host) return null;
    const url = `https://${host}/${pathname.replace(/^\//, '')}?cache=0`;
    return await fetchPrivateBlobJson<T>(url);
  } catch {
    return null;
  }
}

async function blobGetByUrl<T>(url: string): Promise<T | null> {
  const auth = blobAuth();
  try {
    const result = await get(url, {
      access: 'private',
      ...auth,
      useCache: false,
    });
    if (result && result.statusCode === 200 && result.stream) {
      return parseBlobJson<T>(result.stream);
    }
  } catch {
    /* fall through */
  }
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function kvExists(key: string): Promise<boolean> {
  const redis = redisClient();
  if (redis) {
    try {
      return Number(await redis.exists(key)) > 0;
    } catch {
      return false;
    }
  }

  if (!isBlobConfigured()) return false;
  const pathname = blobPath(key);
  const auth = blobAuth();
  try {
    const meta = await head(pathname, auth);
    return Boolean(meta?.url);
  } catch {
    try {
      const listed = await list({ prefix: pathname, ...auth, limit: 5 });
      return listed.blobs.some((b) => b.pathname === pathname);
    } catch {
      return false;
    }
  }
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const redis = redisClient();
  if (redis) {
    try {
      const raw = await redis.get<T>(key);
      if (raw != null) return raw as T;
    } catch {
      /* fall through to blob if configured */
    }
    if (!isBlobConfigured()) return null;
  }

  if (!isBlobConfigured()) return null;

  const pathname = blobPath(key);
  const auth = blobAuth();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const direct = await blobGetByPath<T>(pathname);
      if (direct != null) return direct;
    } catch {
      /* try url / list */
    }

    try {
      const meta = await head(pathname, auth);
      if (meta?.url) {
        const fromHead = await blobGetByUrl<T>(meta.url);
        if (fromHead != null) return fromHead;
      }
    } catch {
      /* try list */
    }

    try {
      const listed = await list({ prefix: pathname, ...auth, limit: 8 });
      const hit =
        listed.blobs.find((b) => b.pathname === pathname) ??
        listed.blobs.find((b) => b.pathname.startsWith(pathname.replace(/\.json$/, ''))) ??
        listed.blobs[0];
      if (hit?.url) {
        const fromList = await blobGetByUrl<T>(hit.url);
        if (fromList != null) return fromList;
      }
    } catch {
      /* retry */
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }

  return null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const redis = redisClient();
  if (redis) {
    await redis.set(key, value);
    return;
  }

  assertBlobConfigured();

  const pathname = blobPath(key);
  const body = JSON.stringify(value);
  const uploaded = await put(pathname, body, {
    access: 'private',
    ...blobAuth(),
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  // Επαλήθευση: αλλιώς POST «πετυχαίνει» αλλά GET επιστρέφει 404.
  let verified: unknown = null;
  try {
    verified = await blobGetByUrl(uploaded.url);
  } catch {
    verified = null;
  }
  if (verified == null) {
    try {
      verified = await blobGetByPath(uploaded.pathname || pathname);
    } catch {
      verified = null;
    }
  }
  if (verified == null) {
    throw new Error(`Blob write verification failed for ${pathname}`);
  }
}

export async function kvDel(key: string): Promise<void> {
  const redis = redisClient();
  if (redis) {
    await redis.del(key);
    return;
  }

  if (!isBlobConfigured()) return;
  const pathname = blobPath(key);
  const auth = blobAuth();
  try {
    await del(pathname, auth);
  } catch {
    try {
      const listed = await list({ prefix: pathname, ...auth, limit: 5 });
      const urls = listed.blobs.map((b) => b.url);
      if (urls.length) await del(urls, auth);
    } catch {
      // ignore
    }
  }
}

export async function kvIncrementWithExpiry(key: string, windowSeconds: number): Promise<number | null> {
  const redis = redisClient();
  if (!redis) return null;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count;
}

export async function kvSetIfAbsent(
  key: string,
  value: string,
  expirySeconds: number,
): Promise<boolean | null> {
  const redis = redisClient();
  if (!redis) return null;
  const result = await redis.set(key, value, { nx: true, ex: expirySeconds });
  return result === 'OK';
}

/** Public binary upload for gallery media (returns CDN URL). */
export async function putPublicBinary(
  pathname: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  assertBlobConfigured();
  const uploaded = await put(pathname, body, {
    access: 'public',
    ...blobAuth(),
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return uploaded.url;
}
