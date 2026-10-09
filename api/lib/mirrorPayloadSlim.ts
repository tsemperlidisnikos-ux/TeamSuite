/**
 * Shrink club mirror payloads so they fit Vercel’s ~4.5MB request/response limit.
 * Drops embedded data-URLs and extremely long strings (keeps https URLs).
 */

const MAX_STRING = 80_000;

function slimValue(value: unknown, depth = 0): unknown {
  if (depth > 12 || value == null) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return '';
    if (value.length > MAX_STRING) return value.slice(0, 2_000) + '…[truncated]';
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => slimValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = slimValue(child, depth + 1);
    }
    return out;
  }
  return value;
}

export function slimMirrorPayload(payload: unknown): unknown {
  return slimValue(payload);
}

export function mirrorPayloadBytes(payload: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8');
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
