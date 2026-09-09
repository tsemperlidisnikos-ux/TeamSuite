import type { AppData } from '../types';

const ID_COLLECTION_KEYS = [
  'students',
  'coaches',
  'classes',
  'schedule',
  'attendance',
  'athleteChangeLogs',
  'revenues',
  'expenses',
  'transactions',
  'trainings',
  'staff',
  'associations',
  'facilities',
  'sports',
  'clubSeasons',
  'announcements',
  'budgets',
  'products',
  'stockMovements',
  'partnerBusinesses',
  'partnerOffers',
  'feeChargeTemplates',
  'feeReminderLogs',
  'amkaAccessLogs',
  'gdprAuditLogs',
  'photos',
  'parentLinks',
  'progressReports',
  'registrationApplications',
  'receiptNumberRanges',
  'matches',
  'rentalBookings',
  'documentProtocolEntries',
  'cashAccounts',
] as const satisfies ReadonlyArray<keyof AppData>;

function stampRow(row: unknown, fallback: number): boolean {
  if (!row || typeof row !== 'object') return false;
  const rec = row as { id?: string; updatedAt?: number; createdAt?: string };
  if (!rec.id) return false;
  if (Number(rec.updatedAt) > 0) return false;
  const fromCreated = rec.createdAt ? Date.parse(String(rec.createdAt)) : NaN;
  rec.updatedAt = Number.isFinite(fromCreated) ? fromCreated : fallback;
  return true;
}

/** Παλιές εγγραφές χωρίς updatedAt παίρνουν σφραγίδα ώστε το merge δύο συσκευών να μην είναι τυφλό. */
export function stampMissingUpdatedAt(data: AppData): boolean {
  const fallback = Number(data.localWrittenAt) || Date.now();
  let changed = false;
  for (const key of ID_COLLECTION_KEYS) {
    const rows = data[key];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (stampRow(row, fallback)) changed = true;
    }
  }
  return changed;
}
