import { describe, expect, it } from 'vitest';
import {
  athletePaymentRevenueId,
  backfillAthletePaymentRevenues,
  buildRevenuesForPayment,
  dedupeLinkedFinanceRevenues,
  paymentRevenuesNeedRepair,
  syncRevenuesForPaymentInData,
} from '../src/api/services/athletePaymentRevenueBridge';
import type { AppData, AthleteTransaction, Revenue } from '../src/types';
import { seedData } from '../src/data/seed';

function baseData(overrides: Partial<AppData> = {}): AppData {
  return {
    ...structuredClone(seedData),
    students: [
      {
        id: 'ath1',
        firstName: 'Νίκος',
        lastName: 'Τεστ',
        registrationFee: 50,
        clubName: 'Απόλλων',
        sport: 'Ποδόσφαιρο',
      } as AppData['students'][number],
    ],
    transactions: [],
    revenues: [],
    deletedRevenueIds: [],
    ...overrides,
  };
}

function payment(partial: Partial<AthleteTransaction> & { id: string }): AthleteTransaction {
  return {
    athleteId: 'ath1',
    amount: 100,
    receiptNumber: '',
    type: 'payment',
    month: 10,
    year: 2026,
    paymentMethod: 'cash',
    comments: '[fee:x:sub]',
    createdAt: '2026-10-15T12:00:00',
    ...partial,
  };
}

describe('athletePaymentRevenueBridge parity', () => {
  it('uses deterministic revenue ids from payment id', () => {
    const data = baseData({
      transactions: [payment({ id: 'txn_abc' })],
    });
    const rows = buildRevenuesForPayment(data.transactions[0]!, data);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(athletePaymentRevenueId('txn_abc', 0));
    expect(rows[0]?.linkedTransactionId).toBe('txn_abc');
  });

  it('tombstones old random ids when re-syncing a payment', () => {
    const pay = payment({ id: 'txn_1' });
    const data = baseData({
      transactions: [pay],
      revenues: [
        {
          id: 'rev_oldrandom',
          date: '2026-10-15',
          amount: 100,
          category: 'tuition',
          description: 'ΜΗΝΙΑΙΑ ΣΥΝΔΡΟΜΗ',
          paymentStatus: 'paid',
          linkedTransactionId: 'txn_1',
        } as Revenue,
        {
          id: 'rev_dup',
          date: '2026-10-15',
          amount: 100,
          category: 'tuition',
          description: 'ΜΗΝΙΑΙΑ ΣΥΝΔΡΟΜΗ',
          paymentStatus: 'paid',
          linkedTransactionId: 'txn_1',
        } as Revenue,
      ],
    });

    expect(paymentRevenuesNeedRepair(data, pay)).toBe(true);
    syncRevenuesForPaymentInData(data, 'txn_1');

    const linked = data.revenues.filter((r) => r.linkedTransactionId === 'txn_1');
    expect(linked).toHaveLength(1);
    expect(linked[0]?.id).toBe(athletePaymentRevenueId('txn_1', 0));
    expect(data.deletedRevenueIds).toEqual(expect.arrayContaining(['rev_oldrandom', 'rev_dup']));
    expect(data.deletedRevenueIds).not.toContain(athletePaymentRevenueId('txn_1', 0));
  });

  it('backfill converges two devices with duplicate random revenues', () => {
    const pay = payment({ id: 'txn_shared' });
    const deviceA = baseData({
      transactions: [pay],
      revenues: [
        {
          id: 'rev_a1',
          date: '2026-10-15',
          amount: 100,
          category: 'tuition',
          description: 'ΜΗΝΙΑΙΑ ΣΥΝΔΡΟΜΗ',
          paymentStatus: 'paid',
          linkedTransactionId: 'txn_shared',
        } as Revenue,
        {
          id: 'rev_a2',
          date: '2026-10-15',
          amount: 100,
          category: 'tuition',
          description: 'ΜΗΝΙΑΙΑ ΣΥΝΔΡΟΜΗ',
          paymentStatus: 'paid',
          linkedTransactionId: 'txn_shared',
        } as Revenue,
      ],
    });
    const deviceB = baseData({
      transactions: [structuredClone(pay)],
      revenues: [
        {
          id: 'rev_b1',
          date: '2026-10-15',
          amount: 100,
          category: 'tuition',
          description: 'ΜΗΝΙΑΙΑ ΣΥΝΔΡΟΜΗ',
          paymentStatus: 'paid',
          linkedTransactionId: 'txn_shared',
        } as Revenue,
      ],
    });

    backfillAthletePaymentRevenues(deviceA);
    backfillAthletePaymentRevenues(deviceB);

    const idsA = deviceA.revenues
      .filter((r) => r.linkedTransactionId === 'txn_shared')
      .map((r) => r.id)
      .sort();
    const idsB = deviceB.revenues
      .filter((r) => r.linkedTransactionId === 'txn_shared')
      .map((r) => r.id)
      .sort();
    expect(idsA).toEqual(idsB);
    expect(idsA).toEqual([athletePaymentRevenueId('txn_shared', 0)]);
  });

  it('dedupeLinkedFinanceRevenues drops duplicate payment mirrors for display', () => {
    const rows = dedupeLinkedFinanceRevenues([
      {
        id: '1',
        amount: 40,
        description: 'ΜΗΝΙΑΙΑ ΣΥΝΔΡΟΜΗ',
        paymentMethod: 'cash',
        linkedTransactionId: 'txn_x',
      } as Revenue,
      {
        id: '2',
        amount: 40,
        description: 'ΜΗΝΙΑΙΑ ΣΥΝΔΡΟΜΗ',
        paymentMethod: 'cash',
        linkedTransactionId: 'txn_x',
      } as Revenue,
      {
        id: '3',
        amount: 10,
        description: 'Χορηγία',
        paymentMethod: 'cash',
      } as Revenue,
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(50);
  });
});
