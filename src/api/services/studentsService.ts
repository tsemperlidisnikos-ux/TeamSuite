import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { studentSchema, type StudentInput } from '../../schemas';
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
    const parsed = studentSchema.parse(input);
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
