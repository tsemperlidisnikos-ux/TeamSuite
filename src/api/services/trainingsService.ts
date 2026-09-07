import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { trainingSchema, type TrainingInput } from '../../schemas';
import { slotConflictsWithClubOccupancy } from '../../shared/facilityRentalAvailability';
import type { AppData, Training } from '../../types';
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
  location: string;
  notes: string;
  classId: string | null;
}) {
  await syncRemoteRentalBookings();
  return apiClient(() => {
    if (!input.startDate || !input.endDate) {
      throw new Error('Ημερομηνίες έναρξης/λήξης υποχρεωτικές');
    }
    if (!input.startTime || !input.endTime) {
      throw new Error('Ώρες έναρξης/λήξης υποχρεωτικές');
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
      if (weekdays.includes(cursor.getDay())) {
        const date = localDateIso(cursor);
        const check = slotConflictsWithClubOccupancy(
          working,
          input.location,
          date,
          input.startTime,
          input.endTime,
        );
        if (!check.ok) {
          skipped.push(`${date} ${input.startTime}–${input.endTime} (${check.reason})`);
        } else {
          const training: Training = {
            id: createId('trn'),
            date,
            startTime: input.startTime,
            endTime: input.endTime,
            location: input.location,
            notes: input.notes,
            classId: input.classId,
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
    });
    void publishClubOpsSlice();
    return { deleted: ids.length };
  });
}
