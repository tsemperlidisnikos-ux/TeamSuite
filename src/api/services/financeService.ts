import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import {
  expenseSchema,
  revenueSchema,
  type ExpenseInput,
  type RevenueInput,
} from '../../schemas';
import type { Expense, Revenue } from '../../types';
import { paymentMethodLabel } from '../../shared/paymentMethods';
import { ensureAthletePaymentRevenuesSynced } from './athletePaymentRevenueBridge';
import { assertFinanceMonthOpen } from './financePeriodService';
import { ensureLegacyPaymentsMatched } from './paymentMatchingService';

export async function getRevenues() {
  return apiClient(() => {
    ensureLegacyPaymentsMatched();
    ensureAthletePaymentRevenuesSynced();
    return getData().revenues;
  });
}

export async function createRevenue(input: RevenueInput) {
  return apiClient(() => {
    const parsed = revenueSchema.parse(input);
    assertFinanceMonthOpen(parsed.date);
    const revenue: Revenue = {
      ...parsed,
      id: createId('rev'),
    };
    mutateData((data) => {
      data.revenues.push(revenue);
    });
    return revenue;
  });
}

export async function updateRevenue(id: string, input: RevenueInput) {
  return apiClient(() => {
    const parsed = revenueSchema.parse(input);
    assertFinanceMonthOpen(parsed.date);
    let updated: Revenue | undefined;
    mutateData((data) => {
      const index = data.revenues.findIndex((r) => r.id === id);
      if (index === -1) throw new Error('Η είσπραξη δεν βρέθηκε');
      assertFinanceMonthOpen(data.revenues[index].date);
      updated = { ...data.revenues[index], ...parsed };
      data.revenues[index] = updated;
    });
    return updated!;
  });
}

export async function deleteRevenue(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      const existing = data.revenues.find((r) => r.id === id);
      if (existing) assertFinanceMonthOpen(existing.date);
      data.revenues = data.revenues.filter((r) => r.id !== id);
    });
    return { id };
  });
}

export async function getExpenses() {
  return apiClient(() => getData().expenses);
}

export async function createExpense(input: ExpenseInput) {
  return apiClient(() => {
    const parsed = expenseSchema.parse(input);
    assertFinanceMonthOpen(parsed.date);
    const expense: Expense = {
      ...parsed,
      id: createId('exp'),
    };
    mutateData((data) => {
      data.expenses.push(expense);
    });
    return expense;
  });
}

export async function updateExpense(id: string, input: ExpenseInput) {
  return apiClient(() => {
    const parsed = expenseSchema.parse(input);
    assertFinanceMonthOpen(parsed.date);
    let updated: Expense | undefined;
    mutateData((data) => {
      const index = data.expenses.findIndex((e) => e.id === id);
      if (index === -1) throw new Error('Η δαπάνη δεν βρέθηκε');
      assertFinanceMonthOpen(data.expenses[index].date);
      updated = { ...data.expenses[index], ...parsed };
      data.expenses[index] = updated;
    });
    return updated!;
  });
}

export async function deleteExpense(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      const existing = data.expenses.find((e) => e.id === id);
      if (existing) assertFinanceMonthOpen(existing.date);
      data.expenses = data.expenses.filter((e) => e.id !== id);
    });
    return { id };
  });
}

export async function getFinanceSummary() {
  return apiClient(() => {
    ensureLegacyPaymentsMatched();
    ensureAthletePaymentRevenuesSynced();
    const { revenues, expenses, students, coaches, classes, cashAccounts } = getData();
    const paidRevenues = revenues.filter((r) => r.paymentStatus === 'paid');
    const totalRevenue = paidRevenues.reduce((sum, r) => sum + r.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const pending = revenues
      .filter((r) => r.paymentStatus === 'pending' || r.paymentStatus === 'overdue')
      .reduce((sum, r) => sum + r.amount, 0);

    const byMonth = new Map<string, { revenue: number; expense: number }>();
    for (const r of paidRevenues) {
      const key = r.date.slice(0, 7);
      const entry = byMonth.get(key) ?? { revenue: 0, expense: 0 };
      entry.revenue += r.amount;
      byMonth.set(key, entry);
    }
    for (const e of expenses) {
      const key = e.date.slice(0, 7);
      const entry = byMonth.get(key) ?? { revenue: 0, expense: 0 };
      entry.expense += e.amount;
      byMonth.set(key, entry);
    }

    const monthly = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({
        month,
        ...values,
        net: values.revenue - values.expense,
      }));

    const revenueByCategory = Object.entries(
      paidRevenues.reduce<Record<string, number>>((acc, r) => {
        acc[r.category] = (acc[r.category] ?? 0) + r.amount;
        return acc;
      }, {}),
    ).map(([category, amount]) => ({ category, amount }));

    const expenseByCategory = Object.entries(
      expenses.reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] ?? 0) + e.amount;
        return acc;
      }, {}),
    ).map(([category, amount]) => ({ category, amount }));

    const byPaymentMethod = Object.entries(
      paidRevenues.reduce<Record<string, number>>((acc, r) => {
        const key = r.paymentMethod || 'cash';
        acc[key] = (acc[key] ?? 0) + r.amount;
        return acc;
      }, {}),
    ).map(([method, amount]) => ({
      method,
      label: paymentMethodLabel(method),
      amount,
    }));

    const accounts = (cashAccounts ?? []).map((account) => {
      const income = paidRevenues
        .filter((r) => r.accountId === account.id)
        .reduce((sum, r) => sum + r.amount, 0);
      const expense = expenses
        .filter((e) => e.accountId === account.id)
        .reduce((sum, e) => sum + e.amount, 0);
      return {
        id: account.id,
        name: account.name,
        kind: account.kind,
        balance: account.openingBalance + income - expense,
      };
    });

    return {
      totalRevenue,
      totalExpenses,
      net: totalRevenue - totalExpenses,
      pending,
      activeStudents: students.filter((s) => s.status === 'active').length,
      activeCoaches: coaches.filter((c) => c.active).length,
      classCount: classes.length,
      monthly,
      revenueByCategory,
      expenseByCategory,
      byPaymentMethod,
      accounts,
    };
  });
}
