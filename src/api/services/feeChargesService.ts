import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { resolveActiveClubId } from '../../data/store';
import { getClubById, getClubSmtp, getClubViva } from '../../auth/clubs';
import { feeChargeTemplateSchema, type FeeChargeTemplateInput } from '../../schemas';
import type {
  AthleteTransaction,
  FeeChargeTemplate,
  FeeReminderLog,
  Student,
} from '../../types';
import { localDateIso, localDateTimeIso } from '../../utils/dates';
import { normalizeSportKey } from '../../utils/sport';
import { studentInClass } from '../../utils/studentClasses';
import { studentHasSport } from '../../utils/studentSports';
import { sendClubEmail } from './emailService';

export const FEE_SEASON_MONTHS = [
  { month: 8, label: 'Αύγ' },
  { month: 9, label: 'Σεπ' },
  { month: 10, label: 'Οκτ' },
  { month: 11, label: 'Νοέ' },
  { month: 12, label: 'Δεκ' },
  { month: 1, label: 'Ιαν' },
  { month: 2, label: 'Φεβ' },
  { month: 3, label: 'Μάρ' },
  { month: 4, label: 'Απρ' },
  { month: 5, label: 'Μάι' },
  { month: 6, label: 'Ιούν' },
  { month: 7, label: 'Ιούλ' },
] as const;

export const DEFAULT_FEE_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

function seasonStartYear(season: string): number {
  const match = season.match(/(\d{4})/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

export function yearForSeasonMonth(season: string, month: number): number {
  const start = seasonStartYear(season);
  return month >= 7 ? start : start + 1;
}

export type FeeAppliesTo =
  | 'all'
  | 'monthly'
  | 'registration'
  | 'seasonTicket'
  | 'class'
  | 'customCharge';

export function getFeeAppliesToOptions(customChargeLabel?: string) {
  const label = (customChargeLabel ?? '').trim();
  const options: Array<{ value: FeeAppliesTo; label: string }> = [
    { value: 'all', label: 'Όλοι οι αθλητές' },
    { value: 'monthly', label: 'Αθλητές με χρέωση μήνα' },
  ];
  if (label) {
    options.push({ value: 'customCharge', label: `Αθλητές με ${label}` });
  }
  options.push(
    { value: 'registration', label: 'Αθλητές με χρέωση εγγραφής' },
    { value: 'seasonTicket', label: 'Αθλητές με εισιτήριο διαρκείας' },
    { value: 'class', label: 'Συγκεκριμένο τμήμα' },
  );
  return options;
}

/** @deprecated Prefer `getFeeAppliesToOptions()` for dynamic custom-charge label. */
export const FEE_APPLIES_TO_OPTIONS = getFeeAppliesToOptions();

export function feeAppliesToLabel(
  appliesTo: FeeChargeTemplate['appliesTo'],
  customChargeLabel?: string,
): string {
  if (appliesTo === 'customCharge') {
    const label = (customChargeLabel ?? '').trim();
    return label ? `Αθλητές με ${label}` : 'Αθλητές (προσαρμοσμένη χρέωση)';
  }
  return FEE_APPLIES_TO_LABELS[appliesTo] ?? 'Όλοι οι αθλητές';
}

export const FEE_APPLIES_TO_LABELS: Record<
  Exclude<FeeAppliesTo, 'customCharge'>,
  string
> = {
  all: 'Όλοι οι αθλητές',
  monthly: 'Αθλητές με χρέωση μήνα',
  registration: 'Αθλητές με χρέωση εγγραφής',
  seasonTicket: 'Αθλητές με εισιτήριο διαρκείας',
  class: 'Συγκεκριμένο τμήμα',
};

function customChargeProgramLabel(): string {
  const club = getClubById(resolveActiveClubId());
  const label = (club?.customChargeLabel ?? '').trim();
  return label ? `Πρόγραμμα ${label}` : 'Πρόγραμμα';
}

function athleteMatchesAppliesTo(
  student: Student,
  appliesTo: FeeChargeTemplate['appliesTo'],
  classId: string | null | undefined,
): boolean {
  switch (appliesTo) {
    case 'monthly':
      return student.monthlyCharge !== false;
    case 'registration':
      return Boolean(student.registrationCharge ?? (student.registrationFee ?? 0) > 0);
    case 'customCharge':
      return Boolean(student.customCharge);
    case 'seasonTicket':
      return Boolean(student.seasonTicket);
    case 'class':
      return Boolean(classId) && studentInClass(student, classId);
    case 'all':
    default:
      return true;
  }
}

function athleteMatchesSport(
  student: Student,
  sport: string,
  classSportById: Map<string, string>,
): boolean {
  if (!sport.trim()) return true;
  if (studentHasSport(student, sport)) return true;
  const ids = [
    ...(student.classIds ?? []),
    ...(student.classId ? [student.classId] : []),
  ];
  return ids.some(
    (id) =>
      normalizeSportKey(classSportById.get(id)) === normalizeSportKey(sport),
  );
}

function hasCharge(
  transactions: AthleteTransaction[],
  athleteId: string,
  month: number,
  year: number,
  commentIncludes: string,
): boolean {
  return transactions.some(
    (t) =>
      t.athleteId === athleteId &&
      t.type === 'charge' &&
      t.month === month &&
      t.year === year &&
      t.comments.includes(commentIncludes),
  );
}

export function athleteMonthlyDiscount(student: Student): number {
  if (student.subscriptionDiscount === false) return 0;
  const amount = Number(student.discountAmount) || 0;
  return amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

const DISC_TAG_RE = /\[disc:([\d.]+)\]/;

function monthlyNetAmount(base: number, student: Student): number {
  return Math.max(0, Math.round((base - athleteMonthlyDiscount(student)) * 100) / 100);
}

function withDiscTag(comments: string, discount: number): string {
  const without = comments.replace(/\s*\[disc:[\d.]+\]/g, '').trim();
  return discount > 0 ? `${without} [disc:${discount}]` : without;
}

function customProgramNeedle(): string {
  const club = getClubById(resolveActiveClubId());
  return (club?.customChargeLabel ?? '').trim();
}

function isCustomProgramCharge(comments: string): boolean {
  if (comments.includes(':custom]')) return true;
  const needle = customProgramNeedle();
  if (needle && comments.toLowerCase().includes(needle.toLowerCase())) return true;
  return false;
}

function isMonthlySubscriptionCharge(comments: string): boolean {
  if (!comments.includes(':sub]')) return false;
  if (comments.includes(':ticket]')) return false;
  if (isCustomProgramCharge(comments)) return false;
  return true;
}

function undoChargeDiscount(item: AthleteTransaction): boolean {
  const applied = Number(item.comments.match(DISC_TAG_RE)?.[1] ?? 0) || 0;
  if (applied <= 0 && !DISC_TAG_RE.test(item.comments)) return false;
  item.amount = Math.max(0, Math.round((item.amount + applied) * 100) / 100);
  item.comments = withDiscTag(item.comments, 0);
  return true;
}

/** Εφαρμόζει/ενημερώνει το μηνιαίο ποσό έκπτωσης μόνο στις χρεώσεις μηνιαίας συνδρομής. */
export function applySubscriptionDiscountToCharges(
  student: Student,
  transactions: AthleteTransaction[],
): number {
  const desired =
    student.monthlyCharge === false ? 0 : athleteMonthlyDiscount(student);
  let changed = 0;
  for (const item of transactions) {
    if (item.athleteId !== student.id || item.type !== 'charge') continue;
    if (isCustomProgramCharge(item.comments) || item.comments.includes(':ticket]')) {
      if (undoChargeDiscount(item)) changed += 1;
      continue;
    }
    if (!isMonthlySubscriptionCharge(item.comments)) continue;
    const applied = Number(item.comments.match(DISC_TAG_RE)?.[1] ?? 0) || 0;
    if (Math.abs(applied - desired) < 0.001) {
      if (desired > 0 && !DISC_TAG_RE.test(item.comments)) {
        item.comments = withDiscTag(item.comments, desired);
        changed += 1;
      }
      continue;
    }
    item.amount = Math.max(0, Math.round((item.amount + applied - desired) * 100) / 100);
    item.comments = withDiscTag(item.comments, desired);
    changed += 1;
  }
  return changed;
}

export async function syncAthleteSubscriptionDiscount(athleteId: string) {
  return apiClient(() => {
    const student = getData().students.find((item) => item.id === athleteId);
    if (!student) return { updated: 0 };
    let updated = 0;
    mutateData((store) => {
      if (!store.transactions) store.transactions = [];
      updated = applySubscriptionDiscountToCharges(student, store.transactions);
    });
    return { updated };
  });
}

export async function createFeeChargeTemplate(input: FeeChargeTemplateInput) {
  return apiClient(() => {
    const parsed = feeChargeTemplateSchema.parse(input);
    if (
      parsed.monthlyAmount <= 0 &&
      parsed.seasonTicketAmount <= 0 &&
      parsed.registrationFee <= 0 &&
      parsed.customChargeAmount <= 0
    ) {
      throw new Error('Συμπληρώστε τουλάχιστον ένα ποσό χρέωσης');
    }
    if (parsed.monthlyAmount > 0 && parsed.months.length === 0) {
      throw new Error('Επιλέξτε μήνες μηνιαίας συνδρομής');
    }
    if (parsed.seasonTicketAmount > 0 && parsed.seasonTicketMonths.length === 0) {
      throw new Error('Επιλέξτε μήνες εισιτηρίου διαρκείας');
    }
    if (parsed.appliesTo === 'class' && !parsed.classId) {
      throw new Error('Επιλέξτε τμήμα για «Συγκεκριμένο τμήμα»');
    }

    const template: FeeChargeTemplate = {
      ...parsed,
      classId: parsed.appliesTo === 'class' ? parsed.classId : null,
      autoGenerate: Boolean(parsed.autoGenerate),
      lastGeneratedAt: null,
      id: createId('feeTpl'),
      createdAt: localDateTimeIso(),
    };
    mutateData((data) => {
      if (!data.feeChargeTemplates) data.feeChargeTemplates = [];
      data.feeChargeTemplates.unshift(template);
    });
    return template;
  });
}

export async function deleteFeeChargeTemplate(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.feeChargeTemplates = (data.feeChargeTemplates ?? []).filter((t) => t.id !== id);
    });
    return { id };
  });
}

export async function generateChargesFromTemplate(templateId: string) {
  return apiClient(() => {
    const data = getData();
    const template = (data.feeChargeTemplates ?? []).find((t) => t.id === templateId);
    if (!template) throw new Error('Το πρότυπο χρέωσης δεν βρέθηκε');

    const classSportById = new Map(data.classes.map((c) => [c.id, c.sport ?? '']));
    const athletes = data.students.filter(
      (s) =>
        s.status === 'active' &&
        athleteMatchesSport(s, template.sport, classSportById) &&
        athleteMatchesAppliesTo(s, template.appliesTo ?? 'all', template.classId),
    );

    let created = 0;
    mutateData((store) => {
      if (!store.transactions) store.transactions = [];
      const existing = store.transactions;

      for (const athlete of athletes) {
        const appliesTo = template.appliesTo ?? 'all';
        const monthlyBase =
          athlete.monthlyFee > 0 ? athlete.monthlyFee : template.monthlyAmount;
        const amount = template.monthlyAmount > 0 ? template.monthlyAmount : monthlyBase;
        const chargeMonthly =
          appliesTo !== 'customCharge' &&
          appliesTo !== 'seasonTicket' &&
          athlete.monthlyCharge !== false;
        const discount = chargeMonthly ? athleteMonthlyDiscount(athlete) : 0;
        const monthlyNet = chargeMonthly ? monthlyNetAmount(amount, athlete) : amount;

        applySubscriptionDiscountToCharges(athlete, existing);

        let firstMonthly = true;
        for (const month of template.months) {
          if (!chargeMonthly || amount <= 0) break;
          const year = yearForSeasonMonth(template.season, month);
          const tag = `[fee:${template.id}:sub]`;
          if (hasCharge(existing, athlete.id, month, year, tag)) continue;

          let chargeAmount = monthlyNet;
          let comments = withDiscTag(
            `${template.typeLabel} ${template.season} ${tag}`,
            discount,
          );
          if (firstMonthly && template.registrationFee > 0) {
            const regTag = `[fee:${template.id}:reg]`;
            if (!hasCharge(existing, athlete.id, month, year, regTag)) {
              chargeAmount += template.registrationFee;
              comments = withDiscTag(
                `${template.typeLabel} + Εγγραφή ${template.season} ${tag} ${regTag}`,
                discount,
              );
            }
          }
          firstMonthly = false;

          existing.push({
            id: createId('txn'),
            athleteId: athlete.id,
            amount: chargeAmount,
            receiptNumber: '',
            type: 'charge',
            month,
            year,
            paymentMethod: '',
            comments,
            createdAt: localDateTimeIso(),
          });
          created += 1;
        }

        if (template.seasonTicketAmount > 0 && template.seasonTicketMonths.length > 0) {
          const perMonth =
            Math.round((template.seasonTicketAmount / template.seasonTicketMonths.length) * 100) /
            100;
          for (const month of template.seasonTicketMonths) {
            const year = yearForSeasonMonth(template.season, month);
            const tag = `[fee:${template.id}:ticket]`;
            if (hasCharge(existing, athlete.id, month, year, tag)) continue;
            existing.push({
              id: createId('txn'),
              athleteId: athlete.id,
              amount: perMonth,
              receiptNumber: '',
              type: 'charge',
              month,
              year,
              paymentMethod: '',
              comments: `Εισιτήριο διαρκείας ${template.season} ${tag}`,
              createdAt: localDateTimeIso(),
            });
            created += 1;
          }
        }

        const customAmount = template.customChargeAmount ?? 0;
        if (customAmount > 0 && athlete.customCharge) {
          const month = template.months[0] ?? 9;
          const year = yearForSeasonMonth(template.season, month);
          const tag = `[fee:${template.id}:custom]`;
          if (!hasCharge(existing, athlete.id, month, year, tag)) {
            existing.push({
              id: createId('txn'),
              athleteId: athlete.id,
              amount: customAmount,
              receiptNumber: '',
              type: 'charge',
              month,
              year,
              paymentMethod: '',
              comments: `${customChargeProgramLabel()} ${template.season} ${tag}`,
              createdAt: localDateTimeIso(),
            });
            created += 1;
          }
        }
      }
    });

    return { created, athletes: athletes.length };
  });
}

export function athleteBalance(
  athleteId: string,
  transactions: AthleteTransaction[],
): number {
  return transactions
    .filter((t) => t.athleteId === athleteId)
    .reduce((sum, t) => sum + (t.type === 'charge' ? t.amount : -t.amount), 0);
}

export type OpenChargeRow = {
  chargeId: string;
  athleteId: string;
  month: number;
  year: number;
  amount: number;
  remaining: number;
  comments: string;
  createdAt: string;
  periodLabel: string;
  chargeDate: string;
};

/** Ημερομηνία χρέωσης για φίλτρα σεζόν (μήνας/έτος χρέωσης, αλλιώς createdAt). */
export function chargePeriodDate(month: number, year: number, createdAt?: string): string {
  if (month >= 1 && month <= 12 && year >= 2000) {
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }
  const fromCreated = createdAt?.slice(0, 10) ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(fromCreated) ? fromCreated : '';
}

export function chargeCommentsLabel(comments: string): string {
  const cleaned = comments.replace(/\s*\[fee:[^\]]+\]/g, '').trim();
  return cleaned || 'Χρέωση αθλητή';
}

/** Συνολικές εκκρεμείς οφειλές ενεργών αθλητών (ίδιο σύνολο με Συνδρομές). */
export function clubOutstandingOwed(
  students: Student[],
  transactions: AthleteTransaction[],
): number {
  return students
    .filter((s) => s.status !== 'inactive')
    .reduce((sum, s) => sum + Math.max(0, athleteBalance(s.id, transactions)), 0);
}

const MONTH_LABELS_EL = [
  '',
  'Ιαν',
  'Φεβ',
  'Μάρ',
  'Απρ',
  'Μάι',
  'Ιούν',
  'Ιούλ',
  'Αύγ',
  'Σεπ',
  'Οκτ',
  'Νοέ',
  'Δεκ',
];

export function periodLabel(month: number, year: number): string {
  const label = MONTH_LABELS_EL[month] ?? String(month);
  return `${label} ${year}`;
}

/** Ανοιχτές χρεώσεις αθλητή (μετά από αντιστοιχισμένες + FIFO πληρωμές). */
export function listOpenCharges(athleteId: string): OpenChargeRow[] {
  const txns = (getData().transactions ?? []).filter((t) => t.athleteId === athleteId);
  const charges = txns
    .filter((t) => t.type === 'charge')
    .sort((a, b) => `${a.year}-${String(a.month).padStart(2, '0')}`.localeCompare(
      `${b.year}-${String(b.month).padStart(2, '0')}`,
    ));
  const payments = txns.filter((t) => t.type === 'payment');

  const allocated = new Map<string, number>();
  let unallocated = 0;
  for (const payment of payments) {
    if (payment.allocatesChargeId) {
      allocated.set(
        payment.allocatesChargeId,
        (allocated.get(payment.allocatesChargeId) ?? 0) + payment.amount,
      );
    } else {
      unallocated += payment.amount;
    }
  }

  const rows: OpenChargeRow[] = [];
  for (const charge of charges) {
    const paidDirect = allocated.get(charge.id) ?? 0;
    let remaining = Math.max(0, charge.amount - paidDirect);
    if (remaining > 0 && unallocated > 0) {
      const take = Math.min(remaining, unallocated);
      remaining -= take;
      unallocated -= take;
    }
    if (remaining < 0.01) continue;
    rows.push({
      chargeId: charge.id,
      athleteId,
      month: charge.month,
      year: charge.year,
      amount: charge.amount,
      remaining,
      comments: charge.comments,
      createdAt: charge.createdAt,
      periodLabel: periodLabel(charge.month, charge.year),
      chargeDate: chargePeriodDate(charge.month, charge.year, charge.createdAt),
    });
  }
  return rows;
}

export type ClubOpenChargeRow = OpenChargeRow & {
  athleteName: string;
  clubName: string;
  sport: string;
  athleteMissing: boolean;
};

/** Ανοιχτές χρεώσεις όλου του συλλόγου, μαζί με ορφανές (διαγραμμένος αθλητής). */
export function listClubOpenCharges(): ClubOpenChargeRow[] {
  const data = getData();
  const students = data.students ?? [];
  const byId = new Map(students.map((s) => [s.id, s]));
  const ids = new Set(
    (data.transactions ?? []).filter((t) => t.type === 'charge').map((t) => t.athleteId),
  );
  const rows: ClubOpenChargeRow[] = [];
  for (const athleteId of ids) {
    const student = byId.get(athleteId);
    for (const row of listOpenCharges(athleteId)) {
      rows.push({
        ...row,
        athleteName: student
          ? `${student.lastName} ${student.firstName}`.trim()
          : 'Διαγραμμένος αθλητής',
        clubName: student?.clubName ?? '',
        sport: student?.sport ?? '',
        athleteMissing: !student,
      });
    }
  }
  return rows.sort((a, b) => (b.chargeDate || '').localeCompare(a.chargeDate || ''));
}

export type DebtReminderRow = {
  athleteId: string;
  athleteName: string;
  balance: number;
  oldestChargeDate: string;
  daysOverdue: number;
  reminderDays: number;
  email: string;
};

export function listDebtReminders(): DebtReminderRow[] {
  const data = getData();
  const today = localDateIso();
  const todayMs = new Date(`${today}T12:00:00`).getTime();
  const templates = data.feeChargeTemplates ?? [];
  const defaultReminder = templates[0]?.reminderDays ?? 7;

  const rows: DebtReminderRow[] = [];
  for (const student of data.students) {
    if (student.status === 'inactive') continue;
    const txns = (data.transactions ?? []).filter((t) => t.athleteId === student.id);
    const balance = athleteBalance(student.id, txns);
    if (balance <= 0) continue;

    const charges = txns
      .filter((t) => t.type === 'charge')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const oldest = charges[0];
    if (!oldest) continue;

    const chargeDay = oldest.createdAt.slice(0, 10);
    const daysOverdue = Math.max(
      0,
      Math.floor((todayMs - new Date(`${chargeDay}T12:00:00`).getTime()) / 86_400_000),
    );
    if (daysOverdue < defaultReminder) continue;

    rows.push({
      athleteId: student.id,
      athleteName: `${student.lastName} ${student.firstName}`.trim(),
      balance,
      oldestChargeDate: chargeDay,
      daysOverdue,
      reminderDays: defaultReminder,
      email:
        student.motherEmail?.trim() ||
        student.fatherEmail?.trim() ||
        student.email?.trim() ||
        '',
    });
  }

  return rows.sort((a, b) => b.balance - a.balance);
}

/** Origin for payment CTAs in reminder emails. */
export function feePaymentAppOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://teamsuite-seven.vercel.app';
}

/** Login URL that lands parents on the portal after auth. */
export function feePaymentLoginUrl(origin = feePaymentAppOrigin()): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/login`;
}

export function buildDebtReminderEmail(input: {
  clubName: string;
  athleteName: string;
  balance: number;
  daysOverdue: number;
  payUrl: string;
  vivaEnabled: boolean;
}): { subject: string; text: string; html: string } {
  const amount = formatCurrencyLocal(input.balance);
  const payHint = input.vivaEnabled
    ? 'Μετά τη σύνδεση ως γονέας μπορείτε να πληρώσετε online με κάρτα (Viva).'
    : 'Μετά τη σύνδεση ως γονέας μπορείτε να δείτε τις οφειλές στο portal γονέα.';

  const text = [
    `Αγαπητοί γονείς,`,
    ``,
    `Υπενθυμίζουμε ότι υπάρχει οφειλή συνδρομής για τον/την ${input.athleteName}.`,
    `Ποσό: ${amount}`,
    `Ημέρες καθυστέρησης: ${input.daysOverdue}`,
    ``,
    `Για να δείτε και να τακτοποιήσετε την οφειλή:`,
    input.payUrl,
    payHint,
    ``,
    `Παρακαλούμε τακτοποιήστε την οφειλή το συντομότερο.`,
    ``,
    input.clubName,
  ].join('\n');

  const html = `
    <div style="font-family:Manrope,Segoe UI,sans-serif;line-height:1.5;color:#152033;">
      <p>Αγαπητοί γονείς,</p>
      <p>Υπενθυμίζουμε ότι υπάρχει οφειλή συνδρομής για τον/την <strong>${escapeHtml(input.athleteName)}</strong>.</p>
      <p>
        <strong>Ποσό:</strong> ${escapeHtml(amount)}<br/>
        <strong>Ημέρες καθυστέρησης:</strong> ${input.daysOverdue}
      </p>
      <p style="margin:1.25rem 0;">
        <a href="${escapeHtml(input.payUrl)}"
           style="display:inline-block;background:#2a9bb5;color:#ffffff;text-decoration:none;font-weight:700;padding:0.75rem 1.15rem;border-radius:10px;">
          Σύνδεση &amp; πληρωμή οφειλής
        </a>
      </p>
      <p style="color:#4a5d70;font-size:0.95rem;">${escapeHtml(payHint)}</p>
      <p style="color:#4a5d70;font-size:0.9rem;">Αν το κουμπί δεν ανοίγει, αντιγράψτε τον σύνδεσμο:<br/>
        <a href="${escapeHtml(input.payUrl)}">${escapeHtml(input.payUrl)}</a>
      </p>
      <p>Παρακαλούμε τακτοποιήστε την οφειλή το συντομότερο.</p>
      <p><strong>${escapeHtml(input.clubName)}</strong></p>
    </div>
  `.trim();

  return {
    subject: `Υπενθύμιση οφειλής — ${input.clubName}`,
    text,
    html,
  };
}

function formatCurrencyLocal(amount: number): string {
  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function logDebtReminder(input: {
  athleteId: string;
  amount: number;
  note?: string;
  templateId?: string;
}) {
  return apiClient(() => {
    const entry: FeeReminderLog = {
      id: createId('feeRem'),
      athleteId: input.athleteId,
      templateId: input.templateId,
      amount: input.amount,
      note: input.note ?? 'Υπενθύμιση οφειλής',
      createdAt: localDateTimeIso(),
    };
    mutateData((data) => {
      if (!data.feeReminderLogs) data.feeReminderLogs = [];
      data.feeReminderLogs.unshift(entry);
    });
    return entry;
  });
}

/**
 * Τρέχει αυτόματη δημιουργία χρεώσεων για πρότυπα με autoGenerate,
 * το πολύ μία φορά ανά ημερολογιακό μήνα ανά πρότυπο.
 */
export async function runDueFeeGenerations() {
  return apiClient(async () => {
    const monthKey = localDateIso().slice(0, 7);
    const templates = (getData().feeChargeTemplates ?? []).filter((t) => t.autoGenerate);
    let generated = 0;
    let templatesRun = 0;

    for (const template of templates) {
      const last = (template.lastGeneratedAt ?? '').slice(0, 7);
      if (last === monthKey) continue;
      const result = await generateChargesFromTemplate(template.id);
      if (!result.success) continue;
      generated += result.data?.created ?? 0;
      templatesRun += 1;
      mutateData((data) => {
        const row = data.feeChargeTemplates.find((t) => t.id === template.id);
        if (row) row.lastGeneratedAt = localDateTimeIso();
      });
    }

    return { templatesRun, generated, monthKey };
  });
}

/**
 * Αυτόματη αποστολή υπενθυμίσεων οφειλών (1 φορά / αθλητή / ημέρα).
 * Απαιτεί ενεργό SMTP συλλόγου.
 */
export async function runDueFeeReminders(clubId: string) {
  return apiClient(async () => {
    if (!clubId) {
      return { sent: 0, skipped: 0, reason: 'no-club' as const };
    }
    const smtp = getClubSmtp(clubId);
    if (!smtp.enabled) {
      return { sent: 0, skipped: 0, reason: 'smtp-disabled' as const };
    }

    const today = localDateIso();
    const logs = getData().feeReminderLogs ?? [];
    const rows = listDebtReminders().filter((row) => row.email.includes('@'));
    if (rows.length === 0) {
      return { sent: 0, skipped: 0, reason: 'none-due' as const };
    }

    const club = getClubById(clubId);
    const viva = getClubViva(clubId);
    const payUrl = feePaymentLoginUrl();
    const clubName = club?.name ?? 'TeamSuite';

    let sent = 0;
    let skipped = 0;

    for (const row of rows) {
      const alreadyToday = logs.some(
        (log) =>
          log.athleteId === row.athleteId &&
          log.createdAt.slice(0, 10) === today,
      );
      if (alreadyToday) {
        skipped += 1;
        continue;
      }

      const emailBody = buildDebtReminderEmail({
        clubName,
        athleteName: row.athleteName,
        balance: row.balance,
        daysOverdue: row.daysOverdue,
        payUrl,
        vivaEnabled: Boolean(viva.enabled),
      });

      const send = await sendClubEmail({
        clubId,
        to: row.email,
        subject: emailBody.subject,
        text: emailBody.text,
        html: emailBody.html,
      });

      if (!send.success) {
        skipped += 1;
        continue;
      }

      await logDebtReminder({
        athleteId: row.athleteId,
        amount: row.balance,
        note: `Αυτόματη υπενθύμιση email σε ${row.email} · ${formatCurrencyLocal(row.balance)}`,
      });
      sent += 1;
    }

    return { sent, skipped, reason: 'ok' as const };
  });
}
