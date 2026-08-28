import { apiClient } from '../apiClient';
import { getSession, isPlatformAdmin } from '../../auth/auth';
import { createId, getData, mutateData } from '../../data/repository';
import {
  documentProtocolSchema,
  type DocumentProtocolInput,
} from '../../schemas';
import type { DocumentProtocolEntry } from '../../types';
import { localDateIso, localDateTimeIso } from '../../utils/dates';

function currentUserLabel(): string {
  const session = getSession();
  if (!session) return 'Σύστημα';
  return session.fullName?.trim() || session.email || 'Χρήστης';
}

/** Μόνο διαχειριστής συλλόγου ή Platform Admin μπορούν να αλλάξουν αρ. πρωτοκόλλου. */
export function canOverrideProtocolNumber(): boolean {
  const session = getSession();
  if (!session) return false;
  return session.role === 'admin' || isPlatformAdmin();
}

function nextProtocolNumber(existing: DocumentProtocolEntry[], dateIso: string): string {
  const year = (dateIso || localDateIso()).slice(0, 4) || String(new Date().getFullYear());
  let max = 0;
  for (const row of existing) {
    const match = new RegExp(`^${year}/(\\d+)$`).exec(row.protocolNumber.trim());
    if (!match) continue;
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${year}/${String(max + 1).padStart(4, '0')}`;
}

export function peekNextProtocolNumber(dateIso = localDateIso()): string {
  return nextProtocolNumber(getData().documentProtocolEntries ?? [], dateIso);
}

function assertUniqueProtocolNumber(
  existing: DocumentProtocolEntry[],
  protocolNumber: string,
  excludeId?: string,
) {
  const normalized = protocolNumber.trim();
  const clash = existing.find(
    (row) =>
      row.id !== excludeId &&
      row.protocolNumber.trim().toLowerCase() === normalized.toLowerCase(),
  );
  if (clash) {
    throw new Error(`Ο αριθμός πρωτοκόλλου «${normalized}» χρησιμοποιείται ήδη.`);
  }
}

function resolveProtocolNumber(
  existing: DocumentProtocolEntry[],
  dateIso: string,
  requested: string | undefined,
  excludeId?: string,
): string {
  const trimmed = (requested ?? '').trim();
  if (!trimmed) {
    return nextProtocolNumber(existing, dateIso);
  }
  if (!canOverrideProtocolNumber()) {
    throw new Error(
      'Μόνο ο διαχειριστής συλλόγου ή ο Platform Admin μπορεί να αλλάξει τον αριθμό πρωτοκόλλου.',
    );
  }
  assertUniqueProtocolNumber(existing, trimmed, excludeId);
  return trimmed;
}

export async function createDocumentProtocolEntry(input: DocumentProtocolInput) {
  return apiClient(() => {
    const parsed = documentProtocolSchema.parse(input);
    const date = (parsed.date || localDateIso()).trim();
    let created: DocumentProtocolEntry | undefined;
    mutateData((data) => {
      if (!data.documentProtocolEntries) data.documentProtocolEntries = [];
      const protocolNumber = resolveProtocolNumber(
        data.documentProtocolEntries,
        date,
        parsed.protocolNumber,
      );
      created = {
        id: createId('proto'),
        protocolNumber,
        direction: parsed.direction,
        sport: parsed.sport.trim(),
        date,
        subject: parsed.subject.trim(),
        party: parsed.party.trim(),
        notes: parsed.notes.trim(),
        fileName: parsed.fileName ?? null,
        fileDataUrl: parsed.fileDataUrl ?? null,
        status: parsed.status ?? 'recorded',
        createdAt: localDateTimeIso(),
        createdByName: currentUserLabel(),
      };
      data.documentProtocolEntries.unshift(created);
    });
    if (!created) throw new Error('Αποτυχία καταχώρησης');
    return created;
  });
}

export async function updateDocumentProtocolEntry(
  id: string,
  input: DocumentProtocolInput,
) {
  return apiClient(() => {
    const parsed = documentProtocolSchema.parse(input);
    let updated: DocumentProtocolEntry | undefined;
    mutateData((data) => {
      if (!data.documentProtocolEntries) data.documentProtocolEntries = [];
      const index = data.documentProtocolEntries.findIndex((row) => row.id === id);
      if (index < 0) throw new Error('Η καταχώρηση δεν βρέθηκε');
      const prev = data.documentProtocolEntries[index];
      const date = (parsed.date || prev.date || localDateIso()).trim();
      const requested = (parsed.protocolNumber ?? '').trim();
      let protocolNumber = prev.protocolNumber;
      if (requested && requested !== prev.protocolNumber.trim()) {
        protocolNumber = resolveProtocolNumber(
          data.documentProtocolEntries,
          date,
          requested,
          id,
        );
      } else if (!requested && canOverrideProtocolNumber()) {
        // Κενό πεδίο από privileged χρήστη → κράτα το υπάρχον
        protocolNumber = prev.protocolNumber;
      }
      updated = {
        ...prev,
        protocolNumber,
        direction: parsed.direction,
        sport: parsed.sport.trim(),
        date,
        subject: parsed.subject.trim(),
        party: parsed.party.trim(),
        notes: parsed.notes.trim(),
        fileName: parsed.fileName ?? null,
        fileDataUrl: parsed.fileDataUrl ?? prev.fileDataUrl ?? null,
        status: parsed.status ?? prev.status,
      };
      data.documentProtocolEntries[index] = updated;
    });
    if (!updated) throw new Error('Η καταχώρηση δεν βρέθηκε');
    return updated;
  });
}

export async function deleteDocumentProtocolEntry(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.documentProtocolEntries = (data.documentProtocolEntries ?? []).filter(
        (row) => row.id !== id,
      );
    });
    return true;
  });
}

export function listDocumentProtocolEntries(): DocumentProtocolEntry[] {
  return [...(getData().documentProtocolEntries ?? [])];
}
