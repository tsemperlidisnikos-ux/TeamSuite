import type { AcademyClass, ClubSeason, Coach, Student } from '../types';
import { isClassInActiveSeason } from './clubSeasons';
import { normalizeSportKey } from './sport';

type SessionLike = {
  role?: string | null;
  coachId?: string | null;
} | null;

export function resolveCoachRecord(
  coaches: Coach[] | undefined,
  coachId: string | null | undefined,
): Coach | null {
  if (!coachId) return null;
  return (coaches ?? []).find((c) => c.id === coachId && c.active) ?? null;
}

/** Τμήματα ορατά στον προπονητή: ίδιο άθλημα με το προφίλ προπονητή. */
export function visibleClassesForSession(
  classes: AcademyClass[] | undefined,
  coaches: Coach[] | undefined,
  session: SessionLike,
  options?: {
    seasons?: ClubSeason[] | null;
    /** Προεπιλογή true όταν υπάρχουν σεζόν — κρύβει ληγμένα τμήματα. */
    onlyActiveSeason?: boolean;
  },
): AcademyClass[] {
  let list = classes ?? [];
  const onlyActive = options?.onlyActiveSeason !== false;
  if (onlyActive) {
    list = list.filter((c) => isClassInActiveSeason(c, options?.seasons));
  }
  if (session?.role !== 'coach') return list;
  const coach = resolveCoachRecord(coaches, session.coachId);
  if (!coach) return [];
  const sportKey = normalizeSportKey(coach.sport);
  if (!sportKey) return [];
  return list.filter((c) => normalizeSportKey(c.sport) === sportKey);
}

export function classIdsOf(classes: AcademyClass[]): Set<string> {
  return new Set(classes.map((c) => c.id));
}

export function visibleStudentsForSession(
  students: Student[] | undefined,
  allowedClassIds: Set<string>,
  session: SessionLike,
): Student[] {
  const list = students ?? [];
  if (session?.role !== 'coach') return list;
  return list.filter((s) => {
    const ids = [
      ...(s.classIds ?? []),
      ...(s.classId ? [s.classId] : []),
    ];
    return ids.some((id) => allowedClassIds.has(id));
  });
}

export function isClassInCoachScope(
  classId: string | null | undefined,
  allowedClassIds: Set<string>,
  isCoach: boolean,
): boolean {
  if (!isCoach) return true;
  if (!classId) return false;
  return allowedClassIds.has(classId);
}

export function sportsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ka = normalizeSportKey(a);
  const kb = normalizeSportKey(b);
  return Boolean(ka && kb && ka === kb);
}
