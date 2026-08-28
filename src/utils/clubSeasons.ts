import type { AcademyClass, AppData, ClubSeason } from '../types';
import { localDateIso } from './dates';
import { normalizeStudentClasses } from './studentClasses';
import { formatDate } from './labels';

export function seasonDisplayName(season: Pick<ClubSeason, 'name' | 'startDate' | 'endDate'>): string {
  const named = season.name.trim();
  if (named) return named;
  if (season.startDate && season.endDate) {
    return `${formatDate(season.startDate)} – ${formatDate(season.endDate)}`;
  }
  return 'Σεζόν';
}

export function isSeasonActive(
  season: Pick<ClubSeason, 'startDate' | 'endDate'>,
  today = localDateIso(),
): boolean {
  if (!season.startDate || !season.endDate) return false;
  return today >= season.startDate && today <= season.endDate;
}

export function isSeasonExpired(
  season: Pick<ClubSeason, 'endDate'>,
  today = localDateIso(),
): boolean {
  if (!season.endDate) return false;
  return today > season.endDate;
}

export function getActiveSeason(
  seasons: ClubSeason[] | undefined | null,
  today = localDateIso(),
): ClubSeason | null {
  const list = seasons ?? [];
  return list.find((s) => isSeasonActive(s, today)) ?? null;
}

export function findSeason(
  seasons: ClubSeason[] | undefined | null,
  seasonId: string | null | undefined,
): ClubSeason | null {
  if (!seasonId) return null;
  return (seasons ?? []).find((s) => s.id === seasonId) ?? null;
}

/**
 * Αν δεν έχουν οριστεί σεζόν, όλα τα τμήματα θεωρούνται ενεργά (συμβατότητα).
 * Αν υπάρχουν σεζόν, ενεργό είναι μόνο τμήμα της τρέχουσας σεζόν.
 */
export function isClassInActiveSeason(
  cls: Pick<AcademyClass, 'seasonId'>,
  seasons: ClubSeason[] | undefined | null,
  today = localDateIso(),
): boolean {
  const list = seasons ?? [];
  if (list.length === 0) return true;
  const active = getActiveSeason(list, today);
  if (!active) return false;
  return Boolean(cls.seasonId && cls.seasonId === active.id);
}

export function filterActiveSeasonClasses(
  classes: AcademyClass[] | undefined,
  seasons: ClubSeason[] | undefined | null,
  today = localDateIso(),
): AcademyClass[] {
  return (classes ?? []).filter((c) => isClassInActiveSeason(c, seasons, today));
}

/**
 * Μετά τη λήξη σεζόν: αφαίρεση αθλητών από τμήματα της ληγμένης σεζόν.
 * Επιστρέφει true αν άλλαξε κάτι.
 */
export function clearExpiredSeasonEnrollments(
  data: AppData,
  today = localDateIso(),
): boolean {
  const seasons = data.clubSeasons ?? [];
  if (seasons.length === 0) return false;

  const expiredIds = new Set(
    seasons.filter((s) => isSeasonExpired(s, today)).map((s) => s.id),
  );
  if (expiredIds.size === 0) return false;

  const expiredClassIds = new Set(
    (data.classes ?? [])
      .filter((c) => c.seasonId && expiredIds.has(c.seasonId))
      .map((c) => c.id),
  );
  if (expiredClassIds.size === 0) return false;

  let changed = false;
  for (const student of data.students ?? []) {
    const current = [
      ...(student.classIds ?? []),
      ...(student.classId ? [student.classId] : []),
    ];
    if (!current.some((id) => expiredClassIds.has(id))) continue;
    const kept = current.filter((id) => !expiredClassIds.has(id));
    const next = normalizeStudentClasses(kept, null);
    if (
      student.classId !== next.classId ||
      JSON.stringify(student.classIds ?? []) !== JSON.stringify(next.classIds)
    ) {
      student.classId = next.classId;
      student.classIds = next.classIds;
      changed = true;
    }
  }
  return changed;
}
