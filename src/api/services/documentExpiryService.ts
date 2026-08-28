import { localDateIso } from '../../utils/dates';
import type { Student } from '../../types';
import { getData } from '../../data/repository';

export type ExpiryKind = 'healthCard' | 'consent';

export type DocumentExpiryRow = {
  athleteId: string;
  athleteName: string;
  kind: ExpiryKind;
  expiresAt: string;
  daysLeft: number;
  status: 'expired' | 'soon' | 'ok';
};

function daysUntil(dateIso: string, today = localDateIso()): number {
  const a = new Date(`${today}T12:00:00`);
  const b = new Date(`${dateIso}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function deriveHealthCardStatus(expiresAt?: string | null): string {
  if (!expiresAt) return 'Όχι';
  const days = daysUntil(expiresAt);
  if (days < 0) return 'Ληγμένη';
  return 'Έγκυρη';
}

export function listDocumentExpiries(options?: {
  withinDays?: number;
  includeOk?: boolean;
}): DocumentExpiryRow[] {
  const withinDays = options?.withinDays ?? 45;
  const includeOk = options?.includeOk ?? false;
  const rows: DocumentExpiryRow[] = [];

  for (const student of getData().students) {
    if (student.status === 'inactive') continue;
    const name = `${student.lastName} ${student.firstName}`.trim();
    pushExpiry(rows, student, name, 'healthCard', student.healthCardExpires, withinDays, includeOk);
    pushExpiry(rows, student, name, 'consent', student.consentExpires, withinDays, includeOk);
  }

  return rows.sort((a, b) => a.daysLeft - b.daysLeft);
}

function pushExpiry(
  rows: DocumentExpiryRow[],
  _student: Student,
  athleteName: string,
  kind: ExpiryKind,
  expiresAt: string | undefined,
  withinDays: number,
  includeOk: boolean,
) {
  const value = (expiresAt ?? '').trim();
  if (!value) return;
  const daysLeft = daysUntil(value);
  const status: DocumentExpiryRow['status'] =
    daysLeft < 0 ? 'expired' : daysLeft <= withinDays ? 'soon' : 'ok';
  if (!includeOk && status === 'ok') return;
  rows.push({
    athleteId: _student.id,
    athleteName,
    kind,
    expiresAt: value,
    daysLeft,
    status,
  });
}

export function expiryKindLabel(kind: ExpiryKind): string {
  return kind === 'healthCard' ? 'Ιατρική κάρτα' : 'Συναίνεση / GDPR';
}
