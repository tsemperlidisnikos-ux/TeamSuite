import { createId, getData, mutateData } from '../../data/repository';
import type { AppData, AthleteTransaction, Revenue, RevenueCategory, Student } from '../../types';

/** Σύστημα υποκατηγορίας — εμφανίζεται στα Έσοδα, όχι στο χειροκίνητο catalog ρυθμίσεων. */
export const ATHLETE_INCOME_SUBCATEGORY = 'ΣΥΝΔΡΟΜΕΣ ΑΘΛΗΤΩΝ';

export const ATHLETE_INCOME_DESCRIPTIONS = [
  'ΕΓΓΡΑΦΗ',
  'ΜΗΝΙΑΙΑ ΣΥΝΔΡΟΜΗ',
  'ΕΤΗΣΙΑ ΣΥΝΔΡΟΜΗ',
  'ΚΑΡΤΑ ΔΙΑΡΚΕΙΑΣ',
] as const;

type RevenuePart = {
  category: RevenueCategory;
  description: (typeof ATHLETE_INCOME_DESCRIPTIONS)[number];
  amount: number;
};

function padMonth(month: number): string {
  return String(month).padStart(2, '0');
}

function paymentDate(payment: AthleteTransaction): string {
  const raw = payment.createdAt?.slice(0, 10);
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return `${payment.year}-${padMonth(payment.month)}-01`;
}

function textBlob(payment: AthleteTransaction, charge: AthleteTransaction | undefined): string {
  return `${charge?.comments ?? ''} ${payment.comments ?? ''}`;
}

function hasFeeTag(blob: string, kind: 'sub' | 'reg' | 'ticket'): boolean {
  return new RegExp(`\\[fee:[^\\]]*:${kind}\\]`).test(blob);
}

function isAnnual(blob: string): boolean {
  return /ετ[ηή]σ/i.test(blob);
}

function classifyPayment(
  payment: AthleteTransaction,
  charge: AthleteTransaction | undefined,
  student: Student | undefined,
  transactions: AthleteTransaction[],
): RevenuePart[] {
  const blob = textBlob(payment, charge);
  const hasReg = hasFeeTag(blob, 'reg') || /εγγραφ/i.test(blob);
  const hasTicket = hasFeeTag(blob, 'ticket') || /διαρκε/i.test(blob);
  const hasSub = hasFeeTag(blob, 'sub') || /συνδρομ/i.test(blob);
  const annual = isAnnual(blob);
  const subLabel = annual ? 'ΕΤΗΣΙΑ ΣΥΝΔΡΟΜΗ' : 'ΜΗΝΙΑΙΑ ΣΥΝΔΡΟΜΗ';

  if (hasTicket && !hasReg) {
    return [{ category: 'tuition', description: 'ΚΑΡΤΑ ΔΙΑΡΚΕΙΑΣ', amount: payment.amount }];
  }

  if (hasReg && (hasSub || charge)) {
    const regFee = Math.max(0, student?.registrationFee ?? 0);
    let regAmount = 0;
    if (regFee > 0 && charge) {
      const priorOnCharge = transactions
        .filter(
          (t) =>
            t.type === 'payment' &&
            t.allocatesChargeId === charge.id &&
            t.id !== payment.id,
        )
        .reduce((sum, t) => sum + t.amount, 0);
      const regRemaining = Math.max(0, regFee - priorOnCharge);
      regAmount = Math.min(payment.amount, regRemaining);
    } else if (hasReg && !hasSub && !hasTicket) {
      regAmount = payment.amount;
    }

    const parts: RevenuePart[] = [];
    if (regAmount > 0.009) {
      parts.push({ category: 'registration', description: 'ΕΓΓΡΑΦΗ', amount: roundMoney(regAmount) });
    }
    const subAmount = roundMoney(payment.amount - regAmount);
    if (subAmount > 0.009) {
      parts.push({ category: 'tuition', description: subLabel, amount: subAmount });
    }
    if (parts.length === 0) {
      return [{ category: 'registration', description: 'ΕΓΓΡΑΦΗ', amount: payment.amount }];
    }
    return parts;
  }

  if (hasReg) {
    return [{ category: 'registration', description: 'ΕΓΓΡΑΦΗ', amount: payment.amount }];
  }

  return [{ category: 'tuition', description: subLabel, amount: payment.amount }];
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildRevenuesForPayment(
  payment: AthleteTransaction,
  data: AppData,
): Revenue[] {
  const student = data.students.find((s) => s.id === payment.athleteId);
  const charge = payment.allocatesChargeId
    ? data.transactions.find((t) => t.id === payment.allocatesChargeId)
    : undefined;
  const parts = classifyPayment(payment, charge, student, data.transactions ?? []);
  const date = paymentDate(payment);
  const period = `${payment.year}-${padMonth(payment.month)}`;
  const noteBits = [
    charge?.comments?.replace(/\s*\[fee:[^\]]+\]/g, '').trim(),
    payment.comments?.trim(),
    payment.receiptNumber ? `Απόδειξη ${payment.receiptNumber}` : '',
  ].filter(Boolean);

  return parts.map((part, index) => ({
    id: createId('rev'),
    date,
    amount: part.amount,
    category: part.category,
    description: part.description,
    studentId: payment.athleteId,
    paymentStatus: 'paid' as const,
    subcategory: ATHLETE_INCOME_SUBCATEGORY,
    clubName: student?.clubName ?? '',
    sport: student?.sport ?? '',
    surname: student?.lastName ?? '',
    firstName: student?.firstName ?? '',
    subscriptionPeriod: period,
    notes: noteBits.join(' · ') + (parts.length > 1 ? ` · μέρος ${index + 1}/${parts.length}` : ''),
    paymentMethod: payment.paymentMethod || 'cash',
    accountId: '',
    vatRate: 0,
    linkedTransactionId: payment.id,
  }));
}

/** Αφαιρεί / ξαναδημιουργεί έσοδα συνδεδεμένα με πληρωμή αθλητή. */
export function syncRevenuesForPaymentInData(data: AppData, paymentId: string): void {
  data.revenues = data.revenues.filter((r) => r.linkedTransactionId !== paymentId);
  const payment = (data.transactions ?? []).find((t) => t.id === paymentId);
  if (!payment || payment.type !== 'payment') return;
  data.revenues.push(...buildRevenuesForPayment(payment, data));
}

export function removeRevenuesForPaymentInData(data: AppData, paymentId: string): void {
  data.revenues = data.revenues.filter((r) => r.linkedTransactionId !== paymentId);
}

export async function syncRevenuesForPayment(paymentId: string) {
  mutateData((data) => {
    syncRevenuesForPaymentInData(data, paymentId);
  });
}

export async function removeRevenuesForPayment(paymentId: string) {
  mutateData((data) => {
    removeRevenuesForPaymentInData(data, paymentId);
  });
}

/**
 * Συμπληρώνει έσοδα για υπάρχουσες πληρωμές που δεν έχουν ακόμα mirror.
 * Επιστρέφει true αν άλλαξε κάτι.
 */
export function backfillAthletePaymentRevenues(data: AppData): boolean {
  if (!data.transactions) data.transactions = [];
  if (!data.revenues) data.revenues = [];

  const linked = new Set(
    data.revenues.map((r) => r.linkedTransactionId).filter((id): id is string => Boolean(id)),
  );
  const payments = data.transactions.filter((t) => t.type === 'payment');
  let changed = false;

  for (const payment of payments) {
    if (linked.has(payment.id)) continue;
    const created = buildRevenuesForPayment(payment, data);
    data.revenues.push(...created);
    linked.add(payment.id);
    changed = true;
  }

  return changed;
}

/** Καλείται από Finance/Έσοδα ώστε παλιές πληρωμές να εμφανιστούν στα έσοδα. */
export function ensureAthletePaymentRevenuesSynced(): void {
  const data = getData();
  const payments = data.transactions ?? [];
  const needs = payments.some(
    (t) =>
      t.type === 'payment' &&
      !data.revenues.some((r) => r.linkedTransactionId === t.id),
  );
  if (!needs) return;
  mutateData((draft) => {
    backfillAthletePaymentRevenues(draft);
  });
}
