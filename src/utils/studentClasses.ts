import type { Student } from '../types';

export type StudentClassRef = Pick<Student, 'classId' | 'classIds'>;

/** Τιμή φίλτρου dropdown: αθλητές / αιτήσεις χωρίς κανένα τμήμα. */
export const NO_CLASS_FILTER = '__none__';

export function isNoClassFilter(teamId: string | null | undefined): boolean {
  return teamId === NO_CLASS_FILTER;
}

/** Όλα τα τμήματα του αθλητή (χωρίς διπλότυπα). */
export function studentClassIds(student: StudentClassRef): string[] {
  const ids = [
    ...(student.classIds ?? []),
    ...(student.classId ? [student.classId] : []),
  ].filter(Boolean);
  return [...new Set(ids)];
}

export function studentHasNoClass(student: StudentClassRef): boolean {
  return studentClassIds(student).length === 0;
}

export function studentInClass(
  student: StudentClassRef,
  classId: string | null | undefined,
): boolean {
  if (!classId || isNoClassFilter(classId)) return false;
  return studentClassIds(student).includes(classId);
}

/** Κενό = όλα τα τμήματα. `__none__` = χωρίς τμήμα. */
export function studentMatchesTeamFilter(
  student: StudentClassRef,
  teamId: string | null | undefined,
): boolean {
  if (!teamId) return true;
  if (isNoClassFilter(teamId)) return studentHasNoClass(student);
  return studentInClass(student, teamId);
}

export function studentInAnyClass(
  student: StudentClassRef,
  allowedClassIds: Set<string>,
): boolean {
  return studentClassIds(student).some((id) => allowedClassIds.has(id));
}

/**
 * Κανονικοποιεί classId (κύριο) + classIds (όλα).
 * Το πρώτο της λίστας (ή το υπάρχον classId αν υπάρχει στη λίστα) γίνεται primary.
 */
export function normalizeStudentClasses(
  classIds: string[] | undefined | null,
  classId?: string | null,
): { classId: string | null; classIds: string[] } {
  const raw = [...(classIds ?? []), ...(classId ? [classId] : [])]
    .map((id) => id.trim())
    .filter(Boolean);
  const ids = [...new Set(raw)];
  const primary =
    classId && ids.includes(classId) ? classId : ids[0] ?? null;
  return { classId: primary, classIds: ids };
}
