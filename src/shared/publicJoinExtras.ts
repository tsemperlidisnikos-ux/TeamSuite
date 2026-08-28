export type ClothingPackage = 'basic' | 'upgraded';
export type IstosParticipation = 'yes' | 'no';
export type PreferredPayment = 'cash' | 'card' | 'transfer';
export type HealthDeclarationChoice = 'allow' | 'deny';
export type LiabilityChoice = 'accept' | 'decline';
export type MediaConsentChoice = 'consent' | 'decline';

export type PublicJoinExtras = {
  clothingPackage: ClothingPackage;
  istosProgram: IstosParticipation;
  preferredPayment: PreferredPayment;
  healthDeclaration: HealthDeclarationChoice;
  liabilityAcceptance: LiabilityChoice;
  mediaConsent: MediaConsentChoice;
};

export const CLOTHING_PACKAGE_OPTIONS: Array<{ value: ClothingPackage; label: string }> = [
  {
    value: 'basic',
    label: 'BASIC (ΠΟΥΓΚΙ - DOUBLE FACE - SHORTS - TSHIRT)',
  },
  {
    value: 'upgraded',
    label:
      'ΑΝΑΒΑΘΜΙΣΜΕΝΟ (DOUBLE FACE - SHORTS - TSHIRT - ΤΣΑΝΤΑ ΠΛΑΤΗΣ - ΖΑΚΕΤΑ ΦΟΥΤΕΡ ΚΟΥΚΟΥΛΑ - ΠΑΝΤΕΛΟΝΙ ΦΟΡΜΑΣ)',
  },
];

export const ISTOS_OPTIONS: Array<{ value: IstosParticipation; label: string }> = [
  { value: 'yes', label: 'Ναι' },
  { value: 'no', label: 'Όχι' },
];

export const PAYMENT_OPTIONS: Array<{ value: PreferredPayment; label: string }> = [
  { value: 'cash', label: 'Μετρητά' },
  { value: 'card', label: 'Κάρτα' },
  { value: 'transfer', label: 'Τραπεζικό έμβασμα' },
];

export const HEALTH_OPTIONS: Array<{ value: HealthDeclarationChoice; label: string }> = [
  { value: 'allow', label: 'ΕΠΙΤΡΕΠΩ' },
  { value: 'deny', label: 'ΔΕΝ ΕΠΙΤΡΕΠΩ' },
];

export const LIABILITY_OPTIONS: Array<{ value: LiabilityChoice; label: string }> = [
  { value: 'accept', label: 'ΔΕΧΟΜΑΙ' },
  { value: 'decline', label: 'ΔΕΝ ΔΕΧΟΜΑΙ' },
];

export const MEDIA_OPTIONS: Array<{ value: MediaConsentChoice; label: string }> = [
  { value: 'consent', label: 'ΣΥΝΑΙΝΩ' },
  { value: 'decline', label: 'ΔΕΝ ΣΥΝΑΙΝΩ' },
];

export const EMPTY_PUBLIC_JOIN_EXTRAS: {
  clothingPackage: ClothingPackage | '';
  istosProgram: IstosParticipation | '';
  preferredPayment: PreferredPayment | '';
  healthDeclaration: HealthDeclarationChoice | '';
  liabilityAcceptance: LiabilityChoice | '';
  mediaConsent: MediaConsentChoice | '';
} = {
  clothingPackage: '',
  istosProgram: '',
  preferredPayment: '',
  healthDeclaration: '',
  liabilityAcceptance: '',
  mediaConsent: '',
};

export function parsePublicJoinExtras(value: unknown): PublicJoinExtras | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const clothingPackage = raw.clothingPackage;
  const istosProgram = raw.istosProgram;
  const preferredPayment = raw.preferredPayment;
  const healthDeclaration = raw.healthDeclaration;
  const liabilityAcceptance = raw.liabilityAcceptance;
  const mediaConsent = raw.mediaConsent;
  if (clothingPackage !== 'basic' && clothingPackage !== 'upgraded') return undefined;
  if (istosProgram !== 'yes' && istosProgram !== 'no') return undefined;
  if (preferredPayment !== 'cash' && preferredPayment !== 'card' && preferredPayment !== 'transfer') {
    return undefined;
  }
  if (healthDeclaration !== 'allow' && healthDeclaration !== 'deny') return undefined;
  if (liabilityAcceptance !== 'accept' && liabilityAcceptance !== 'decline') return undefined;
  if (mediaConsent !== 'consent' && mediaConsent !== 'decline') return undefined;
  return {
    clothingPackage,
    istosProgram,
    preferredPayment,
    healthDeclaration,
    liabilityAcceptance,
    mediaConsent,
  };
}

export function validatePublicJoinExtras(
  extras: typeof EMPTY_PUBLIC_JOIN_EXTRAS,
): string | null {
  if (!extras.clothingPackage) return 'Επιλέξτε πακέτο ρουχισμού.';
  if (!extras.istosProgram) return 'Επιλέξτε συμμετοχή στο πρόγραμμα ΙΣΤΟΣ.';
  if (!extras.preferredPayment) return 'Επιλέξτε προτιμώμενη μέθοδο πληρωμής.';
  if (!extras.healthDeclaration) return 'Απαντήστε στην υπεύθυνη δήλωση υγείας.';
  if (!extras.liabilityAcceptance) return 'Απαντήστε στη δήλωση ευθύνης.';
  if (!extras.mediaConsent) return 'Απαντήστε στη συναίνεση φωτογράφισης.';
  return null;
}

function labelOf<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T | undefined,
): string {
  return options.find((o) => o.value === value)?.label ?? '—';
}

export function formatJoinExtrasLines(extras: PublicJoinExtras | undefined): string[] {
  if (!extras) return [];
  return [
    `Πακέτο ρουχισμού: ${labelOf(CLOTHING_PACKAGE_OPTIONS, extras.clothingPackage)}`,
    `Πρόγραμμα ΙΣΤΟΣ: ${labelOf(ISTOS_OPTIONS, extras.istosProgram)}`,
    `Πληρωμή: ${labelOf(PAYMENT_OPTIONS, extras.preferredPayment)}`,
    `Δήλωση υγείας: ${labelOf(HEALTH_OPTIONS, extras.healthDeclaration)}`,
    `Ευθύνη: ${labelOf(LIABILITY_OPTIONS, extras.liabilityAcceptance)}`,
    `Φωτογράφιση: ${labelOf(MEDIA_OPTIONS, extras.mediaConsent)}`,
  ];
}

export function formatJoinExtrasText(extras: PublicJoinExtras | undefined): string {
  return formatJoinExtrasLines(extras).join('\n');
}
