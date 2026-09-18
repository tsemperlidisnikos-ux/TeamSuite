import { describe, expect, it } from 'vitest';
import { transactionSchema } from '../src/schemas';

const base = {
  athleteId: 'athlete-1',
  amount: 50,
  receiptNumber: '',
  type: 'charge' as const,
  month: 8,
  year: 2026,
  paymentMethod: '' as const,
  comments: '',
};

describe('transaction day', () => {
  it('accepts a valid numeric day', () => {
    expect(transactionSchema.parse({ ...base, day: 10 }).day).toBe(10);
  });

  it('rejects a day that does not exist in the selected month', () => {
    const result = transactionSchema.safeParse({ ...base, day: 30, month: 2 });
    expect(result.success).toBe(false);
  });

  it('keeps day optional for automated payments', () => {
    expect(transactionSchema.safeParse(base).success).toBe(true);
  });
});
