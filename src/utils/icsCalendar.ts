type IcsEvent = {
  uid: string;
  title: string;
  date: string;
  startTime: string;
  endTime?: string;
  location?: string;
  description?: string;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIcsUtc(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsStampNow(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Minimal iCalendar export for parent schedule subscribe/download. */
export function buildIcsCalendar(events: IcsEvent[], calendarName = 'SportSuite360'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SportSuite360//Parent Schedule//EL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
  ];
  for (const event of events) {
    const endTime = event.endTime || event.startTime;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}@sportsuite360`,
      `DTSTAMP:${icsStampNow()}`,
      `DTSTART:${toIcsUtc(event.date, event.startTime)}`,
      `DTEND:${toIcsUtc(event.date, endTime)}`,
      `SUMMARY:${escapeIcs(event.title)}`,
      event.location ? `LOCATION:${escapeIcs(event.location)}` : '',
      event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : '',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

export function downloadIcsFile(events: IcsEvent[], filename = 'proponiseis.ics', calendarName?: string) {
  const body = buildIcsCalendar(events, calendarName);
  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
