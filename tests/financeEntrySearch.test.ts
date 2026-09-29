import { describe, expect, it } from 'vitest';
import {
  filterFinanceEntries,
  financeDescriptionOptions,
  financeEntryMatchesQuery,
  sumFinanceEntryAmounts,
} from '../src/utils/financeEntrySearch';

const rows = [
  {
    date: '2026-09-29',
    amount: 1000,
    description: 'ΧΟΡΗΓΙΑ',
    clubName: 'ΑΠΟΛΛΩΝ',
    sport: 'Ποδόσφαιρο',
    surname: 'Παπαδόπουλος',
    firstName: 'Γιάννης',
    notes: 'ετήσια ενίσχυση',
  },
  {
    date: '2026-09-01',
    amount: 50,
    description: 'ΚΥΛΙΚΕΙΟ',
    clubName: 'ΑΠΟΛΛΩΝ',
    sport: '',
  },
];

describe('financeEntrySearch', () => {
  it('matches description, name, club and amount', () => {
    expect(financeEntryMatchesQuery(rows[0], 'χορηγ')).toBe(true);
    expect(financeEntryMatchesQuery(rows[0], 'Παπαδοπουλος')).toBe(true);
    expect(financeEntryMatchesQuery(rows[0], '1000')).toBe(true);
    expect(financeEntryMatchesQuery(rows[0], 'κυλικείο')).toBe(false);
  });

  it('filters by exact description from the dropdown', () => {
    const filtered = filterFinanceEntries(rows, {
      description: 'ΧΟΡΗΓΙΑ',
      dateFrom: '',
      dateTo: '',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].description).toBe('ΧΟΡΗΓΙΑ');
    expect(sumFinanceEntryAmounts(filtered)).toBe(1000);
  });

  it('builds description options from catalog and existing rows', () => {
    expect(financeDescriptionOptions(['ΚΥΛΙΚΕΙΟ'], rows)).toEqual(['ΚΥΛΙΚΕΙΟ', 'ΧΟΡΗΓΙΑ']);
  });
});
