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

/** π.χ. TeamSuite-Α-Σ-ΑΠΟΛΛΩΝ-ΠΑΤΡΩΝ-2026-09-04-17-25.json */
export function clubBackupJsonFileName(
  clubName: string,
  fallbackId: string,
  now = new Date(),
): string {
  const slug = slugifyClubNameForBackup(clubName, fallbackId);
  return `TeamSuite-${slug}-${backupDateTimeStamp(now)}.json`;
}
