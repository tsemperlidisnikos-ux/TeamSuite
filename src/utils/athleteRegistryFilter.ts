import type { AcademyClass, AttendanceRecord, Student } from '../types';
import { maskAmka } from './amkaAccess';
import { normalizeSportKey } from './sport';
import { studentClassIds, studentMatchesTeamFilter } from './studentClasses';
import { studentHasSport } from './studentSports';

export type TriState = '' | 'yes' | 'no';

export interface RegistryFilters {
  fromDate: string;
  untilDate: string;
  teamId: string;
  birthYear: string;
  birthYearOp: '=' | '<' | '>' | '<=' | '>=';
  gender: string;
  registrationFee: TriState;
  photo: TriState;
  active: TriState;
  doctorCheck: TriState;
  sport: string;
  association: string;
  seasonTicket: TriState;
  customCharge: TriState;
  hasRegistrationCard: TriState;
  trainingPresence: string;
  trainingPresenceOp: '=' | '<' | '>' | '>=';
  uniformReceipt: TriState;
  uniformSize: string;
}

export function defaultRegistryFilters(): RegistryFilters {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const untilDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return {
    fromDate: '',
    untilDate,
    teamId: '',
    birthYear: '',
    birthYearOp: '=',
    gender: '',
    registrationFee: '',
    photo: '',
    active: '',
    doctorCheck: '',
    sport: '',
    association: '',
    seasonTicket: '',
    customCharge: '',
    hasRegistrationCard: '',
    trainingPresence: '',
    trainingPresenceOp: '>=',
    uniformReceipt: '',
    uniformSize: '',
  };
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateKey(value: string | undefined | null): number | null {
  const d = parseDate(value);
  if (!d) return null;
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function compareNumber(
  value: number | undefined,
  op: string,
  target: string,
): boolean {
  const t = Number(target);
  if (!target || Number.isNaN(t)) return true;
  if (value == null || Number.isNaN(value)) return false;
  switch (op) {
    case '<':
      return value < t;
    case '>':
      return value > t;
    case '<=':
      return value <= t;
    case '>=':
      return value >= t;
    default:
      return value === t;
  }
}

function triStateMatch(filterValue: TriState, isTruthy: boolean): boolean {
  if (!filterValue) return true;
  if (filterValue === 'yes') return isTruthy;
  if (filterValue === 'no') return !isTruthy;
  return true;
}

function sportsAreEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeSportKey(a) === normalizeSportKey(b) && Boolean(normalizeSportKey(a));
}

function hasRegistrationCard(student: Student): boolean {
  const raw = String(student.registrationNumber ?? '').trim();
  return raw.length > 0;
}

export function filterAthleteRegistry(
  athletes: Student[],
  filters: RegistryFilters,
  classes: AcademyClass[],
  attendance: AttendanceRecord[],
): Student[] {
  const refDate = parseDate(filters.untilDate) || new Date();
  const refKey = dateKey(filters.untilDate) ?? dateKey(
    `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}-${String(refDate.getDate()).padStart(2, '0')}`,
  );
  const fromKey = dateKey(filters.fromDate);

  return athletes.filter((athlete) => {
    const createdKey = dateKey(athlete.enrolledAt);
    if (createdKey != null && fromKey != null && createdKey < fromKey) return false;
    if (createdKey != null && refKey != null && createdKey > refKey) return false;

    if (!studentMatchesTeamFilter(athlete, filters.teamId)) return false;

    if (filters.birthYear) {
      const year = parseDate(athlete.birthDate)?.getFullYear();
      if (!compareNumber(year, filters.birthYearOp, filters.birthYear)) return false;
    }

    if (filters.gender && athlete.gender !== filters.gender) return false;

    if (
      !triStateMatch(
        filters.registrationFee,
        Boolean(athlete.registrationCharge ?? (athlete.registrationFee ?? 0) > 0),
      )
    ) {
      return false;
    }

    if (!triStateMatch(filters.photo, Boolean(athlete.photoUrl))) return false;

    if (!triStateMatch(filters.active, athlete.status === 'active')) return false;

    if (
      !triStateMatch(
        filters.doctorCheck,
        Boolean(athlete.healthCard || athlete.healthCardStatus === 'Έγκυρη'),
      )
    ) {
      return false;
    }

    if (filters.sport) {
      const classSports = studentClassIds(athlete).map(
        (id) => classes.find((c) => c.id === id)?.sport,
      );
      if (
        !studentHasSport(athlete, filters.sport) &&
        !classSports.some((classSport) => sportsAreEquivalent(classSport, filters.sport))
      ) {
        return false;
      }
    }

    if (!triStateMatch(filters.hasRegistrationCard, hasRegistrationCard(athlete))) {
      return false;
    }

    if (filters.association) {
      const assoc = String(athlete.clubName || '').trim();
      if (assoc !== filters.association) return false;
    }

    if (!triStateMatch(filters.seasonTicket, Boolean(athlete.seasonTicket))) return false;

    if (!triStateMatch(filters.customCharge, Boolean(athlete.customCharge))) return false;

    if (!triStateMatch(filters.uniformReceipt, Boolean(athlete.uniformReceived))) {
      return false;
    }

    if (filters.uniformSize) {
      const size = String(athlete.uniformSize || '')
        .trim()
        .toUpperCase();
      if (size !== String(filters.uniformSize).trim().toUpperCase()) return false;
    }

    if (filters.trainingPresence) {
      const count = attendance.filter(
        (a) => a.studentId === athlete.id && a.present,
      ).length;
      if (
        !compareNumber(count, filters.trainingPresenceOp, filters.trainingPresence)
      ) {
        return false;
      }
    }

    // unused but keeps signature ready for team date filters
    void classes;
    return true;
  });
}

export function formatRegistryDate(value: string | undefined | null): string {
  const d = parseDate(value);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function genderLabel(gender: Student['gender']): string {
  if (gender === 'boy') return 'ΑΓΟΡΙ';
  if (gender === 'girl') return 'ΚΟΡΙΤΣΙ';
  if (gender === 'other') return 'ΑΛΛΟ';
  return '';
}

export const REGISTRY_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'index', label: '#' },
  { key: 'amka', label: 'ΑΜΚΑ' },
  { key: 'gender', label: 'Φύλο' },
  { key: 'last_name', label: 'Επώνυμο' },
  { key: 'first_name', label: 'Όνομα' },
  { key: 'email', label: 'Email αθλητή / τριας' },
  { key: 'phone', label: 'Τηλέφωνο αθλητή / τριας' },
  { key: 'date_of_birth', label: 'Ημερομηνία γέννησης' },
  { key: 'patronymic', label: 'Πατρώνυμο' },
  { key: 'metronymic', label: 'Μητρώνυμο' },
  { key: 'association', label: 'Σωματείο' },
  { key: 'teams', label: 'Τμήμα' },
  { key: 'registration_card_no', label: 'Αρ. Δελτίου' },
  { key: 'photo', label: 'Φωτογραφία' },
  { key: 'health_card', label: 'Κάρτα υγείας' },
  { key: 'uniform_receipt', label: 'Παραλαβή στολής' },
  { key: 'uniform_size', label: 'Μέγεθος Στολής' },
  { key: 'registration_fee', label: 'Χρέωση Εγγραφής' },
  { key: 'season_ticket', label: 'Εισιτήριο Διαρκείας' },
];

export function mapAthleteRegistryRow(
  athlete: Student,
  index: number,
  className: string,
  options?: { revealAmka?: boolean },
): Record<string, string> {
  const yesNo = (v: boolean) => (v ? 'Ναι' : 'Όχι');
  const revealAmka = options?.revealAmka ?? false;
  return {
    index: String(index + 1),
    amka: revealAmka ? athlete.amka || '' : maskAmka(athlete.amka),
    gender: genderLabel(athlete.gender),
    last_name: athlete.lastName || '',
    first_name: athlete.firstName || '',
    email: athlete.email || '',
    phone: athlete.phone || '',
    date_of_birth: formatRegistryDate(athlete.birthDate),
    patronymic: athlete.fatherFirstName || '',
    metronymic: athlete.motherFirstName || '',
    association: athlete.clubName || '',
    teams: className || '',
    registration_card_no: athlete.registrationNumber || '',
    photo: yesNo(Boolean(athlete.photoUrl)),
    health_card: yesNo(
      Boolean(athlete.healthCard || athlete.healthCardStatus === 'Έγκυρη'),
    ),
    uniform_receipt: yesNo(Boolean(athlete.uniformReceived)),
    uniform_size: athlete.uniformSize || '—',
    registration_fee: yesNo(
      Boolean(athlete.registrationCharge ?? (athlete.registrationFee ?? 0) > 0),
    ),
    season_ticket: yesNo(Boolean(athlete.seasonTicket)),
  };
}
