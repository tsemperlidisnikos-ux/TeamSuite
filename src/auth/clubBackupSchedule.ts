import { localDateIso, localDateTimeIso } from '../utils/dates';

export type ClubBackupScheduleKind = 'once' | 'daily' | 'weekly';
export type ClubBackupDeliveryMode = 'download' | 'cloud' | 'both';

/** Πρόγραμμα backup που ορίζει ο σύλλογος (τοπική ώρα browser). */
export type ClubBackupSchedule = {
  enabled: boolean;
  kind: ClubBackupScheduleKind;
  /** YYYY-MM-DD — μόνο για μία φορά */
  dateLocal?: string;
  /** HH:mm τοπική ώρα */
  timeLocal: string;
  /** 0=Κυρ … 6=Σαβ (μόνο weekly) */
  dayOfWeek?: number;
  mode: ClubBackupDeliveryMode;
  lastRunAt?: string | null;
  /** Συμπληρώνεται όταν ολοκληρωθεί το once */
  completedAt?: string | null;
};

const WEEKDAYS = [
  'Κυριακή',
  'Δευτέρα',
  'Τρίτη',
  'Τετάρτη',
  'Πέμπτη',
  'Παρασκευή',
  'Σάββατο',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function normalizeTimeLocal(value: string): string {
  const parts = value.trim().split(':');
  if (parts.length < 2) return '18:00';
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '18:00';
  return `${pad(Math.min(23, Math.max(0, Math.floor(hours))))}:${pad(
    Math.min(59, Math.max(0, Math.floor(minutes))),
  )}`;
}

export function parseLocalDateTime(dateLocal: string, timeLocal: string): Date | null {
  const time = normalizeTimeLocal(timeLocal);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateLocal)) return null;
  const parsed = new Date(`${dateLocal}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function datetimeLocalValue(date = new Date()): string {
  return `${localDateIso(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Προεπιλογή: περίπου μία ώρα από τώρα, στρογγυλεμένη στα 5 λεπτά. */
export function defaultOnceDateTime(from = new Date()): { dateLocal: string; timeLocal: string } {
  const next = new Date(from.getTime() + 60 * 60 * 1000);
  next.setSeconds(0, 0);
  const rounded = Math.ceil(next.getMinutes() / 5) * 5;
  if (rounded >= 60) {
    next.setHours(next.getHours() + 1);
    next.setMinutes(0);
  } else {
    next.setMinutes(rounded);
  }
  return {
    dateLocal: localDateIso(next),
    timeLocal: `${pad(next.getHours())}:${pad(next.getMinutes())}`,
  };
}

function lastRunDayKey(lastRunAt?: string | null): string | null {
  if (!lastRunAt) return null;
  const parsed = new Date(lastRunAt);
  if (Number.isNaN(parsed.getTime())) return lastRunAt.slice(0, 10);
  return localDateIso(parsed);
}

function minutesOf(timeLocal: string): number {
  const [hours, minutes] = normalizeTimeLocal(timeLocal).split(':').map(Number);
  return hours * 60 + minutes;
}

export function isClubBackupScheduleDue(
  schedule: ClubBackupSchedule,
  now = new Date(),
): boolean {
  if (!schedule.enabled) return false;
  if (schedule.kind === 'once') {
    if (schedule.completedAt) return false;
    const due = parseLocalDateTime(schedule.dateLocal ?? '', schedule.timeLocal);
    if (!due) return false;
    return now.getTime() >= due.getTime();
  }

  if (lastRunDayKey(schedule.lastRunAt) === localDateIso(now)) return false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes < minutesOf(schedule.timeLocal)) return false;

  if (schedule.kind === 'weekly') {
    return now.getDay() === (schedule.dayOfWeek ?? 1);
  }
  return true;
}

export function prepareClubBackupScheduleForSave(
  schedule: ClubBackupSchedule,
  now = new Date(),
): { ok: true; schedule: ClubBackupSchedule } | { ok: false; error: string } {
  const timeLocal = normalizeTimeLocal(schedule.timeLocal);
  if (schedule.kind === 'once') {
    const due = parseLocalDateTime(schedule.dateLocal ?? '', timeLocal);
    if (!due) return { ok: false, error: 'Επιλέξτε έγκυρη ημερομηνία και ώρα.' };
    if (due.getTime() <= now.getTime()) {
      return { ok: false, error: 'Η ημερομηνία και η ώρα πρέπει να είναι στο μέλλον.' };
    }
    return {
      ok: true,
      schedule: {
        ...schedule,
        enabled: true,
        timeLocal,
        dateLocal: schedule.dateLocal,
        completedAt: null,
        lastRunAt: null,
      },
    };
  }

  let next: ClubBackupSchedule = {
    ...schedule,
    enabled: true,
    timeLocal,
    completedAt: null,
    lastRunAt: null,
    dayOfWeek: schedule.kind === 'weekly' ? (schedule.dayOfWeek ?? 1) : schedule.dayOfWeek,
  };
  // Αν η σημερινή ώρα έχει ήδη περάσει, το πρώτο τρέξιμο είναι στην επόμενη περίοδο.
  if (isClubBackupScheduleDue(next, now)) {
    next = { ...next, lastRunAt: localDateTimeIso(now) };
  }
  return { ok: true, schedule: next };
}

export function sanitizeClubBackupSchedule(raw: unknown): ClubBackupSchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<ClubBackupSchedule>;
  const kind: ClubBackupScheduleKind =
    value.kind === 'daily' || value.kind === 'weekly' || value.kind === 'once'
      ? value.kind
      : 'once';
  const mode: ClubBackupDeliveryMode =
    value.mode === 'cloud' || value.mode === 'both' || value.mode === 'download'
      ? value.mode
      : 'download';
  const dayOfWeek =
    typeof value.dayOfWeek === 'number' && value.dayOfWeek >= 0 && value.dayOfWeek <= 6
      ? value.dayOfWeek
      : 1;
  return {
    enabled: Boolean(value.enabled),
    kind,
    dateLocal: typeof value.dateLocal === 'string' ? value.dateLocal : undefined,
    timeLocal: normalizeTimeLocal(typeof value.timeLocal === 'string' ? value.timeLocal : '18:00'),
    dayOfWeek,
    mode,
    lastRunAt: typeof value.lastRunAt === 'string' ? value.lastRunAt : null,
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : null,
  };
}

function formatElDateTime(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} στις ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function modeLabel(mode: ClubBackupDeliveryMode): string {
  if (mode === 'cloud') return 'cloud mirror';
  if (mode === 'both') return 'JSON και cloud';
  return 'λήψη JSON';
}

export function describeClubBackupSchedule(
  schedule: ClubBackupSchedule | null | undefined,
): string {
  if (!schedule) return 'Δεν έχει οριστεί πρόγραμμα.';
  if (!schedule.enabled) {
    if (schedule.kind === 'once' && schedule.completedAt) {
      const done = new Date(schedule.completedAt);
      const when = Number.isNaN(done.getTime()) ? '' : ` (${formatElDateTime(done)})`;
      return `Το προγραμματισμένο backup ολοκληρώθηκε${when}. Ορίστε νέα ημερομηνία για επόμενο.`;
    }
    return 'Το πρόγραμμα είναι απενεργοποιημένο.';
  }
  const how = modeLabel(schedule.mode);
  if (schedule.kind === 'once') {
    const due = parseLocalDateTime(schedule.dateLocal ?? '', schedule.timeLocal);
    if (!due) return 'Ενεργό, αλλά η ημερομηνία δεν είναι έγκυρη.';
    return `Επόμενο backup: ${formatElDateTime(due)} (${how}).`;
  }
  if (schedule.kind === 'weekly') {
    const day = WEEKDAYS[schedule.dayOfWeek ?? 1] ?? 'Δευτέρα';
    return `Κάθε ${day} στις ${normalizeTimeLocal(schedule.timeLocal)} (${how}).${lastRunNote(schedule)}`;
  }
  return `Κάθε μέρα στις ${normalizeTimeLocal(schedule.timeLocal)} (${how}).${lastRunNote(schedule)}`;
}

function lastRunNote(schedule: ClubBackupSchedule): string {
  if (!schedule.lastRunAt) return '';
  const done = new Date(schedule.lastRunAt);
  if (Number.isNaN(done.getTime())) return '';
  return ` Τελευταία εκτέλεση: ${formatElDateTime(done)}.`;
}

export { WEEKDAYS as CLUB_BACKUP_WEEKDAYS };
