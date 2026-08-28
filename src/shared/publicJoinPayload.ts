import type { AcademyClass, AppData, RegistrationApplication, Student } from '../types';
import { localDateIso } from '../utils/dates';
import {
  parsePublicJoinExtras,
  validatePublicJoinExtras,
  EMPTY_PUBLIC_JOIN_EXTRAS,
  type PublicJoinExtras,
} from './publicJoinExtras';

export type PublicJoinGdprItems = {
  personalData: boolean;
  photoUse: boolean;
  gallery: boolean;
  communication: boolean;
  medical: boolean;
  amkaHealthCard?: boolean;
};

export function collectClubSportOptions(data: Pick<AppData, 'sports' | 'classes'>): string[] {
  const fromSports = (data.sports ?? [])
    .filter((s) => s.active)
    .map((s) => s.name.trim())
    .filter(Boolean);
  const fromClasses = (data.classes ?? []).map((c) => (c.sport ?? '').trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const sport of [...fromSports, ...fromClasses]) {
    const key = sport.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(sport);
  }
  return result;
}

export function gdprItemsFromPublicConsent(
  personalDataAccepted: boolean,
  amkaAccepted: boolean,
): PublicJoinGdprItems {
  return {
    personalData: personalDataAccepted,
    photoUse: personalDataAccepted,
    gallery: personalDataAccepted,
    communication: personalDataAccepted,
    medical: personalDataAccepted,
    amkaHealthCard: amkaAccepted,
  };
}

export function gdprItemsFromJoinDeclarations(input: {
  gdprAcknowledged: boolean;
  mediaConsent: PublicJoinExtras['mediaConsent'] | '';
  healthDeclaration: PublicJoinExtras['healthDeclaration'] | '';
  amkaAccepted: boolean;
}): PublicJoinGdprItems {
  const photo = input.mediaConsent === 'consent';
  return {
    personalData: input.gdprAcknowledged,
    photoUse: photo,
    gallery: photo,
    communication: input.gdprAcknowledged,
    medical: input.healthDeclaration === 'allow',
    amkaHealthCard: input.amkaAccepted,
  };
}

export function gdprConsentStatusFromItems(items: PublicJoinGdprItems): Student['gdprConsent'] {
  const coreOn =
    items.personalData &&
    items.photoUse &&
    items.gallery &&
    items.communication &&
    items.medical;
  return coreOn ? 'full' : 'pending';
}

export type PublicJoinRequiredInput = {
  amka?: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  gender: string;
  athleteEmail?: string;
  phone?: string;
  fatherFirstName?: string;
  motherFirstName?: string;
  fatherEmail?: string;
  motherEmail?: string;
  guardianPhone: string;
  motherPhone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  county?: string;
  sport?: string;
  uniformSize?: string;
  notes?: string;
  joinExtras?: PublicJoinExtras | typeof EMPTY_PUBLIC_JOIN_EXTRAS;
};

function trimField(value: string | undefined): string {
  return (value ?? '').trim();
}

/** Επιστρέφει μήνυμα σφάλματος ή null αν όλα τα πεδία είναι συμπληρωμένα. */
export function validatePublicJoinRequiredFields(input: PublicJoinRequiredInput): string | null {
  if (!trimField(input.amka)) return 'Συμπληρώστε ΑΜΚΑ.';
  if (trimField(input.firstName).length < 2) return 'Συμπληρώστε όνομα.';
  if (trimField(input.lastName).length < 2) return 'Συμπληρώστε επώνυμο.';
  if (!trimField(input.birthDate)) return 'Συμπληρώστε ημερομηνία γέννησης.';
  if (!trimField(input.gender)) return 'Επιλέξτε φύλο.';
  const athleteEmail = trimField(input.athleteEmail);
  if (!athleteEmail.includes('@')) return 'Συμπληρώστε email αθλητή.';
  if (!trimField(input.phone)) return 'Συμπληρώστε τηλέφωνο αθλητή.';
  if (!trimField(input.fatherFirstName)) return 'Συμπληρώστε πατρώνυμο.';
  if (!trimField(input.motherFirstName)) return 'Συμπληρώστε μητρώνυμο.';
  const fatherEmail = trimField(input.fatherEmail);
  if (!fatherEmail.includes('@')) return 'Συμπληρώστε email πατρός.';
  const motherEmail = trimField(input.motherEmail);
  if (!motherEmail.includes('@')) return 'Συμπληρώστε email μητρός.';
  if (!trimField(input.guardianPhone)) return 'Συμπληρώστε τηλέφωνο πατρός.';
  if (!trimField(input.motherPhone)) return 'Συμπληρώστε τηλέφωνο μητρός.';
  if (!trimField(input.address)) return 'Συμπληρώστε διεύθυνση.';
  if (!trimField(input.postalCode)) return 'Συμπληρώστε Τ.Κ.';
  if (!trimField(input.city)) return 'Συμπληρώστε πόλη.';
  if (!trimField(input.county)) return 'Συμπληρώστε νομό.';
  if (!trimField(input.sport)) return 'Επιλέξτε άθλημα.';
  if (!trimField(input.uniformSize)) return 'Επιλέξτε μέγεθος στολής.';
  const extrasError = validatePublicJoinExtras(input.joinExtras ?? EMPTY_PUBLIC_JOIN_EXTRAS);
  if (extrasError) return extrasError;
  return null;
}

export function buildStudentFromRegistrationApplication(
  app: RegistrationApplication,
  clubName: string,
  cls: AcademyClass | null,
  athleteId: string,
  options?: { status?: Student['status']; comments?: string },
): Student {
  const gdprItems = app.gdprItems ?? gdprItemsFromPublicConsent(true, Boolean(app.amkaConsentAt));
  const guardianName =
    app.guardianName.trim() ||
    app.fatherFirstName?.trim() ||
  `${app.fatherFirstName ?? ''} ${app.lastName}`.trim();

  return {
    id: athleteId,
    firstName: app.firstName,
    lastName: app.lastName,
    email: app.athleteEmail || app.email || app.fatherEmail || '',
    phone: app.phone || '',
    birthDate: app.birthDate || '',
    guardianName,
    guardianPhone: app.guardianPhone,
    classId: app.classId,
    classIds: app.classId ? [app.classId] : [],
    status: options?.status ?? (app.kind === 'trial' ? 'trial' : 'active'),
    monthlyFee: cls?.monthlyFee ?? 0,
    enrolledAt: localDateIso(),
    gender: app.gender || '',
    clubName,
    sport: app.sport || cls?.sport || '',
    sports: app.sport ? [app.sport] : [],
    healthCard: false,
    comments: options?.comments ?? (app.notes?.trim() || 'Δημόσια εγγραφή'),
    gdprConsent: gdprConsentStatusFromItems(gdprItems),
    gdprItems,
    amka: app.amka || '',
    amkaConsentAt: app.amkaConsentAt || '',
    fatherFirstName: app.fatherFirstName || '',
    motherFirstName: app.motherFirstName || '',
    fatherEmail: app.fatherEmail || '',
    motherEmail: app.motherEmail || '',
    motherPhone: app.motherPhone || '',
    address: app.address || '',
    postalCode: app.postalCode || '',
    city: app.city || '',
    county: app.county || '',
    uniformSize: app.uniformSize || '',
    joinExtras: app.joinExtras,
  };
}

export function registrationApplicationFromPublicJoin(
  input: {
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: RegistrationApplication['gender'];
    guardianName: string;
    guardianPhone: string;
    email: string;
    classId: string | null;
    kind: RegistrationApplication['kind'];
    notes?: string;
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
  },
  meta: { id: string; status: RegistrationApplication['status']; athleteId?: string | null },
): RegistrationApplication {
  return {
    id: meta.id,
    firstName: input.firstName,
    lastName: input.lastName,
    birthDate: input.birthDate,
    gender: input.gender,
    guardianName: input.guardianName,
    guardianPhone: input.guardianPhone,
    email: input.email,
    classId: input.classId,
    kind: input.kind,
    status: meta.status,
    notes: input.notes?.trim() || '',
    createdAt: localDateIso(),
    athleteId: meta.athleteId ?? null,
    amka: input.amka?.trim() || '',
    phone: input.phone?.trim() || '',
    athleteEmail: input.athleteEmail?.trim() || '',
    fatherFirstName: input.fatherFirstName?.trim() || '',
    motherFirstName: input.motherFirstName?.trim() || '',
    fatherEmail: input.fatherEmail?.trim() || '',
    motherEmail: input.motherEmail?.trim() || '',
    motherPhone: input.motherPhone?.trim() || '',
    address: input.address?.trim() || '',
    postalCode: input.postalCode?.trim() || '',
    city: input.city?.trim() || '',
    county: input.county?.trim() || '',
    sport: input.sport?.trim() || '',
    uniformSize: input.uniformSize?.trim() || '',
    joinExtras: parsePublicJoinExtras(input.joinExtras),
    gdprItems: input.gdprItems,
    amkaConsentAt: input.amkaConsentAt || '',
    guardianSignature: input.guardianSignature || '',
  };
}
