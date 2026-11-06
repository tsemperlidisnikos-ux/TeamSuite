import { apiClient, type ApiResult } from '../apiClient';
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

/** Keep under Vercel ~4.5MB (base64 expands ~4/3). */
const CLIENT_CHUNK_BYTES = 2_000_000;
const CLIENT_WIRE_SOFT = 3_000_000;
/** Parallel chunk HTTP requests (Greece → iad1 RTT dominates large club sync). */
const CHUNK_CONCURRENCY = 4;

type ChunkEncoding = 'base64utf8' | 'gzip-base64utf8';

function isAppDataPayload(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return Array.isArray(data.students) && Array.isArray(data.classes);
}

type MirrorJson = {
  ok?: boolean;
  error?: string;
  code?: string;
  updatedAt?: string;
  conflict?: boolean;
  payload?: unknown;
  durable?: boolean;
  studentCount?: number;
  chunked?: boolean;
  chunk?: number;
  chunkCount?: number;
  encoding?: string;
  data?: string;
  uploadId?: string;
};

function httpSyncHint(status: number): string {
  if (status === 413) {
    return 'Τα δεδομένα είναι πολύ μεγάλα για μία αποστολή· γίνεται προσπάθεια σε κομμάτια.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Ο server δεν απάντησε εγκαίρως. Ξαναδοκιμάστε σε λίγο.';
  }
  if (status === 401) return 'Η συνεδρία έληξε. Κάντε ξανά είσοδο.';
  return `Σφάλμα συγχρονισμού (HTTP ${status}).`;
}

async function parseMirrorJson(response: Response): Promise<MirrorJson> {
  if (response.status === 413) {
    throw new Error(httpSyncHint(413));
  }
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`${httpSyncHint(response.status)} (κενή απάντηση)`);
  }
  try {
    return JSON.parse(text) as MirrorJson;
  } catch {
    const clipped = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (/payload too large|request entity too large|413/i.test(clipped)) {
      throw new Error(httpSyncHint(413));
    }
    const looksHtml = clipped.startsWith('<') || /<!doctype|html/i.test(clipped);
    throw new Error(
      looksHtml
        ? httpSyncHint(response.status)
        : `Ο server δεν επέστρεψε έγκυρο JSON (${response.status}). ${clipped}`,
    );
  }
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function splitToBase64Chunks(raw: Uint8Array): string[] {
  const out: string[] = [];
  for (let offset = 0; offset < raw.length; offset += CLIENT_CHUNK_BYTES) {
    const slice = raw.subarray(offset, offset + CLIENT_CHUNK_BYTES);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < slice.length; i += chunkSize) {
      binary += String.fromCharCode(...slice.subarray(i, i + chunkSize));
    }
    out.push(btoa(binary));
  }
  return out.length ? out : [''];
}

function joinBase64Chunks(chunks: string[]): Uint8Array {
  const parts = chunks.map((c) => {
    const binary = atob(c);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  });
  const total = parts.reduce((n, p) => n + p.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return merged;
}

async function mapPool<T>(
  count: number,
  concurrency: number,
  worker: (index: number) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(count);
  let next = 0;
  async function run() {
    while (next < count) {
      const i = next;
      next += 1;
      results[i] = await worker(i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, count));
  await Promise.all(Array.from({ length: n }, () => run()));
  return results;
}

function toArrayBuffer(raw: Uint8Array): ArrayBuffer {
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

async function gzipBytes(raw: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([toArrayBuffer(raw)])
      .stream()
      .pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function gunzipBytes(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Ο browser δεν υποστηρίζει gzip decompress για mirror sync.');
  }
  const stream = new Blob([toArrayBuffer(raw)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function pushChunkedMirror(
  clubId: string,
  payload: unknown,
  baseUpdatedAt: string | null,
  keepalive?: boolean,
) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const gzipped = await gzipBytes(jsonBytes);
  const encoding: ChunkEncoding =
    gzipped && gzipped.byteLength < jsonBytes.byteLength * 0.9
      ? 'gzip-base64utf8'
      : 'base64utf8';
  const wire = encoding === 'gzip-base64utf8' && gzipped ? gzipped : jsonBytes;
  const chunks = splitToBase64Chunks(wire);
  const initRes = await fetch('/api/sync/mirror', {
    method: 'POST',
    headers: syncAuthHeaders(),
    keepalive: Boolean(keepalive),
    body: JSON.stringify({
      clubId,
      initChunked: true,
      chunkCount: chunks.length,
      baseUpdatedAt,
      encoding,
    }),
  });
  const initJson = await parseMirrorJson(initRes);
  if (!initRes.ok || !initJson.ok || !initJson.uploadId) {
    throw new Error(initJson.error || httpSyncHint(initRes.status));
  }
  const uploadId = initJson.uploadId;
  await mapPool(chunks.length, CHUNK_CONCURRENCY, async (i) => {
    const partRes = await fetch('/api/sync/mirror', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify({
        clubId,
        uploadId,
        chunk: i,
        data: chunks[i],
      }),
    });
    const partJson = await parseMirrorJson(partRes);
    if (!partRes.ok || !partJson.ok) {
      throw new Error(partJson.error || `Αποτυχία chunk ${i + 1}/${chunks.length}`);
    }
  });
  const commitRes = await fetch('/api/sync/mirror', {
    method: 'POST',
    headers: syncAuthHeaders(),
    keepalive: Boolean(keepalive),
    body: JSON.stringify({
      clubId,
      commitChunked: true,
      uploadId,
    }),
  });
  return { response: commitRes, json: await parseMirrorJson(commitRes) };
}

export async function pushClubMirror(
  clubId: string,
  opts?: { baseUpdatedAt?: string | null; keepalive?: boolean },
) {
  return apiClient(async () => {
    const local = getClubData(clubId);
    const payload = await encryptSensitivePayloadForCloud(stripHeavyMedia(local), clubId);
    const bodyText = JSON.stringify({
      clubId,
      payload,
      baseUpdatedAt: opts?.baseUpdatedAt ?? null,
    });
    const useChunked = utf8Bytes(bodyText) > CLIENT_WIRE_SOFT;

    let response: Response;
    let json: MirrorJson;
    if (useChunked) {
      const chunked = await pushChunkedMirror(
        clubId,
        payload,
        opts?.baseUpdatedAt ?? null,
        opts?.keepalive,
      );
      response = chunked.response;
      json = chunked.json;
    } else {
      response = await fetch('/api/sync/mirror', {
        method: 'POST',
        headers: syncAuthHeaders(),
        keepalive: Boolean(opts?.keepalive),
        body: bodyText,
      });
      json = await parseMirrorJson(response);
      if (response.status === 413 || json.code === 'MIRROR_USE_CHUNKED') {
        const chunked = await pushChunkedMirror(
          clubId,
          payload,
          opts?.baseUpdatedAt ?? null,
          opts?.keepalive,
        );
        response = chunked.response;
        json = chunked.json;
      }
    }

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
      throw err;
    }

    if (!response.ok || !json.ok) {
      throw new Error(
        json.error ||
          (response.status === 404
            ? 'Το sync API είναι διαθέσιμο μόνο στο production (Vercel).'
            : httpSyncHint(response.status)),
      );
    }
    return { updatedAt: json.updatedAt ?? null };
  });
}

type LoadedClubMirror = {
  updatedAt: string | null;
  durable: boolean;
  payload: AppData;
  notModified: false;
};

type UnchangedClubMirror = {
  updatedAt: string | null;
  durable: true;
  payload: null;
  notModified: true;
};

async function pullChunkedEnvelope(
  clubId: string,
  chunkCount: number,
  encoding?: string | null,
) {
  const parts = await mapPool(chunkCount, CHUNK_CONCURRENCY, async (i) => {
    const params = new URLSearchParams({ clubId, chunk: String(i) });
    const response = await fetch(`/api/sync/mirror?${params.toString()}`, {
      headers: syncAuthHeaders(false),
    });
    const json = await parseMirrorJson(response);
    if (!response.ok || !json.ok || typeof json.data !== 'string') {
      throw new Error(json.error || `Αποτυχία φόρτωσης chunk ${i + 1}/${chunkCount}`);
    }
    return json.data;
  });
  let raw = joinBase64Chunks(parts);
  if (encoding === 'gzip-base64utf8') {
    raw = await gunzipBytes(raw);
  }
  const text = new TextDecoder().decode(raw);
  const envelope = JSON.parse(text) as { updatedAt?: string; payload?: unknown };
  return envelope;
}

export function pullClubMirror(clubId: string): Promise<ApiResult<LoadedClubMirror>>;
export function pullClubMirror(
  clubId: string,
  opts: { since?: string | null },
): Promise<ApiResult<LoadedClubMirror | UnchangedClubMirror>>;
export function pullClubMirror(clubId: string, opts?: { since?: string | null }) {
  return apiClient<LoadedClubMirror | UnchangedClubMirror>(async () => {
    const params = new URLSearchParams({ clubId });
    if (opts?.since) params.set('since', opts.since);
    const response = await fetch(`/api/sync/mirror?${params.toString()}`, {
      headers: syncAuthHeaders(false),
    });
    if (response.status === 304) {
      return {
        updatedAt: opts?.since ?? null,
        durable: true,
        payload: null,
        notModified: true as const,
      };
    }
    const json = await parseMirrorJson(response);
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
      throw new Error(json.error || httpSyncHint(response.status));
    }

    let payloadUnknown: unknown = json.payload;
    let updatedAt = json.updatedAt ?? null;

    if (json.chunked && typeof json.chunkCount === 'number' && json.chunkCount > 0) {
      const envelope = await pullChunkedEnvelope(clubId, json.chunkCount, json.encoding);
      payloadUnknown = envelope.payload;
      updatedAt = envelope.updatedAt ?? updatedAt;
    }

    if (!isAppDataPayload(payloadUnknown)) {
      throw new Error('Το mirror δεν περιέχει έγκυρα δεδομένα συλλόγου.');
    }
    const payload = await decryptSensitivePayloadFromCloud(payloadUnknown, clubId);
    return {
      updatedAt,
      durable: json.durable !== false,
      payload,
      notModified: false as const,
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
    const json = await parseMirrorJson(response);
    if (response.status === 401) {
      const { logoutIfSessionReplaced } = await import('../sessionReplaced');
      logoutIfSessionReplaced(json.error, json.code);
    }
    if (!response.ok || !json.ok) {
      throw new Error(json.error || httpSyncHint(response.status));
    }
    return {
      updatedAt: json.updatedAt ?? null,
      studentCount: json.studentCount ?? students.length,
    };
  });
}
