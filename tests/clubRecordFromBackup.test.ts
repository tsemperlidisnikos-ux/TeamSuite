import { describe, expect, it } from 'vitest';
import { clubRecordFromBackup } from '../src/utils/backupArchive';

const club = {
  id: 'club_apollon',
  name: 'ΑΚΑΔΗΜΙΑ ΑΠΟΛΛΩΝ ΠΑΤΡΩΝ',
  city: 'Πάτρα',
  phone: '2610000000',
  adminUserId: 'admin1',
  createdAt: '2024-01-01',
  athleteLicenseLimit: 80,
  athleteLicenseUsed: 12,
};

describe('clubRecordFromBackup', () => {
  it('keeps the source club id from a club-only backup', () => {
    const record = clubRecordFromBackup({
      exportedAt: '2026-09-23T00:00:00',
      scope: 'club',
      sourceClubId: 'club_apollon',
      clubs: [club],
    });
    expect(record?.id).toBe('club_apollon');
    expect(record?.name).toBe('ΑΚΑΔΗΜΙΑ ΑΠΟΛΛΩΝ ΠΑΤΡΩΝ');
  });

  it('synthesizes a club with the same source id when the clubs list is missing', () => {
    const record = clubRecordFromBackup({
      exportedAt: '2026-09-23T00:00:00',
      scope: 'club',
      sourceClubId: 'club_from_file',
    });
    expect(record?.id).toBe('club_from_file');
    expect(record?.name).toBe('club_from_file');
  });

  it('returns null when the backup has no club identity', () => {
    expect(
      clubRecordFromBackup({
        exportedAt: '2026-09-23T00:00:00',
        scope: 'platform',
      }),
    ).toBeNull();
  });
});
