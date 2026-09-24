import { describe, expect, it } from 'vitest';
import {
  isCanteenFinanceCategory,
  isStaffFinanceCategory,
  isAdministrativeFinanceCategory,
  expenseSkipsSportAndClass,
  matchExpenseTotal,
  matchTravelTotal,
  normalizeMatchExpenseDetails,
} from '../src/shared/financeCategories';

describe('isCanteenFinanceCategory', () => {
  it('matches greek and latin labels', () => {
    expect(isCanteenFinanceCategory('ΚΑΝΤΙΝΑ / ΚΥΛΙΚΕΙΟ')).toBe(true);
    expect(isCanteenFinanceCategory('KANTINA / KYLIKIEIO')).toBe(true);
    expect(isCanteenFinanceCategory('Κυλικείο')).toBe(true);
    expect(isCanteenFinanceCategory('ΑΓΩΝΕΣ')).toBe(false);
  });
});

describe('isStaffFinanceCategory', () => {
  it('matches only staff expenses', () => {
    expect(isStaffFinanceCategory('ΠΡΟΣΩΠΙΚΟ')).toBe(true);
    expect(isStaffFinanceCategory('ΠΡΟΠΟΝΗΤΕΣ / ΓΥΜΝΑΣΤΕΣ')).toBe(false);
    expect(isStaffFinanceCategory('ΚΑΝΤΙΝΑ / ΚΥΛΙΚΕΙΟ')).toBe(false);
  });
});

describe('administrative expenses skip sport and class', () => {
  it('matches διοικητικά and skips sport/class with staff and canteen', () => {
    expect(isAdministrativeFinanceCategory('ΔΙΟΙΚΗΤΙΚΑ')).toBe(true);
    expect(isAdministrativeFinanceCategory('ΠΡΟΣΩΠΙΚΟ')).toBe(false);
    expect(expenseSkipsSportAndClass('ΔΙΟΙΚΗΤΙΚΑ')).toBe(true);
    expect(expenseSkipsSportAndClass('ΠΡΟΣΩΠΙΚΟ')).toBe(true);
    expect(expenseSkipsSportAndClass('ΚΑΝΤΙΝΑ / ΚΥΛΙΚΕΙΟ')).toBe(true);
    expect(expenseSkipsSportAndClass('ΑΓΩΝΕΣ')).toBe(false);
  });
});

describe('match expense officials totals', () => {
  it('adds Έξοδα and Οδοιπορικά without double-counting legacy travelAllowance', () => {
    expect(
      matchExpenseTotal({
        referees: 50,
        judges: 20,
        commissioner: 15,
        observer: 10,
        doctor: 30,
        travelReferees: 8,
        travelJudges: 4,
        travelCommissioner: 3,
        travelObserver: 2,
        travelAllowance: 80,
      }),
    ).toBe(142);
    expect(matchTravelTotal({ travelReferees: 8, travelJudges: 4, travelAllowance: 80 })).toBe(12);
    expect(matchTravelTotal({ travelAllowance: 80 })).toBe(80);
  });

  it('maps legacy travelAllowance onto διαιτητών when new travel fields are empty', () => {
    const normalized = normalizeMatchExpenseDetails({
      sport: 'Μπάσκετ',
      category: 'Πρωτάθλημα',
      teams: 'Α vs Β',
      referees: 40,
      travelAllowance: 25,
    });
    expect(normalized.travelReferees).toBe(25);
    expect(normalized.commissioner).toBe(0);
    expect(normalized.doctor).toBe(0);
    expect(matchExpenseTotal(normalized)).toBe(65);
  });
});
