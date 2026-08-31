import type { DiscountReasonDef, Student } from '../types';
import { clubSportsMatch } from './clubSports';
import { studentSports } from './studentSports';

export const ALL_SPORTS_DISCOUNT_LABEL = 'Όλα τα αθλήματα';

export function defaultDiscountReasons(): DiscountReasonDef[] {
  return [
    { id: 'siblings', name: 'Αδέλφια', sport: '' },
    { id: 'annual', name: 'Ετήσια συνδρομή', sport: '' },
    { id: 'social', name: 'Κοινωνικό κριτήριο', sport: '' },
    { id: 'other', name: 'Άλλο', sport: '' },
  ];
}

export function normalizeDiscountReasons(
  list: DiscountReasonDef[] | undefined | null,
): DiscountReasonDef[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const next: DiscountReasonDef[] = [];
  for (const row of list) {
    const id = String(row?.id ?? '').trim();
    const name = String(row?.name ?? '').trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    next.push({
      id,
      name,
      sport: String(row?.sport ?? '').trim(),
    });
  }
  return next;
}

export function studentDiscountReasonIds(
  student: Pick<Student, 'discountReasonIds' | 'discountReason'>,
  catalog: DiscountReasonDef[],
): string[] {
  const fromList = (student.discountReasonIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);
  if (fromList.length > 0) return [...new Set(fromList)];
  const raw = String(student.discountReason ?? '').trim();
  if (!raw) return [];
  const parts = raw.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
  const ids: string[] = [];
  for (const part of parts) {
    const match = catalog.find(
      (row) =>
        row.id === part ||
        row.name.localeCompare(part, 'el', { sensitivity: 'accent' }) === 0,
    );
    if (match) ids.push(match.id);
  }
  return [...new Set(ids)];
}

export function discountReasonsForAthlete(
  catalog: DiscountReasonDef[],
  athlete: Pick<Student, 'sport' | 'sports'>,
  selectedIds: string[] = [],
): DiscountReasonDef[] {
  const sports = studentSports(athlete);
  const selected = new Set(selectedIds);
  return catalog.filter((row) => {
    if (selected.has(row.id)) return true;
    if (!row.sport) return true;
    if (sports.length === 0) return false;
    return sports.some((sport) => clubSportsMatch(sport, row.sport));
  });
}

export function discountReasonSummary(
  ids: string[],
  catalog: DiscountReasonDef[],
): string {
  return ids
    .map((id) => catalog.find((row) => row.id === id)?.name ?? id)
    .filter(Boolean)
    .join(', ');
}

export function discountReasonOptionLabel(row: DiscountReasonDef): string {
  if (!row.sport) return row.name;
  return `${row.name} · ${row.sport}`;
}
