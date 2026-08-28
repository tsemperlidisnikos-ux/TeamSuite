import { apiClient } from '../apiClient';
import { getData, mutateData } from '../../data/repository';

export function isFinanceMonthClosed(dateOrMonth: string): boolean {
  const month = dateOrMonth.slice(0, 7);
  const closed = getData().closedFinanceMonths ?? [];
  return closed.includes(month);
}

export function assertFinanceMonthOpen(dateOrMonth: string): void {
  const month = dateOrMonth.slice(0, 7);
  if (isFinanceMonthClosed(month)) {
    throw new Error(`Ο μήνας ${month} είναι κλειστός. Δεν επιτρέπονται αλλαγές.`);
  }
}

export async function listClosedFinanceMonths() {
  return apiClient(() => [...(getData().closedFinanceMonths ?? [])].sort());
}

export async function closeFinanceMonth(month: string) {
  return apiClient(() => {
    const key = month.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) throw new Error('Μη έγκυρος μήνας (YYYY-MM)');
    mutateData((data) => {
      if (!data.closedFinanceMonths) data.closedFinanceMonths = [];
      if (!data.closedFinanceMonths.includes(key)) data.closedFinanceMonths.push(key);
    });
    return { month: key };
  });
}

export async function reopenFinanceMonth(month: string) {
  return apiClient(() => {
    const key = month.slice(0, 7);
    mutateData((data) => {
      data.closedFinanceMonths = (data.closedFinanceMonths ?? []).filter((m) => m !== key);
    });
    return { month: key };
  });
}
