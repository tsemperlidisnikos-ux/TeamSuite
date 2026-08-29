import type { StudentInput } from '../schemas';
import type { Gender, Student, StudentStatus } from '../types';
import {
  CLOTHING_PACKAGE_OPTIONS,
  HEALTH_OPTIONS,
  ISTOS_OPTIONS,
  LIABILITY_OPTIONS,
  MEDIA_OPTIONS,
  PAYMENT_OPTIONS,
  parsePublicJoinExtras,
  type PublicJoinExtras,
} from '../shared/publicJoinExtras';
import { studentStatusLabels } from './labels';
import { studentClassIds } from './studentClasses';
import { studentCoachNames } from './studentCoaches';
import { studentSports } from './studentSports';

export type AthleteSheetClass = { id: string; name: string };

type ColumnKey =
  | 'id'
  | 'lastName'
  | 'firstName'
  | 'status'
  | 'email'
  | 'phone'
  | 'birthDate'
  | 'gender'
  | 'amka'
  | 'sports'
  | 'classes'
  | 'guardianName'
  | 'guardianPhone'
  | 'fatherFirstName'
  | 'fatherEmail'
  | 'motherFirstName'
  | 'motherEmail'
  | 'motherPhone'
  | 'address'
  | 'postalCode'
  | 'city'
  | 'county'
  | 'placeOfBirth'
  | 'nationality'
  | 'communicationLanguage'
  | 'clubName'
  | 'registrationNumber'
  | 'jerseyNumber'
  | 'position'
  | 'athleticLevel'
  | 'athleticStartDate'
  | 'coaches'
  | 'enrolledAt'
  | 'monthlyFee'
  | 'registrationFee'
  | 'registrationCharge'
  | 'monthlyCharge'
  | 'customCharge'
  | 'seasonTicket'
  | 'subscriptionDiscount'
  | 'discountAmount'
  | 'discountReason'
  | 'healthCard'
  | 'healthCardStatus'
  | 'healthCardExpires'
  | 'consentExpires'
  | 'uniformReceived'
  | 'uniformSize'
  | 'gdprConsent'
  | 'gdprPersonalData'
  | 'gdprPhotoUse'
  | 'gdprGallery'
  | 'gdprCommunication'
  | 'gdprMedical'
  | 'gdprAmka'
  | 'amkaConsentAt'
  | 'healthCardSealedAt'
  | 'emergencyName'
  | 'emergencyPhone'
  | 'emergencyRelation'
  | 'emergencyAltPhone'
  | 'doctorName'
  | 'doctorPhone'
  | 'bloodType'
  | 'allergies'
  | 'chronicConditions'
  | 'medication'
  | 'registrationExpires'
  | 'autoRenewal'
  | 'clothingPackage'
  | 'istosProgram'
  | 'preferredPayment'
  | 'healthDeclaration'
  | 'liabilityAcceptance'
  | 'mediaConsent'
  | 'comments';

const COLUMNS: Array<{ key: ColumnKey; header: string; aliases?: string[] }> = [
  { key: 'id', header: 'Κωδικός' },
  { key: 'lastName', header: 'Επώνυμο' },
  { key: 'firstName', header: 'Όνομα' },
  { key: 'status', header: 'Κατάσταση' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Τηλέφωνο αθλητή' },
  { key: 'birthDate', header: 'Ημ. γέννησης', aliases: ['Ημερομηνία γέννησης'] },
  { key: 'gender', header: 'Φύλο' },
  { key: 'amka', header: 'ΑΜΚΑ' },
  { key: 'sports', header: 'Αθλήματα', aliases: ['Άθλημα'] },
  { key: 'classes', header: 'Τμήματα', aliases: ['Τμήμα'] },
  { key: 'guardianName', header: 'Γονέας / κηδεμόνας', aliases: ['Γονέας'] },
  { key: 'guardianPhone', header: 'Τηλ. γονέα' },
  { key: 'fatherFirstName', header: 'Όνομα πατέρα' },
  { key: 'fatherEmail', header: 'Email πατέρα' },
  { key: 'motherFirstName', header: 'Όνομα μητέρας' },
  { key: 'motherEmail', header: 'Email μητέρας' },
  { key: 'motherPhone', header: 'Τηλ. μητέρας' },
  { key: 'address', header: 'Διεύθυνση' },
  { key: 'postalCode', header: 'Τ.Κ.' },
  { key: 'city', header: 'Πόλη' },
  { key: 'county', header: 'Νομός' },
  { key: 'placeOfBirth', header: 'Τόπος γέννησης' },
  { key: 'nationality', header: 'Εθνικότητα' },
  { key: 'communicationLanguage', header: 'Γλώσσα επικοινωνίας' },
  { key: 'clubName', header: 'Σωματείο' },
  { key: 'registrationNumber', header: 'Αριθμός μητρώου' },
  { key: 'jerseyNumber', header: 'Αριθμός φανέλας' },
  { key: 'position', header: 'Θέση' },
  { key: 'athleticLevel', header: 'Αγωνιστικό επίπεδο' },
  { key: 'athleticStartDate', header: 'Έναρξη αθλητισμού' },
  { key: 'coaches', header: 'Προπονητές', aliases: ['Προπονητής'] },
  { key: 'enrolledAt', header: 'Ημ. εγγραφής' },
  { key: 'monthlyFee', header: 'Μηνιαίο δίδακτρο' },
  { key: 'registrationFee', header: 'Πάγιο εγγραφής' },
  { key: 'registrationCharge', header: 'Χρέωση εγγραφής' },
  { key: 'monthlyCharge', header: 'Μηνιαία χρέωση' },
  { key: 'customCharge', header: 'Ειδική χρέωση' },
  { key: 'seasonTicket', header: 'Εισιτήριο σεζόν' },
  { key: 'subscriptionDiscount', header: 'Έκπτωση συνδρομής' },
  { key: 'discountAmount', header: 'Ποσό έκπτωσης' },
  { key: 'discountReason', header: 'Αιτία έκπτωσης' },
  { key: 'healthCard', header: 'Κάρτα υγείας' },
  { key: 'healthCardStatus', header: 'Κατάσταση κάρτας υγείας' },
  { key: 'healthCardExpires', header: 'Λήξη κάρτας υγείας' },
  { key: 'consentExpires', header: 'Λήξη συναίνεσης' },
  { key: 'uniformReceived', header: 'Παρελήφθη στολή' },
  { key: 'uniformSize', header: 'Μέγεθος στολής' },
  { key: 'gdprConsent', header: 'GDPR' },
  { key: 'gdprPersonalData', header: 'GDPR προσωπικά' },
  { key: 'gdprPhotoUse', header: 'GDPR φωτογραφία' },
  { key: 'gdprGallery', header: 'GDPR gallery' },
  { key: 'gdprCommunication', header: 'GDPR επικοινωνία' },
  { key: 'gdprMedical', header: 'GDPR ιατρικά' },
  { key: 'gdprAmka', header: 'GDPR ΑΜΚΑ' },
  { key: 'amkaConsentAt', header: 'Ημ. συναίνεσης ΑΜΚΑ' },
  { key: 'healthCardSealedAt', header: 'Σφράγιση κάρτας υγείας' },
  { key: 'emergencyName', header: 'Επείγον όνομα' },
  { key: 'emergencyPhone', header: 'Επείγον τηλέφωνο' },
  { key: 'emergencyRelation', header: 'Επείγον σχέση' },
  { key: 'emergencyAltPhone', header: 'Επείγον εναλλακτικό τηλ.' },
  { key: 'doctorName', header: 'Γιατρός' },
  { key: 'doctorPhone', header: 'Τηλ. γιατρού' },
  { key: 'bloodType', header: 'Ομάδα αίματος' },
  { key: 'allergies', header: 'Αλλεργίες' },
  { key: 'chronicConditions', header: 'Χρόνια νοσήματα' },
  { key: 'medication', header: 'Φαρμακευτική αγωγή' },
  { key: 'registrationExpires', header: 'Λήξη εγγραφής' },
  { key: 'autoRenewal', header: 'Αυτόματη ανανέωση' },
  { key: 'clothingPackage', header: 'Πακέτο ρουχισμού' },
  { key: 'istosProgram', header: 'Πρόγραμμα ΙΣΤΟΣ' },
  { key: 'preferredPayment', header: 'Προτιμώμενη πληρωμή' },
  { key: 'healthDeclaration', header: 'Δήλωση υγείας' },
  { key: 'liabilityAcceptance', header: 'Δήλωση ευθύνης' },
  { key: 'mediaConsent', header: 'Συναίνεση φωτογράφισης' },
  { key: 'comments', header: 'Σχόλια' },
];

const DATE_KEYS = new Set<ColumnKey>([
  'birthDate',
  'athleticStartDate',
  'enrolledAt',
  'healthCardExpires',
  'consentExpires',
  'amkaConsentAt',
  'healthCardSealedAt',
  'registrationExpires',
]);

function normHeader(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('el');
}

const HEADER_TO_KEY = new Map<string, ColumnKey>();
for (const col of COLUMNS) {
  HEADER_TO_KEY.set(normHeader(col.header), col.key);
  for (const alias of col.aliases ?? []) {
    HEADER_TO_KEY.set(normHeader(alias), col.key);
  }
}

function yesNo(value: boolean | undefined): string {
  if (value == null) return '';
  return value ? 'Ναι' : 'Όχι';
}

function genderLabel(value: Gender | undefined): string {
  if (value === 'boy') return 'Αγόρι';
  if (value === 'girl') return 'Κορίτσι';
  if (value === 'other') return 'Άλλο';
  return '';
}

function gdprLabel(value: Student['gdprConsent']): string {
  if (value === 'full') return 'Πλήρης';
  if (value === 'locked') return 'Κλειδωμένη';
  if (value === 'pending') return 'Εκκρεμής';
  return '';
}

function optionLabel<T extends string>(options: Array<{ value: T; label: string }>, value: T | undefined): string {
  if (!value) return '';
  return options.find((o) => o.value === value)?.label ?? value;
}

function splitList(raw: string): string[] {
  return raw
    .split(/[,;/|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBool(raw: string): boolean | undefined {
  const v = raw.trim().toLocaleLowerCase('el');
  if (!v) return undefined;
  if (['ναι', 'yes', 'true', '1', 'ν', 'y'].includes(v)) return true;
  if (['όχι', 'οχι', 'no', 'false', '0', 'n'].includes(v)) return false;
  return undefined;
}

function parseNumber(raw: string): number | undefined {
  const v = raw.trim().replace(',', '.');
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function excelSerialToIso(serial: number): string {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

function parseDate(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v);
  if (dmy) {
    const day = dmy[1]!.padStart(2, '0');
    const month = dmy[2]!.padStart(2, '0');
    return `${dmy[3]}-${month}-${day}`;
  }
  const asNum = Number(v.replace(',', '.'));
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 80000) {
    return excelSerialToIso(asNum);
  }
  return v;
}

function parseGender(raw: string): Gender | undefined {
  const v = raw.trim().toLocaleLowerCase('el');
  if (!v) return '';
  if (['αγόρι', 'αγορι', 'boy', 'm', 'male', 'άνδρας', 'ανδρας'].includes(v)) return 'boy';
  if (['κορίτσι', 'κοριτσι', 'girl', 'f', 'female', 'γυναίκα', 'γυναικα'].includes(v)) return 'girl';
  if (['άλλο', 'αλλο', 'other'].includes(v)) return 'other';
  return undefined;
}

function parseStatus(raw: string): StudentStatus | undefined {
  const v = raw.trim().toLocaleLowerCase('el');
  if (!v) return undefined;
  if (['ενεργός', 'ενεργος', 'active'].includes(v)) return 'active';
  if (['ανενεργός', 'ανενεργος', 'inactive'].includes(v)) return 'inactive';
  if (['δοκιμαστικός', 'δοκιμαστικος', 'trial'].includes(v)) return 'trial';
  return undefined;
}

function parseGdpr(raw: string): Student['gdprConsent'] | undefined {
  const v = raw.trim().toLocaleLowerCase('el');
  if (!v) return undefined;
  if (['πλήρης', 'πληρης', 'full'].includes(v)) return 'full';
  if (['κλειδωμένη', 'κλειδωμενη', 'locked'].includes(v)) return 'locked';
  if (['εκκρεμής', 'εκκρεμης', 'pending'].includes(v)) return 'pending';
  return undefined;
}

function parseOption<T extends string>(
  raw: string,
  options: Array<{ value: T; label: string }>,
): T | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const byValue = options.find((o) => o.value === v || o.value === v.toLowerCase());
  if (byValue) return byValue.value;
  const norm = normHeader(v);
  const byLabel = options.find((o) => normHeader(o.label) === norm);
  return byLabel?.value;
}

function classNameMap(classes: AthleteSheetClass[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const cls of classes) {
    map.set(normHeader(cls.name), cls.id);
  }
  return map;
}

export function athleteSheetHeaders(): string[] {
  return COLUMNS.map((c) => c.header);
}

export function studentToSheetRow(student: Student, classes: AthleteSheetClass[]): string[] {
  const classNames = studentClassIds(student)
    .map((id) => classes.find((c) => c.id === id)?.name)
    .filter(Boolean)
    .join(', ');
  const extras = student.joinExtras;
  const rec: Record<ColumnKey, string> = {
    id: student.id,
    lastName: student.lastName ?? '',
    firstName: student.firstName ?? '',
    status: studentStatusLabels[student.status] ?? student.status,
    email: student.email ?? '',
    phone: student.phone ?? '',
    birthDate: student.birthDate ?? '',
    gender: genderLabel(student.gender),
    amka: student.amka ?? '',
    sports: studentSports(student).join(', '),
    classes: classNames,
    guardianName: student.guardianName ?? '',
    guardianPhone: student.guardianPhone ?? '',
    fatherFirstName: student.fatherFirstName ?? '',
    fatherEmail: student.fatherEmail ?? '',
    motherFirstName: student.motherFirstName ?? '',
    motherEmail: student.motherEmail ?? '',
    motherPhone: student.motherPhone ?? '',
    address: student.address ?? '',
    postalCode: student.postalCode ?? '',
    city: student.city ?? '',
    county: student.county ?? '',
    placeOfBirth: student.placeOfBirth ?? '',
    nationality: student.nationality ?? '',
    communicationLanguage: student.communicationLanguage ?? '',
    clubName: student.clubName ?? '',
    registrationNumber: student.registrationNumber ?? '',
    jerseyNumber: student.jerseyNumber ?? '',
    position: student.position ?? '',
    athleticLevel: student.athleticLevel ?? '',
    athleticStartDate: student.athleticStartDate ?? '',
    coaches: studentCoachNames(student).join(', '),
    enrolledAt: student.enrolledAt ?? '',
    monthlyFee: String(student.monthlyFee ?? ''),
    registrationFee: student.registrationFee == null ? '' : String(student.registrationFee),
    registrationCharge: yesNo(student.registrationCharge),
    monthlyCharge: yesNo(student.monthlyCharge),
    customCharge: yesNo(student.customCharge),
    seasonTicket: yesNo(student.seasonTicket),
    subscriptionDiscount: yesNo(student.subscriptionDiscount),
    discountAmount: student.discountAmount == null ? '' : String(student.discountAmount),
    discountReason: student.discountReason ?? '',
    healthCard: yesNo(student.healthCard),
    healthCardStatus: student.healthCardStatus ?? '',
    healthCardExpires: student.healthCardExpires ?? '',
    consentExpires: student.consentExpires ?? '',
    uniformReceived: yesNo(student.uniformReceived),
    uniformSize: student.uniformSize ?? '',
    gdprConsent: gdprLabel(student.gdprConsent),
    gdprPersonalData: yesNo(student.gdprItems?.personalData),
    gdprPhotoUse: yesNo(student.gdprItems?.photoUse),
    gdprGallery: yesNo(student.gdprItems?.gallery),
    gdprCommunication: yesNo(student.gdprItems?.communication),
    gdprMedical: yesNo(student.gdprItems?.medical),
    gdprAmka: yesNo(student.gdprItems?.amkaHealthCard),
    amkaConsentAt: student.amkaConsentAt ?? '',
    healthCardSealedAt: student.healthCardSealedAt ?? '',
    emergencyName: student.emergencyName ?? '',
    emergencyPhone: student.emergencyPhone ?? '',
    emergencyRelation: student.emergencyRelation ?? '',
    emergencyAltPhone: student.emergencyAltPhone ?? '',
    doctorName: student.doctorName ?? '',
    doctorPhone: student.doctorPhone ?? '',
    bloodType: student.bloodType ?? '',
    allergies: student.allergies ?? '',
    chronicConditions: student.chronicConditions ?? '',
    medication: student.medication ?? '',
    registrationExpires: student.registrationExpires ?? '',
    autoRenewal: yesNo(student.autoRenewal),
    clothingPackage: optionLabel(CLOTHING_PACKAGE_OPTIONS, extras?.clothingPackage),
    istosProgram: optionLabel(ISTOS_OPTIONS, extras?.istosProgram),
    preferredPayment: optionLabel(PAYMENT_OPTIONS, extras?.preferredPayment),
    healthDeclaration: optionLabel(HEALTH_OPTIONS, extras?.healthDeclaration),
    liabilityAcceptance: optionLabel(LIABILITY_OPTIONS, extras?.liabilityAcceptance),
    mediaConsent: optionLabel(MEDIA_OPTIONS, extras?.mediaConsent),
    comments: student.comments ?? '',
  };
  return COLUMNS.map((c) => rec[c.key]);
}

export function studentToInput(student: Student): StudentInput {
  const { id: _id, enrolledAt: _enrolled, ...rest } = student;
  return rest as StudentInput;
}

export type AthleteImportAction = {
  rowNumber: number;
  mode: 'create' | 'update';
  existingId?: string;
  input: StudentInput;
  label: string;
};

export type AthleteImportPlan = {
  actions: AthleteImportAction[];
  errors: string[];
};

function emptyInput(): StudentInput {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthDate: '',
    guardianName: '',
    guardianPhone: '',
    classId: null,
    classIds: [] as string[],
    status: 'active',
    monthlyFee: 0,
    sports: [] as string[],
    coachNames: [] as string[],
    healthCardExpires: '',
    consentExpires: '',
  };
}

function applyCell(
  draft: StudentInput,
  key: ColumnKey,
  raw: string,
  classes: AthleteSheetClass[],
  errors: string[],
  rowNumber: number,
): void {
  const value = DATE_KEYS.has(key) ? parseDate(raw) : raw.trim();
  const rowErr = (msg: string) => errors.push(`Γραμμή ${rowNumber}: ${msg}`);

  switch (key) {
    case 'id':
    case 'enrolledAt':
      return;
    case 'lastName':
      draft.lastName = value;
      return;
    case 'firstName':
      draft.firstName = value;
      return;
    case 'status': {
      const status = parseStatus(value);
      if (value && !status) rowErr(`άγνωστη κατάσταση «${raw}».`);
      if (status) draft.status = status;
      return;
    }
    case 'email':
      draft.email = value;
      return;
    case 'phone':
      draft.phone = value;
      return;
    case 'birthDate':
      draft.birthDate = value;
      return;
    case 'gender': {
      const gender = parseGender(value);
      if (value && gender === undefined) rowErr(`άγνωστο φύλο «${raw}».`);
      if (gender !== undefined) draft.gender = gender;
      return;
    }
    case 'amka':
      draft.amka = value;
      return;
    case 'sports': {
      const list = splitList(value);
      draft.sports = list;
      draft.sport = list[0] ?? '';
      return;
    }
    case 'classes': {
      const names = splitList(value);
      const map = classNameMap(classes);
      const ids: string[] = [];
      const missing: string[] = [];
      for (const name of names) {
        const id = map.get(normHeader(name));
        if (id) ids.push(id);
        else missing.push(name);
      }
      if (missing.length) {
        rowErr(`δεν βρέθηκαν τμήματα: ${missing.join(', ')}.`);
      }
      draft.classIds = ids;
      draft.classId = ids[0] ?? null;
      return;
    }
    case 'guardianName':
      draft.guardianName = value;
      return;
    case 'guardianPhone':
      draft.guardianPhone = value;
      return;
    case 'fatherFirstName':
      draft.fatherFirstName = value;
      return;
    case 'fatherEmail':
      draft.fatherEmail = value;
      return;
    case 'motherFirstName':
      draft.motherFirstName = value;
      return;
    case 'motherEmail':
      draft.motherEmail = value;
      return;
    case 'motherPhone':
      draft.motherPhone = value;
      return;
    case 'address':
      draft.address = value;
      return;
    case 'postalCode':
      draft.postalCode = value;
      return;
    case 'city':
      draft.city = value;
      return;
    case 'county':
      draft.county = value;
      return;
    case 'placeOfBirth':
      draft.placeOfBirth = value;
      return;
    case 'nationality':
      draft.nationality = value;
      return;
    case 'communicationLanguage':
      draft.communicationLanguage = value;
      return;
    case 'clubName':
      draft.clubName = value;
      return;
    case 'registrationNumber':
      draft.registrationNumber = value;
      return;
    case 'jerseyNumber':
      draft.jerseyNumber = value;
      return;
    case 'position':
      draft.position = value;
      return;
    case 'athleticLevel':
      draft.athleticLevel = value;
      return;
    case 'athleticStartDate':
      draft.athleticStartDate = value;
      return;
    case 'coaches': {
      const list = splitList(value);
      draft.coachNames = list;
      draft.coachName = list[0] ?? '';
      return;
    }
    case 'monthlyFee': {
      const n = parseNumber(value);
      if (value && n == null) rowErr(`μη έγκυρο μηνιαίο δίδακτρο.`);
      if (n != null) draft.monthlyFee = n;
      return;
    }
    case 'registrationFee': {
      const n = parseNumber(value);
      if (value && n == null) rowErr(`μη έγκυρο πάγιο εγγραφής.`);
      if (n != null) draft.registrationFee = n;
      return;
    }
    case 'registrationCharge':
      draft.registrationCharge = parseBool(value) ?? draft.registrationCharge;
      return;
    case 'monthlyCharge':
      draft.monthlyCharge = parseBool(value) ?? draft.monthlyCharge;
      return;
    case 'customCharge':
      draft.customCharge = parseBool(value) ?? draft.customCharge;
      return;
    case 'seasonTicket':
      draft.seasonTicket = parseBool(value) ?? draft.seasonTicket;
      return;
    case 'subscriptionDiscount':
      draft.subscriptionDiscount = parseBool(value) ?? draft.subscriptionDiscount;
      return;
    case 'discountAmount': {
      const n = parseNumber(value);
      if (value && n == null) rowErr(`μη έγκυρο ποσό έκπτωσης.`);
      if (n != null) draft.discountAmount = n;
      return;
    }
    case 'discountReason':
      draft.discountReason = value;
      return;
    case 'healthCard':
      draft.healthCard = parseBool(value) ?? draft.healthCard;
      return;
    case 'healthCardStatus':
      draft.healthCardStatus = value;
      return;
    case 'healthCardExpires':
      draft.healthCardExpires = value;
      return;
    case 'consentExpires':
      draft.consentExpires = value;
      return;
    case 'uniformReceived':
      draft.uniformReceived = parseBool(value) ?? draft.uniformReceived;
      return;
    case 'uniformSize':
      draft.uniformSize = value;
      return;
    case 'gdprConsent': {
      const g = parseGdpr(value);
      if (value && !g) rowErr(`άγνωστη τιμή GDPR.`);
      if (g) draft.gdprConsent = g;
      return;
    }
    case 'gdprPersonalData':
    case 'gdprPhotoUse':
    case 'gdprGallery':
    case 'gdprCommunication':
    case 'gdprMedical':
    case 'gdprAmka': {
      const b = parseBool(value);
      if (b == null) return;
      const items = draft.gdprItems ?? {
        personalData: false,
        photoUse: false,
        gallery: false,
        communication: false,
        medical: false,
      };
      if (key === 'gdprPersonalData') items.personalData = b;
      if (key === 'gdprPhotoUse') items.photoUse = b;
      if (key === 'gdprGallery') items.gallery = b;
      if (key === 'gdprCommunication') items.communication = b;
      if (key === 'gdprMedical') items.medical = b;
      if (key === 'gdprAmka') items.amkaHealthCard = b;
      draft.gdprItems = items;
      return;
    }
    case 'amkaConsentAt':
      draft.amkaConsentAt = value;
      return;
    case 'healthCardSealedAt':
      draft.healthCardSealedAt = value;
      return;
    case 'emergencyName':
      draft.emergencyName = value;
      return;
    case 'emergencyPhone':
      draft.emergencyPhone = value;
      return;
    case 'emergencyRelation':
      draft.emergencyRelation = value;
      return;
    case 'emergencyAltPhone':
      draft.emergencyAltPhone = value;
      return;
    case 'doctorName':
      draft.doctorName = value;
      return;
    case 'doctorPhone':
      draft.doctorPhone = value;
      return;
    case 'bloodType':
      draft.bloodType = value;
      return;
    case 'allergies':
      draft.allergies = value;
      return;
    case 'chronicConditions':
      draft.chronicConditions = value;
      return;
    case 'medication':
      draft.medication = value;
      return;
    case 'registrationExpires':
      draft.registrationExpires = value;
      return;
    case 'autoRenewal':
      draft.autoRenewal = parseBool(value) ?? draft.autoRenewal;
      return;
    case 'clothingPackage':
    case 'istosProgram':
    case 'preferredPayment':
    case 'healthDeclaration':
    case 'liabilityAcceptance':
    case 'mediaConsent': {
      const extras: Partial<PublicJoinExtras> = { ...(draft.joinExtras ?? {}) };
      if (key === 'clothingPackage') extras.clothingPackage = parseOption(value, CLOTHING_PACKAGE_OPTIONS);
      if (key === 'istosProgram') extras.istosProgram = parseOption(value, ISTOS_OPTIONS);
      if (key === 'preferredPayment') extras.preferredPayment = parseOption(value, PAYMENT_OPTIONS);
      if (key === 'healthDeclaration') extras.healthDeclaration = parseOption(value, HEALTH_OPTIONS);
      if (key === 'liabilityAcceptance') extras.liabilityAcceptance = parseOption(value, LIABILITY_OPTIONS);
      if (key === 'mediaConsent') extras.mediaConsent = parseOption(value, MEDIA_OPTIONS);
      const parsed = parsePublicJoinExtras(extras);
      if (parsed) draft.joinExtras = parsed;
      return;
    }
    case 'comments':
      draft.comments = value;
      return;
    default:
      return;
  }
}

function findExisting(
  students: Student[],
  id: string,
  email: string,
  firstName: string,
  lastName: string,
  birthDate: string,
): Student | undefined {
  if (id) {
    const byId = students.find((s) => s.id === id);
    if (byId) return byId;
  }
  const mail = email.trim().toLowerCase();
  if (mail) {
    const matches = students.filter((s) => (s.email || '').trim().toLowerCase() === mail);
    if (matches.length === 1) return matches[0];
  }
  const fn = firstName.trim().toLocaleLowerCase('el');
  const ln = lastName.trim().toLocaleLowerCase('el');
  const bd = birthDate.trim();
  if (fn && ln && bd) {
    const matches = students.filter(
      (s) =>
        s.firstName.trim().toLocaleLowerCase('el') === fn &&
        s.lastName.trim().toLocaleLowerCase('el') === ln &&
        (s.birthDate || '').trim() === bd,
    );
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}

export function planAthleteImport(
  grid: string[][],
  students: Student[],
  classes: AthleteSheetClass[],
): AthleteImportPlan {
  const errors: string[] = [];
  if (grid.length < 2) {
    return { actions: [], errors: ['Το αρχείο δεν έχει γραμμές δεδομένων.'] };
  }

  const header = grid[0] ?? [];
  const keyByCol: Array<ColumnKey | null> = header.map((h) => HEADER_TO_KEY.get(normHeader(h)) ?? null);
  if (!keyByCol.some((k) => k === 'lastName') || !keyByCol.some((k) => k === 'firstName')) {
    return {
      actions: [],
      errors: ['Λείπουν οι στήλες Επώνυμο και Όνομα. Χρησιμοποιήστε το αρχείο εξαγωγής της εφαρμογής.'],
    };
  }

  const actions: AthleteImportAction[] = [];
  for (let i = 1; i < grid.length; i += 1) {
    const row = grid[i] ?? [];
    const rowNumber = i + 1;
    const beforeErr = errors.length;
    const cells = new Map<ColumnKey, string>();
    keyByCol.forEach((key, col) => {
      if (!key) return;
      cells.set(key, (row[col] ?? '').trim());
    });

    const lastName = cells.get('lastName') ?? '';
    const firstName = cells.get('firstName') ?? '';
    if (!lastName && !firstName) continue;

    const id = cells.get('id') ?? '';
    const existing = findExisting(
      students,
      id,
      cells.get('email') ?? '',
      firstName,
      lastName,
      parseDate(cells.get('birthDate') ?? ''),
    );

    const draft: StudentInput = existing ? { ...studentToInput(existing) } : emptyInput();
    for (const [key, raw] of cells) {
      applyCell(draft, key, raw, classes, errors, rowNumber);
    }

    if (draft.firstName.trim().length < 2 || draft.lastName.trim().length < 2) {
      errors.push(`Γραμμή ${rowNumber}: όνομα και επώνυμο πρέπει να έχουν τουλάχιστον 2 χαρακτήρες.`);
    }

    if (errors.length > beforeErr) continue;

    const label = `${draft.lastName} ${draft.firstName}`.trim();
    actions.push({
      rowNumber,
      mode: existing ? 'update' : 'create',
      existingId: existing?.id,
      input: draft,
      label,
    });
  }

  return { actions, errors };
}
