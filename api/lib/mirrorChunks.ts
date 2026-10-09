import { randomUUID } from 'crypto';
import { kvDel, kvGet, kvSet } from './durableKv.js';

/** Binary bytes per chunk — base64 expands ~4/3, stay under Vercel 4.5MB wire limit. */
export const MIRROR_CHUNK_BYTES = 2_000_000;
export const MIRROR_WIRE_SOFT_LIMIT = 3_200_000;

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
): Promise<string> {
  const uploadId = randomUUID();
  const meta: StagingMeta = {
    clubId,
    chunkCount,
    baseUpdatedAt,
    createdAt: Date.now(),
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
  const parts: string[] = [];
  for (let i = 0; i < meta.chunkCount; i++) {
    const part = await kvGet<string>(stagingChunkKey(clubId, uploadId, i));
    if (typeof part !== 'string') {
      throw new Error(`Λείπει το chunk ${i + 1}/${meta.chunkCount}.`);
    }
    parts.push(part);
  }
  const raw = joinBase64Chunks(parts);
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
  await kvDel(stagingMetaKey(clubId, uploadId));
  for (let i = 0; i < chunkCount; i++) {
    await kvDel(stagingChunkKey(clubId, uploadId, i));
  }
}
