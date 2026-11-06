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

describe('active athlete preservation', () => {
  it('does not demote active→inactive when incoming is not strictly newer', () => {
    const existing = {
      students: [
        { id: 'a1', status: 'active', updatedAt: 100, firstName: 'Νίκος' },
        { id: 'a2', status: 'active', updatedAt: 100, firstName: 'Μαρία' },
      ],
    };
    const incoming = {
      students: [
        { id: 'a1', status: 'inactive', updatedAt: 100, firstName: 'Νίκος' },
        { id: 'a2', status: 'inactive', updatedAt: 50, firstName: 'Μαρία' },
      ],
    };
    const merged = mergeMirrorPayloadPreservingRoster(existing, incoming) as {
      students: Array<{ id: string; status: string }>;
    };
    expect(merged.students.find((s) => s.id === 'a1')?.status).toBe('active');
    expect(merged.students.find((s) => s.id === 'a2')?.status).toBe('active');
  });

  it('allows demotion only when incoming updatedAt is strictly newer', () => {
    const existing = {
      students: [{ id: 'a1', status: 'active', updatedAt: 100 }],
    };
    const incoming = {
      students: [{ id: 'a1', status: 'inactive', updatedAt: 200 }],
    };
    const merged = mergeMirrorPayloadPreservingRoster(existing, incoming) as {
      students: Array<{ id: string; status: string }>;
    };
    expect(merged.students.find((s) => s.id === 'a1')?.status).toBe('inactive');
  });

  it('circuit-breaker restores mass demotion from stale push', () => {
    const existing = {
      students: Array.from({ length: 20 }, (_, i) => ({
        id: `a${i}`,
        status: 'active',
        updatedAt: 100,
      })),
    };
    const incoming = {
      students: Array.from({ length: 20 }, (_, i) => ({
        id: `a${i}`,
        status: 'inactive',
        updatedAt: 100,
      })),
    };
    const merged = mergeMirrorPayloadPreservingRoster(existing, incoming) as {
      students: Array<{ status: string }>;
    };
    const actives = merged.students.filter((s) => s.status === 'active').length;
    expect(actives).toBe(20);
  });
});
