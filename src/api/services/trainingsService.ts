import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { trainingSchema, type TrainingInput } from '../../schemas';
import { slotConflictsWithRentals } from '../../shared/facilityRentalAvailability';
import type { AppData, Training } from '../../types';
import { localDateIso } from '../../utils/dates';
import { syncRemoteRentalBookings } from './rentalBookingsService';

function assertNoRentalConflict(
  data: AppData,
  location: string,
  date: string,
  startTime: string,
  endTime: string,
) {
  const check = slotConflictsWithRentals(data, location, date, startTime, endTime);
  if (!check.ok) throw new Error(check.reason);
}

export async function getTrainings() {
  return apiClient(() => getData().trainings ?? []);
}

export async function createTraining(input: TrainingInput) {
  await syncRemoteRentalBookings();
  return apiClient(() => {
    const parsed = trainingSchema.parse(input);
    assertNoRentalConflict(getData(), parsed.location, parsed.date, parsed.startTime, parsed.endTime);
    const training: Training = {
      ...parsed,
      id: createId('trn'),
      classId: parsed.classId ?? null,
    };
    mutateData((data) => {
      if (!data.trainings) data.trainings = [];
      data.trainings.push(training);
    });
    return training;
  });
}

export async function createRecurringTrainings(input: {
  weekday: number;
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

    const start = new Date(`${input.startDate}T12:00:00`);
    const end = new Date(`${input.endDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new Error('Μη έγκυρο διάστημα ημερομηνιών');
    }

    const created: Training[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      if (cursor.getDay() === input.weekday) {
        const date = localDateIso(cursor);
        assertNoRentalConflict(getData(), input.location, date, input.startTime, input.endTime);
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
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (created.length === 0) {
      throw new Error('Δεν βρέθηκαν ημερομηνίες για την επιλεγμένη ημέρα');
    }

    mutateData((data) => {
      if (!data.trainings) data.trainings = [];
      data.trainings.push(...created);
    });
    return { count: created.length, items: created };
  });
}

export async function updateTraining(id: string, input: TrainingInput) {
  await syncRemoteRentalBookings();
  return apiClient(() => {
    const parsed = trainingSchema.parse(input);
    assertNoRentalConflict(getData(), parsed.location, parsed.date, parsed.startTime, parsed.endTime);
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
    return updated!;
  });
}

export async function deleteTraining(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.trainings = (data.trainings ?? []).filter((t) => t.id !== id);
    });
    return { id };
  });
}

export async function bulkDeleteTrainings(ids: string[]) {
  return apiClient(() => {
    const idSet = new Set(ids);
    mutateData((data) => {
      data.trainings = (data.trainings ?? []).filter((t) => !idSet.has(t.id));
    });
    return { deleted: ids.length };
  });
}
