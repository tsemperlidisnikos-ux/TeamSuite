import { resolveCatalogSportName } from '../shared/sportsCatalog';
import type { Student } from '../types';
import { sportsMatch } from './coachScope';
import { normalizeSportKey } from './sport';

export type StudentSportRef = Pick<Student, 'sport' | 'sports'>;

function canonicalSportLabel(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  return resolveCatalogSportName(trimmed) ?? trimmed;
}

/** Όλα τα αθλήματα του αθλητή (χωρίς διπλότυπα, με κανονικά ονόματα καταλόγου). */
export function studentSports(student: StudentSportRef): string[] {
  const values = [
    ...(student.sports ?? []),
    ...(student.sport?.trim() ? [student.sport.trim()] : []),
  ]
    .map((s) => canonicalSportLabel(s))
    .filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = normalizeSportKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

export function studentHasSport(
  student: StudentSportRef,
  sport: string | null | undefined,
): boolean {
  if (!sport?.trim()) return false;
  return studentSports(student).some((s) => sportsMatch(s, sport));
}

export function normalizeStudentSports(
  sports: string[] | undefined | null,
  sport?: string | null,
): { sport: string; sports: string[] } {
  const list = studentSports({
    sports: sports ?? [],
    sport: sport ?? '',
  });
  const primaryRaw = sport?.trim() ? canonicalSportLabel(sport) : '';
  const primary =
    primaryRaw && list.some((s) => sportsMatch(s, primaryRaw))
      ? list.find((s) => sportsMatch(s, primaryRaw))!
      : list[0] ?? '';
  return { sport: primary, sports: list };
}
