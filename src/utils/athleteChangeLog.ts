import { createId } from '../data/repository';
import type { AppData, AthleteChangeLog, Student } from '../types';
import { getSession } from '../auth/auth';
import { localDateTimeIso } from './dates';
import { normalizeAmkaDigits } from './athleteIdentity';
import { studentClassIds } from './studentClasses';
import { studentSports } from './studentSports';

const FIELD_LABELS: Record<string, string> = {
  firstName: 'Όνομα',
  lastName: 'Επώνυμο',
  status: 'Κατάσταση',
  classIds: 'Τμήματα',
  sport: 'Άθλημα',
  sports: 'Αθλήματα',
  amka: 'ΑΜΚΑ',
  registrationNumber: 'Αρ. δελτίου',
  phone: 'Τηλέφωνο',
  email: 'Email',
  monthlyFee: 'Συνδρομή',
  birthDate: 'Ημ. γέννησης',
  address: 'Διεύθυνση',
  healthCardStatus: 'Κάρτα υγείας',
  guardianPhone: 'Τηλ. κηδεμόνα',
};

function maskAmka(value: string): string {
  const digits = normalizeAmkaDigits(value);
  if (digits.length === 11) return `*******${digits.slice(-4)}`;
  if (/^enc:|^amkaenc:/i.test(value)) return '(κρυπτογραφημένο)';
  return value.trim() ? '•' : '';
}

function fieldValue(student: Student, field: string): string {
  if (field === 'classIds') {
    return [...studentClassIds(student)].sort().join(',');
  }
  if (field === 'sports') {
    return studentSports(student).slice().sort().join(',');
  }
  if (field === 'amka') {
    return maskAmka(String(student.amka ?? ''));
  }
  const raw = (student as unknown as Record<string, unknown>)[field];
  if (raw == null) return '';
  if (Array.isArray(raw)) return raw.map(String).join(',');
  return String(raw);
}

const TRACKED = [
  'firstName',
  'lastName',
  'status',
  'classIds',
  'sport',
  'sports',
  'amka',
  'registrationNumber',
  'phone',
  'email',
  'monthlyFee',
  'birthDate',
  'address',
  'healthCardStatus',
  'guardianPhone',
] as const;

const MAX_LOGS = 400;

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function appendAthleteChangeLog(
  data: AppData,
  previous: Student,
  next: Student,
): void {
  const changes: AthleteChangeLog['changes'] = [];
  for (const field of TRACKED) {
    const from = fieldValue(previous, field);
    const to = fieldValue(next, field);
    if (from === to) continue;
    changes.push({ field, from, to });
  }
  if (changes.length === 0) return;
  const session = getSession();
  const entry: AthleteChangeLog = {
    id: createId('acl'),
    studentId: next.id,
    at: localDateTimeIso(),
    byUserId: session?.id,
    byName: session?.fullName || session?.email || '—',
    changes,
  };
  const list = data.athleteChangeLogs ?? [];
  data.athleteChangeLogs = [...list, entry].slice(-MAX_LOGS);
}
