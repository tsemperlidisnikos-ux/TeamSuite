import { describe, expect, it } from 'vitest';
import { athleteMonthSubscription } from '../src/api/services/feeChargesService';
import type { AthleteTransaction } from '../src/types';

function tx(
  partial: Partial<AthleteTransaction> &
    Pick<AthleteTransaction, 'id' | 'type' | 'amount' | 'month' | 'year'>,
): AthleteTransaction {
  return {
    athleteId: 'ath1',
    receiptNumber: '',
    paymentMethod: 'cash',
    comments: partial.type === 'charge' ? '[fee:tpl:sub]' : '',
    createdAt: '2026-09-14T12:00:00',
    allocatesChargeId: null,
    ...partial,
  };
}

describe('athleteMonthSubscription', () => {
  it('marks September paid when payment is labeled Sep but allocated to another month', () => {
    const chargeSep = tx({
      id: 'chg_sep',
      type: 'charge',
      amount: 30,
      month: 9,
      year: 2026,
    });
    const chargeOct = tx({
      id: 'chg_oct',
      type: 'charge',
      amount: 30,
      month: 10,
      year: 2026,
      createdAt: '2026-10-01T12:00:00',
    });
    // Πληρωμή «για Σεπτέμβριο» αλλά αντιστοιχισμένη σε Οκτώβριο — παλιά λογική: ανεξόφλητη.
    const payment = tx({
      id: 'pay_sep',
      type: 'payment',
      amount: 30,
      month: 9,
      year: 2026,
      allocatesChargeId: 'chg_oct',
      createdAt: '2026-09-20T12:00:00',
      comments: 'ΣΥΝΔΡΟΜΗ 9/26',
    });

    const sub = athleteMonthSubscription('ath1', 9, 2026, [chargeSep, chargeOct, payment]);
    expect(sub.status).toBe('paid');
    expect(sub.paid).toBe(30);
    expect(sub.remaining).toBe(0);
  });

  it('still counts allocation when payment period label differs', () => {
    const chargeSep = tx({
      id: 'chg_sep',
      type: 'charge',
      amount: 30,
      month: 9,
      year: 2026,
    });
    const payment = tx({
      id: 'pay',
      type: 'payment',
      amount: 30,
      month: 10,
      year: 2026,
      allocatesChargeId: 'chg_sep',
    });

    const sub = athleteMonthSubscription('ath1', 9, 2026, [chargeSep, payment]);
    expect(sub.status).toBe('paid');
    expect(sub.paid).toBe(30);
  });

  it('keeps partial unpaid when period payments do not cover the charge', () => {
    const chargeSep = tx({
      id: 'chg_sep',
      type: 'charge',
      amount: 75,
      month: 9,
      year: 2026,
    });
    const payment = tx({
      id: 'pay',
      type: 'payment',
      amount: 40,
      month: 9,
      year: 2026,
      allocatesChargeId: 'chg_sep',
    });

    const sub = athleteMonthSubscription('ath1', 9, 2026, [chargeSep, payment]);
    expect(sub.status).toBe('unpaid');
    expect(sub.paid).toBe(40);
    expect(sub.remaining).toBe(35);
  });
});
