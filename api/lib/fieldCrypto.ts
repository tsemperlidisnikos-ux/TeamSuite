import { createHmac } from 'node:crypto';

/**
 * Club-scoped AES-256 key material for AMKA / sensitive field crypto (v2).
 * Derived from a server-only secret — not from clubId alone.
 */
export function fieldCryptoSecret(): string {
  return (
    process.env.SS360_AMKA_SECRET ||
    process.env.SS360_SESSION_SECRET ||
    process.env.SS360_SYNC_SECRET ||
    ''
  ).trim();
}

export function deriveClubFieldKeyMaterial(clubId: string, secret = fieldCryptoSecret()): Buffer | null {
  const id = clubId.trim();
  if (!id || !secret) return null;
  return createHmac('sha256', secret).update(`ss360-field-crypto-v2|${id}`).digest();
}
