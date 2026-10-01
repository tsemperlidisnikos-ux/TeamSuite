import { describe, expect, it } from 'vitest';
import type { AppData } from '../src/types';
import { buildDailyTill } from '../src/utils/dailyTill';

function dailyData(values: Partial<AppData>): AppData {
  return {
    students: [],
    transactions: [],
    rentalBookings: [],
    revenues: [],
    receiptIssues: [],
    ...values,
  } as AppData;
}

describe('buildDailyTill income separation', () => {
  it('does not treat legitimate unrelated income as a collection mismatch', () => {
    const data = dailyData({
      transactions: [
        {
          id: 'payment-1',
          athleteId: 'member-1',
          amount: 50,
          receiptNumber: '',
          type: 'payment',
          month: 9,
          year: 2026,
          paymentMethod: 'cash',
          comments: '',
          createdAt: '2026-09-29T10:00:00',
        },
      ],
      revenues: [
        {
          id: 'linked-1',
          date: '2026-09-29',
          amount: 50,
          category: 'tuition',
          description: 'Συνδρομή',
          paymentStatus: 'paid',
          paymentMethod: 'cash',
          linkedTransactionId: 'payment-1',
        },
        {
          id: 'support-1',
          date: '2026-09-29',
          amount: 1000,
          category: 'other',
          description: 'Οικονομική ενίσχυση μελών',
          paymentStatus: 'paid',
          paymentMethod: 'cash',
        },
      ],
    });

    const till = buildDailyTill(data, '2026-09-29');

    expect(till.collectionsTotal).toBe(50);
    expect(till.linkedIncomeTotal).toBe(50);
    expect(till.otherIncomeTotal).toBe(1000);
    expect(till.incomeTotal).toBe(1050);
    expect(till.collectionsTotal - till.linkedIncomeTotal).toBe(0);
    expect(till.methods.find((row) => row.key === 'cash')).toMatchObject({
      collections: 50,
      linkedIncome: 50,
      otherIncome: 1000,
      income: 1050,
    });
  });

  it('still exposes a real mismatch in linked subscription income', () => {
    const data = dailyData({
      transactions: [
        {
          id: 'payment-2',
          athleteId: 'athlete-1',
          amount: 80,
          receiptNumber: '',
          type: 'payment',
          month: 9,
          year: 2026,
          paymentMethod: 'card',
          comments: '',
          createdAt: '2026-09-29T11:00:00',
        },
      ],
      revenues: [],
    });

    const till = buildDailyTill(data, '2026-09-29');

    expect(till.collectionsTotal).toBe(80);
    expect(till.linkedIncomeTotal).toBe(0);
    expect(till.collectionsTotal - till.linkedIncomeTotal).toBe(80);
  });
});
