import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { budgetSchema, type BudgetInput } from '../../schemas';
import type { BudgetLine } from '../../types';

export async function getBudgets() {
  return apiClient(() => getData().budgets ?? []);
}

export async function createBudget(input: BudgetInput) {
  return apiClient(() => {
    const parsed = budgetSchema.parse(input);
    const line: BudgetLine = {
      ...parsed,
      id: createId('budget'),
    };
    mutateData((data) => {
      if (!data.budgets) data.budgets = [];
      data.budgets.push(line);
    });
    return line;
  });
}

export async function updateBudget(id: string, input: BudgetInput) {
  return apiClient(() => {
    const parsed = budgetSchema.parse(input);
    let updated: BudgetLine | undefined;
    mutateData((data) => {
      if (!data.budgets) data.budgets = [];
      const index = data.budgets.findIndex((b) => b.id === id);
      if (index === -1) throw new Error('Ο προϋπολογισμός δεν βρέθηκε');
      updated = { ...data.budgets[index], ...parsed };
      data.budgets[index] = updated;
    });
    return updated!;
  });
}

export async function deleteBudget(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.budgets = (data.budgets ?? []).filter((b) => b.id !== id);
    });
    return { id };
  });
}
