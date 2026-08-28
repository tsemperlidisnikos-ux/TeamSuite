import { apiClient } from '../apiClient';
import { getSession, getUserById, isPlatformAdmin } from '../../auth/auth';
import { getClubById, getClubPublicRegistration, getClubSmtp } from '../../auth/clubs';
import { createId, getData, mutateData } from '../../data/repository';
import { buildStudentFromRegistrationApplication } from '../../shared/publicJoinPayload';
import type {
  RegistrationApplication,
  RegistrationApplicationKind,
  Student,
} from '../../types';
import * as emailService from './emailService';

function clubNameForSession(): string {
  const session = getSession();
  const club = getClubById(session?.clubId);
  return club?.name ?? '';
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizePersonName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function findStudentDuplicatesForApplication(
  app: Pick<RegistrationApplication, 'firstName' | 'lastName' | 'guardianPhone'>,
  students: Student[],
): Student[] {
  const first = normalizePersonName(app.firstName);
  const last = normalizePersonName(app.lastName);
  const phone = normalizePhone(app.guardianPhone);
  if (!first || !last || phone.length < 6) return [];
  return students.filter((s) => {
    if (s.status === 'inactive') return false;
    return (
      normalizePersonName(s.firstName) === first &&
      normalizePersonName(s.lastName) === last &&
      normalizePhone(s.guardianPhone || '') === phone
    );
  });
}

export async function getRegistrationApplications() {
  return apiClient(() => getData().registrationApplications ?? []);
}

export type RegistrationApplicationUpdateInput = {
  classId?: string | null;
  kind?: RegistrationApplicationKind;
  notes?: string;
  firstName?: string;
  lastName?: string;
  guardianName?: string;
  guardianPhone?: string;
  email?: string;
};

export async function updateRegistrationApplication(
  id: string,
  input: RegistrationApplicationUpdateInput,
) {
  return apiClient(() => {
    let application: RegistrationApplication | null = null;
    mutateData((data) => {
      const apps = data.registrationApplications ?? [];
      const index = apps.findIndex((a) => a.id === id);
      if (index < 0) throw new Error('Η αίτηση δεν βρέθηκε.');
      const app = apps[index];
      if (app.status !== 'pending') {
        throw new Error('Μόνο εκκρεμείς αιτήσεις μπορούν να επεξεργαστούν.');
      }
      application = {
        ...app,
        classId: input.classId === undefined ? app.classId : input.classId,
        kind: input.kind ?? app.kind,
        notes: input.notes === undefined ? app.notes : input.notes.trim(),
        firstName:
          input.firstName === undefined ? app.firstName : input.firstName.trim(),
        lastName: input.lastName === undefined ? app.lastName : input.lastName.trim(),
        guardianName:
          input.guardianName === undefined
            ? app.guardianName
            : input.guardianName.trim(),
        guardianPhone:
          input.guardianPhone === undefined
            ? app.guardianPhone
            : input.guardianPhone.trim(),
        email: input.email === undefined ? app.email : input.email.trim(),
      };
      if (!application.firstName || !application.lastName) {
        throw new Error('Το όνομα και το επώνυμο είναι υποχρεωτικά.');
      }
      data.registrationApplications = apps.map((a, i) => (i === index ? application! : a));
    });
    return application!;
  });
}

export async function approveRegistrationApplication(
  id: string,
  options?: { force?: boolean },
) {
  return apiClient(() => {
    let athleteId: string | null = null;
    let application: RegistrationApplication | null = null;
    let duplicates: Array<{ id: string; name: string }> = [];

    mutateData((data) => {
      const apps = data.registrationApplications ?? [];
      const index = apps.findIndex((a) => a.id === id);
      if (index < 0) throw new Error('Η αίτηση δεν βρέθηκε.');
      const app = apps[index];
      if (app.status === 'approved' && app.athleteId) {
        application = app;
        athleteId = app.athleteId;
        return;
      }
      if (app.status === 'rejected') {
        throw new Error('Η αίτηση έχει απορριφθεί.');
      }

      const matched = findStudentDuplicatesForApplication(app, data.students);
      duplicates = matched.map((s) => ({
        id: s.id,
        name: `${s.lastName} ${s.firstName}`.trim(),
      }));
      if (duplicates.length > 0 && !options?.force) {
        throw new Error(
          `Πιθανό διπλότυπο: υπάρχει ήδη αθλητής «${duplicates[0].name}» με ίδιο τηλ. γονέα. Επιβεβαιώστε για συνέχεια.`,
        );
      }

      const cls = app.classId
        ? data.classes.find((c) => c.id === app.classId) ?? null
        : null;

      const athleteIdNew = createId('stu');
      const athlete = buildStudentFromRegistrationApplication(
        app,
        clubNameForSession(),
        cls,
        athleteIdNew,
        {
          status: app.kind === 'trial' ? 'trial' : 'active',
          comments: app.notes?.trim() || 'Δημόσια εγγραφή (έγκριση)',
        },
      );
      data.students = [athlete, ...data.students];
      athleteId = athlete.id;

      application = {
        ...app,
        status: 'approved',
        athleteId: athlete.id,
      };
      data.registrationApplications = apps.map((a, i) => (i === index ? application! : a));
    });

    return {
      application: application!,
      athleteId,
      duplicates,
    };
  });
}

export async function rejectRegistrationApplication(id: string) {
  return apiClient(() => {
    let application: RegistrationApplication | null = null;
    mutateData((data) => {
      const apps = data.registrationApplications ?? [];
      const index = apps.findIndex((a) => a.id === id);
      if (index < 0) throw new Error('Η αίτηση δεν βρέθηκε.');
      const app = apps[index];
      if (app.status === 'approved') {
        throw new Error('Η αίτηση έχει ήδη εγκριθεί.');
      }
      application = { ...app, status: 'rejected' };
      data.registrationApplications = apps.map((a, i) => (i === index ? application! : a));
    });
    return application!;
  });
}

export async function deleteRegistrationApplication(id: string) {
  return apiClient(() => {
    if (!isPlatformAdmin()) {
      throw new Error('Μόνο Platform Admin μπορεί να διαγράψει αιτήσεις εγγραφής.');
    }
    mutateData((data) => {
      const apps = data.registrationApplications ?? [];
      if (!apps.some((a) => a.id === id)) {
        throw new Error('Η αίτηση δεν βρέθηκε.');
      }
      data.registrationApplications = apps.filter((a) => a.id !== id);
    });
    return { id };
  });
}

export async function deleteRegistrationApplications(ids: string[]) {
  return apiClient(() => {
    if (!isPlatformAdmin()) {
      throw new Error('Μόνο Platform Admin μπορεί να διαγράψει αιτήσεις εγγραφής.');
    }
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return { deleted: 0 };
    let deleted = 0;
    mutateData((data) => {
      const before = data.registrationApplications ?? [];
      const remove = new Set(unique);
      data.registrationApplications = before.filter((a) => {
        if (!remove.has(a.id)) return true;
        deleted += 1;
        return false;
      });
    });
    return { deleted };
  });
}

export async function notifyClubNewRegistration(input: {
  clubId: string;
  firstName: string;
  lastName: string;
  kind: string;
  guardianPhone: string;
}) {
  const club = getClubById(input.clubId);
  if (!club) return { sent: false as const, reason: 'no-club' };
  const smtp = getClubSmtp(input.clubId);
  if (!smtp.enabled) return { sent: false as const, reason: 'smtp-disabled' };

  const settings = getClubPublicRegistration(input.clubId);
  const adminEmail = getUserById(club.adminUserId)?.email?.trim() || '';
  const to = (settings.notifyEmail || adminEmail || smtp.username || '').trim();
  if (!to.includes('@')) return { sent: false as const, reason: 'no-recipient' };

  const kindLabel =
    input.kind === 'trial'
      ? 'Δοκιμαστική'
      : input.kind === 'waitlist'
        ? 'Λίστα αναμονής'
        : 'Πλήρης εγγραφή';

  const result = await emailService.sendClubEmail({
    clubId: input.clubId,
    to,
    subject: `Νέα αίτηση εγγραφής · ${input.lastName} ${input.firstName}`,
    text: [
      `Νέα αίτηση δημόσιας εγγραφής στον σύλλογο ${club.name}.`,
      '',
      `Αθλητής: ${input.lastName} ${input.firstName}`,
      `Τύπος: ${kindLabel}`,
      `Τηλ. γονέα: ${input.guardianPhone}`,
      '',
      'Άνοιξε Αθλητές για έγκριση ή απόρριψη.',
    ].join('\n'),
  });

  return result.success
    ? { sent: true as const }
    : { sent: false as const, reason: result.error ?? 'send-failed' };
}
