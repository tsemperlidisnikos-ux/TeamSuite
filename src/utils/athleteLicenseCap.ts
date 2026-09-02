import { getClubById, getClubs, saveClubs } from '../auth/clubs';
import { resolveActiveClubId } from '../data/store';
import type { Student, StudentStatus } from '../types';

export function countActiveAthleteLicenses(
  students: Array<Pick<Student, 'status'>>,
): number {
  return students.filter((s) => s.status === 'active').length;
}

export function clubAthleteLicenseLimit(clubId?: string | null): number {
  const id = (clubId ?? resolveActiveClubId()).trim();
  const club = getClubById(id);
  const limit = Number(club?.athleteLicenseLimit);
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.floor(limit);
}

/** Κενές θέσεις ενεργών αθλητών. `null` = δεν έχει οριστεί όριο. */
export function remainingAthleteLicenseSeats(
  students: Array<Pick<Student, 'status'>>,
  clubId?: string | null,
): number | null {
  const limit = clubAthleteLicenseLimit(clubId);
  if (limit <= 0) return null;
  return Math.max(0, limit - countActiveAthleteLicenses(students));
}

export function athleteLicenseCapMessage(used: number, limit: number, extra = ''): string {
  const base =
    `Έχετε συμπληρώσει τις άδειες αθλητών (${used} / ${limit} ενεργοί). ` +
    'Ζητήστε αύξηση πακέτου από τον διαχειριστή πλατφόρμας.';
  return extra ? `${base} ${extra}` : base;
}

export function wouldConsumeAthleteLicense(
  nextStatus: StudentStatus | undefined,
  previousStatus?: StudentStatus,
): boolean {
  if (nextStatus !== 'active') return false;
  if (previousStatus === 'active') return false;
  return true;
}

export function syncClubAthleteLicenseUsed(
  students: Array<Pick<Student, 'status'>>,
  clubId?: string | null,
): void {
  const id = (clubId ?? resolveActiveClubId()).trim();
  const clubs = getClubs();
  const index = clubs.findIndex((c) => c.id === id);
  if (index < 0) return;
  const limit = Math.max(0, Math.floor(Number(clubs[index].athleteLicenseLimit) || 0));
  const active = countActiveAthleteLicenses(students);
  const nextUsed = limit > 0 ? Math.min(limit, active) : active;
  if (clubs[index].athleteLicenseUsed === nextUsed) return;
  clubs[index] = { ...clubs[index], athleteLicenseUsed: nextUsed };
  saveClubs(clubs);
  window.dispatchEvent(new CustomEvent('academyhub-clubs-updated'));
}
