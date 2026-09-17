import { describe, expect, it } from 'vitest';
import {
  mergeMirrorPayloadPreservingRoster,
  mergeOpsSliceIntoPayload,
} from '../api/lib/serverStore';

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

  it('keeps roster when a partial occupancy slice is applied', () => {
    const existing = {
      students: [{ id: 'st_1', firstName: 'Α', lastName: 'Β' }],
      transactions: [{ id: 'txn_1', amount: 10 }],
      rentalBookings: [],
    };
    const slice = {
      rentalBookings: [{ id: 'rb_1', status: 'confirmed' }],
    };
    const merged = mergeOpsSliceIntoPayload(existing, slice) as {
      students: Array<{ id: string }>;
      transactions: Array<{ id: string }>;
      rentalBookings: Array<{ id: string }>;
    };
    expect(merged.students).toHaveLength(1);
    expect(merged.transactions).toHaveLength(1);
    expect(merged.rentalBookings.some((row) => row.id === 'rb_1')).toBe(true);
  });

  it('does not restore a deleted fee charge template from the cloud mirror', () => {
    const existing = {
      students: [],
      feeChargeTemplates: [{ id: 'fee_tpl_1', typeLabel: 'Συνδρομή' }],
    };
    const incoming = {
      students: [],
      feeChargeTemplates: [],
      deletedFeeChargeTemplateIds: ['fee_tpl_1'],
    };
    const merged = mergeMirrorPayloadPreservingRoster(existing, incoming) as {
      feeChargeTemplates: Array<{ id: string }>;
      deletedFeeChargeTemplateIds: string[];
    };
    expect(merged.feeChargeTemplates).toHaveLength(0);
    expect(merged.deletedFeeChargeTemplateIds).toContain('fee_tpl_1');
  });
});
