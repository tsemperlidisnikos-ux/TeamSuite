import type { Facility } from '../types/index.js';

export const FACILITY_TIME_LAYOUTS: Array<{
  id: Facility['timeLayout'];
  label: string;
  start: string;
  end: string;
  stepMin: number;
}> = [
  {
    id: '08:00-00:00-15',
    label: '08:00 με 00:00 ανά 15 λεπτά',
    start: '08:00',
    end: '00:00',
    stepMin: 15,
  },
  {
    id: '08:00-00:00-30',
    label: '08:00 με 00:00 ανά 30 λεπτά',
    start: '08:00',
    end: '00:00',
    stepMin: 30,
  },
  {
    id: '07:00-23:00-30',
    label: '07:00 με 23:00 ανά 30 λεπτά',
    start: '07:00',
    end: '23:00',
    stepMin: 30,
  },
  {
    id: '09:00-22:00-60',
    label: '09:00 με 22:00 ανά 60 λεπτά',
    start: '09:00',
    end: '22:00',
    stepMin: 60,
  },
];

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function formatMinutes(total: number): string {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function facilityLayoutLabel(id: string | undefined): string {
  return FACILITY_TIME_LAYOUTS.find((item) => item.id === id)?.label ?? id ?? '—';
}

/** Ώρες από start μέχρι (όχι inclusive) end. Το 00:00 ως τέλος = μεσάνυχτα επόμενης. */
export function facilityTimeSlots(layoutId: string | undefined): string[] {
  const layout = FACILITY_TIME_LAYOUTS.find((item) => item.id === layoutId) ?? FACILITY_TIME_LAYOUTS[0];
  const start = minutesOf(layout.start);
  let end = minutesOf(layout.end);
  if (end <= start) end += 24 * 60;
  const slots: string[] = [];
  for (let t = start; t < end; t += layout.stepMin) {
    slots.push(formatMinutes(t));
  }
  return slots;
}

export function listActiveFacilities(facilities: Facility[] | undefined | null): Facility[] {
  return [...(facilities ?? [])]
    .filter((item) => item.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'el'));
}

export function resolveFacilityForLocation(
  facilities: Facility[] | undefined | null,
  location: string | undefined | null,
): Facility | null {
  const name = String(location ?? '').trim().toLowerCase();
  if (!name) return null;
  return (facilities ?? []).find((item) => item.name.trim().toLowerCase() === name) ?? null;
}
