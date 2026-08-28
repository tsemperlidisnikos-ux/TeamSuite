import { apiClient } from '../apiClient';
import { getClubById, getClubPublicRegistration } from '../../auth/clubs';
import { createId, mutateClubData } from '../../data/repository';
import {
  buildStudentFromRegistrationApplication,
  gdprItemsFromPublicConsent,
  registrationApplicationFromPublicJoin,
  validatePublicJoinRequiredFields,
  type PublicJoinGdprItems,
} from '../../shared/publicJoinPayload';
import { localDateIso } from '../../utils/dates';
import { studentInClass } from '../../utils/studentClasses';
import type { RegistrationApplicationKind } from '../../types';
import * as emailService from './emailService';
import { notifyClubNewRegistration } from './registrationApplicationsService';

export type PublicJoinInput = {
  clubId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: '' | 'boy' | 'girl' | 'other';
  guardianName: string;
  guardianPhone: string;
  email: string;
  classId: string | null;
  kind: RegistrationApplicationKind;
  notes?: string;
  acceptedTerms: boolean;
  amka?: string;
  phone?: string;
  athleteEmail?: string;
  fatherFirstName?: string;
  motherFirstName?: string;
  fatherEmail?: string;
  motherEmail?: string;
  motherPhone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  county?: string;
  sport?: string;
  uniformSize?: string;
  gdprItems?: PublicJoinGdprItems;
  amkaConsentAt?: string;
  guardianSignature?: string;
};

function classIsFull(classId: string | null, maxStudents: number, activeCount: number): boolean {
  if (!classId) return false;
  return activeCount >= maxStudents;
}

export async function submitPublicJoin(input: PublicJoinInput) {
  return apiClient(async () => {
    const club = getClubById(input.clubId);
    if (!club) throw new Error('Ο σύλλογος δεν βρέθηκε.');
    const settings = getClubPublicRegistration(club.id);
    if (!settings.enabled) throw new Error('Η δημόσια εγγραφή δεν είναι ενεργή.');
    if (!input.acceptedTerms) {
      throw new Error('Πρέπει να αποδεχτείτε τη συγκατάθεση επεξεργασίας προσωπικών δεδομένων.');
    }
    if (!input.guardianSignature?.trim()) {
      throw new Error('Απαιτείται υπογραφή γονέα ή κηδεμόνα.');
    }

    const requiredError = validatePublicJoinRequiredFields({
      amka: input.amka,
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate,
      gender: input.gender,
      athleteEmail: input.athleteEmail,
      phone: input.phone,
      fatherFirstName: input.fatherFirstName,
      motherFirstName: input.motherFirstName,
      fatherEmail: input.fatherEmail,
      motherEmail: input.motherEmail,
      guardianPhone: input.guardianPhone,
      motherPhone: input.motherPhone,
      address: input.address,
      postalCode: input.postalCode,
      city: input.city,
      county: input.county,
      sport: input.sport,
      uniformSize: input.uniformSize,
      notes: input.notes,
    });
    if (requiredError) throw new Error(requiredError);

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const amka = input.amka?.trim() ?? '';
    if (!input.gdprItems?.amkaHealthCard) {
      throw new Error('Απαιτείται ρητή συγκατάθεση για τη συλλογή του ΑΜΚΑ.');
    }
    if (input.kind === 'trial' && !settings.allowTrial) {
      throw new Error('Η δοκιμαστική προπόνηση δεν επιτρέπεται.');
    }
    if (input.kind === 'waitlist' && !settings.allowWaitlist) {
      throw new Error('Η λίστα αναμονής δεν επιτρέπεται.');
    }

    let resultKind = input.kind;
    let createdAthleteId: string | null = null;

    const gdprItems =
      input.gdprItems ??
      gdprItemsFromPublicConsent(input.acceptedTerms, Boolean(input.amkaConsentAt));

    mutateClubData(input.clubId, (data) => {
      const cls = input.classId
        ? data.classes.find((c) => c.id === input.classId) ?? null
        : null;
      const activeInClass = input.classId
        ? data.students.filter(
            (s) => studentInClass(s, input.classId) && s.status !== 'inactive',
          ).length
        : 0;
      const full = classIsFull(input.classId, cls?.maxStudents ?? 0, activeInClass);

      if (full && settings.allowWaitlist) {
        resultKind = 'waitlist';
      }

      const shouldCreateAthlete =
        settings.autoApprove &&
        resultKind !== 'waitlist' &&
        (resultKind === 'full' || resultKind === 'trial');

      const applicationId = createId('rapp');
      if (shouldCreateAthlete) {
        const athleteId = createId('stu');
        const athlete = buildStudentFromRegistrationApplication(
          registrationApplicationFromPublicJoin(
            {
              ...input,
              firstName,
              lastName,
              guardianName: input.guardianName.trim(),
              guardianPhone: input.guardianPhone.trim(),
              email: input.email.trim(),
              gdprItems,
              amkaConsentAt: input.amkaConsentAt || (amka ? localDateIso() : ''),
            },
            {
              id: applicationId,
              status: 'approved',
              athleteId,
            },
          ),
          club.name,
          cls,
          athleteId,
          {
            status: resultKind === 'trial' ? 'trial' : 'active',
            comments: input.notes?.trim() || 'Δημόσια εγγραφή',
          },
        );
        data.students = [athlete, ...data.students];
        createdAthleteId = athlete.id;
      }

      const application = registrationApplicationFromPublicJoin(
        {
          ...input,
          firstName,
          lastName,
          guardianName: input.guardianName.trim(),
          guardianPhone: input.guardianPhone.trim(),
          email: input.email.trim(),
          gdprItems,
          amkaConsentAt: input.amkaConsentAt || (amka ? localDateIso() : ''),
        },
        {
          id: applicationId,
          status: shouldCreateAthlete ? 'approved' : 'pending',
          athleteId: createdAthleteId,
        },
      );
      data.registrationApplications = [application, ...(data.registrationApplications ?? [])];
    });

    const resolvedMode: 'athlete' | 'application' = createdAthleteId
      ? 'athlete'
      : 'application';

    let emailSent = false;
    let guardianEmailSent = false;
    try {
      const notify = await notifyClubNewRegistration({
        clubId: input.clubId,
        firstName,
        lastName,
        kind: resultKind,
        guardianPhone: input.guardianPhone.trim(),
      });
      emailSent = notify.sent;
    } catch {
      emailSent = false;
    }

    const guardianEmail = (input.fatherEmail?.trim() || input.email.trim() || '').trim();
    if (guardianEmail.includes('@')) {
      try {
        const clubName = club.name;
        const confirm = await emailService.sendClubEmail({
          clubId: input.clubId,
          to: guardianEmail,
          subject: `Επιβεβαίωση αίτησης · ${clubName}`,
          text: [
            `Αγαπητέ/ή ${input.guardianName.trim()},`,
            '',
            `Λάβαμε την αίτηση εγγραφής για τον/την ${firstName} ${lastName} στον σύλλογο ${clubName}.`,
            resolvedMode === 'athlete'
              ? 'Η εγγραφή καταχωρήθηκε.'
              : resultKind === 'waitlist'
                ? 'Η αίτηση μπήκε στη λίστα αναμονής.'
                : 'Η αίτηση εκκρεμεί έγκριση από τον σύλλογο.',
            '',
            'Ευχαριστούμε.',
            clubName,
          ].join('\n'),
        });
        guardianEmailSent = Boolean(confirm.success);
      } catch {
        guardianEmailSent = false;
      }
    }

    return {
      mode: resolvedMode,
      kind: resultKind,
      athleteId: createdAthleteId,
      emailSent,
      guardianEmailSent,
      message:
        resolvedMode === 'athlete'
          ? 'Η εγγραφή ολοκληρώθηκε.'
          : resultKind === 'waitlist'
            ? 'Η αίτηση μπήκε στη λίστα αναμονής.'
            : 'Η αίτηση υποβλήθηκε και εκκρεμεί έγκριση.',
    };
  });
}
