import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { rememberDeletedId, rememberDeletedIds } from '../../data/financeSyncMerge';
import { trainingSchema, type TrainingInput } from '../../schemas';
import { slotConflictsWithClubOccupancy } from '../../shared/facilityRentalAvailability';
import type { AppData, Training } from '../../types';
import { getActiveSeason } from '../../utils/clubSeasons';
import { localDateIso } from '../../utils/dates';
import { publishClubOpsSlice } from './clubOpsSyncService';
import { syncRemoteRentalBookings } from './rentalBookingsService';

function assertNoFacilityConflict(
  data: AppData,
  location: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeTrainingIds?: string[],
) {
  const check = slotConflictsWithClubOccupancy(data, location, date, startTime, endTime, {
    excludeTrainingIds,
  });
  if (!check.ok) throw new Error(check.reason);
}

export async function getTrainings() {
  return apiClient(() => getData().trainings ?? []);
}

export async function createTraining(input: TrainingInput) {
  await syncRemoteRentalBookings();
  return apiClient(() => {
    const parsed = trainingSchema.parse(input);
    assertNoFacilityConflict(getData(), parsed.location, parsed.date, parsed.startTime, parsed.endTime);
    const training: Training = {
      ...parsed,
      id: createId('trn'),
      classId: parsed.classId ?? null,
      updatedAt: Date.now(),
    };
    mutateData((data) => {
      if (!data.trainings) data.trainings = [];
      data.trainings.push(training);
    });
    void publishClubOpsSlice();
    return training;
  });
}

export async function createRecurringTrainings(input: {
  weekday?: number;
  weekdays?: number[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  weekdayTimes?: Record<number, { startTime?: string; endTime?: string; location?: string }>;
  location: string;
  notes: string;
  classId: string | null;
}) {
  await syncRemoteRentalBookings();
  return apiClient(() => {
    if (!input.startDate || !input.endDate) {
      throw new Error('Ημερομηνίες έναρξης/λήξης υποχρεωτικές');
    }

    const weekdays = [
      ...new Set(
        (input.weekdays?.length ? input.weekdays : input.weekday != null ? [input.weekday] : []).map(
          (d) => Number(d),
        ),
      ),
    ].filter((d) => d >= 0 && d <= 6);
    if (weekdays.length === 0) {
      throw new Error('Επιλέξτε τουλάχιστον μία ημέρα');
    }

    const timesFor = (day: number) => {
      const override = input.weekdayTimes?.[day];
      return {
        startTime: (override?.startTime || input.startTime || '').trim(),
        endTime: (override?.endTime || input.endTime || '').trim(),
        location: (override?.location || input.location || '').trim(),
      };
    };
    for (const day of weekdays) {
      const times = timesFor(day);
      if (!times.startTime || !times.endTime) {
        throw new Error('Ώρες έναρξης/λήξης υποχρεωτικές για κάθε επιλεγμένη ημέρα');
      }
    }

    const start = new Date(`${input.startDate}T12:00:00`);
    const end = new Date(`${input.endDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new Error('Μη έγκυρο διάστημα ημερομηνιών');
    }

    const created: Training[] = [];
    const skipped: string[] = [];
    const working = structuredClone(getData()) as AppData;
    if (!working.trainings) working.trainings = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const day = cursor.getDay();
      if (weekdays.includes(day)) {
        const date = localDateIso(cursor);
        const times = timesFor(day);
        const check = slotConflictsWithClubOccupancy(
          working,
          times.location,
          date,
          times.startTime,
          times.endTime,
        );
        if (!check.ok) {
          skipped.push(`${date} ${times.startTime}–${times.endTime} (${check.reason})`);
        } else {
          const training: Training = {
            id: createId('trn'),
            date,
            startTime: times.startTime,
            endTime: times.endTime,
            location: times.location,
            notes: input.notes,
            classId: input.classId,
            updatedAt: Date.now(),
          };
          created.push(training);
          working.trainings.push(training);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (created.length === 0) {
      throw new Error(
        skipped[0] ?? 'Δεν βρέθηκαν ημερομηνίες για τις επιλεγμένες ημέρες',
      );
    }

    mutateData((data) => {
      if (!data.trainings) data.trainings = [];
      data.trainings.push(...created);
    });
    void publishClubOpsSlice();
    return { count: created.length, items: created, skipped };
  });
}

function addCalendarDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateIso(d);
}

function trainingAlreadyExists(
  data: AppData,
  input: { classId: string | null; date: string; startTime: string; location: string },
): boolean {
  return (data.trainings ?? []).some(
    (row) =>
      row.date === input.date &&
      row.startTime === input.startTime &&
      (row.location || '') === (input.location || '') &&
      (row.classId || null) === (input.classId || null),
  );
}

/** Δημιουργεί προπονήσεις ημερολογίου από το εβδομαδιαίο πρόγραμμα (πρότυπα), χωρίς να τα συγχωνεύει. */
export async function generateTrainingsFromSchedule(input?: {
  startDate?: string;
  endDate?: string;
  classIds?: string[];
}) {
  await syncRemoteRentalBookings();
  return apiClient(() => {
    const data = getData();
    const today = localDateIso();
    const season = getActiveSeason(data.clubSeasons, today);
    const startDate =
      (input?.startDate || '').trim() ||
      (season?.startDate && season.startDate > today ? season.startDate : today);
    const endDate =
      (input?.endDate || '').trim() || season?.endDate || addCalendarDays(today, 84);
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new Error('Μη έγκυρο διάστημα ημερομηνιών (ορίστε ενεργή σεζόν ή ημερομηνίες).');
    }

    const classFilter = new Set((input?.classIds ?? []).filter(Boolean));
    const slots = (data.schedule ?? []).filter((slot) => {
      if (!slot.classId || !slot.startTime || !slot.endTime || !slot.location) return false;
      if (classFilter.size > 0 && !classFilter.has(slot.classId)) return false;
      return true;
    });
    if (slots.length === 0) {
      throw new Error('Δεν υπάρχουν ώρες στο πρόγραμμα για δημιουργία προπονήσεων.');
    }

    const created: Training[] = [];
    const skipped: string[] = [];
    const working = structuredClone(data) as AppData;
    if (!working.trainings) working.trainings = [];

    const cursor = new Date(start);
    while (cursor <= end) {
      const date = localDateIso(cursor);
      if (date >= today) {
        const day = cursor.getDay();
        for (const slot of slots) {
          if (slot.dayOfWeek !== day) continue;
          if (
            trainingAlreadyExists(working, {
              classId: slot.classId,
              date,
              startTime: slot.startTime,
              location: slot.location,
            })
          ) {
            skipped.push(`${date} ${slot.startTime} — υπάρχει ήδη`);
            continue;
          }
          const check = slotConflictsWithClubOccupancy(
            working,
            slot.location,
            date,
            slot.startTime,
            slot.endTime,
          );
          if (!check.ok) {
            skipped.push(`${date} ${slot.startTime}–${slot.endTime} (${check.reason})`);
            continue;
          }
          const training: Training = {
            id: createId('trn'),
            date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            location: slot.location,
            notes: '',
            classId: slot.classId,
            updatedAt: Date.now(),
          };
          created.push(training);
          working.trainings.push(training);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (created.length === 0) {
      throw new Error(
        skipped[0] ?? 'Δεν δημιουργήθηκαν προπονήσεις (ήδη υπάρχουν ή υπάρχουν συγκρούσεις).',
      );
    }

    mutateData((store) => {
      if (!store.trainings) store.trainings = [];
      store.trainings.push(...created);
    });
    void publishClubOpsSlice();
    return { count: created.length, skipped, startDate, endDate };
  });
}

export async function updateTraining(id: string, input: TrainingInput) {
  await syncRemoteRentalBookings();
  return apiClient(() => {
    const parsed = trainingSchema.parse(input);
    assertNoFacilityConflict(
      getData(),
      parsed.location,
      parsed.date,
      parsed.startTime,
      parsed.endTime,
      [id],
    );
    let updated: Training | undefined;
    mutateData((data) => {
      if (!data.trainings) data.trainings = [];
      const index = data.trainings.findIndex((t) => t.id === id);
      if (index === -1) throw new Error('Η προπόνηση δεν βρέθηκε');
      updated = {
        ...data.trainings[index],
        ...parsed,
        classId: parsed.classId ?? null,
      };
      updated.updatedAt = Date.now();
      data.trainings[index] = updated;
    });
    void publishClubOpsSlice();
    return updated!;
  });
}

export async function deleteTraining(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.trainings = (data.trainings ?? []).filter((t) => t.id !== id);
      data.deletedTrainingIds = rememberDeletedId(data.deletedTrainingIds, id);
    });
    void publishClubOpsSlice();
    return { id };
  });
}

export async function bulkDeleteTrainings(ids: string[]) {
  return apiClient(() => {
    const idSet = new Set(ids);
    mutateData((data) => {
      data.trainings = (data.trainings ?? []).filter((t) => !idSet.has(t.id));
      data.deletedTrainingIds = rememberDeletedIds(data.deletedTrainingIds, ids);
    });
    void publishClubOpsSlice();
    return { deleted: ids.length };
  });
}

export async function bulkUpdateTrainings(
  ids: string[],
  patch: { startTime?: string; endTime?: string; location?: string },
) {
  await syncRemoteRentalBookings();
  return apiClient(() => {
    const idSet = new Set(ids.filter(Boolean));
    if (idSet.size === 0) throw new Error('Δεν επιλέχθηκαν προπονήσεις');
    const startTime = patch.startTime?.trim() ?? '';
    const endTime = patch.endTime?.trim() ?? '';
    const location = patch.location?.trim() ?? '';
    if (!startTime && !endTime && !location) {
      throw new Error('Συμπληρώστε ώρα ή γήπεδο για αλλαγή');
    }

    const working = structuredClone(getData()) as AppData;
    if (!working.trainings) working.trainings = [];
    const updated: Training[] = [];
    const skipped: string[] = [];

    for (const training of working.trainings) {
      if (!idSet.has(training.id)) continue;
      const next: Training = {
        ...training,
        startTime: startTime || training.startTime,
        endTime: endTime || training.endTime,
        location: location || training.location,
        updatedAt: Date.now(),
      };
      const check = slotConflictsWithClubOccupancy(
        working,
        next.location,
        next.date,
        next.startTime,
        next.endTime,
        { excludeTrainingIds: [training.id] },
      );
      if (!check.ok) {
        skipped.push(`${next.date} ${next.startTime}–${next.endTime} (${check.reason})`);
        continue;
      }
      const idx = working.trainings.findIndex((row) => row.id === training.id);
      if (idx >= 0) working.trainings[idx] = next;
      updated.push(next);
    }

    if (updated.length === 0) {
      throw new Error(skipped[0] ?? 'Δεν ενημερώθηκε καμία προπόνηση');
    }

    const byId = new Map(updated.map((row) => [row.id, row]));
    mutateData((data) => {
      data.trainings = (data.trainings ?? []).map((row) => byId.get(row.id) ?? row);
    });
    void publishClubOpsSlice();
    return { updated: updated.length, skipped };
  });
}
