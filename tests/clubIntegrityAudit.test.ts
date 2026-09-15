import { describe, expect, it } from 'vitest';
import { seedData } from '../src/data/seed';
import type { AppData, Student } from '../src/types';
import { auditClubIntegrity } from '../src/utils/clubIntegrityAudit';

function club(partial: Partial<AppData>): AppData {
  return { ...structuredClone(seedData), ...partial };
}

function student(id: string, lastName: string): Student {
  return {
    id,
    firstName: 'Γιάννης',
    lastName,
    status: 'active',
  } as Student;
}

describe('club integrity audit', () => {
  it('flags a subscription payment that never reached revenues', () => {
    const data = club({
      students: [student('ath1', 'Παλουμπής')],
      transactions: [
        {
          id: 'txn_pay',
          athleteId: 'ath1',
          amount: 65,
          receiptNumber: '',
          type: 'payment',
          month: 9,
          year: 2026,
          paymentMethod: 'card',
          comments: 'Συνδρομή',
          createdAt: '2026-09-15T10:00:00',
        },
      ],
      revenues: [],
    });
    const findings = auditClubIntegrity('Απόλλων', data);
    expect(findings.some((f) => f.title.includes('χωρίς έσοδο') && f.severity === 'critical')).toBe(
      true,
    );
  });

  it('flags a receipt number outside the club book', () => {
    const data = club({
      students: [student('ath1', 'Παλουμπής')],
      receiptNumberRanges: [{ id: 'r1', series: 'Γ', from: 1, to: 200 }],
      receiptIssues: [
        {
          id: 'ris_201',
          series: 'Γ',
          number: 201,
          transactionId: 'txn_pay',
          athleteId: 'ath1',
          issuedAt: '2026-09-15T10:00:00',
          emailedAt: null,
          voidedAt: null,
          voidReason: null,
          amount: 65,
          receivedFrom: 'Παλουμπής',
          reason: 'Συνδρομή',
          kind: 'subscription',
        },
      ],
    });
    const findings = auditClubIntegrity('Απόλλων', data);
    expect(findings.some((f) => f.title.includes('εκτός δηλωμένου εύρους'))).toBe(true);
  });

  it('accepts a payment that matches its revenue amount', () => {
    const data = club({
      students: [student('ath1', 'Παλουμπής')],
      transactions: [
        {
          id: 'txn_pay',
          athleteId: 'ath1',
          amount: 65,
          receiptNumber: 'Σειρά Γ · Αρ. 1',
          receiptSeries: 'Γ',
          receiptSeq: 1,
          type: 'payment',
          month: 9,
          year: 2026,
          paymentMethod: 'card',
          comments: 'Συνδρομή',
          createdAt: '2026-09-15T10:00:00',
        },
      ],
      revenues: [
        {
          id: 'rev1',
          date: '2026-09-15',
          amount: 65,
          category: 'tuition',
          description: 'ΜΗΝΙΑΙΑ ΣΥΝΔΡΟΜΗ',
          paymentStatus: 'paid',
          linkedTransactionId: 'txn_pay',
        },
      ],
    });
    const findings = auditClubIntegrity('Απόλλων', data);
    expect(findings.some((f) => f.title.includes('κάθε πληρωμή έχει έσοδο'))).toBe(true);
    expect(findings.some((f) => f.title.includes('χωρίς έσοδο'))).toBe(false);
  });
});
