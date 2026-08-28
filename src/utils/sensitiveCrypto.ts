/**
 * Field-level AES-256-GCM for sensitive student data before cloud mirror sync.
 * Uses the same key family as AMKA (server-derived v2 when available).
 */
import {
  decryptAmka,
  encryptAmka,
  isAmkaEncrypted,
  AMKA_ENC_PREFIX,
  AMKA_ENC_PREFIX_V2,
} from './amkaCrypto';

export const SENSITIVE_ENC_PREFIX = 'enc:pii:v1:';
export const SENSITIVE_ENC_PREFIX_V2 = 'enc:pii:v2:';

const SENSITIVE_FIELDS = [
  'amka',
  'doctorName',
  'doctorPhone',
  'bloodType',
  'allergies',
  'chronicConditions',
  'medication',
  'emergencyName',
  'emergencyPhone',
  'emergencyRelation',
  'emergencyAltPhone',
] as const;

type SensitiveStudent = Partial<Record<(typeof SENSITIVE_FIELDS)[number], string>> & {
  amka?: string;
};

function isPiiEncrypted(value: string | undefined | null): boolean {
  return Boolean(
    value &&
      (value.startsWith(SENSITIVE_ENC_PREFIX_V2) ||
        value.startsWith(SENSITIVE_ENC_PREFIX) ||
        value.startsWith(AMKA_ENC_PREFIX_V2) ||
        value.startsWith(AMKA_ENC_PREFIX)),
  );
}

function toAmkaCipherPrefix(value: string): string {
  if (value.startsWith(SENSITIVE_ENC_PREFIX_V2)) {
    return value.replace(SENSITIVE_ENC_PREFIX_V2, AMKA_ENC_PREFIX_V2);
  }
  if (value.startsWith(SENSITIVE_ENC_PREFIX)) {
    return value.replace(SENSITIVE_ENC_PREFIX, AMKA_ENC_PREFIX);
  }
  return value;
}

function toPiiCipherPrefix(value: string): string {
  if (value.startsWith(AMKA_ENC_PREFIX_V2)) {
    return value.replace(AMKA_ENC_PREFIX_V2, SENSITIVE_ENC_PREFIX_V2);
  }
  if (value.startsWith(AMKA_ENC_PREFIX)) {
    return value.replace(AMKA_ENC_PREFIX, SENSITIVE_ENC_PREFIX);
  }
  return value;
}

async function encryptField(plain: string, clubId: string): Promise<string> {
  const trimmed = plain.trim();
  if (!trimmed || isPiiEncrypted(trimmed)) return trimmed;
  const cipher = await encryptAmka(trimmed, clubId);
  return toPiiCipherPrefix(cipher);
}

async function decryptField(value: string, clubId: string): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (isPiiEncrypted(trimmed) || isAmkaEncrypted(trimmed)) {
    return decryptAmka(toAmkaCipherPrefix(trimmed), clubId);
  }
  return trimmed;
}

/** Deep-clone AppData-like payload and encrypt sensitive student fields for cloud. */
export async function encryptSensitivePayloadForCloud<T extends { students?: SensitiveStudent[] }>(
  payload: T,
  clubId: string,
): Promise<T> {
  const clone = structuredClone(payload);
  if (!Array.isArray(clone.students)) return clone;
  for (const student of clone.students) {
    for (const field of SENSITIVE_FIELDS) {
      const value = student[field];
      if (!value?.trim() || isPiiEncrypted(value)) continue;
      student[field] = await encryptField(value, clubId);
    }
  }
  return clone;
}

export async function decryptSensitivePayloadFromCloud<T extends { students?: SensitiveStudent[] }>(
  payload: T,
  clubId: string,
): Promise<T> {
  const clone = structuredClone(payload);
  if (!Array.isArray(clone.students)) return clone;
  for (const student of clone.students) {
    for (const field of SENSITIVE_FIELDS) {
      const value = student[field];
      if (!value?.trim() || !isPiiEncrypted(value)) continue;
      try {
        student[field] = await decryptField(value, clubId);
      } catch {
        /* keep ciphertext if decrypt fails */
      }
    }
  }
  return clone;
}
