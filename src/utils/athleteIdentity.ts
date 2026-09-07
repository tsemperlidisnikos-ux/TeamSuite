import type { Student } from '../types/index.js';
import { sha256Hex } from './sha256hex.js';

export function normalizeAmkaDigits(value: string | undefined | null): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizeRegistrationNumber(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function isComparableAmka(value: string | undefined | null): boolean {
  const digits = normalizeAmkaDigits(value);
  if (digits.length !== 11) return false;
  const raw = String(value ?? '');
  if (/^enc:|^amkaenc:/i.test(raw)) return false;
  return true;
}

/** Μη αναστρέψιμο αποτύπωμα 11 ψηφίων ΑΜΚΑ. */
export function amkaFingerprint(amka: string | undefined | null): string {
  const digits = normalizeAmkaDigits(amka);
  if (digits.length !== 11) return '';
  return sha256Hex(`teamsuite-amka|${digits}`);
}

export function withAmkaFingerprint<T extends { amka?: string; amkaFp?: string }>(row: T): T {
  const fp = amkaFingerprint(row.amka);
  if (!fp) return row;
  if (row.amkaFp === fp) return row;
  return { ...row, amkaFp: fp };
}

type AmkaStudent = Pick<Student, 'id' | 'amka' | 'firstName' | 'lastName'> & {
  amkaFp?: string;
};

function rowMatchesAmka(row: AmkaStudent, want: string, wantFp: string): boolean {
  if (wantFp && row.amkaFp && row.amkaFp === wantFp) return true;
  if (!isComparableAmka(row.amka)) return false;
  return normalizeAmkaDigits(row.amka) === want;
}

export function findStudentsByAmka(
  students: AmkaStudent[],
  amka: string,
  exceptId?: string,
): AmkaStudent[] {
  const want = normalizeAmkaDigits(amka);
  if (want.length !== 11) return [];
  const wantFp = amkaFingerprint(want);
  return students.filter((row) => {
    if (exceptId && row.id === exceptId) return false;
    return rowMatchesAmka(row, want, wantFp);
  });
}

/** Συγκρίνει και κρυπτογραφημένα ΑΜΚΑ (cloud / δημόσια εγγραφή). */
export async function findStudentsByAmkaDeep(
  students: AmkaStudent[],
  amka: string,
  clubId: string,
  exceptId?: string,
): Promise<AmkaStudent[]> {
  const syncHits = findStudentsByAmka(students, amka, exceptId);
  if (syncHits.length) return syncHits;
  const want = normalizeAmkaDigits(amka);
  if (want.length !== 11 || !clubId.trim()) return [];
  const { decryptAmka, isAmkaEncrypted } = await import('./amkaCrypto.js');
  const hits: AmkaStudent[] = [];
  for (const row of students) {
    if (exceptId && row.id === exceptId) continue;
    if (!isAmkaEncrypted(row.amka)) continue;
    try {
      const plain = await decryptAmka(String(row.amka), clubId);
      if (normalizeAmkaDigits(plain) === want) hits.push(row);
    } catch {
      /* κλειδί / cipher mismatch */
    }
  }
  return hits;
}

export function findStudentsByRegistrationNumber(
  students: Array<Pick<Student, 'id' | 'registrationNumber' | 'firstName' | 'lastName'>>,
  registrationNumber: string,
  exceptId?: string,
): Array<Pick<Student, 'id' | 'registrationNumber' | 'firstName' | 'lastName'>> {
  const want = normalizeRegistrationNumber(registrationNumber);
  if (want.length < 3) return [];
  return students.filter((row) => {
    if (exceptId && row.id === exceptId) return false;
    const have = normalizeRegistrationNumber(row.registrationNumber);
    return have.length >= 3 && have === want;
  });
}

export function athleteIdentityConflictMessage(
  kind: 'amka' | 'registration',
  hits: Array<Pick<Student, 'firstName' | 'lastName'>>,
): string {
  const names = hits
    .slice(0, 3)
    .map((s) => `${s.lastName} ${s.firstName}`.trim())
    .join(', ');
  if (kind === 'amka') {
    return `Το ΑΜΚΑ υπάρχει ήδη στο μητρώο (${names}).`;
  }
  return `Ο αριθμός δελτίου υπάρχει ήδη στο μητρώο (${names}).`;
}
