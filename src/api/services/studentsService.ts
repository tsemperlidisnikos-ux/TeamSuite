import { apiClient } from '../apiClient';
import { createId, getData, mutateData } from '../../data/repository';
import { studentCreateSchema, studentSchema, type StudentInput } from '../../schemas';
import type { Gender, Student, StudentStatus } from '../../types';
import { localDateIso } from '../../utils/dates';
import { normalizeStudentClasses } from '../../utils/studentClasses';
import { normalizeStudentCoaches } from '../../utils/studentCoaches';
import { normalizeStudentSports } from '../../utils/studentSports';
import { applySubscriptionDiscountToCharges } from './feeChargesService';
import { stripJoinFormSnapshotForStudent } from '../../utils/publicJoinFormSnapshots';
import { toUpperEl } from '../../utils/upperText';
import {
  athleteLicenseCapMessage,
  clubAthleteLicenseLimit,
  countActiveAthleteLicenses,
  syncClubAthleteLicenseUsed,
  wouldConsumeAthleteLicense,
} from '../../utils/athleteLicenseCap';

function withUpperIdentity(input: StudentInput): StudentInput {
  return {
    ...input,
    firstName: toUpperEl(input.firstName),
    lastName: toUpperEl(input.lastName),
    fatherFirstName: input.fatherFirstName != null ? toUpperEl(input.fatherFirstName) : input.fatherFirstName,
    motherFirstName: input.motherFirstName != null ? toUpperEl(input.motherFirstName) : input.motherFirstName,
    address: input.address != null ? toUpperEl(input.address) : input.address,
    city: input.city != null ? toUpperEl(input.city) : input.city,
    county: input.county != null ? toUpperEl(input.county) : input.county,
  };
}

export async function getStudents() {
  return apiClient(() => getData().students);
}

export async function createStudent(input: StudentInput) {
  return apiClient(async () => {
    const parsed = withUpperIdentity(studentCreateSchema.parse(input));
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
      const limit = clubAthleteLicenseLimit();
      if (
        wouldConsumeAthleteLicense(student.status) &&
        limit > 0 &&
        countActiveAthleteLicenses(data.students) >= limit
      ) {
        throw new Error(
          athleteLicenseCapMessage(countActiveAthleteLicenses(data.students), limit),
        );
      }
      data.students.push(student);
      syncClubAthleteLicenseUsed(data.students);
    });
    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush();
    return student;
  });
}

export async function updateStudent(id: string, input: StudentInput) {
  return apiClient(() => {
    const parsed = withUpperIdentity(studentSchema.parse(input));
    const classes = normalizeStudentClasses(parsed.classIds, parsed.classId);
    const sports = normalizeStudentSports(parsed.sports, parsed.sport);
    const coaches = normalizeStudentCoaches(parsed.coachNames, parsed.coachName);
    let updated: Student | undefined;
    mutateData((data) => {
      const index = data.students.findIndex((s) => s.id === id);
      if (index === -1) throw new Error('Ο αθλητής δεν βρέθηκε');
      const previous = data.students[index];
      updated = {
        ...previous,
        ...parsed,
        ...classes,
        ...sports,
        ...coaches,
      };
      const limit = clubAthleteLicenseLimit();
      if (
        wouldConsumeAthleteLicense(updated.status, previous.status) &&
        limit > 0 &&
        countActiveAthleteLicenses(data.students) >= limit
      ) {
        throw new Error(
          athleteLicenseCapMessage(countActiveAthleteLicenses(data.students), limit),
        );
      }
      data.students[index] = updated;
      if (!data.transactions) data.transactions = [];
      applySubscriptionDiscountToCharges(updated, data.transactions);
      syncClubAthleteLicenseUsed(data.students);
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
      syncClubAthleteLicenseUsed(data.students);
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
          const parsed = withUpperIdentity(studentCreateSchema.parse(row.input));
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
          parsed: withUpperIdentity(studentSchema.parse(row.input)),
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
    let licenseSkipped = 0;
    mutateData((data) => {
      if (!data.transactions) data.transactions = [];
      const limit = clubAthleteLicenseLimit();
      for (const item of prepared) {
        if (item.mode === 'create') {
          if (
            wouldConsumeAthleteLicense(item.student.status) &&
            limit > 0 &&
            countActiveAthleteLicenses(data.students) >= limit
          ) {
            licenseSkipped += 1;
            failed.push(
              `${item.label}: υπέρβαση αδειών (${countActiveAthleteLicenses(data.students)} / ${limit})`,
            );
            continue;
          }
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
        let next: Student = {
          ...data.students[index],
          ...parsed,
          ...classes,
          ...sports,
          ...coaches,
        };
        if (
          wouldConsumeAthleteLicense(next.status, data.students[index].status) &&
          limit > 0 &&
          countActiveAthleteLicenses(data.students) >= limit
        ) {
          next = { ...next, status: data.students[index].status };
          licenseSkipped += 1;
          failed.push(
            `${item.label}: ενημερώθηκε χωρίς ενεργοποίηση — υπέρβαση αδειών (${countActiveAthleteLicenses(data.students)} / ${limit})`,
          );
        }
        data.students[index] = next;
        applySubscriptionDiscountToCharges(next, data.transactions);
        updated += 1;
      }
      syncClubAthleteLicenseUsed(data.students);
    });

    const { flushClubMirrorPush } = await import('../../data/clubSync');
    await flushClubMirrorPush();
    return { created, updated, failed, licenseSkipped };
  });
}

export type StudentBulkPatch = {
  ids: string[];
  status?: StudentStatus;
  gender?: Gender;
  sport?: string;
  /** true = Έγκυρη, false = Όχι (και καθαρισμός ημερομηνίας λήξης). */
  healthCard?: boolean;
};

/** Μαζική ενημέρωση επιλεγμένων πεδίων (τοπικά άμεσα· cloud sync στο παρασκήνιο). */
export async function bulkPatchStudents(patch: StudentBulkPatch) {
  return apiClient(async () => {
    const ids = [...new Set(patch.ids.filter(Boolean))];
    if (ids.length === 0) throw new Error('Δεν επιλέχθηκαν αθλητές');
    const hasStatus = patch.status !== undefined;
    const hasGender = patch.gender !== undefined;
    const sportValue = patch.sport?.trim() ?? '';
    const hasSport = patch.sport !== undefined;
    const hasHealthCard = patch.healthCard !== undefined;
    if (!hasStatus && !hasGender && !hasSport && !hasHealthCard) {
      throw new Error('Δεν επιλέχθηκε πεδίο για αλλαγή');
    }

    let updated = 0;
    const missing: string[] = [];
    mutateData((data) => {
      const limit = clubAthleteLicenseLimit();
      if (hasStatus && patch.status === 'active' && limit > 0) {
        const selected = data.students.filter((s) => ids.includes(s.id));
        const extra = selected.filter((s) => s.status !== 'active').length;
        const used = countActiveAthleteLicenses(data.students);
        if (used + extra > limit) {
          throw new Error(
            athleteLicenseCapMessage(
              used,
              limit,
              `Η μαζική ενεργοποίηση χρειάζεται ${extra} θέσεις.`,
            ),
          );
        }
      }
      const wanted = new Set(ids);
      for (let i = 0; i < data.students.length; i += 1) {
        const current = data.students[i];
        if (!wanted.has(current.id)) continue;
        wanted.delete(current.id);
        let next: Student = { ...current };
        if (hasStatus) next = { ...next, status: patch.status! };
        if (hasGender) next = { ...next, gender: patch.gender };
        if (hasSport) {
          next = { ...next, ...normalizeStudentSports(sportValue ? [sportValue] : [], sportValue) };
        }
        if (hasHealthCard) {
          const on = Boolean(patch.healthCard);
          next = {
            ...next,
            healthCard: on,
            healthCardStatus: on ? 'Έγκυρη' : 'Όχι',
            ...(on ? {} : { healthCardExpires: '' }),
          };
        }
        data.students[i] = next;
        updated += 1;
      }
      for (const id of wanted) missing.push(id);
      syncClubAthleteLicenseUsed(data.students);
    });

    // Άμεσο push στο παρασκήνιο — χωρίς να μπλοκάρει το κουμπί Εφαρμογή.
    void import('../../data/clubSync').then(({ flushClubMirrorPush }) => {
      void flushClubMirrorPush();
    });
    return { updated, missing };
  });
}
