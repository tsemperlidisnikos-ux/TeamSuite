import { describe, expect, it } from 'vitest';
import { mergeMirrorPayloadPreservingRoster } from '../api/lib/serverStore';

describe('cloud receipt merge', () => {
  it('does not wipe club receipts when another device pushes an empty book', () => {
    const existing = {
      students: [],
      transactions: [],
      receiptIssues: [
        {
          id: 'ris_1',
          series: 'Γ',
          number: 1,
          transactionId: 'txn_1',
          issuedAt: '2026-09-14T10:00:00',
        },
      ],
      receiptNumberRanges: [{ id: 'r1', series: 'Γ', from: 1, to: 200 }],
    };
    const incoming = {
      students: [],
      transactions: [],
      receiptIssues: [],
      receiptNumberRanges: [],
    };
    const merged = mergeMirrorPayloadPreservingRoster(existing, incoming) as {
      receiptIssues: Array<{ number: number }>;
    };
    expect(merged.receiptIssues.some((row) => row.number === 1)).toBe(true);
  });
});
