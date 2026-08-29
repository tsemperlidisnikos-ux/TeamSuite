import type { AppData, RegistrationApplication, Student } from '../types';

function isStoredJoinImage(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function countPublicJoinFormSnapshots(data: AppData): {
  athletes: number;
  applications: number;
  total: number;
} {
  const athletes = (data.students ?? []).filter((s) =>
    isStoredJoinImage(s.registrationFormImageUrl),
  ).length;
  const applications = (data.registrationApplications ?? []).filter(
    (a) => isStoredJoinImage(a.formSnapshotUrl) || Boolean(a.guardianSignature?.trim()),
  ).length;
  return { athletes, applications, total: athletes + applications };
}

function stripStudent(student: Student): Student {
  if (!isStoredJoinImage(student.registrationFormImageUrl)) return student;
  return { ...student, registrationFormImageUrl: null };
}

function stripApplication(app: RegistrationApplication): RegistrationApplication {
  if (!isStoredJoinImage(app.formSnapshotUrl) && !app.guardianSignature?.trim()) return app;
  return { ...app, formSnapshotUrl: null, guardianSignature: '' };
}

/** Removes stored JPEG snapshots (and signatures) of the public join form. */
export function stripPublicJoinFormSnapshots(data: AppData): {
  athletes: number;
  applications: number;
} {
  let athletes = 0;
  let applications = 0;
  data.students = (data.students ?? []).map((student) => {
    const next = stripStudent(student);
    if (next !== student) athletes += 1;
    return next;
  });
  data.registrationApplications = (data.registrationApplications ?? []).map((app) => {
    const next = stripApplication(app);
    if (next !== app) applications += 1;
    return next;
  });
  return { athletes, applications };
}

export function stripJoinFormSnapshotForStudent(data: AppData, studentId: string): boolean {
  let changed = false;
  data.students = (data.students ?? []).map((student) => {
    if (student.id !== studentId) return student;
    const next = stripStudent(student);
    if (next !== student) changed = true;
    return next;
  });
  const student = data.students.find((s) => s.id === studentId);
  data.registrationApplications = (data.registrationApplications ?? []).map((app) => {
    const linked =
      app.athleteId === studentId ||
      (student &&
        app.firstName.trim().toLowerCase() === student.firstName.trim().toLowerCase() &&
        app.lastName.trim().toLowerCase() === student.lastName.trim().toLowerCase());
    if (!linked) return app;
    const next = stripApplication(app);
    if (next !== app) changed = true;
    return next;
  });
  return changed;
}

export function stripJoinFormSnapshotForApplication(data: AppData, applicationId: string): boolean {
  let changed = false;
  let athleteId: string | null = null;
  data.registrationApplications = (data.registrationApplications ?? []).map((app) => {
    if (app.id !== applicationId) return app;
    athleteId = app.athleteId ?? null;
    const next = stripApplication(app);
    if (next !== app) changed = true;
    return next;
  });
  if (athleteId) {
    data.students = (data.students ?? []).map((student) => {
      if (student.id !== athleteId) return student;
      const next = stripStudent(student);
      if (next !== student) changed = true;
      return next;
    });
  }
  return changed;
}
