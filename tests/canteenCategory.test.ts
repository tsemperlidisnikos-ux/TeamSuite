import { describe, expect, it } from 'vitest';
import { isCanteenFinanceCategory, isStaffFinanceCategory, isAdministrativeFinanceCategory, expenseSkipsSportAndClass } from '../src/shared/financeCategories';

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
