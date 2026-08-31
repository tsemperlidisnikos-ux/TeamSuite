import type { AppData, ReceiptIssueRecord, ReceiptNumberRange } from '../types';
import { localDateTimeIso } from './dates';

export function normalizeReceiptSeries(raw: string | undefined | null): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('el');
}

export function normalizeReceiptRanges(
  list: ReceiptNumberRange[] | undefined | null,
): ReceiptNumberRange[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const next: ReceiptNumberRange[] = [];
  for (const row of list) {
    const id = String(row?.id ?? '').trim();
    const series = normalizeReceiptSeries(row?.series);
    const from = Math.floor(Number(row?.from));
    const to = Math.floor(Number(row?.to));
    if (!id || !series || seen.has(id)) continue;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) continue;
    if (to - from > 99_999) continue;
    seen.add(id);
    next.push({ id, series, from, to });
  }
  return next.sort((a, b) => {
    const bySeries = a.series.localeCompare(b.series, 'el');
    if (bySeries !== 0) return bySeries;
    return a.from - b.from;
  });
}

export function normalizeReceiptIssues(
  list: ReceiptIssueRecord[] | undefined | null,
): ReceiptIssueRecord[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const next: ReceiptIssueRecord[] = [];
  for (const row of list) {
    const series = normalizeReceiptSeries(row?.series);
    const number = Math.floor(Number(row?.number));
    if (!series || !Number.isFinite(number) || number < 1) continue;
    const key = `${series}:${number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({
      id: String(row?.id ?? '').trim() || key,
      series,
      number,
      transactionId: row?.transactionId ?? null,
      athleteId: row?.athleteId ?? null,
      issuedAt: String(row?.issuedAt ?? '').trim() || localDateTimeIso(),
      emailedAt: row?.emailedAt ?? null,
      voidedAt: row?.voidedAt ?? null,
      voidReason: row?.voidReason ?? null,
    });
  }
  return next.sort((a, b) => {
    const bySeries = a.series.localeCompare(b.series, 'el');
    if (bySeries !== 0) return bySeries;
    return a.number - b.number;
  });
}

export function rangesOverlap(
  a: Pick<ReceiptNumberRange, 'series' | 'from' | 'to'>,
  b: Pick<ReceiptNumberRange, 'series' | 'from' | 'to'>,
): boolean {
  return (
    normalizeReceiptSeries(a.series) === normalizeReceiptSeries(b.series) &&
    a.from <= b.to &&
    b.from <= a.to
  );
}

export function validateReceiptRanges(
  list: ReceiptNumberRange[],
): { ok: true; ranges: ReceiptNumberRange[] } | { ok: false; error: string } {
  const ranges = normalizeReceiptRanges(list);
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      if (rangesOverlap(ranges[i], ranges[j])) {
        return {
          ok: false,
          error: `Το εύρος ${ranges[i].series} ${ranges[i].from}–${ranges[i].to} επικαλύπτεται με ${ranges[j].series} ${ranges[j].from}–${ranges[j].to}.`,
        };
      }
    }
  }
  return { ok: true, ranges };
}

export function formatReceiptLabel(series: string, number: number): string {
  const s = normalizeReceiptSeries(series);
  return s ? `Σειρά ${s} · Αρ. ${number}` : `Αρ. ${number}`;
}

export function voidedReceiptNote(series: string, number: number): string {
  const s = normalizeReceiptSeries(series) || series;
  return `Η απόδειξη σειράς ${s} με αριθμό ${number} έχει γίνει διαγραφή`;
}

function numbersCovered(series: string, ranges: ReceiptNumberRange[]): { min: number; max: number } | null {
  const key = normalizeReceiptSeries(series);
  const mine = ranges.filter((row) => row.series === key);
  if (!mine.length) return null;
  return {
    min: Math.min(...mine.map((row) => row.from)),
    max: Math.max(...mine.map((row) => row.to)),
  };
}

function isNumberInRanges(series: string, number: number, ranges: ReceiptNumberRange[]): boolean {
  const key = normalizeReceiptSeries(series);
  return ranges.some((row) => row.series === key && number >= row.from && number <= row.to);
}

export function maxIssuedNumber(
  series: string,
  issues: ReceiptIssueRecord[],
): number {
  const key = normalizeReceiptSeries(series);
  let max = 0;
  for (const row of issues) {
    if (row.series === key && row.number > max) max = row.number;
  }
  return max;
}

export function previewNextReceipt(
  series: string,
  ranges: ReceiptNumberRange[] | undefined | null,
  issues: ReceiptIssueRecord[] | undefined | null,
): { ok: true; series: string; number: number } | { ok: false; error: string } {
  const key = normalizeReceiptSeries(series);
  const normalizedRanges = normalizeReceiptRanges(ranges);
  const normalizedIssues = normalizeReceiptIssues(issues);
  if (!key) return { ok: false, error: 'Επιλέξτε σειρά αποδείξεων.' };
  const span = numbersCovered(key, normalizedRanges);
  if (!span) {
    return {
      ok: false,
      error: 'Δεν υπάρχει εύρος αριθμών για αυτή τη σειρά. Ορίστε το στις Ρυθμίσεις → Αποδείξεις.',
    };
  }
  const next = Math.max(maxIssuedNumber(key, normalizedIssues) + 1, span.min);
  if (!isNumberInRanges(key, next, normalizedRanges)) {
    return {
      ok: false,
      error: `Η σειρά ${key} έφτασε στο όριο. Προσθέστε νέο εύρος (π.χ. ${key} ${next}–${next + 49}) στις Ρυθμίσεις → Αποδείξεις.`,
    };
  }
  return { ok: true, series: key, number: next };
}

export function remainingInRange(
  range: ReceiptNumberRange,
  ranges: ReceiptNumberRange[] | undefined | null,
  issues: ReceiptIssueRecord[] | undefined | null,
): number {
  const preview = previewNextReceipt(range.series, ranges, issues);
  if (!preview.ok) {
    const maxIssued = maxIssuedNumber(range.series, normalizeReceiptIssues(issues));
    if (maxIssued >= range.to) return 0;
    return 0;
  }
  const start = Math.max(preview.number, range.from);
  if (start > range.to) return 0;
  return range.to - start + 1;
}

export function remainingCount(
  series: string,
  ranges: ReceiptNumberRange[] | undefined | null,
  issues: ReceiptIssueRecord[] | undefined | null,
): number {
  return normalizeReceiptRanges(ranges)
    .filter((row) => row.series === normalizeReceiptSeries(series))
    .reduce((sum, row) => sum + remainingInRange(row, ranges, issues), 0);
}

export function seriesOptions(
  ranges: ReceiptNumberRange[] | undefined | null,
  issues: ReceiptIssueRecord[] | undefined | null,
): Array<{ series: string; remaining: number; next: number | null; blocked: boolean }> {
  const normalized = normalizeReceiptRanges(ranges);
  const seen = new Set<string>();
  const out: Array<{
    series: string;
    remaining: number;
    next: number | null;
    blocked: boolean;
  }> = [];
  for (const row of normalized) {
    if (seen.has(row.series)) continue;
    seen.add(row.series);
    const preview = previewNextReceipt(row.series, normalized, issues);
    out.push({
      series: row.series,
      remaining: remainingCount(row.series, normalized, issues),
      next: preview.ok ? preview.number : null,
      blocked: !preview.ok,
    });
  }
  return out;
}

export function issueForTransaction(
  issues: ReceiptIssueRecord[] | undefined,
  transactionId: string | null | undefined,
): ReceiptIssueRecord | null {
  if (!transactionId) return null;
  return (
    normalizeReceiptIssues(issues).find((row) => row.transactionId === transactionId) ?? null
  );
}

export function voidReceiptIssuesForTransactionInData(data: AppData, transactionId: string): void {
  if (!transactionId) return;
  const now = localDateTimeIso();
  data.receiptIssues = normalizeReceiptIssues(data.receiptIssues).map((row) => {
    if (row.transactionId !== transactionId || row.voidedAt) return row;
    return {
      ...row,
      voidedAt: now,
      voidReason: voidedReceiptNote(row.series, row.number),
    };
  });
}
