import { describe, expect, it } from 'vitest';
import {
  parentUserIdsForAnnouncement,
  parentUserIdsForAthletes,
  parentUserIdsForClass,
} from '../src/utils/parentPushTargets';

const users = [
  { id: 'p1', role: 'parent', active: true },
  { id: 'p2', role: 'parent', active: true },
  { id: 'p3', role: 'parent', active: false },
  { id: 'admin', role: 'admin', active: true },
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
