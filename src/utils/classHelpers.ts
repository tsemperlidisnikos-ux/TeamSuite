import type { AcademyClass, AttendanceRecord, AthleteTransaction, ClubSeason, Student } from '../types';
import { isClassInActiveSeason } from './clubSeasons';
import { localDateIso } from './dates';
import { seasonDisplayName } from './clubSeasons';

export const classGenderLabels = {
  male: 'Άρρεν',
  female: 'Θήλυ',
  mixed: 'Μικτό',
  '': '—',
} as const;

export function seasonShortLabel(season: ClubSeason | null | undefined): string {
  if (!season) return '—';
  const named = season.name.trim();
  const shortMatch = named.match(/\d{4}[-–]\d{2,4}/);
  if (shortMatch) return shortMatch[0].replace('–', '-');
  const y1 = season.startDate.slice(0, 4);
  const y2 = season.endDate.slice(2, 4);
  if (y1 && y2) return `${y1}-${y2}`;
  return seasonDisplayName(season);
}

export function isClassListedActive(
  cls: AcademyClass,
  seasons: ClubSeason[] | undefined | null,
  today = localDateIso(),
): boolean {
  if (cls.manualInactive) return false;
  return isClassInActiveSeason(cls, seasons, today);
}

export function coachDisplayName(
  coachId: string | null | undefined,
  coaches: { id: string; firstName: string; lastName: string; active?: boolean }[],
): string {
  if (!coachId) return '—';
  const coach = coaches.find((c) => c.id === coachId);
  if (!coach) return '—';
  return `${coach.lastName} ${coach.firstName}`.trim();
}

export function athleteAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const m = today.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age -= 1;
  return age;
}

export function athleteBirthYear(birthDate: string): string {
  if (!birthDate || birthDate.length < 4) return '—';
  return birthDate.slice(0, 4);
}

export function athleteAttendanceStats(
  studentId: string,
  classId: string,
  attendance: AttendanceRecord[] | undefined,
): { present: number; total: number; pct: number } {
  const rows = (attendance ?? []).filter(
    (a) => a.studentId === studentId && a.classId === classId,
  );
  const total = rows.length;
  const present = rows.filter((a) => a.present).length;
  const pct = total === 0 ? 0 : Math.round((present / total) * 10000) / 100;
  return { present, total, pct };
}

function seasonStartFromPeriod(month: number, year: number): number {
  return month >= 8 ? year : year - 1;
}

export function athleteFinancialClear(
  athleteId: string,
  transactions: AthleteTransaction[] | undefined,
  seasonStart = new Date().getFullYear(),
): boolean {
  const balance = (transactions ?? [])
    .filter((t) => t.athleteId === athleteId)
    .filter((t) => {
      const month = t.month ?? 1;
      const year = t.year ?? seasonStart;
      return seasonStartFromPeriod(month, year) === seasonStart;
    })
    .reduce((sum, t) => sum + (t.type === 'charge' ? t.amount : -t.amount), 0);
  return balance <= 0.01;
}

export function athleteClassStatusLabel(
  student: Student,
  cls: AcademyClass,
  seasons: ClubSeason[] | undefined | null,
): string {
  if (student.status === 'inactive') return 'Ανενεργός';
  const activeSeason = isClassInActiveSeason(cls, seasons);
  if (activeSeason && !cls.manualInactive) return 'Ενεργός';
  return 'Ενεργός Προηγ. Σεζόν';
}

export function classAgeRangeLabel(cls: AcademyClass): string {
  const from = cls.birthYearFrom;
  const to = cls.birthYearTo;
  if (from && to) return `${from} - ${to}`;
  if (from) return `${from} - …`;
  if (to) return `… - ${to}`;
  return '—';
}

export const studentGenderLabels = {
  boy: 'Άρρεν',
  girl: 'Θήλυ',
  other: 'Άλλο',
  '': '—',
} as const;

export function studentBirthYear(student: Pick<Student, 'birthDate'>): number | null {
  if (!student.birthDate || student.birthDate.length < 4) return null;
  const y = Number(student.birthDate.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export function studentMatchesGenderFilter(
  student: Pick<Student, 'gender'>,
  filter: '' | 'boy' | 'girl',
): boolean {
  if (!filter) return true;
  return (student.gender ?? '') === filter;
}

export function studentMatchesBirthYearFilter(
  student: Pick<Student, 'birthDate'>,
  filter: string,
): boolean {
  if (!filter) return true;
  const year = studentBirthYear(student);
  if (year === null) return false;
  return String(year) === filter;
}

export function classToFormInput(cls: AcademyClass) {
  return {
    name: cls.name,
    sport: cls.sport,
    ageGroup: cls.ageGroup,
    coachId: cls.coachId,
    maxStudents: cls.maxStudents,
    scheduleSummary: cls.scheduleSummary,
    monthlyFee: cls.monthlyFee,
    startDate: cls.startDate ?? '',
    endDate: cls.endDate ?? '',
    seasonId: cls.seasonId ?? null,
    gender: cls.gender ?? '',
    birthYearFrom: cls.birthYearFrom ?? null,
    birthYearTo: cls.birthYearTo ?? null,
    manualInactive: cls.manualInactive ?? false,
  };
}
