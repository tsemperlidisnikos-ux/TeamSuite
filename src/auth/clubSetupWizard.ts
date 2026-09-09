import { isDemoSessionActive, getSession, getUsers } from './auth';
import {
  clubAllowsOnlineProvider,
  getClubById,
  getClubEurobank,
  getClubPublicRegistration,
  getClubStripe,
  getClubViva,
  isMaskedOrBlankSecret,
  updateClubSetupWizard,
  type Club,
} from './clubs';
import { isDemoClubName } from '../data/demoShowcase';

export const CLUB_SETUP_STEP_IDS = [
  'profile',
  'classes',
  'publicJoin',
  'payments',
  'secretariat',
] as const;

export type ClubSetupStepId = (typeof CLUB_SETUP_STEP_IDS)[number];

export const CLUB_SETUP_STEPS: Array<{
  id: ClubSetupStepId;
  label: string;
  hint: string;
}> = [
  {
    id: 'profile',
    label: 'Προφίλ συλλόγου',
    hint: 'Όνομα, έδρα και στοιχεία επικοινωνίας',
  },
  {
    id: 'classes',
    label: 'Πρώτο τμήμα',
    hint: 'Δημιουργήστε τουλάχιστον ένα τμήμα',
  },
  {
    id: 'publicJoin',
    label: 'Δημόσια φόρμα',
    hint: 'Ενεργοποιήστε την εγγραφή από το κινητό',
  },
  {
    id: 'payments',
    label: 'Πληρωμές',
    hint: 'Online πάροχος ή μόνο μετρητά',
  },
  {
    id: 'secretariat',
    label: 'Γραμματεία',
    hint: 'Λογαριασμός για καθημερινή λειτουργία',
  },
];

type WizardClubState = {
  dismissed?: boolean;
  skipped?: Partial<Record<ClubSetupStepId, boolean>>;
};

const STORAGE_KEY = 'teamsuite-club-setup-wizard-v1';

function readAll(): Record<string, WizardClubState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, WizardClubState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, WizardClubState>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getClubSetupState(clubId: string): WizardClubState {
  const local = readAll()[clubId] ?? {};
  const remote = getClubById(clubId)?.setupWizard;
  return {
    dismissed: Boolean(remote?.dismissed || local.dismissed),
    skipped: { ...local.skipped, ...remote?.skipped },
  };
}

function persistWizardState(clubId: string, next: WizardClubState): void {
  const map = readAll();
  map[clubId] = next;
  writeAll(map);
  updateClubSetupWizard(clubId, next);
}

export function setClubSetupDismissed(clubId: string, dismissed = true): void {
  persistWizardState(clubId, { ...getClubSetupState(clubId), dismissed });
}

export function skipClubSetupStep(clubId: string, step: ClubSetupStepId): void {
  const current = getClubSetupState(clubId);
  persistWizardState(clubId, {
    ...current,
    skipped: { ...current.skipped, [step]: true },
  });
}

export function clubHasOnlinePaymentsConfigured(clubId: string): boolean {
  const viva = getClubViva(clubId);
  if (
    viva.enabled &&
    clubAllowsOnlineProvider(clubId, 'viva') &&
    viva.clientId.trim() &&
    (!isMaskedOrBlankSecret(viva.clientSecret) || Boolean(viva.clientSecret) || Boolean(viva.merchantId.trim()))
  ) {
    return true;
  }
  const stripe = getClubStripe(clubId);
  if (
    stripe.enabled &&
    clubAllowsOnlineProvider(clubId, 'stripe') &&
    stripe.publishableKey.trim()
  ) {
    return true;
  }
  const eurobank = getClubEurobank(clubId);
  if (
    eurobank.enabled &&
    clubAllowsOnlineProvider(clubId, 'eurobank') &&
    eurobank.merchantId.trim()
  ) {
    return true;
  }
  return false;
}

export function isClubProfileReady(club: Club | null | undefined): boolean {
  if (!club) return false;
  const nameOk = String(club.name ?? '').trim().length >= 2;
  const contactOk = Boolean(
    String(club.phone ?? '').trim() ||
      String(club.email ?? '').trim() ||
      String(club.address ?? club.city ?? '').trim(),
  );
  return nameOk && contactOk;
}

export type ClubSetupProgress = {
  done: Record<ClubSetupStepId, boolean>;
  doneCount: number;
  total: number;
  complete: boolean;
  nextStep: ClubSetupStepId | null;
};

export function getClubSetupProgress(
  clubId: string,
  options: { classCount: number },
): ClubSetupProgress {
  const club = getClubById(clubId);
  const skipped = getClubSetupState(clubId).skipped ?? {};
  const pub = getClubPublicRegistration(clubId);
  const hasSecretariat = getUsers().some(
    (user) => user.clubId === clubId && user.role === 'secretariat' && user.active,
  );

  const done: Record<ClubSetupStepId, boolean> = {
    profile: isClubProfileReady(club),
    classes: options.classCount > 0 || Boolean(skipped.classes),
    publicJoin: Boolean(pub.enabled) || Boolean(skipped.publicJoin),
    payments: clubHasOnlinePaymentsConfigured(clubId) || Boolean(skipped.payments),
    secretariat: hasSecretariat || Boolean(skipped.secretariat),
  };

  const doneCount = CLUB_SETUP_STEP_IDS.filter((id) => done[id]).length;
  const nextStep = CLUB_SETUP_STEP_IDS.find((id) => !done[id]) ?? null;

  return {
    done,
    doneCount,
    total: CLUB_SETUP_STEP_IDS.length,
    complete: doneCount === CLUB_SETUP_STEP_IDS.length,
    nextStep,
  };
}

export function canManageClubSetup(): boolean {
  const session = getSession();
  return session?.role === 'admin' || session?.role === 'platform_admin';
}

export function shouldOfferClubSetup(
  clubId: string | null | undefined,
  options: { classCount: number; studentCount: number },
): boolean {
  if (!clubId || !canManageClubSetup()) return false;
  if (isDemoSessionActive()) return false;
  const club = getClubById(clubId);
  if (!club || isDemoClubName(club.name)) return false;
  if (getClubSetupState(clubId).dismissed) return false;

  const progress = getClubSetupProgress(clubId, { classCount: options.classCount });
  if (progress.complete) return false;

  const createdMs = Date.parse(club.createdAt);
  const ageDays = Number.isFinite(createdMs) ? (Date.now() - createdMs) / 86_400_000 : 999;
  const sparse = options.classCount === 0 || options.studentCount < 3 || progress.doneCount <= 2;
  if (ageDays > 45 && !sparse) return false;
  return true;
}
