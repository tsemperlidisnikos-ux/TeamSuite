import type { DiscountReasonDef, Student } from '../types';
import { clubSportsMatch } from './clubSports';
import { studentSports } from './studentSports';

export const ALL_SPORTS_DISCOUNT_LABEL = 'Όλα τα αθλήματα';

/** Παλιοί ενσωματωμένοι λόγοι — δεν εμφανίζονται πλέον από προεπιλογή. */
const LEGACY_BUILTIN_DISCOUNT_IDS = ['annual', 'other', 'siblings', 'social'];

/** Κενός κατάλογος: κάθε σύλλογος καταχωρεί τους δικούς του λόγους. */
export function defaultDiscountReasons(): DiscountReasonDef[] {
  return [];
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

export function isLegacyBuiltInDiscountCatalog(
  list: DiscountReasonDef[] | undefined | null,
): boolean {
  const ids = normalizeDiscountReasons(list)
    .map((row) => row.id)
    .sort();
  return (
    ids.length === LEGACY_BUILTIN_DISCOUNT_IDS.length &&
    ids.every((id, i) => id === LEGACY_BUILTIN_DISCOUNT_IDS[i])
  );
}

/** Κατάλογος συλλόγου χωρίς τα παλιά προεπιλεγμένα. */
export function clubDiscountReasons(
  list: DiscountReasonDef[] | undefined | null,
): DiscountReasonDef[] {
  const next = normalizeDiscountReasons(list);
  if (isLegacyBuiltInDiscountCatalog(next)) return [];
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
  const rank = (row: DiscountReasonDef) => {
    if (selected.has(row.id)) return 0;
    if (!row.sport) return 1;
    if (sports.some((sport) => clubSportsMatch(sport, row.sport))) return 0;
    return 2;
  };
  return [...catalog].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return a.name.localeCompare(b.name, 'el');
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
