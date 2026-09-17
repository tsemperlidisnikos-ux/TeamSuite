import { describe, expect, it } from 'vitest';
import { mergeTwoRecords, mergeByIdPreferringUpdatedAt } from '../src/data/entityFieldMerge';
import { applyFinanceCollections, rememberDeletedId } from '../src/data/financeSyncMerge';
import { applyOpsCollections } from '../src/data/opsSyncMerge';
import { seedData } from '../src/data/seed';
import { applyContentCollections } from '../src/data/clubContentSyncMerge';
import type { AppData, Announcement, AttendanceRecord, RegistrationApplication } from '../src/types';

function club(partial: Partial<AppData>): AppData {
  return { ...structuredClone(seedData), ...partial };
}

describe('entity field merge', () => {
  it('fills empty fields from the older record', () => {
    const local = { id: 's1', phone: '111', email: '', updatedAt: 20 };
    const cloud = { id: 's1', phone: '222', email: 'a@b.gr', updatedAt: 10 };
    const merged = mergeTwoRecords(local, cloud, true);
    expect(merged.phone).toBe('111');
    expect(merged.email).toBe('a@b.gr');
    expect(merged.updatedAt).toBe(20);
  });

  it('newer updatedAt wins conflicting values', () => {
    const rows = mergeByIdPreferringUpdatedAt(
      [{ id: 's1', phone: 'local', updatedAt: 1 }],
      [{ id: 's1', phone: 'cloud', updatedAt: 9 }],
      new Set(),
      true,
    );
    expect(rows[0]?.phone).toBe('cloud');
  });
});

describe('finance tombstones', () => {
  it('does not revive a deleted revenue', () => {
    const local = club({
      revenues: [],
      deletedRevenueIds: rememberDeletedId([], 'rev_1'),
    });
    const cloud = club({
      revenues: [
        {
          id: 'rev_1',
          date: '2026-01-01',
          amount: 10,
          category: 'other',
          description: 'x',
          paymentStatus: 'paid',
        },
      ],
    });
    const target = structuredClone(local);
    applyFinanceCollections(target, local, cloud, {
      preferLocal: true,
      treatCloudOnlyTxAsDeleted: false,
    });
    expect(target.revenues.some((row) => row.id === 'rev_1')).toBe(false);
  });

  it('does not revive a deleted fee charge template', () => {
    const template = {
      id: 'fee_tpl_1',
      season: '2026-2027',
      sport: 'Μπάσκετ',
      typeLabel: 'Μηνιαία συνδρομή',
      monthlyAmount: 30,
      appliesTo: 'all' as const,
      classId: null,
      athleteId: null,
      months: [9],
      reminderDays: 7,
      registrationFee: 0,
      seasonTicketAmount: 0,
      seasonTicketMonths: [],
      customChargeAmount: 0,
      createdAt: '2026-09-17T10:00:00',
    };
    const local = club({
      feeChargeTemplates: [],
      deletedFeeChargeTemplateIds: rememberDeletedId([], template.id),
    });
    const cloud = club({ feeChargeTemplates: [template] });
    const target = structuredClone(local);
    applyFinanceCollections(target, local, cloud, {
      preferLocal: true,
      treatCloudOnlyTxAsDeleted: false,
    });
    expect(target.feeChargeTemplates.some((row) => row.id === template.id)).toBe(false);
  });

  it('keeps the newer revenue when two devices edit the same id', () => {
    const local = club({
      revenues: [
        {
          id: 'rev_2',
          date: '2026-01-01',
          amount: 10,
          category: 'other',
          description: 'old',
          paymentStatus: 'paid',
          updatedAt: 1,
        },
      ],
    });
    const cloud = club({
      revenues: [
        {
          id: 'rev_2',
          date: '2026-01-01',
          amount: 25,
          category: 'other',
          description: 'new',
          paymentStatus: 'paid',
          updatedAt: 9,
        },
      ],
    });
    const target = structuredClone(local);
    applyFinanceCollections(target, local, cloud, {
      preferLocal: true,
      treatCloudOnlyTxAsDeleted: false,
    });
    expect(target.revenues[0]?.amount).toBe(25);
    expect(target.revenues[0]?.description).toBe('new');
  });

  it('keeps a new manual charge after an older charge for that month was deleted', () => {
    const local = club({
      transactions: [
        {
          id: 'txn_new',
          athleteId: 'ath1',
          amount: 50,
          receiptNumber: '',
          type: 'charge',
          month: 9,
          year: 2026,
          paymentMethod: '',
          comments: 'Συνδρομή Σεπτεμβρίου',
          createdAt: '2026-09-14T12:00:00',
        },
      ],
      deletedTransactionIds: ['txn_old'],
      suppressedFeeChargeKeys: ['ath1|2026|9|*'],
    });
    const cloud = club({
      transactions: [],
      deletedTransactionIds: ['txn_old'],
      suppressedFeeChargeKeys: ['ath1|2026|9|*'],
    });
    const target = structuredClone(local);
    applyFinanceCollections(target, local, cloud, {
      preferLocal: true,
      treatCloudOnlyTxAsDeleted: false,
    });
    expect(target.transactions.some((row) => row.id === 'txn_new')).toBe(true);
  });

  it('still hides a deleted template fee charge', () => {
    const tagged = {
      id: 'txn_fee',
      athleteId: 'ath1',
      amount: 50,
      receiptNumber: '',
      type: 'charge' as const,
      month: 9,
      year: 2026,
      paymentMethod: '',
      comments: 'Συνδρομή [fee:tpl1:sub]',
      createdAt: '2026-09-01T12:00:00',
    };
    const local = club({
      transactions: [tagged],
      deletedTransactionIds: ['txn_fee'],
      suppressedFeeChargeKeys: ['ath1|2026|9|[fee:tpl1:sub]', 'ath1|2026|9|*'],
    });
    const cloud = club({
      transactions: [tagged],
      deletedTransactionIds: ['txn_fee'],
      suppressedFeeChargeKeys: ['ath1|2026|9|[fee:tpl1:sub]', 'ath1|2026|9|*'],
    });
    const target = structuredClone(local);
    applyFinanceCollections(target, local, cloud, {
      preferLocal: true,
      treatCloudOnlyTxAsDeleted: false,
    });
    expect(target.transactions.some((row) => row.id === 'txn_fee')).toBe(false);
  });
});

describe('ops attendance slot merge', () => {
  it('collapses two ids for the same class/student/date', () => {
    const a: AttendanceRecord = {
      id: 'att_a',
      classId: 'c1',
      studentId: 's1',
      date: '2026-09-10',
      present: false,
      updatedAt: 1,
    };
    const b: AttendanceRecord = {
      id: 'att_b',
      classId: 'c1',
      studentId: 's1',
      date: '2026-09-10',
      present: true,
      updatedAt: 2,
    };
    const local = club({ attendance: [a] });
    const cloud = club({ attendance: [b] });
    const target = structuredClone(local);
    applyOpsCollections(target, local, cloud, true);
    expect(target.attendance).toHaveLength(1);
    expect(target.attendance[0]?.present).toBe(true);
  });

  it('keeps a delete tombstone', () => {
    const local = club({
      trainings: [],
      deletedTrainingIds: ['trn_1'],
    });
    const cloud = club({
      trainings: [
        {
          id: 'trn_1',
          date: '2026-09-10',
          startTime: '18:00',
          endTime: '19:00',
          location: 'A',
          notes: '',
          classId: 'c1',
        },
      ],
    });
    const target = structuredClone(local);
    applyOpsCollections(target, local, cloud, true);
    expect(target.trainings.some((row) => row.id === 'trn_1')).toBe(false);
  });
});

describe('content collections', () => {
  it('keeps a local-only announcement when roster size matches', () => {
    const announcement: Announcement = {
      id: 'ann_local',
      title: 'Τοπική ανακοίνωση',
      message: 'Μόνο σε αυτό το browser',
      createdAt: '2026-09-10T10:00:00',
      targetType: 'club',
      targetId: null,
      updatedAt: 5,
    };
    const local = club({ announcements: [announcement] });
    const cloud = club({ announcements: [] });
    const target = structuredClone(cloud);
    applyContentCollections(target, local, cloud, true);
    expect(target.announcements.some((row) => row.id === 'ann_local')).toBe(true);
  });

  it('does not revive a deleted registration application', () => {
    const application = {
      id: 'app_1',
      status: 'pending',
      firstName: 'A',
      lastName: 'B',
    } as RegistrationApplication;
    const local = club({
      registrationApplications: [],
      deletedRegistrationApplicationIds: rememberDeletedId([], 'app_1'),
    });
    const cloud = club({ registrationApplications: [application] });
    const target = structuredClone(local);
    applyContentCollections(target, local, cloud, true);
    expect(target.registrationApplications.some((row) => row.id === 'app_1')).toBe(false);
  });
});
