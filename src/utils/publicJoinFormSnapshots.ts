import type { AppData, RegistrationApplication, Student } from '../types';

function isStoredJoinImage(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function hasStudentJoinForm(student: Student): boolean {
  return isStoredJoinImage(student.registrationFormImageUrl) || Boolean(student.joinExtras);
}

function hasApplicationJoinForm(app: RegistrationApplication): boolean {
  return (
    isStoredJoinImage(app.formSnapshotUrl) ||
    Boolean(app.guardianSignature?.trim()) ||
    Boolean(app.joinExtras)
  );
}

export function countPublicJoinFormSnapshots(data: AppData): {
  athletes: number;
  applications: number;
  total: number;
} {
  const athletes = (data.students ?? []).filter(hasStudentJoinForm).length;
  const applications = (data.registrationApplications ?? []).filter(hasApplicationJoinForm)
    .length;
  return { athletes, applications, total: athletes + applications };
}

function stripStudent(student: Student): Student {
  if (!hasStudentJoinForm(student)) return student;
  return { ...student, registrationFormImageUrl: null, joinExtras: undefined };
}

function stripApplication(app: RegistrationApplication): RegistrationApplication {
  if (!hasApplicationJoinForm(app)) return app;
  return { ...app, formSnapshotUrl: null, guardianSignature: '', joinExtras: undefined };
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
  let found = false;
  data.students = (data.students ?? []).map((student) => {
    if (student.id !== studentId) return student;
    found = true;
    return {
      ...student,
      registrationFormImageUrl: null,
      joinExtras: undefined,
    };
  });
  const student = data.students.find((s) => s.id === studentId);
  data.registrationApplications = (data.registrationApplications ?? []).map((app) => {
    const linked =
      app.athleteId === studentId ||
      (student &&
        app.firstName.trim().toLowerCase() === student.firstName.trim().toLowerCase() &&
        app.lastName.trim().toLowerCase() === student.lastName.trim().toLowerCase());
    if (!linked) return app;
    return {
      ...app,
      formSnapshotUrl: null,
      guardianSignature: '',
      joinExtras: undefined,
    };
  });
  return found;
}

export function stripJoinFormSnapshotForApplication(data: AppData, applicationId: string): boolean {
  let found = false;
  let athleteId: string | null = null;
  data.registrationApplications = (data.registrationApplications ?? []).map((app) => {
    if (app.id !== applicationId) return app;
    found = true;
    athleteId = app.athleteId ?? null;
    return {
      ...app,
      formSnapshotUrl: null,
      guardianSignature: '',
      joinExtras: undefined,
    };
  });
  if (athleteId) {
    data.students = (data.students ?? []).map((student) => {
      if (student.id !== athleteId) return student;
      return { ...student, registrationFormImageUrl: null, joinExtras: undefined };
    });
  }
  return found;
}
