import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import type { AttendanceRecord } from '../../types';

export async function getAttendance() {
  return apiClient(() => getData().attendance);
}

export async function upsertAttendance(input: {
  classId: string;
  studentId: string;
  date: string;
  present: boolean;
  notes?: string;
}) {
  return apiClient(() => {
    let record: AttendanceRecord | undefined;
    mutateData((data) => {
      const existing = data.attendance.find(
        (a) =>
          a.classId === input.classId &&
          a.studentId === input.studentId &&
          a.date === input.date,
      );
      if (existing) {
        existing.present = input.present;
        existing.notes = input.notes;
        record = existing;
      } else {
        record = {
          id: createId('att'),
          ...input,
        };
        data.attendance.push(record);
      }
    });
    return record!;
  });
}
