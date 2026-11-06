import type { VercelRequest, VercelResponse } from '@vercel/node';
import { gzipSync } from 'zlib';
import {
  assertClubTenantAccess,
  assertSyncAuthorized,
  isDurableStoreEnabled,
  listMirrorKeys,
  loadMirror,
  saveMirror,
} from '../lib/serverStore.js';
import { mirrorPayloadBytes, slimMirrorPayload } from '../lib/mirrorPayloadSlim.js';
import {
  MIRROR_WIRE_SOFT_LIMIT,
  commitMirrorStaging,
  initMirrorStaging,
  putMirrorStagingChunk,
  splitBufferToBase64Chunks,
  utf8ByteLength,
  type MirrorChunkEncoding,
} from '../lib/mirrorChunks.js';

const WIRE_HARD_LIMIT = 4_200_000;

/**
 * Cloud mirror for club AppData (optimistic concurrency via baseUpdatedAt).
 * Large clubs use chunked GET/POST so we stay under Vercel’s ~4.5MB limit.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await handleMirror(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mirror sync failed';
    console.error('[sync/mirror]', message);
    if (res.headersSent) return;
    return res.status(500).json({ ok: false, error: message });
  }
}

function sendJson(res: VercelResponse, status: number, data: unknown) {
  const raw = Buffer.from(JSON.stringify(data), 'utf8');
  if (raw.length <= MIRROR_WIRE_SOFT_LIMIT) {
    return res.status(status).json(data);
  }
  const gz = gzipSync(raw, { level: 9 });
  if (gz.length > WIRE_HARD_LIMIT) {
    return res.status(413).json({
      ok: false,
      error:
        'Τα δεδομένα του συλλόγου είναι πολύ μεγάλα για συγχρονισμό. Αφαιρέστε ενσωματωμένες φωτογραφίες και ξαναδοκιμάστε.',
      code: 'MIRROR_TOO_LARGE',
    });
  }
  res.statusCode = status;
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(gz);
}

async function handleMirror(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const clubId = String(req.query.clubId ?? '').trim();
    if (!clubId) {
      if (!(await assertSyncAuthorized(req, res))) return;
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        clubs: await listMirrorKeys(),
      });
    }
    if (!(await assertClubTenantAccess(req, res, clubId))) return;
    const mirror = await loadMirror(clubId);
    if (!mirror) return res.status(404).json({ ok: false, error: 'No mirror for club' });
    const since = String(req.query.since ?? '').trim();
    if (since && since === mirror.updatedAt) {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(304).end();
    }

    const originalBytes = mirrorPayloadBytes(mirror.payload);
    const slimmedPayload = slimMirrorPayload(mirror.payload);
    const slimBytes = mirrorPayloadBytes(slimmedPayload);

    if (originalBytes > slimBytes + 50_000) {
      void saveMirror(clubId, slimmedPayload, { baseUpdatedAt: mirror.updatedAt }).catch((err) => {
        console.warn('[sync/mirror] slim resave skipped', err instanceof Error ? err.message : err);
      });
    }

    const envelope = {
      updatedAt: mirror.updatedAt,
      payload: slimmedPayload,
    };
    const envelopeRaw = Buffer.from(JSON.stringify(envelope), 'utf8');
    const useGzipChunks = envelopeRaw.length > MIRROR_WIRE_SOFT_LIMIT;
    const wireBody = useGzipChunks ? gzipSync(envelopeRaw, { level: 6 }) : envelopeRaw;
    const pullEncoding: MirrorChunkEncoding = useGzipChunks
      ? 'gzip-base64utf8'
      : 'base64utf8';
    const chunkParam = String(req.query.chunk ?? '').trim();

    if (chunkParam !== '') {
      const chunkIndex = Number(chunkParam);
      const chunks = splitBufferToBase64Chunks(wireBody);
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= chunks.length) {
        return res.status(400).json({ ok: false, error: 'Άκυρο chunk' });
      }
      return res.status(200).json({
        ok: true,
        durable: isDurableStoreEnabled(),
        clubId,
        updatedAt: mirror.updatedAt,
        chunked: true,
        chunk: chunkIndex,
        chunkCount: chunks.length,
        encoding: pullEncoding,
        data: chunks[chunkIndex],
      });
    }

    // Μικρό mirror: μία απάντηση. Μεγάλο: manifest για chunked pull.
    if (envelopeRaw.length <= MIRROR_WIRE_SOFT_LIMIT) {
      return sendJson(res, 200, {
        ok: true,
        durable: isDurableStoreEnabled(),
        clubId,
        updatedAt: mirror.updatedAt,
        payload: slimmedPayload,
        slimmed: originalBytes > slimBytes,
        bytesBefore: originalBytes,
        bytesAfter: slimBytes,
      });
    }

    const chunks = splitBufferToBase64Chunks(wireBody);
    return res.status(200).json({
      ok: true,
      durable: isDurableStoreEnabled(),
      clubId,
      updatedAt: mirror.updatedAt,
      chunked: true,
      chunkCount: chunks.length,
      encoding: pullEncoding,
      slimmed: originalBytes > slimBytes,
      bytesBefore: originalBytes,
      bytesAfter: slimBytes,
    });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as {
      clubId?: string;
      payload?: unknown;
      baseUpdatedAt?: string | null;
      initChunked?: boolean;
      chunkCount?: number;
      uploadId?: string;
      chunk?: number;
      data?: string;
      commitChunked?: boolean;
      encoding?: MirrorChunkEncoding;
    };
    const clubId = String(body.clubId ?? '').trim();
    if (!clubId) return res.status(400).json({ ok: false, error: 'clubId required' });
    if (!(await assertClubTenantAccess(req, res, clubId))) return;

    if (!isDurableStoreEnabled()) {
      return res.status(503).json({
        ok: false,
        durable: false,
        error:
          'Το cloud sync δεν είναι ενεργό: λείπει Vercel Blob/Redis. Τα δεδομένα μένουν μόνο σε αυτόν τον browser μέχρι να συνδεθεί store.',
      });
    }

    // --- Chunked upload protocol ---
    if (body.initChunked) {
      const chunkCount = Number(body.chunkCount);
      if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 64) {
        return res.status(400).json({ ok: false, error: 'Άκυρο chunkCount' });
      }
      const encoding: MirrorChunkEncoding =
        body.encoding === 'gzip-base64utf8' ? 'gzip-base64utf8' : 'base64utf8';
      const uploadId = await initMirrorStaging(
        clubId,
        chunkCount,
        body.baseUpdatedAt === undefined ? null : body.baseUpdatedAt,
        encoding,
      );
      return res.status(200).json({ ok: true, uploadId, chunkCount, encoding });
    }

    if (typeof body.uploadId === 'string' && typeof body.chunk === 'number' && typeof body.data === 'string') {
      await putMirrorStagingChunk(clubId, body.uploadId, body.chunk, body.data);
      return res.status(200).json({ ok: true, uploadId: body.uploadId, chunk: body.chunk });
    }

    if (body.commitChunked && typeof body.uploadId === 'string') {
      const staged = await commitMirrorStaging(clubId, body.uploadId);
      const slimmedIncoming = slimMirrorPayload(staged.payload);
      const result = await saveMirror(clubId, slimmedIncoming, {
        baseUpdatedAt: staged.baseUpdatedAt,
      });
      if (result.ok === false) {
        return res.status(409).json({
          ok: false,
          conflict: true,
          error: 'Mirror conflict: cloud has a newer revision',
          updatedAt: result.updatedAt,
          durable: isDurableStoreEnabled(),
        });
      }
      return res.status(200).json({
        ok: true,
        clubId,
        durable: isDurableStoreEnabled(),
        updatedAt: result.updatedAt,
        chunked: true,
      });
    }

    // --- Single-shot push ---
    if (body.payload == null) return res.status(400).json({ ok: false, error: 'payload required' });

    const slimmedIncoming = slimMirrorPayload(body.payload);
    const approx = utf8ByteLength(JSON.stringify(slimmedIncoming));
    if (approx > MIRROR_WIRE_SOFT_LIMIT) {
      return res.status(413).json({
        ok: false,
        error: 'Χρησιμοποιήστε chunked sync για μεγάλο mirror.',
        code: 'MIRROR_USE_CHUNKED',
      });
    }

    const result = await saveMirror(clubId, slimmedIncoming, {
      baseUpdatedAt: body.baseUpdatedAt ?? null,
    });

    if (result.ok === false) {
      return res.status(409).json({
        ok: false,
        conflict: true,
        error: 'Mirror conflict: cloud has a newer revision',
        updatedAt: result.updatedAt,
        durable: isDurableStoreEnabled(),
      });
    }

    return res.status(200).json({
      ok: true,
      clubId,
      durable: isDurableStoreEnabled(),
      updatedAt: result.updatedAt,
    });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
