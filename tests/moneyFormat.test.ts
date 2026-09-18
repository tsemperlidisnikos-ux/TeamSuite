import { describe, expect, it } from 'vitest';
import { formatCurrency, parseMoneyInput } from '../src/utils/labels';

describe('money amounts', () => {
  it('keeps two decimal places instead of rounding to whole euros', () => {
    expect(formatCurrency(12.5)).toMatch(/12[,.]50/);
    expect(formatCurrency(70.05)).toMatch(/70[,.]05/);
  });

  it('accepts comma and dot decimals', () => {
    expect(parseMoneyInput('12,50')).toBe(12.5);
    expect(parseMoneyInput('12.50')).toBe(12.5);
  });
});
