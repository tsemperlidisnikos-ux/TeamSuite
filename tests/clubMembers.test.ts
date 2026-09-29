import { describe, expect, it } from 'vitest';
import { clubMemberSchema } from '../src/schemas';
import { MEMBERS_SPORT_FILTER, MEMBERS_SPORT_LABEL } from '../src/utils/clubMembers';

describe('club members', () => {
  it('keeps the transactions filter distinct from a real sport name', () => {
    expect(MEMBERS_SPORT_LABEL).toBe('Μέλη');
    expect(MEMBERS_SPORT_FILTER).toBe('__members__');
    expect(MEMBERS_SPORT_FILTER).not.toBe(MEMBERS_SPORT_LABEL);
  });

  it('accepts the registry fields used on the Μέλη page', () => {
    const parsed = clubMemberSchema.parse({
      lastName: 'Καραγιάννης',
      firstName: 'Παναγιώτης',
      address: 'Ηρώων Πολυτεχνείου 12',
      postalCode: '18531',
      city: 'Πειραιάς',
      prefecture: 'Αττικής',
      email: 'member@example.com',
      phone: '2105550101',
      active: true,
    });
    expect(parsed.lastName).toBe('Καραγιάννης');
    expect(parsed.city).toBe('Πειραιάς');
    expect(parsed.email).toBe('member@example.com');
  });

  it('rejects a short last name', () => {
    const result = clubMemberSchema.safeParse({
      lastName: 'Α',
      firstName: 'Νίκος',
    });
    expect(result.success).toBe(false);
  });
});
