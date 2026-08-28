import type { Student } from '../types';

export type StudentCoachRef = Pick<Student, 'coachName' | 'coachNames'>;

/** Όλοι οι προπονητές του αθλητή (χωρίς διπλότυπα). */
export function studentCoachNames(student: StudentCoachRef): string[] {
  const values = [
    ...(student.coachNames ?? []),
    ...(student.coachName?.trim() ? [student.coachName.trim()] : []),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

export function normalizeStudentCoaches(
  coachNames: string[] | undefined | null,
  coachName?: string | null,
): { coachName: string; coachNames: string[] } {
  const list = studentCoachNames({
    coachNames: coachNames ?? [],
    coachName: coachName ?? '',
  });
  const primary =
    coachName?.trim() && list.includes(coachName.trim())
      ? coachName.trim()
      : list[0] ?? '';
  return { coachName: primary, coachNames: list };
}
