import { describe, expect, it } from 'vitest';
import { isCanteenFinanceCategory } from '../src/shared/financeCategories';

describe('isCanteenFinanceCategory', () => {
  it('matches greek and latin labels', () => {
    expect(isCanteenFinanceCategory('ΚΑΝΤΙΝΑ / ΚΥΛΙΚΕΙΟ')).toBe(true);
    expect(isCanteenFinanceCategory('KANTINA / KYLIKIEIO')).toBe(true);
    expect(isCanteenFinanceCategory('Κυλικείο')).toBe(true);
    expect(isCanteenFinanceCategory('ΑΓΩΝΕΣ')).toBe(false);
  });
});
