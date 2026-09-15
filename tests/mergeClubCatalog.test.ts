import { describe, expect, it } from 'vitest';
import { mergeClubCatalog, type Club } from '../src/auth/clubs';

function club(partial: Partial<Club> & Pick<Club, 'id' | 'athleteLicenseLimit'>): Club {
  return {
    name: 'ΑΠΟΛΛΩΝ',
    city: '',
    phone: '',
    adminUserId: 'admin',
    createdAt: '2026-01-01T00:00:00.000Z',
    athleteLicenseUsed: 100,
    ...partial,
  } as Club;
}

describe('mergeClubCatalog licenses', () => {
  it('keeps a newer local reduction instead of Math.max with cloud', () => {
    const local = [
      club({
        id: 'apollon',
        athleteLicenseLimit: 600,
        licensePackageId: 'pkg_seats_600',
        licensesUpdatedAt: '2026-09-15T18:00:00.000Z',
      }),
    ];
    const cloud = [
      club({
        id: 'apollon',
        athleteLicenseLimit: 2000,
        licensePackageId: null,
        licensesUpdatedAt: null,
      }),
    ];
    const merged = mergeClubCatalog(local, cloud);
    expect(merged[0].athleteLicenseLimit).toBe(600);
    expect(merged[0].licensePackageId).toBe('pkg_seats_600');
  });

  it('applies a newer cloud reduction over stale local', () => {
    const local = [
      club({
        id: 'apollon',
        athleteLicenseLimit: 2000,
        licensesUpdatedAt: '2026-09-01T00:00:00.000Z',
      }),
    ];
    const cloud = [
      club({
        id: 'apollon',
        athleteLicenseLimit: 600,
        licensePackageId: 'pkg_seats_600',
        licensesUpdatedAt: '2026-09-15T18:00:00.000Z',
      }),
    ];
    const merged = mergeClubCatalog(local, cloud);
    expect(merged[0].athleteLicenseLimit).toBe(600);
    expect(merged[0].licensePackageId).toBe('pkg_seats_600');
  });
});
