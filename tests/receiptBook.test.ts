import { describe, expect, it } from 'vitest';
import type { ReceiptIssueRecord, ReceiptNumberRange } from '../src/types';
import {
  parseReceiptNumberInput,
  previewNextReceipt,
  validateReceiptNumberForIssue,
} from '../src/utils/receiptBook';

const ranges: ReceiptNumberRange[] = [
  { id: 'r1', series: 'Γ', from: 1, to: 50 },
  { id: 'r2', series: 'Γ', from: 51, to: 100 },
  { id: 'r3', series: 'Γ', from: 101, to: 150 },
  { id: 'r4', series: 'Γ', from: 151, to: 200 },
];

function issue(number: number): ReceiptIssueRecord {
  return {
    id: `ris_${number}`,
    series: 'Γ',
    number,
    transactionId: `txn_${number}`,
    athleteId: 'ath1',
    issuedAt: '2026-09-14T12:00:00',
    emailedAt: null,
    voidedAt: null,
    voidReason: null,
    amount: 65,
    receivedFrom: 'Παλουμπής',
    reason: 'Συνδρομή',
    kind: 'subscription',
  };
}

describe('receipt book next number', () => {
  it('suggests 1 when nothing has been issued', () => {
    const next = previewNextReceipt('Γ', ranges, []);
    expect(next).toEqual({ ok: true, series: 'Γ', number: 1 });
  });

  it('suggests the next unused number after 1', () => {
    const next = previewNextReceipt('Γ', ranges, [issue(1)]);
    expect(next).toEqual({ ok: true, series: 'Γ', number: 2 });
  });

  it('blocks 201 when the club only declared up to 200', () => {
    const issues = [issue(200)];
    const next = previewNextReceipt('Γ', ranges, issues);
    expect(next.ok).toBe(false);
    if (next.ok) return;
    expect(next.number).toBe(201);
    expect(next.error).toContain('201');
    expect(next.error).toContain('Γ');

    const typed = validateReceiptNumberForIssue('Γ', 201, ranges, issues);
    expect(typed.ok).toBe(false);
    if (typed.ok) return;
    expect(typed.error).toContain('201');
  });

  it('parses the number from a labeled receipt field', () => {
    expect(parseReceiptNumberInput('Σειρά Γ · Αρ. 51')).toBe(51);
    expect(parseReceiptNumberInput('2')).toBe(2);
  });
});
