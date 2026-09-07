import type { Student } from '../types/index.js';

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

export function findStudentsByAmka(
  students: Array<Pick<Student, 'id' | 'amka' | 'firstName' | 'lastName'>>,
  amka: string,
  exceptId?: string,
): Array<Pick<Student, 'id' | 'amka' | 'firstName' | 'lastName'>> {
  const want = normalizeAmkaDigits(amka);
  if (want.length !== 11) return [];
  return students.filter((row) => {
    if (exceptId && row.id === exceptId) return false;
    if (!isComparableAmka(row.amka)) return false;
    return normalizeAmkaDigits(row.amka) === want;
  });
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
