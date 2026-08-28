function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Τοπική ημερομηνία YYYY-MM-DD (όχι UTC). */
export function localDateIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Τοπικό timestamp με offset, π.χ. 2026-08-11T00:41:00+03:00 */
export function localDateTimeIso(now = new Date()): string {
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offsetHours = pad(Math.floor(abs / 60));
  const offsetMinutes = pad(abs % 60);
  return `${localDateIso(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${offsetHours}:${offsetMinutes}`;
}
