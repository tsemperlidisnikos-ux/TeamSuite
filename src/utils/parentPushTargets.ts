import { announcementVisibleToCoach, announcementVisibleToParent } from './announcementAudience';
import type { Announcement } from '../types';

export type PushUser = { id: string; role?: string; active?: boolean; coachId?: string | null };
export type PushCoach = { id: string; sport?: string | null; active?: boolean };
export type PushLink = { parentUserId: string; athleteId: string };
export type PushStudent = {
  id: string;
  status?: string;
  sport?: string | null;
  clubName?: string | null;
  classId?: string | null;
  classIds?: string[];
};
export type PushClass = { id: string; sport?: string | null };

type AudienceAnnouncement = Pick<
  Announcement,
  'audienceRoles' | 'classIds' | 'recipientIds' | 'status' | 'sportCategories' | 'teamsLabel'
>;

export function uniqueIds(ids: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const id of ids) {
    const value = (id ?? '').trim();
    if (value) set.add(value);
  }
  return [...set];
}

function studentInClass(student: PushStudent, classId: string): boolean {
  if (student.classId === classId) return true;
  return (student.classIds ?? []).includes(classId);
}

export function parentUserIdsForAthletes(input: {
  athleteIds: string[];
  parentLinks: PushLink[];
  users: PushUser[];
}): string[] {
  const want = new Set(input.athleteIds);
  const ids: string[] = [];
  for (const link of input.parentLinks) {
    if (!want.has(link.athleteId)) continue;
    const user = input.users.find((row) => row.id === link.parentUserId);
    if (user && user.active === false) continue;
    ids.push(link.parentUserId);
  }
  return uniqueIds(ids);
}

export function parentUserIdsForClass(input: {
  classId: string;
  students: PushStudent[];
  parentLinks: PushLink[];
  users: PushUser[];
}): string[] {
  const athleteIds = input.students
    .filter((student) => student.status !== 'inactive' && studentInClass(student, input.classId))
    .map((student) => student.id);
  return parentUserIdsForAthletes({
    athleteIds,
    parentLinks: input.parentLinks,
    users: input.users,
  });
}

export function parentUserIdsForAnnouncement(input: {
  announcement: AudienceAnnouncement;
  students: PushStudent[];
  classes: PushClass[];
  parentLinks: PushLink[];
  users: PushUser[];
}): string[] {
  const parents = input.users.filter((user) => user.role === 'parent' && user.active !== false);
  const ids: string[] = [];
  for (const parent of parents) {
    const linkedIds = input.parentLinks
      .filter((link) => link.parentUserId === parent.id)
      .map((link) => link.athleteId);
    const athletes = input.students.filter(
      (student) => linkedIds.includes(student.id) && student.status !== 'inactive',
    );
    const classIds = athletes.flatMap((athlete) =>
      [athlete.classId, ...(athlete.classIds ?? [])].filter((id): id is string => Boolean(id)),
    );
    const meta = athletes.map((athlete) => ({
      id: athlete.id,
      sport: athlete.sport,
      clubName: athlete.clubName,
      classSport:
        [athlete.classId, ...(athlete.classIds ?? [])]
          .map((id) => input.classes.find((row) => row.id === id)?.sport)
          .find(Boolean) || null,
    }));
    if (announcementVisibleToParent(input.announcement, parent.id, linkedIds, classIds, meta)) {
      ids.push(parent.id);
    }
  }
  return uniqueIds(ids);
}

export function coachUserIdsForAnnouncement(input: {
  announcement: AudienceAnnouncement;
  coaches: PushCoach[];
  users: PushUser[];
}): string[] {
  const coaches = input.coaches.filter((coach) => coach.active !== false);
  const ids: string[] = [];
  for (const user of input.users) {
    if (user.role !== 'coach' || user.active === false) continue;
    const coach = coaches.find((row) => row.id === user.coachId);
    if (!coach) continue;
    if (announcementVisibleToCoach(input.announcement, coach.id, coach.sport)) {
      ids.push(user.id);
    }
  }
  return uniqueIds(ids);
}

export function coachUserIdsForClass(input: {
  classId: string;
  classes: Array<{ id: string; coachId?: string | null }>;
  users: PushUser[];
}): string[] {
  const coachId = input.classes.find((row) => row.id === input.classId)?.coachId;
  if (!coachId) return [];
  return uniqueIds(
    input.users
      .filter((user) => user.role === 'coach' && user.active !== false && user.coachId === coachId)
      .map((user) => user.id),
  );
}
