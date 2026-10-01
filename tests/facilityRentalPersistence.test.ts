import { describe, expect, it } from 'vitest';
import { mergeRentalSettings } from '../src/data/clubSync';
import type { Facility, RentalSettings } from '../src/types';
import { canonicalizePublicRentalMedia } from '../src/shared/facilityRentalAvailability';
import {
  normalizeFacilityName,
  resolveFacilityForLocation,
} from '../src/utils/facilityHours';

function settings(updatedAt: number, fullRate: number): RentalSettings {
  return {
    publicEnabled: true,
    notes: '',
    updatedAt,
    rules: [
      {
        facilityId: 'court-1',
        enabled: true,
        slotMinutes: 60,
        windows: [{ days: [1], startTime: '08:00', endTime: '22:00' }],
        hourlyRate: fullRate,
        hourlyRateFull: fullRate,
        hourlyRateHalf: 50,
        lockerRoomAvailable: true,
        lockerRoomFee: 10,
      },
    ],
  };
}

describe('facility names', () => {
  it('treats case, accents and extra spaces as the same facility', () => {
    const facility: Facility = {
      id: 'court-1',
      name: 'ΚΕΝΤΡΙΚΗ ΣΑΛΑ',
      active: true,
      sports: ['Μπάσκετ'],
      timeLayout: '08:00-00:00-30',
      sortOrder: 1,
    };

    expect(normalizeFacilityName('  Κεντρική   Σάλα ')).toBe(
      normalizeFacilityName(facility.name),
    );
    expect(resolveFacilityForLocation([facility], 'Κεντρική Σάλα')?.id).toBe(facility.id);
  });
});

describe('rental settings synchronization', () => {
  it('keeps newer saved prices and locker-room values during a cloud pull', () => {
    const newerLocal = settings(20, 80);
    const olderCloud = settings(10, 0);

    const merged = mergeRentalSettings(newerLocal, olderCloud, false);

    expect(merged.updatedAt).toBe(20);
    expect(merged.rules[0]).toMatchObject({
      hourlyRateFull: 80,
      hourlyRateHalf: 50,
      lockerRoomAvailable: true,
      lockerRoomFee: 10,
    });
  });
});

describe('public rental media persistence', () => {
  it('keeps durable hero and facility photos when an incomplete slice is published', () => {
    const result = canonicalizePublicRentalMedia(
      {
        facilities: [
          {
            id: 'court-1',
            name: 'Γήπεδο',
            active: true,
            sports: ['Μπάσκετ'],
            timeLayout: '08:00-00:00-30',
            sortOrder: 1,
            photoUrl: 'https://blob.example/court.jpg',
          },
        ],
        rentalSettings: {
          ...settings(10, 80),
          heroImageUrl: 'https://blob.example/hero.jpg',
        },
      },
      {
        facilities: [
          {
            id: 'court-1',
            name: 'Γήπεδο',
            active: true,
            sports: ['Μπάσκετ'],
            timeLayout: '08:00-00:00-30',
            sortOrder: 1,
            photoUrl: null,
          },
        ],
        rentalSettings: {
          ...settings(20, 80),
          heroImageUrl: null,
        },
      },
    );

    expect(result.facilities?.[0]?.photoUrl).toBe('https://blob.example/court.jpg');
    expect(result.rentalSettings?.heroImageUrl).toBe('https://blob.example/hero.jpg');
  });

  it('honors explicit media removals', () => {
    const result = canonicalizePublicRentalMedia(
      {
        facilities: [
          {
            id: 'court-1',
            name: 'Γήπεδο',
            active: true,
            sports: ['Μπάσκετ'],
            timeLayout: '08:00-00:00-30',
            sortOrder: 1,
            photoUrl: 'https://blob.example/court.jpg',
          },
        ],
        rentalSettings: {
          ...settings(10, 80),
          heroImageUrl: 'https://blob.example/hero.jpg',
        },
      },
      {
        facilities: [
          {
            id: 'court-1',
            name: 'Γήπεδο',
            active: true,
            sports: ['Μπάσκετ'],
            timeLayout: '08:00-00:00-30',
            sortOrder: 1,
            photoUrl: null,
          },
        ],
        rentalSettings: {
          ...settings(20, 80),
          heroImageUrl: null,
        },
      },
      { facilityPhotoIds: ['court-1'], heroImage: true },
    );

    expect(result.facilities?.[0]?.photoUrl).toBeNull();
    expect(result.rentalSettings?.heroImageUrl).toBeNull();
  });
});
