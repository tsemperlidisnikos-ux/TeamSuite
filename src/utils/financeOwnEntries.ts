import { getSession, getUserById } from '../auth/auth';

export type FinanceEntryOwner = {
  createdByUserId?: string | null;
  createdByEmail?: string | null;
};

/** Διαχειριστής συλλόγου / πλατφόρμας βλέπει όλα. */
export function sessionSeesOnlyOwnFinance(): boolean {
  const session = getSession();
  if (!session) return false;
  if (session.role === 'platform_admin' || session.role === 'admin') return false;
  const user = getUserById(session.id);
  return Boolean(user?.financeOwnEntriesOnly);
}

export function currentFinanceActor(): { userId: string; email: string } | null {
  const session = getSession();
  const email = String(session?.email ?? '')
    .trim()
    .toLowerCase();
  if (!session?.id || !email.includes('@')) return null;
  return { userId: session.id, email };
}

export function isOwnFinanceEntry(entry: FinanceEntryOwner): boolean {
  const actor = currentFinanceActor();
  if (!actor) return false;
  if (entry.createdByUserId && entry.createdByUserId === actor.userId) return true;
  const email = String(entry.createdByEmail ?? '')
    .trim()
    .toLowerCase();
  return Boolean(email && email === actor.email);
}

export function filterOwnFinanceEntries<T extends FinanceEntryOwner>(list: T[] | undefined | null): T[] {
  const rows = list ?? [];
  if (!sessionSeesOnlyOwnFinance()) return rows;
  return rows.filter((row) => isOwnFinanceEntry(row));
}

export function assertCanMutateFinanceEntry(entry: FinanceEntryOwner | undefined): void {
  if (!sessionSeesOnlyOwnFinance()) return;
  if (!entry || !isOwnFinanceEntry(entry)) {
    throw new Error('Δεν μπορείτε να επεξεργαστείτε καταχώρηση άλλου χρήστη.');
  }
}
