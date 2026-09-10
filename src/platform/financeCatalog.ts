import {
  DEFAULT_EXPENSE_DESCRIPTIONS,
  DEFAULT_INCOME_DESCRIPTIONS,
  EXPENSE_SUBCATEGORIES,
  INCOME_SUBCATEGORIES,
} from '../shared/financeCategories';
import { loadPlatformConfig } from './platformConfig';

const RENTAL_INCOME = 'ΕΝΟΙΚΙΑΣΗ ΓΗΠΕΔΟΥ';

export function getConfiguredIncomeCategories(): string[] {
  const categories = loadPlatformConfig().incomeCategories;
  const base = categories.length > 0 ? [...categories] : [...INCOME_SUBCATEGORIES];
  if (!base.includes(RENTAL_INCOME)) {
    const after = base.indexOf('ΠΑΡΟΧΕΣ');
    if (after >= 0) base.splice(after + 1, 0, RENTAL_INCOME);
    else base.push(RENTAL_INCOME);
  }
  return base;
}

export function getConfiguredExpenseCategories(): string[] {
  const categories = loadPlatformConfig().expenseCategories;
  return categories.length > 0 ? categories : [...EXPENSE_SUBCATEGORIES];
}

export function getConfiguredIncomeDescriptions(subcategory: string): string[] {
  const config = loadPlatformConfig();
  const fromConfig = config.incomeDescriptions[subcategory];
  if (fromConfig && fromConfig.length > 0) return [...fromConfig];
  const fallback = (DEFAULT_INCOME_DESCRIPTIONS as Record<string, readonly string[]>)[subcategory];
  return fallback ? [...fallback] : [];
}

export function getConfiguredExpenseDescriptions(subcategory: string): string[] {
  const config = loadPlatformConfig();
  const fromConfig = config.expenseDescriptions[subcategory];
  if (fromConfig && fromConfig.length > 0) return [...fromConfig];
  const fallback = (DEFAULT_EXPENSE_DESCRIPTIONS as Record<string, readonly string[]>)[subcategory];
  return fallback ? [...fallback] : [];
}
