import { apiClient } from '../apiClient';
import { getClubById, getClubPublicRegistration } from '../../auth/clubs';
import { createId, mutateClubData } from '../../data/repository';
import {
  gdprItemsFromPublicConsent,
  registrationApplicationFromPublicJoin,
  validatePublicJoinRequiredFields,
  type PublicJoinGdprItems,
} from '../../shared/publicJoinPayload';
import { localDateIso } from '../../utils/dates';
import type { RegistrationApplicationKind } from '../../types';
import type { PublicJoinExtras } from '../../shared/publicJoinExtras';
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
  joinExtras?: PublicJoinExtras;
  gdprItems?: PublicJoinGdprItems;
  amkaConsentAt?: string;
  guardianSignature?: string;
  formSnapshotUrl?: string | null;
};

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
      joinExtras: input.joinExtras,
    });
    if (requiredError) throw new Error(requiredError);

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const amka = input.amka?.trim() ?? '';
    if (!input.gdprItems?.amkaHealthCard) {
      throw new Error('Απαιτείται ρητή συγκατάθεση για τη συλλογή του ΑΜΚΑ.');
    }

    const gdprItems =
      input.gdprItems ??
      gdprItemsFromPublicConsent(input.acceptedTerms, Boolean(input.amkaConsentAt));

    mutateClubData(input.clubId, (data) => {
      const applicationId = createId('rapp');
      const application = registrationApplicationFromPublicJoin(
        {
          ...input,
          firstName,
          lastName,
          kind: 'waitlist',
          guardianName: input.guardianName.trim(),
          guardianPhone: input.guardianPhone.trim(),
          email: input.email.trim(),
          gdprItems,
          amkaConsentAt: input.amkaConsentAt || (amka ? localDateIso() : ''),
          formSnapshotUrl: input.formSnapshotUrl || null,
        },
        {
          id: applicationId,
          status: 'pending',
          athleteId: null,
        },
      );
      data.registrationApplications = [application, ...(data.registrationApplications ?? [])];
    });

    let emailSent = false;
    let guardianEmailSent = false;
    try {
      const notify = await notifyClubNewRegistration({
        clubId: input.clubId,
        firstName,
        lastName,
        kind: 'waitlist',
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
            'Η αίτηση μπήκε σε αναμονή. Ο σύλλογος θα ενεργοποιήσει τον αθλητή μετά τον έλεγχο.',
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
      mode: 'application' as const,
      kind: 'waitlist' as const,
      athleteId: null,
      emailSent,
      guardianEmailSent,
      message:
        'Η αίτηση μπήκε σε αναμονή. Ο σύλλογος θα ενεργοποιήσει τον αθλητή από Αθλητές → εκκρεμείς αιτήσεις.',
    };
  });
}
