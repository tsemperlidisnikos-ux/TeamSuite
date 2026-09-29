import { paymentMethodLabel } from '../shared/paymentMethods';
import { formatCurrency, formatDate, formatMonthYearNumeric } from './labels';

export type FinanceEntrySearchable = {
  date: string;
  amount: number;
  description?: string;
  clubName?: string;
  sport?: string;
  className?: string;
  surname?: string;
  firstName?: string;
  notes?: string;
  vendor?: string;
  subscriptionPeriod?: string;
  paymentMethod?: string;
  matchDetails?: {
    teams?: string;
    category?: string;
    otherExpensesNote?: string;
  };
};

export type FinanceEntryFilter = {
  query?: string;
  description?: string;
  dateFrom: string;
  dateTo: string;
};

export function financeDescriptionOptions(
  configured: readonly string[],
  rows: Array<{ description?: string }>,
): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const value of [...configured, ...rows.map((row) => row.description ?? '')]) {
    const next = value.trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    options.push(next);
  }
  return options.sort((a, b) => a.localeCompare(b, 'el'));
}

function normalize(value: string | number | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
}

function entrySearchText(entry: FinanceEntrySearchable): string {
  const amount = Number(entry.amount) || 0;
  return [
    entry.date,
    formatDate(entry.date),
    entry.description,
    entry.clubName,
    entry.sport,
    entry.className,
    entry.surname,
    entry.firstName,
    `${entry.surname ?? ''} ${entry.firstName ?? ''}`,
    entry.notes,
    entry.vendor,
    entry.subscriptionPeriod,
    entry.subscriptionPeriod ? formatMonthYearNumeric(entry.subscriptionPeriod) : '',
    paymentMethodLabel(entry.paymentMethod),
    entry.matchDetails?.teams,
    entry.matchDetails?.category,
    entry.matchDetails?.otherExpensesNote,
    String(amount),
    amount.toFixed(2),
    formatCurrency(amount),
  ]
    .map((part) => normalize(part))
    .filter(Boolean)
    .join(' ');
}

export function financeEntryMatchesQuery(entry: FinanceEntrySearchable, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return entrySearchText(entry).includes(needle);
}

export function financeEntryInDateRange(
  entry: FinanceEntrySearchable,
  dateFrom: string,
  dateTo: string,
): boolean {
  const day = String(entry.date ?? '').slice(0, 10);
  if (dateFrom && day < dateFrom) return false;
  if (dateTo && day > dateTo) return false;
  return true;
}

export function filterFinanceEntries<T extends FinanceEntrySearchable>(
  rows: T[],
  filter: FinanceEntryFilter,
): T[] {
  const description = filter.description?.trim() ?? '';
  return rows.filter(
    (row) =>
      financeEntryInDateRange(row, filter.dateFrom, filter.dateTo) &&
      financeEntryMatchesQuery(row, filter.query ?? '') &&
      (!description || row.description === description),
  );
}

export function sumFinanceEntryAmounts(rows: Array<{ amount: number }>): number {
  return Math.round(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100) / 100;
}

export function printFinanceEntries(): void {
  document.body.classList.add('printing-finance-entries');
  const cleanup = () => document.body.classList.remove('printing-finance-entries');
  window.addEventListener('afterprint', cleanup, { once: true });
  window.requestAnimationFrame(() => {
    try {
      window.print();
    } finally {
      window.setTimeout(cleanup, 0);
    }
  });
}
