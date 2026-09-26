import { describe, expect, it } from 'vitest';
import { resolveCoachForSession, visibleClassesForSession } from '../src/utils/coachScope';
import type { AcademyClass, Coach } from '../src/types';

function coach(partial: Partial<Coach> & Pick<Coach, 'id' | 'firstName' | 'lastName'>): Coach {
  return {
    email: '',
    phone: '',
    sport: 'Μπάσκετ',
    hireDate: '2024-01-01',
    active: true,
    ...partial,
  };
}

const tzamakos = coach({
  id: 'coach_tz',
  firstName: 'Κωνσταντίνος',
  lastName: 'Τζαμάκος',
  email: 'coach.tzamakos@example.com',
});

describe('resolveCoachForSession', () => {
  it('uses stored coachId when the card is active', () => {
    const found = resolveCoachForSession([tzamakos], {
      role: 'coach',
      coachId: 'coach_tz',
    });
    expect(found?.id).toBe('coach_tz');
  });

  it('matches unique email when coachId is missing', () => {
    const found = resolveCoachForSession([tzamakos], {
      role: 'coach',
      email: 'coach.tzamakos@example.com',
      fullName: 'Other Name',
    });
    expect(found?.id).toBe('coach_tz');
  });

  it('matches ALL CAPS name without tonos', () => {
    const found = resolveCoachForSession([tzamakos], {
      role: 'coach',
      email: 'other@example.com',
      fullName: 'ΤΖΑΜΑΚΟΣ ΚΩΝΣΤΑΝΤΙΝΟΣ',
    });
    expect(found?.id).toBe('coach_tz');
  });

  it('matches first-name-first order', () => {
    const found = resolveCoachForSession([tzamakos], {
      role: 'coach',
      fullName: 'Κωνσταντίνος Τζαμάκος',
    });
    expect(found?.id).toBe('coach_tz');
  });

  it('does not guess when two coaches share the same name', () => {
    const found = resolveCoachForSession(
      [tzamakos, coach({ id: 'coach_tz_2', firstName: 'Κωνσταντίνος', lastName: 'Τζαμάκος' })],
      { role: 'coach', fullName: 'ΤΖΑΜΑΚΟΣ ΚΩΝΣΤΑΝΤΙΝΟΣ' },
    );
    expect(found).toBeNull();
  });

  it('ignores inactive cards for email/name fallback', () => {
    const found = resolveCoachForSession(
      [{ ...tzamakos, active: false }],
      { role: 'coach', email: 'coach.tzamakos@example.com', fullName: 'ΤΖΑΜΑΚΟΣ ΚΩΝΣΤΑΝΤΙΝΟΣ' },
    );
    expect(found).toBeNull();
  });
});

describe('visibleClassesForSession', () => {
  it('shows classes for a coach resolved by name', () => {
    const classes: AcademyClass[] = [
      {
        id: 'cls1',
        name: 'U12',
        sport: 'Μπάσκετ',
        ageGroup: 'U12',
        coachId: 'coach_tz',
        maxStudents: 20,
        scheduleSummary: '',
        monthlyFee: 0,
        seasonId: null,
      },
    ];
    const visible = visibleClassesForSession(classes, [tzamakos], {
      role: 'coach',
      fullName: 'ΤΖΑΜΑΚΟΣ ΚΩΝΣΤΑΝΤΙΝΟΣ',
    }, { onlyActiveSeason: false });
    expect(visible.map((row) => row.id)).toEqual(['cls1']);
  });
});
