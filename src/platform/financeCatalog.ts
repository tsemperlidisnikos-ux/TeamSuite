import {
  DEFAULT_EXPENSE_DESCRIPTIONS,
  DEFAULT_INCOME_DESCRIPTIONS,
  EXPENSE_SUBCATEGORIES,
  INCOME_SUBCATEGORIES,
} from '../shared/financeCategories';
import { loadPlatformConfig } from './platformConfig';

export function getConfiguredIncomeCategories(): string[] {
  const categories = loadPlatformConfig().incomeCategories;
  return categories.length > 0 ? categories : [...INCOME_SUBCATEGORIES];
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
