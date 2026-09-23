import { describe, expect, it } from 'vitest';
import {
  coachUserIdsForAnnouncement,
  coachUserIdsForClass,
  parentUserIdsForAnnouncement,
  parentUserIdsForAthletes,
  parentUserIdsForClass,
} from '../src/utils/parentPushTargets';

const users = [
  { id: 'p1', role: 'parent', active: true },
  { id: 'p2', role: 'parent', active: true },
  { id: 'p3', role: 'parent', active: false },
  { id: 'admin', role: 'admin', active: true },
  { id: 'cu1', role: 'coach', active: true, coachId: 'coach1' },
  { id: 'cu2', role: 'coach', active: true, coachId: 'coach2' },
  { id: 'cu3', role: 'coach', active: false, coachId: 'coach1' },
];

const coaches = [
  { id: 'coach1', sport: 'Μπάσκετ', active: true },
  { id: 'coach2', sport: 'Βόλεϊ', active: true },
];

const classRows = [
  { id: 'c1', sport: 'Μπάσκετ', coachId: 'coach1' },
  { id: 'c2', sport: 'Βόλεϊ', coachId: 'coach2' },
];

const parentLinks = [
  { parentUserId: 'p1', athleteId: 'a1' },
  { parentUserId: 'p2', athleteId: 'a2' },
  { parentUserId: 'p3', athleteId: 'a1' },
];

const students = [
  { id: 'a1', status: 'active', classId: 'c1', classIds: ['c1'], sport: 'Μπάσκετ' },
  { id: 'a2', status: 'active', classId: 'c2', classIds: ['c2'], sport: 'Βόλεϊ' },
];

const classes = [
  { id: 'c1', sport: 'Μπάσκετ' },
  { id: 'c2', sport: 'Βόλεϊ' },
];

describe('parentUserIdsForAthletes', () => {
  it('returns active parents of the athletes', () => {
    expect(
      parentUserIdsForAthletes({ athleteIds: ['a1'], parentLinks, users }).sort(),
    ).toEqual(['p1']);
  });
});

describe('parentUserIdsForClass', () => {
  it('returns parents of athletes in the class', () => {
    expect(
      parentUserIdsForClass({ classId: 'c2', students, parentLinks, users }),
    ).toEqual(['p2']);
  });
});

describe('parentUserIdsForAnnouncement', () => {
  it('targets parents when the club announcement includes parents', () => {
    expect(
      parentUserIdsForAnnouncement({
        announcement: {
          status: 'published',
          audienceRoles: ['parents'],
          classIds: [],
          recipientIds: [],
        },
        students,
        classes,
        parentLinks,
        users,
      }).sort(),
    ).toEqual(['p1', 'p2']);
  });

  it('limits to a class', () => {
    expect(
      parentUserIdsForAnnouncement({
        announcement: {
          status: 'published',
          audienceRoles: ['parents'],
          classIds: ['c1'],
          recipientIds: [],
        },
        students,
        classes,
        parentLinks,
        users,
      }),
    ).toEqual(['p1']);
  });

  it('skips drafts', () => {
    expect(
      parentUserIdsForAnnouncement({
        announcement: {
          status: 'draft',
          audienceRoles: ['parents'],
          classIds: [],
          recipientIds: [],
        },
        students,
        classes,
        parentLinks,
        users,
      }),
    ).toEqual([]);
  });
});

describe('coachUserIdsForAnnouncement', () => {
  it('targets active coaches when the announcement includes coaches', () => {
    expect(
      coachUserIdsForAnnouncement({
        announcement: {
          status: 'published',
          audienceRoles: ['coaches'],
          classIds: [],
          recipientIds: [],
        },
        coaches,
        users,
      }).sort(),
    ).toEqual(['cu1', 'cu2']);
  });

  it('limits to a named coach recipient', () => {
    expect(
      coachUserIdsForAnnouncement({
        announcement: {
          status: 'published',
          audienceRoles: ['coaches'],
          classIds: [],
          recipientIds: [{ kind: 'coach', id: 'coach2' }],
        },
        coaches,
        users,
      }),
    ).toEqual(['cu2']);
  });

  it('skips parent-only announcements', () => {
    expect(
      coachUserIdsForAnnouncement({
        announcement: {
          status: 'published',
          audienceRoles: ['parents'],
          classIds: [],
          recipientIds: [],
        },
        coaches,
        users,
      }),
    ).toEqual([]);
  });
});

describe('coachUserIdsForClass', () => {
  it('returns the active coach user of the class', () => {
    expect(coachUserIdsForClass({ classId: 'c1', classes: classRows, users })).toEqual(['cu1']);
  });
});
