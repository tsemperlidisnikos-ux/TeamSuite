import type { AppData, ReceiptIssueKind, ReceiptIssueRecord } from '../types';
import { formatReceiptLabel, voidedReceiptNote } from './receiptBook';

const MONTHS = [
  '',
  'Ιανουάριος',
  'Φεβρουάριος',
  'Μάρτιος',
  'Απρίλιος',
  'Μάιος',
  'Ιούνιος',
  'Ιούλιος',
  'Αύγουστος',
  'Σεπτέμβριος',
  'Οκτώβριος',
  'Νοέμβριος',
  'Δεκέμβριος',
];

export type ReceiptIssueView = {
  id: string;
  series: string;
  number: number;
  label: string;
  issuedAt: string;
  issuedDate: string;
  emailedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  transactionId: string | null;
  athleteId: string | null;
  kind: ReceiptIssueKind;
  amount: number;
  receivedFrom: string;
  reason: string;
};

export function receiptKindLabel(kind: ReceiptIssueKind): string {
  if (kind === 'rental') return 'Ενοικίαση γηπέδου';
  if (kind === 'subscription') return 'Συνδρομή / πληρωμή αθλητή';
  return 'Άλλο';
}

export function inferReceiptKind(issue: ReceiptIssueRecord): ReceiptIssueKind {
  if (issue.kind === 'subscription' || issue.kind === 'rental' || issue.kind === 'other') {
    return issue.kind;
  }
  if (String(issue.transactionId ?? '').startsWith('rent_')) return 'rental';
  if (issue.athleteId) return 'subscription';
  return 'other';
}

export function describeReceiptIssue(issue: ReceiptIssueRecord, data: AppData): ReceiptIssueView {
  const kind = inferReceiptKind(issue);
  const issuedDate = String(issue.issuedAt ?? '').slice(0, 10);
  let amount = Number(issue.amount) || 0;
  let receivedFrom = String(issue.receivedFrom ?? '').trim();
  let reason = String(issue.reason ?? '').trim();
  const txId = String(issue.transactionId ?? '').trim();

  if (txId.startsWith('rent_')) {
    const bookingId = txId.slice(5);
    const booking = (data.rentalBookings ?? []).find((row) => row.id === bookingId);
    if (booking) {
      if (!(amount > 0)) amount = Number(booking.amount) || 0;
      if (!receivedFrom) receivedFrom = booking.customerName;
      if (!reason) {
        reason = `Ενοικίαση γηπέδου · ${booking.facilityName} · ${booking.date} ${booking.startTime}–${booking.endTime}`;
      }
    }
  } else if (txId) {
    const tx = (data.transactions ?? []).find((row) => row.id === txId);
    if (tx) {
      if (!(amount > 0)) amount = Number(tx.amount) || 0;
      const student = data.students.find((s) => s.id === (issue.athleteId || tx.athleteId));
      if (!receivedFrom && student) {
        receivedFrom = `${student.lastName} ${student.firstName}`.trim();
      }
      if (!reason) {
        const month = MONTHS[tx.month] || '';
        reason = tx.comments?.trim() || (month ? `Συνδρομή ${month} ${tx.year}` : 'Πληρωμή αθλητή');
      }
    }
  }

  if (!receivedFrom && issue.athleteId) {
    const student = data.students.find((s) => s.id === issue.athleteId);
    if (student) receivedFrom = `${student.lastName} ${student.firstName}`.trim();
  }
  if (issue.voidedAt && !reason) {
    reason = issue.voidReason || voidedReceiptNote(issue.series, issue.number);
  }

  return {
    id: issue.id,
    series: issue.series,
    number: issue.number,
    label: formatReceiptLabel(issue.series, issue.number),
    issuedAt: issue.issuedAt,
    issuedDate,
    emailedAt: issue.emailedAt ?? null,
    voidedAt: issue.voidedAt ?? null,
    voidReason: issue.voidReason ?? null,
    transactionId: issue.transactionId ?? null,
    athleteId: issue.athleteId ?? null,
    kind,
    amount,
    receivedFrom,
    reason,
  };
}
