import { describe, expect, it } from 'vitest';
import {
  collectClubUsersForBackup,
  prepareClubDataForBackup,
  type ClubBackupUserSource,
} from '../src/utils/backupArchive';
import type { AppUser } from '../src/auth/auth';
import type { AppData } from '../src/types';

function user(partial: Partial<AppUser> & Pick<AppUser, 'id' | 'role'>): AppUser {
  return {
    email: `${partial.id}@club.test`,
    password: 'hash',
    fullName: partial.id,
    active: true,
    ...partial,
  };
}

const clubData: ClubBackupUserSource = {
  coaches: [{ id: 'coach-1', email: 'coach@club.test' }],
  staff: [{ email: 'secretariat@club.test' }],
  students: [{ id: 'ath-1', email: 'athlete@club.test', fatherEmail: 'parent@club.test' }],
};

describe('collectClubUsersForBackup', () => {
  it('includes club admin, secretariat, coaches and linked logins', () => {
    const users = [
      user({ id: 'admin', role: 'admin', clubId: 'club-a', email: 'admin@club.test' }),
      user({
        id: 'sec',
        role: 'secretariat',
        clubId: 'club-a',
        email: 'secretariat@club.test',
      }),
      user({
        id: 'coach',
        role: 'coach',
        clubId: 'club-a',
        coachId: 'coach-1',
        email: 'coach@club.test',
      }),
      user({
        id: 'parent',
        role: 'parent',
        clubId: 'club-a',
        email: 'parent@club.test',
      }),
      user({
        id: 'other',
        role: 'admin',
        clubId: 'club-b',
        email: 'other@club.test',
      }),
      user({
        id: 'platform',
        role: 'platform_admin',
        email: 'pa@teamsuite.test',
      }),
    ];

    const collected = collectClubUsersForBackup('club-a', users, clubData);
    expect(collected.map((row) => row.id).sort()).toEqual(['admin', 'coach', 'parent', 'sec']);
    expect(collected.every((row) => row.clubId === 'club-a')).toBe(true);
  });

  it('includes unscoped users linked by coach card, athlete card or email', () => {
    const users = [
      user({ id: 'coach-login', role: 'coach', coachId: 'coach-1', clubId: null }),
      user({ id: 'athlete-login', role: 'athlete', athleteId: 'ath-1', clubId: '' }),
      user({ id: 'staff-login', role: 'secretariat', clubId: null, email: 'secretariat@club.test' }),
      user({ id: 'foreign', role: 'coach', clubId: 'club-b', coachId: 'coach-1' }),
    ];

    const collected = collectClubUsersForBackup('club-a', users, clubData);
    expect(collected.map((row) => row.id).sort()).toEqual([
      'athlete-login',
      'coach-login',
      'staff-login',
    ]);
  });
});

describe('prepareClubDataForBackup', () => {
  it('keeps club members and their deletion tombstones in club backups', () => {
    const source = {
      clubMembers: [
        {
          id: 'member-1',
          lastName: 'Παπαδόπουλος',
          firstName: 'Νίκος',
          address: 'Οδός 1',
          postalCode: '11111',
          city: 'Αθήνα',
          prefecture: 'Αττικής',
          email: 'member@club.test',
          phone: '2100000000',
          active: true,
          createdAt: '2026-09-29',
        },
      ],
      deletedClubMemberIds: ['member-deleted'],
    } as AppData;

    const prepared = prepareClubDataForBackup(source);

    expect(prepared.clubMembers).toEqual(source.clubMembers);
    expect(prepared.deletedClubMemberIds).toEqual(['member-deleted']);
    expect(prepared.clubMembers).not.toBe(source.clubMembers);
  });
});
