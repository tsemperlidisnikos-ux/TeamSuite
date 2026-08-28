import { getUsers } from '../auth/auth';
import type {
  Announcement,
  AnnouncementAudienceRole,
  AnnouncementRecipient,
} from '../types';
import { sportsMatch } from './coachScope';
import { normalizeSportKey } from './sport';

type AudienceAnnouncement = Pick<
  Announcement,
  | 'audienceRoles'
  | 'classIds'
  | 'recipientIds'
  | 'status'
  | 'sportCategories'
  | 'teamsLabel'
>;

export type AthleteAudienceContext = {
  athleteId: string;
  classId?: string | null;
  classIds?: string[];
  sport?: string | null;
  clubName?: string | null;
  classSport?: string | null;
};

function recipientsOf(
  item: AudienceAnnouncement,
  kind: AnnouncementRecipient['kind'],
): string[] {
  return (item.recipientIds ?? []).filter((r) => r.kind === kind).map((r) => r.id);
}

function rolesOf(item: AudienceAnnouncement): AnnouncementAudienceRole[] {
  return item.audienceRoles ?? [];
}

function matchesSportFilter(
  item: AudienceAnnouncement,
  sport?: string | null,
  classSport?: string | null,
): boolean {
  const filter = (item.sportCategories ?? '').trim();
  if (!filter) return true;
  return sportsMatch(sport, filter) || sportsMatch(classSport, filter);
}

function matchesClubFilter(item: AudienceAnnouncement, clubName?: string | null): boolean {
  const filter = (item.teamsLabel ?? '').trim();
  if (!filter) return true;
  return normalizeSportKey(clubName) === normalizeSportKey(filter);
}

/** Whether announcement is visible to a given athlete (portal / filtering). */
export function announcementVisibleToAthlete(
  item: AudienceAnnouncement,
  athleteIdOrContext: string | AthleteAudienceContext,
  athleteClassId?: string | null,
): boolean {
  if (item.status === 'draft') return false;

  const ctx: AthleteAudienceContext =
    typeof athleteIdOrContext === 'string'
      ? { athleteId: athleteIdOrContext, classId: athleteClassId }
      : athleteIdOrContext;

  const roles = rolesOf(item);
  const athleteRecipients = recipientsOf(item, 'athlete');
  const classIds = item.classIds ?? [];

  const roleOk = roles.length === 0 || roles.includes('athletes');
  if (!roleOk && athleteRecipients.length === 0 && classIds.length === 0) return false;

  if (athleteRecipients.length > 0) {
    if (!athleteRecipients.includes(ctx.athleteId)) return false;
  } else if (classIds.length > 0) {
    const athleteClasses = [
      ...(ctx.classIds ?? []),
      ...(ctx.classId ? [ctx.classId] : []),
    ];
    if (!athleteClasses.some((id) => classIds.includes(id))) return false;
  } else if (!roleOk) {
    return false;
  }

  if (!matchesSportFilter(item, ctx.sport, ctx.classSport)) return false;
  if (!matchesClubFilter(item, ctx.clubName)) return false;
  return true;
}

/** Whether announcement is visible to a coach. */
export function announcementVisibleToCoach(
  item: AudienceAnnouncement,
  coachId: string,
  coachSport?: string | null,
): boolean {
  if (item.status === 'draft') return false;
  const roles = rolesOf(item);
  const coachRecipients = recipientsOf(item, 'coach');

  if (coachRecipients.length > 0) {
    if (!coachRecipients.includes(coachId)) return false;
  } else if (!(roles.length === 0 || roles.includes('coaches'))) {
    return false;
  }

  if (!matchesSportFilter(item, coachSport, null)) return false;
  return true;
}

/** Whether announcement is visible to staff. */
export function announcementVisibleToStaff(
  item: AudienceAnnouncement,
  staffId: string,
): boolean {
  if (item.status === 'draft') return false;
  const roles = rolesOf(item);
  const staffRecipients = recipientsOf(item, 'staff');

  if (staffRecipients.length > 0) {
    return staffRecipients.includes(staffId);
  }

  return roles.length === 0 || roles.includes('staff');
}

/** Whether announcement is visible to a parent user. */
export function announcementVisibleToParent(
  item: AudienceAnnouncement,
  parentUserId: string,
  linkedAthleteIds: string[],
  linkedClassIds: string[],
  linkedAthleteMeta?: Array<{
    id: string;
    sport?: string | null;
    clubName?: string | null;
    classSport?: string | null;
  }>,
): boolean {
  if (item.status === 'draft') return false;
  const roles = rolesOf(item);
  const parentRecipients = recipientsOf(item, 'parent');
  const athleteRecipients = recipientsOf(item, 'athlete');
  const classIds = item.classIds ?? [];

  if (parentRecipients.length > 0) {
    if (!parentRecipients.includes(parentUserId)) return false;
  } else {
    const roleOk = roles.length === 0 || roles.includes('parents') || roles.includes('athletes');
    if (!roleOk) return false;

    if (athleteRecipients.length > 0) {
      if (!linkedAthleteIds.some((id) => athleteRecipients.includes(id))) return false;
    } else if (classIds.length > 0) {
      if (!linkedClassIds.some((id) => classIds.includes(id))) return false;
    }
  }

  const sportFilter = (item.sportCategories ?? '').trim();
  const clubFilter = (item.teamsLabel ?? '').trim();
  if (!sportFilter && !clubFilter) return true;
  if (!linkedAthleteMeta || linkedAthleteMeta.length === 0) {
    // χωρίς meta: αν υπάρχει φίλτρο αθλήματος/σωματείου, μην δείχνουμε σε όλους
    return !sportFilter && !clubFilter;
  }

  return linkedAthleteMeta.some((a) => {
    if (athleteRecipients.length > 0 && !athleteRecipients.includes(a.id)) return false;
    if (classIds.length > 0) {
      /* class check already done via linkedClassIds for role path */
    }
    if (!matchesSportFilter(item, a.sport, a.classSport)) return false;
    if (!matchesClubFilter(item, a.clubName)) return false;
    return true;
  });
}

export function listParentRecipients(): Array<{ id: string; label: string; email: string }> {
  const users = getUsers().filter((u) => u.role === 'parent' && u.active);
  return users
    .map((u) => ({
      id: u.id,
      label: u.fullName || u.email,
      email: u.email,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'el'));
}
