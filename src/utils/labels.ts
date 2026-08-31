import type {
  ExpenseCategory,
  PaymentStatus,
  RevenueCategory,
  StudentStatus,
} from '../types';

export const dayNames = [
  'Κυριακή',
  'Δευτέρα',
  'Τρίτη',
  'Τετάρτη',
  'Πέμπτη',
  'Παρασκευή',
  'Σάββατο',
];

export const studentStatusLabels: Record<StudentStatus, string> = {
  active: 'Ενεργός',
  inactive: 'Ανενεργός',
  trial: 'Δοκιμαστικός',
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  paid: 'Πληρωμένο',
  pending: 'Εκκρεμές',
  overdue: 'Ληξιπρόθεσμο',
};

export const revenueCategoryLabels: Record<RevenueCategory, string> = {
  tuition: 'Δίδακτρα',
  registration: 'Εγγραφή',
  merchandise: 'Προϊόντα',
  events: 'Εκδηλώσεις',
  other: 'Άλλο',
};

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  rent: 'Ενοίκιο',
  salaries: 'Μισθοί',
  equipment: 'Εξοπλισμός',
  utilities: 'Κοινόχρηστα',
  marketing: 'Marketing',
  other: 'Άλλο',
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('el-GR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

/** Περίοδος YYYY-MM → MM-YYYY (π.χ. 2026-09 → 09-2026). */
export function formatMonthYearNumeric(monthKey: string): string {
  const trimmed = String(monthKey ?? '').trim();
  if (!trimmed) return '';
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (iso) return `${iso[2].padStart(2, '0')}-${iso[1]}`;
  const swapped = trimmed.match(/^(\d{1,2})-(\d{4})$/);
  if (swapped) return `${swapped[1].padStart(2, '0')}-${swapped[2]}`;
  return trimmed;
}
