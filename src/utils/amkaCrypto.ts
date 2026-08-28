/** AES-256-GCM for AMKA at rest (Web Crypto). Prefix marks ciphertext. */

export const AMKA_ENC_PREFIX = 'enc:amka:v1:';
export const AMKA_ENC_PREFIX_V2 = 'enc:amka:v2:';

const APP_SALT_V1 = 'TeamSuite-AMKA-AES256-v1';
const PBKDF2_ITERATIONS = 100_000;

const v1KeyCache = new Map<string, CryptoKey>();
const v2KeyCache = new Map<string, CryptoKey>();
const v2KeyFetch = new Map<string, Promise<CryptoKey | null>>();

type FieldKeyFetcher = (clubId: string) => Promise<string | null>;

let fieldKeyFetcher: FieldKeyFetcher | null = null;

/** Injected from API layer to avoid circular imports (auth ↔ crypto). */
export function setAmkaFieldKeyFetcher(fetcher: FieldKeyFetcher | null): void {
  fieldKeyFetcher = fetcher;
}

export function clearAmkaFieldKeyCache(): void {
  v2KeyCache.clear();
  v2KeyFetch.clear();
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isAmkaEncrypted(value: string | undefined | null): boolean {
  return Boolean(
    value &&
      (value.startsWith(AMKA_ENC_PREFIX_V2) || value.startsWith(AMKA_ENC_PREFIX)),
  );
}

export function isAmkaEncryptedV2(value: string | undefined | null): boolean {
  return Boolean(value && value.startsWith(AMKA_ENC_PREFIX_V2));
}

async function deriveKeyV1(clubId: string): Promise<CryptoKey> {
  const cached = v1KeyCache.get(clubId);
  if (cached) return cached;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${APP_SALT_V1}|${clubId}`),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const salt = new TextEncoder().encode(APP_SALT_V1);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  v1KeyCache.set(clubId, key);
  return key;
}

async function importV2Key(keyMaterialB64: string): Promise<CryptoKey> {
  const raw = fromBase64(keyMaterialB64);
  if (raw.byteLength !== 32) {
    throw new Error('Invalid field key length');
  }
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  return crypto.subtle.importKey('raw', buffer, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Fetch server-derived club key (HMAC of server secret). Null when offline / demo / no JWT. */
export async function resolveClubFieldKey(clubId: string): Promise<CryptoKey | null> {
  const id = clubId.trim();
  if (!id) return null;
  const cached = v2KeyCache.get(id);
  if (cached) return cached;

  let pending = v2KeyFetch.get(id);
  if (!pending) {
    pending = (async () => {
      if (!fieldKeyFetcher) return null;
      try {
        const keyB64 = await fieldKeyFetcher(id);
        if (!keyB64) return null;
        const key = await importV2Key(keyB64);
        v2KeyCache.set(id, key);
        return key;
      } catch {
        return null;
      } finally {
        v2KeyFetch.delete(id);
      }
    })();
    v2KeyFetch.set(id, pending);
  }
  return pending;
}

async function aesGcmEncrypt(key: CryptoKey, plain: string, prefix: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  const cipher = new Uint8Array(cipherBuf);
  return `${prefix}${toBase64(iv)}.${toBase64(cipher)}`;
}

async function aesGcmDecrypt(key: CryptoKey, payload: string): Promise<string> {
  const [ivB64, cipherB64] = payload.split('.');
  if (!ivB64 || !cipherB64) return '';
  const ivBytes = fromBase64(ivB64);
  const cipherBytes = fromBase64(cipherB64);
  const iv = ivBytes.buffer.slice(
    ivBytes.byteOffset,
    ivBytes.byteOffset + ivBytes.byteLength,
  ) as ArrayBuffer;
  const cipher = cipherBytes.buffer.slice(
    cipherBytes.byteOffset,
    cipherBytes.byteOffset + cipherBytes.byteLength,
  ) as ArrayBuffer;
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}

export async function encryptAmka(plain: string, clubId: string): Promise<string> {
  const trimmed = plain.trim();
  if (!trimmed) return '';
  if (isAmkaEncrypted(trimmed)) return trimmed;

  const v2Key = await resolveClubFieldKey(clubId);
  if (v2Key) {
    return aesGcmEncrypt(v2Key, trimmed, AMKA_ENC_PREFIX_V2);
  }

  // Offline / demo / local without JWT: legacy v1 (clubId-derived). Prefer v2 in production.
  const v1Key = await deriveKeyV1(clubId);
  return aesGcmEncrypt(v1Key, trimmed, AMKA_ENC_PREFIX);
}

export async function decryptAmka(value: string, clubId: string): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!isAmkaEncrypted(trimmed)) return trimmed;

  if (trimmed.startsWith(AMKA_ENC_PREFIX_V2)) {
    const v2Key = await resolveClubFieldKey(clubId);
    if (!v2Key) return trimmed;
    try {
      return await aesGcmDecrypt(v2Key, trimmed.slice(AMKA_ENC_PREFIX_V2.length));
    } catch {
      return trimmed;
    }
  }

  const v1Key = await deriveKeyV1(clubId);
  try {
    return await aesGcmDecrypt(v1Key, trimmed.slice(AMKA_ENC_PREFIX.length));
  } catch {
    return trimmed;
  }
}

export async function encryptStudentAmkaFields(
  students: Array<{ amka?: string }>,
  clubId: string,
): Promise<boolean> {
  let changed = false;
  // Prefetch once per club batch
  await resolveClubFieldKey(clubId);
  for (const student of students) {
    const amka = student.amka?.trim();
    if (!amka) continue;
    if (isAmkaEncryptedV2(amka)) continue;
    if (isAmkaEncrypted(amka)) {
      // Migrate v1 → v2 when server key is available
      const plain = await decryptAmka(amka, clubId);
      if (!plain || isAmkaEncrypted(plain)) continue;
      const v2Key = await resolveClubFieldKey(clubId);
      if (!v2Key) continue;
      student.amka = await encryptAmka(plain, clubId);
      changed = true;
      continue;
    }
    student.amka = await encryptAmka(amka, clubId);
    changed = true;
  }
  return changed;
}

export async function decryptStudentAmkaFields(
  students: Array<{ amka?: string }>,
  clubId: string,
): Promise<boolean> {
  let changed = false;
  await resolveClubFieldKey(clubId);
  for (const student of students) {
    const amka = student.amka?.trim();
    if (!amka || !isAmkaEncrypted(amka)) continue;
    try {
      const plain = await decryptAmka(amka, clubId);
      if (plain && plain !== amka && !isAmkaEncrypted(plain)) {
        student.amka = plain;
        changed = true;
      }
    } catch {
      /* keep ciphertext if key/context mismatch */
    }
  }
  return changed;
}
