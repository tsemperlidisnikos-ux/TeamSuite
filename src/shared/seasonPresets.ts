import { localDateIso } from '../utils/dates';

export { localDateIso, localDateTimeIso } from '../utils/dates';

export type SeasonDateRange = {
  dateFrom: string;
  dateTo: string;
};

export type SeasonPreset = {
  id: string;
  label: string;
  filters: SeasonDateRange;
};

/** Αγωνιστική σεζόν: 1 Ιουλίου → 30 Ιουνίου */
export function seasonBounds(startYear: number): SeasonDateRange {
  return {
    dateFrom: `${startYear}-07-01`,
    dateTo: `${startYear + 1}-06-30`,
  };
}

export function currentSeasonStartYear(now = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 7 ? year : year - 1;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function monthBounds(year: number, month: number): SeasonDateRange {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    dateFrom: `${year}-${pad(month)}-01`,
    dateTo: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export function dayBounds(now = new Date()): SeasonDateRange {
  const day = localDateIso(now);
  return { dateFrom: day, dateTo: day };
}

export function buildSeasonPresets(now = new Date()): SeasonPreset[] {
  const seasonStart = currentSeasonStartYear(now);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return [
    {
      id: 'season-current',
      label: `Τρέχουσα σεζόν ${seasonStart}–${String(seasonStart + 1).slice(2)}`,
      filters: seasonBounds(seasonStart),
    },
    {
      id: 'month-current',
      label: 'Τρέχων μήνας',
      filters: monthBounds(year, month),
    },
    {
      id: 'day-current',
      label: 'Τρέχουσα ημέρα',
      filters: dayBounds(now),
    },
  ];
}
