import type { AppData, PaymentMethod } from '../types';
import {
  isRentalBookingCollected,
  listUncollectedRentalBookings,
  rentalPaymentMethodOf,
  rentalRevenueDate,
} from '../api/services/rentalRevenueBridge';
import { paymentMethodLabel } from '../shared/paymentMethods';
import { filterOwnFinanceEntries } from './financeOwnEntries';
import { normalizeReceiptIssues, issueForTransaction } from './receiptBook';
import { describeReceiptIssue } from './receiptIssueView';

export type TillMethodKey = 'cash' | 'card' | 'online' | 'transfer' | 'other';

export type TillMethodRow = {
  key: TillMethodKey;
  label: string;
  collections: number;
  collectionCount: number;
  income: number;
};

export type TillGap = {
  id: string;
  label: string;
  amount: number;
};

export type DailyTill = {
  date: string;
  collectionsTotal: number;
  collectionCount: number;
  incomeTotal: number;
  incomeCount: number;
  receiptsTotal: number;
  receiptsCount: number;
  receiptsVoided: number;
  methods: TillMethodRow[];
  missingReceipts: TillGap[];
  uncollectedToday: TillGap[];
};

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isoDate(raw: string | undefined | null): string {
  return String(raw ?? '').slice(0, 10);
}

function methodKey(method: PaymentMethod | string | undefined | null): TillMethodKey {
  if (method === 'cash') return 'cash';
  if (method === 'card') return 'card';
  if (method === 'viva' || method === 'stripe' || method === 'eurobank') return 'online';
  if (method === 'transfer') return 'transfer';
  return 'other';
}

function methodLabel(key: TillMethodKey): string {
  if (key === 'cash') return 'Μετρητά';
  if (key === 'card') return 'POS';
  if (key === 'online') return 'Online (Viva / Stripe / Eurobank)';
  if (key === 'transfer') return 'Κατάθεση';
  return 'Άλλο / χωρίς τρόπο';
}

const METHOD_ORDER: TillMethodKey[] = ['cash', 'card', 'online', 'transfer', 'other'];

export function buildDailyTill(data: AppData, date: string): DailyTill {
  const day = isoDate(date);
  const methods = new Map<TillMethodKey, TillMethodRow>();
  for (const key of METHOD_ORDER) {
    methods.set(key, {
      key,
      label: methodLabel(key),
      collections: 0,
      collectionCount: 0,
      income: 0,
    });
  }

  const bump = (key: TillMethodKey, amount: number, kind: 'collections' | 'income') => {
    const row = methods.get(key)!;
    const money = roundMoney(amount);
    if (kind === 'collections') {
      row.collections = roundMoney(row.collections + money);
      row.collectionCount += 1;
    } else {
      row.income = roundMoney(row.income + money);
    }
  };

  let collectionsTotal = 0;
  let collectionCount = 0;
  const missingReceipts: TillGap[] = [];

  for (const tx of data.transactions ?? []) {
    if (tx.type !== 'payment' || !(Number(tx.amount) > 0)) continue;
    if (isoDate(tx.createdAt) !== day) continue;
    const amount = roundMoney(tx.amount);
    collectionsTotal = roundMoney(collectionsTotal + amount);
    collectionCount += 1;
    bump(methodKey(tx.paymentMethod), amount, 'collections');
    const issued = issueForTransaction(data.receiptIssues, tx.id);
    if (!issued || issued.voidedAt) {
      const student = data.students.find((s) => s.id === tx.athleteId);
      const name = student ? `${student.lastName} ${student.firstName}`.trim() : 'Αθλητής';
      missingReceipts.push({
        id: tx.id,
        label: `Συνδρομή · ${name}`,
        amount,
      });
    }
  }

  for (const booking of data.rentalBookings ?? []) {
    if (!isRentalBookingCollected(booking) || !(Number(booking.amount) > 0)) continue;
    if (rentalRevenueDate(booking) !== day) continue;
    const amount = roundMoney(booking.amount);
    collectionsTotal = roundMoney(collectionsTotal + amount);
    collectionCount += 1;
    bump(methodKey(rentalPaymentMethodOf(booking)), amount, 'collections');
    const issued = issueForTransaction(data.receiptIssues, `rent_${booking.id}`);
    if (!issued || issued.voidedAt) {
      missingReceipts.push({
        id: booking.id,
        label: `Ενοικίαση · ${booking.customerName} · ${booking.facilityName}`,
        amount,
      });
    }
  }

  const incomes = filterOwnFinanceEntries(data.revenues).filter(
    (row) => isoDate(row.date) === day && row.paymentStatus !== 'pending',
  );
  let incomeTotal = 0;
  for (const row of incomes) {
    const amount = roundMoney(row.amount);
    incomeTotal = roundMoney(incomeTotal + amount);
    bump(methodKey(row.paymentMethod), amount, 'income');
  }

  const issuedRows = normalizeReceiptIssues(data.receiptIssues)
    .filter((row) => isoDate(row.issuedAt) === day)
    .map((row) => describeReceiptIssue(row, data));
  const validReceipts = issuedRows.filter((row) => !row.voidedAt);
  const receiptsTotal = roundMoney(
    validReceipts.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
  );

  const uncollectedToday = listUncollectedRentalBookings(data.rentalBookings)
    .filter((row) => row.date === day)
    .map((row) => ({
      id: row.id,
      label: `${row.customerName} · ${row.facilityName} · ${row.startTime}–${row.endTime}`,
      amount: roundMoney(row.amount),
    }));

  return {
    date: day,
    collectionsTotal,
    collectionCount,
    incomeTotal,
    incomeCount: incomes.length,
    receiptsTotal,
    receiptsCount: validReceipts.length,
    receiptsVoided: issuedRows.length - validReceipts.length,
    methods: METHOD_ORDER.map((key) => methods.get(key)!).filter(
      (row) => row.collectionCount > 0 || row.income > 0,
    ),
    missingReceipts,
    uncollectedToday,
  };
}

export function tillMethodHint(method: string | undefined | null): string {
  return paymentMethodLabel(method);
}
