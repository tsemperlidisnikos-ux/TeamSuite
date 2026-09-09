import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { publishClubOpsSlice } from './clubOpsSyncService';
import type { AbsenceReason, AttendanceRecord } from '../../types';

export function absenceReasonLabel(reason?: AbsenceReason | null): string {
  if (reason === 'sick') return 'Ασθένεια';
  if (reason === 'leave') return 'Άδεια';
  return '';
}

export async function getAttendance() {
  return apiClient(() => getData().attendance);
}

export async function upsertAttendance(input: {
  classId: string;
  studentId: string;
  date: string;
  present: boolean;
  notes?: string;
  absenceReason?: AbsenceReason | null;
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
        if (input.notes !== undefined) existing.notes = input.notes;
        if (input.present) {
          existing.absenceReason = null;
        } else if (input.absenceReason !== undefined) {
          existing.absenceReason = input.absenceReason;
        }
        existing.updatedAt = Date.now();
        record = existing;
      } else {
        record = {
          id: createId('att'),
          classId: input.classId,
          studentId: input.studentId,
          date: input.date,
          present: input.present,
          notes: input.notes,
          absenceReason: input.present ? null : (input.absenceReason ?? null),
          updatedAt: Date.now(),
        };
        data.attendance.push(record);
      }
    });
    void publishClubOpsSlice();
    return record!;
  });
}
