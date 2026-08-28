import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import type { CashAccount } from '../../types';

export type CashAccountInput = {
  name: string;
  kind: CashAccount['kind'];
  openingBalance: number;
  active?: boolean;
};

export async function listCashAccounts() {
  return apiClient(() => getData().cashAccounts ?? []);
}

export async function createCashAccount(input: CashAccountInput) {
  return apiClient(() => {
    const name = input.name.trim();
    if (!name) throw new Error('Το όνομα ταμείου είναι υποχρεωτικό');
    const account: CashAccount = {
      id: createId('cash'),
      name,
      kind: input.kind,
      openingBalance: Number(input.openingBalance) || 0,
      active: input.active ?? true,
    };
    mutateData((data) => {
      if (!data.cashAccounts) data.cashAccounts = [];
      data.cashAccounts.push(account);
    });
    return account;
  });
}

export async function updateCashAccount(id: string, input: CashAccountInput) {
  return apiClient(() => {
    let updated: CashAccount | undefined;
    mutateData((data) => {
      if (!data.cashAccounts) data.cashAccounts = [];
      const index = data.cashAccounts.findIndex((a) => a.id === id);
      if (index < 0) throw new Error('Το ταμείο δεν βρέθηκε');
      updated = {
        ...data.cashAccounts[index],
        name: input.name.trim(),
        kind: input.kind,
        openingBalance: Number(input.openingBalance) || 0,
        active: input.active ?? data.cashAccounts[index].active,
      };
      data.cashAccounts[index] = updated;
    });
    return updated!;
  });
}

export async function deleteCashAccount(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.cashAccounts = (data.cashAccounts ?? []).filter((a) => a.id !== id);
    });
    return { id };
  });
}

export function getAccountBalances() {
  const data = getData();
  const accounts = data.cashAccounts ?? [];
  return accounts.map((account) => {
    const income = data.revenues
      .filter((r) => r.accountId === account.id && r.paymentStatus === 'paid')
      .reduce((sum, r) => sum + r.amount, 0);
    const expense = data.expenses
      .filter((e) => e.accountId === account.id)
      .reduce((sum, e) => sum + e.amount, 0);
    return {
      ...account,
      balance: account.openingBalance + income - expense,
      income,
      expense,
    };
  });
}
