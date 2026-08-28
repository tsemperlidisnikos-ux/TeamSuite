import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { classSchema, type ClassInput } from '../../schemas';
import type { AcademyClass } from '../../types';

export async function getClasses() {
  return apiClient(() => getData().classes);
}

export async function createClass(input: ClassInput) {
  return apiClient(() => {
    const parsed = classSchema.parse(input);
    const academyClass: AcademyClass = {
      ...parsed,
      id: createId('class'),
    };
    mutateData((data) => {
      data.classes.push(academyClass);
    });
    return academyClass;
  });
}

export async function updateClass(id: string, input: ClassInput) {
  return apiClient(() => {
    const parsed = classSchema.parse(input);
    let updated: AcademyClass | undefined;
    mutateData((data) => {
      const index = data.classes.findIndex((c) => c.id === id);
      if (index === -1) throw new Error('Το τμήμα δεν βρέθηκε');
      updated = { ...data.classes[index], ...parsed };
      data.classes[index] = updated;
    });
    return updated!;
  });
}

export async function deleteClass(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      data.classes = data.classes.filter((c) => c.id !== id);
      data.students = data.students.map((s) => {
        const classIds = [
          ...(s.classIds ?? []),
          ...(s.classId ? [s.classId] : []),
        ].filter((cid) => cid !== id);
        const unique = [...new Set(classIds)];
        return {
          ...s,
          classIds: unique,
          classId: s.classId === id ? unique[0] ?? null : s.classId,
        };
      });
      data.schedule = data.schedule.filter((s) => s.classId !== id);
      data.attendance = data.attendance.filter((a) => a.classId !== id);
    });
    return { id };
  });
}
