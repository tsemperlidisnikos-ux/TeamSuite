import { randomUUID } from 'crypto';
import { gunzipSync } from 'zlib';
import { kvDel, kvGet, kvSet } from './durableKv.js';

/** Binary bytes per chunk — base64 expands ~4/3, stay under Vercel 4.5MB wire limit. */
export const MIRROR_CHUNK_BYTES = 2_000_000;
export const MIRROR_WIRE_SOFT_LIMIT = 3_200_000;

export type MirrorChunkEncoding = 'base64utf8' | 'gzip-base64utf8';

export function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

export function splitBufferToBase64Chunks(raw: Buffer, maxBytes = MIRROR_CHUNK_BYTES): string[] {
  const out: string[] = [];
  for (let offset = 0; offset < raw.length; offset += maxBytes) {
    out.push(raw.subarray(offset, offset + maxBytes).toString('base64'));
  }
  return out.length ? out : [''];
}

export function joinBase64Chunks(chunks: string[]): Buffer {
  return Buffer.concat(chunks.map((c) => Buffer.from(c, 'base64')));
}

type StagingMeta = {
  clubId: string;
  chunkCount: number;
  baseUpdatedAt: string | null;
  createdAt: number;
  encoding?: MirrorChunkEncoding;
};

function stagingMetaKey(clubId: string, uploadId: string) {
  return `mirror-staging-meta:${clubId}:${uploadId}`;
}

function stagingChunkKey(clubId: string, uploadId: string, index: number) {
  return `mirror-staging-chunk:${clubId}:${uploadId}:${index}`;
}

export async function initMirrorStaging(
  clubId: string,
  chunkCount: number,
  baseUpdatedAt: string | null,
  encoding: MirrorChunkEncoding = 'base64utf8',
): Promise<string> {
  const uploadId = randomUUID();
  const meta: StagingMeta = {
    clubId,
    chunkCount,
    baseUpdatedAt,
    createdAt: Date.now(),
    encoding,
  };
  await kvSet(stagingMetaKey(clubId, uploadId), meta);
  return uploadId;
}

export async function putMirrorStagingChunk(
  clubId: string,
  uploadId: string,
  index: number,
  dataBase64: string,
): Promise<void> {
  const meta = await kvGet<StagingMeta>(stagingMetaKey(clubId, uploadId));
  if (!meta || meta.clubId !== clubId) {
    throw new Error('Άκυρο ή ληγμένο chunked upload.');
  }
  if (index < 0 || index >= meta.chunkCount) {
    throw new Error('Άκυρο chunk index.');
  }
  await kvSet(stagingChunkKey(clubId, uploadId, index), dataBase64);
}

export async function commitMirrorStaging(
  clubId: string,
  uploadId: string,
): Promise<{ payload: unknown; baseUpdatedAt: string | null }> {
  const meta = await kvGet<StagingMeta>(stagingMetaKey(clubId, uploadId));
  if (!meta || meta.clubId !== clubId) {
    throw new Error('Άκυρο ή ληγμένο chunked upload.');
  }
  const parts = await Promise.all(
    Array.from({ length: meta.chunkCount }, (_, i) =>
      kvGet<string>(stagingChunkKey(clubId, uploadId, i)),
    ),
  );
  for (let i = 0; i < parts.length; i++) {
    if (typeof parts[i] !== 'string') {
      throw new Error(`Λείπει το chunk ${i + 1}/${meta.chunkCount}.`);
    }
  }
  let raw = joinBase64Chunks(parts as string[]);
  if (meta.encoding === 'gzip-base64utf8') {
    try {
      raw = gunzipSync(raw);
    } catch {
      throw new Error('Αποτυχία αποσυμπίεσης gzip mirror chunks.');
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error('Τα chunks δεν σχηματίζουν έγκυρο JSON.');
  }
  await clearMirrorStaging(clubId, uploadId, meta.chunkCount);
  return { payload: parsed, baseUpdatedAt: meta.baseUpdatedAt };
}

export async function clearMirrorStaging(
  clubId: string,
  uploadId: string,
  chunkCount: number,
): Promise<void> {
  await Promise.all([
    kvDel(stagingMetaKey(clubId, uploadId)),
    ...Array.from({ length: chunkCount }, (_, i) =>
      kvDel(stagingChunkKey(clubId, uploadId, i)),
    ),
  ]);
}
