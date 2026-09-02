import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { studentCreateSchema, studentSchema, type StudentInput } from '../../schemas';
import type { Student } from '../../types';
import { localDateIso } from '../../utils/dates';
import { normalizeStudentClasses } from '../../utils/studentClasses';
import { normalizeStudentCoaches } from '../../utils/studentCoaches';
import { normalizeStudentSports } from '../../utils/studentSports';
import { applySubscriptionDiscountToCharges } from './feeChargesService';
import { stripJoinFormSnapshotForStudent } from '../../utils/publicJoinFormSnapshots';

export async function getStudents() {
  return apiClient(() => getData().students);
}

export async function createStudent(input: StudentInput) {
  return apiClient(async () => {
    const parsed = studentCreateSchema.parse(input);
    const classes = normalizeStudentClasses(parsed.classIds, parsed.classId);
    const sports = normalizeStudentSports(parsed.sports, parsed.sport);
    const coaches = normalizeStudentCoaches(parsed.coachNames, parsed.coachName);
    const student: Student = {
      ...parsed,
      ...classes,
      ...sports,
      ...coaches,
      id: createId('stu'),
      enrolledAt: localDateIso(),
    };
    mutateData((data) => {
      data.students.push(student);
    });
    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush();
    return student;
  });
}

export async function updateStudent(id: string, input: StudentInput) {
  return apiClient(() => {
    const parsed = studentSchema.parse(input);
    const classes = normalizeStudentClasses(parsed.classIds, parsed.classId);
    const sports = normalizeStudentSports(parsed.sports, parsed.sport);
    const coaches = normalizeStudentCoaches(parsed.coachNames, parsed.coachName);
    let updated: Student | undefined;
    mutateData((data) => {
      const index = data.students.findIndex((s) => s.id === id);
      if (index === -1) throw new Error('Ο αθλητής δεν βρέθηκε');
      updated = {
        ...data.students[index],
        ...parsed,
        ...classes,
        ...sports,
        ...coaches,
      };
      data.students[index] = updated;
      if (!data.transactions) data.transactions = [];
      applySubscriptionDiscountToCharges(updated, data.transactions);
    });
    return updated!;
  });
}

export async function deleteStudent(id: string) {
  return apiClient(async () => {
    mutateData((data) => {
      data.students = data.students.filter((s) => s.id !== id);
      data.attendance = data.attendance.filter((a) => a.studentId !== id);
      const deleted = data.deletedStudentIds ?? [];
      if (!deleted.includes(id)) {
        data.deletedStudentIds = [...deleted, id].slice(-5000);
      }
    });
    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush();
    return { id };
  });
}

export async function deleteJoinFormSnapshotForStudent(id: string) {
  return apiClient(() => {
    let changed = false;
    mutateData((data) => {
      changed = stripJoinFormSnapshotForStudent(data, id);
      if (!changed) {
        const exists = data.students.some((s) => s.id === id);
        if (!exists) throw new Error('Ο αθλητής δεν βρέθηκε');
      }
    });
    return { id, changed };
  });
}

export type StudentImportRow = {
  mode: 'create' | 'update';
  input: StudentInput;
  existingId?: string;
  label: string;
};

/** Μαζική εισαγωγή: μία εγγραφή στο store και ένα cloud push στο τέλος. */
export async function importStudents(rows: StudentImportRow[]) {
  return apiClient(async () => {
    const enrolledAt = localDateIso();
    const prepared: Array<
      | { mode: 'create'; student: Student; label: string }
      | { mode: 'update'; id: string; parsed: StudentInput; label: string }
    > = [];
    const failed: string[] = [];

    for (const row of rows) {
      try {
        if (row.mode === 'create') {
          const parsed = studentCreateSchema.parse(row.input);
          const classes = normalizeStudentClasses(parsed.classIds, parsed.classId);
          const sports = normalizeStudentSports(parsed.sports, parsed.sport);
          const coaches = normalizeStudentCoaches(parsed.coachNames, parsed.coachName);
          prepared.push({
            mode: 'create',
            label: row.label,
            student: {
              ...parsed,
              ...classes,
              ...sports,
              ...coaches,
              id: createId('stu'),
              enrolledAt,
            },
          });
          continue;
        }
        if (!row.existingId) {
          failed.push(`${row.label}: λείπει κωδικός για ενημέρωση`);
          continue;
        }
        prepared.push({
          mode: 'update',
          id: row.existingId,
          parsed: studentSchema.parse(row.input),
          label: row.label,
        });
      } catch (err) {
        failed.push(
          `${row.label}: ${err instanceof Error ? err.message : 'μη έγκυρα στοιχεία'}`,
        );
      }
    }

    let created = 0;
    let updated = 0;
    mutateData((data) => {
      if (!data.transactions) data.transactions = [];
      for (const item of prepared) {
        if (item.mode === 'create') {
          data.students.push(item.student);
          created += 1;
          continue;
        }
        const index = data.students.findIndex((s) => s.id === item.id);
        if (index === -1) {
          failed.push(`${item.label}: ο αθλητής δεν βρέθηκε`);
          continue;
        }
        const parsed = item.parsed;
        const classes = normalizeStudentClasses(parsed.classIds, parsed.classId);
        const sports = normalizeStudentSports(parsed.sports, parsed.sport);
        const coaches = normalizeStudentCoaches(parsed.coachNames, parsed.coachName);
        const next: Student = {
          ...data.students[index],
          ...parsed,
          ...classes,
          ...sports,
          ...coaches,
        };
        data.students[index] = next;
        applySubscriptionDiscountToCharges(next, data.transactions);
        updated += 1;
      }
    });

    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush();
    return { created, updated, failed };
  });
}
