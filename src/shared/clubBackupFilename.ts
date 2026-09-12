const ATHENS_TZ = 'Europe/Athens';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Filesystem-safe club name for backup filenames (preserves Greek letters). */
export function slugifyClubNameForBackup(name: string, fallback: string): string {
  const trimmed = String(name ?? '').trim();
  const slug = trimmed
    .replace(/[^\w\u0370-\u03ff-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return slug || fallback;
}

/** Date+time stamp in Greece, e.g. 2026-09-04-17-25 (no `:` in filenames). */
export function backupDateTimeStamp(now = new Date(), timeZone = ATHENS_TZ): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? pad(0);
  return `${get('year')}-${get('month')}-${get('day')}-${get('hour')}-${get('minute')}`;
}

export function countActiveAthletesForBackup(
  students: Array<{ status?: string }> | undefined | null,
): number {
  if (!Array.isArray(students)) return 0;
  return students.filter((row) => row?.status === 'active').length;
}

/** π.χ. ` (142)` μετά την ώρα στο όνομα αρχείου. */
export function backupActiveAthletesSuffix(count: number | null | undefined): string {
  if (count == null || !Number.isFinite(Number(count))) return '';
  return ` (${Math.max(0, Math.floor(Number(count)))})`;
}

/** π.χ. TeamSuite-Α-Σ-ΑΠΟΛΛΩΝ-ΠΑΤΡΩΝ-2026-09-04-17-25 (142).json */
export function clubBackupJsonFileName(
  clubName: string,
  fallbackId: string,
  now = new Date(),
  activeAthletes?: number,
): string {
  const slug = slugifyClubNameForBackup(clubName, fallbackId);
  return `TeamSuite-${slug}-${backupDateTimeStamp(now)}${backupActiveAthletesSuffix(activeAthletes)}.json`;
}

/** Ίδιο όνομα με το JSON backup, με επέκταση .xlsx */
export function clubAthletesXlsxFileName(
  clubName: string,
  fallbackId: string,
  students: Array<{ status?: string }> | undefined | null,
  now = new Date(),
): string {
  return clubBackupJsonFileName(
    clubName,
    fallbackId,
    now,
    countActiveAthletesForBackup(students),
  ).replace(/\.json$/i, '.xlsx');
}
