import type { AppData, Student } from '../types';
import { DEFAULT_TERMS_OF_USE_HTML } from '../shared/termsDefaults';
import { localDateIso } from '../utils/dates';
import { defaultDiscountReasons } from '../utils/discountReasons';

/** Bump to re-seed DEMO clubs after showcase content changes. */
export const DEMO_SHOWCASE_VERSION = 5;

const APPLIED_KEY = 'academyhub-demo-showcase-applied-v1';
const ATHLETES_PER_CLASS = 16;
const FEE_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

const BOY_FIRST = [
  'Δημήτρης', 'Γιάννης', 'Αλέξανδρος', 'Παύλος', 'Χρήστος', 'Νίκος', 'Κώστας', 'Μιχάλης',
  'Ανδρέας', 'Λεωνίδας', 'Πέτρος', 'Στέφανος', 'Θανάσης', 'Βασίλης', 'Ηλίας', 'Άγγελος',
  'Φίλιππος', 'Ορέστης', 'Τάσος', 'Σπύρος',
];
const GIRL_FIRST = [
  'Ελένη', 'Αναστασία', 'Μαρία', 'Ιωάννα', 'Κατερίνα', 'Σοφία', 'Νεφέλη', 'Δήμητρα',
  'Αγγελική', 'Χριστίνα', 'Ευαγγελία', 'Όλγα', 'Ειρήνη', 'Αλεξάνδρα', 'Γεωργία', 'Βασιλική',
  'Άννα', 'Δανάη', 'Ραφαέλα', 'Μελίνα',
];
const LAST_NAMES = [
  'Ιωάννου', 'Νικολάου', 'Βασιλείου', 'Γεωργίου', 'Αντωνίου', 'Χριστοδούλου', 'Μαρίνου',
  'Παπακώστα', 'Σακελλαρίου', 'Λάμπρου', 'Σταματίου', 'Δημητρίου', 'Καρράς', 'Ρήγα', 'Μάρκου',
  'Πέτρου', 'Οικονόμου', 'Λάσκαρη', 'Θεοδώρου', 'Μιχαηλίδης', 'Ζαχαρίου', 'Φωτίου', 'Κυριακού',
  'Αθανασίου', 'Μαυρίδης', 'Χατζής', 'Σπυρίδης', 'Τσάκωνας', 'Βλάχου', 'Ροδίτη', 'Σταύρου',
  'Κολιάτσου', 'Παυλίδης', 'Χριστοφή', 'Αργυρίου', 'Μανώλη', 'Σεραφείμ', 'Δουκάκης',
];
const FATHER_FIRST = ['Κώστας', 'Πέτρος', 'Ανδρέας', 'Γιώργος', 'Νίκος', 'Θανάσης', 'Παναγιώτης', 'Λευτέρης'];
const MOTHER_FIRST = ['Άννα', 'Ειρήνη', 'Σοφία', 'Ελένη', 'Μαρία', 'Καίτη', 'Όλγα', 'Δήμητρα'];
const CITIES = ['Αθήνα', 'Πειραιάς', 'Κηφισιά', 'Γλυφάδα', 'Μαρούσι'];
const UNIFORM_SIZES = ['XS', 'S', 'M', 'L'];

export function isDemoClubName(name: string | null | undefined): boolean {
  return (name ?? '').trim().toUpperCase() === 'DEMO';
}

export function isDemoShowcaseApplied(clubId: string): boolean {
  try {
    const raw = localStorage.getItem(APPLIED_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, number>;
    return map[clubId] === DEMO_SHOWCASE_VERSION;
  } catch {
    return false;
  }
}

export function markDemoShowcaseApplied(clubId: string): void {
  try {
    const raw = localStorage.getItem(APPLIED_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, number>;
    map[clubId] = DEMO_SHOWCASE_VERSION;
    localStorage.setItem(APPLIED_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function daysFromToday(offset: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return localDateIso(d);
}

function svgPhoto(label: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="hsl(${hue} 45% 28%)"/>
    <stop offset="100%" stop-color="hsl(${hue + 40} 40% 42%)"/>
  </linearGradient></defs>
  <rect width="640" height="400" fill="url(#g)"/>
  <text x="320" y="200" text-anchor="middle" fill="white" font-family="Segoe UI,sans-serif" font-size="28">${label}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

type GenderMix = 'boy' | 'girl' | 'mixed';

interface ClassSpec {
  id: string;
  short: string;
  name: string;
  sport: string;
  ageGroup: string;
  coachId: string;
  coachFullName: string;
  monthlyFee: number;
  registrationFee: number;
  scheduleSummary: string;
  genderMix: GenderMix;
  birthYearMin: number;
  birthYearMax: number;
  facility: string;
  slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  trainingNotesPast: string;
  trainingNotesFuture: string;
  showcaseIds: string[];
}

const CLASS_SPECS: ClassSpec[] = [
  {
    id: 'demo_class_bask_u12',
    short: 'bask_u12',
    name: 'U12 Αγόρια',
    sport: 'Μπάσκετ',
    ageGroup: 'U12',
    coachId: 'demo_coach_1',
    coachFullName: 'Νίκος Παπαδόπουλος',
    monthlyFee: 50,
    registrationFee: 60,
    scheduleSummary: 'Δε–Τε–Πα 18:00',
    genderMix: 'boy',
    birthYearMin: 2013,
    birthYearMax: 2014,
    facility: 'Κλειστό 1',
    slots: [
      { dayOfWeek: 1, startTime: '18:00', endTime: '19:30' },
      { dayOfWeek: 3, startTime: '18:00', endTime: '19:30' },
      { dayOfWeek: 5, startTime: '18:00', endTime: '19:30' },
    ],
    trainingNotesPast: 'Τεχνική ντρίμπλας & τελειώματα',
    trainingNotesFuture: 'Σουτ & ριμπάουντ',
    showcaseIds: ['demo_ath_f1', 'demo_ath_f2', 'demo_ath_f3', 'demo_ath_f4', 'demo_ath_f5'],
  },
  {
    id: 'demo_class_bask_u14',
    short: 'bask_u14',
    name: 'U14 Κορίτσια',
    sport: 'Μπάσκετ',
    ageGroup: 'U14',
    coachId: 'demo_coach_2',
    coachFullName: 'Μαρία Κωνσταντίνου',
    monthlyFee: 50,
    registrationFee: 60,
    scheduleSummary: 'Τρ–Πε 17:30',
    genderMix: 'girl',
    birthYearMin: 2011,
    birthYearMax: 2012,
    facility: 'Κλειστό 1',
    slots: [
      { dayOfWeek: 2, startTime: '17:30', endTime: '19:00' },
      { dayOfWeek: 4, startTime: '17:30', endTime: '19:00' },
    ],
    trainingNotesPast: 'Άμυνα man-to-man',
    trainingNotesFuture: 'Τρίποντα & pick and roll',
    showcaseIds: ['demo_ath_b1', 'demo_ath_b2', 'demo_ath_b3', 'demo_ath_b4', 'demo_ath_b5'],
  },
  {
    id: 'demo_class_voll_u14',
    short: 'voll_u14',
    name: 'U14 Αγόρια',
    sport: 'Βόλεϊ',
    ageGroup: 'U14',
    coachId: 'demo_coach_5',
    coachFullName: 'Κώστας Νικολαΐδης',
    monthlyFee: 48,
    registrationFee: 55,
    scheduleSummary: 'Δε–Τε 19:30',
    genderMix: 'boy',
    birthYearMin: 2011,
    birthYearMax: 2012,
    facility: 'Κλειστό 2',
    slots: [
      { dayOfWeek: 1, startTime: '19:30', endTime: '21:00' },
      { dayOfWeek: 3, startTime: '19:30', endTime: '21:00' },
    ],
    trainingNotesPast: 'Υποδοχή & πάσα',
    trainingNotesFuture: 'Επίθεση από θέση 4',
    showcaseIds: [],
  },
  {
    id: 'demo_class_voll_u16',
    short: 'voll_u16',
    name: 'U16 Κορίτσια',
    sport: 'Βόλεϊ',
    ageGroup: 'U16',
    coachId: 'demo_coach_6',
    coachFullName: 'Ελένη Παππά',
    monthlyFee: 48,
    registrationFee: 55,
    scheduleSummary: 'Τρ–Πε 19:30',
    genderMix: 'girl',
    birthYearMin: 2009,
    birthYearMax: 2010,
    facility: 'Κλειστό 2',
    slots: [
      { dayOfWeek: 2, startTime: '19:30', endTime: '21:00' },
      { dayOfWeek: 4, startTime: '19:30', endTime: '21:00' },
    ],
    trainingNotesPast: 'Μπλοκ & άμυνα',
    trainingNotesFuture: 'Σερβίς jump',
    showcaseIds: [],
  },
  {
    id: 'demo_class_swim_beg',
    short: 'swim_beg',
    name: 'Κολύμβηση Αρχάριοι',
    sport: 'Κολύμβηση',
    ageGroup: '8–12',
    coachId: 'demo_coach_3',
    coachFullName: 'Γιώργος Αλεξίου',
    monthlyFee: 55,
    registrationFee: 40,
    scheduleSummary: 'Σάβ 10:00',
    genderMix: 'mixed',
    birthYearMin: 2014,
    birthYearMax: 2016,
    facility: 'Κολυμβητήριο',
    slots: [{ dayOfWeek: 6, startTime: '10:00', endTime: '11:00' }],
    trainingNotesPast: 'Ελεύθερο 25μ',
    trainingNotesFuture: 'Τεχνική αναπνοής',
    showcaseIds: ['demo_ath_s1', 'demo_ath_s2', 'demo_ath_s3', 'demo_ath_s4', 'demo_ath_s5'],
  },
  {
    id: 'demo_class_swim_adv',
    short: 'swim_adv',
    name: 'Κολύμβηση Προχωρημένοι',
    sport: 'Κολύμβηση',
    ageGroup: '12–16',
    coachId: 'demo_coach_4',
    coachFullName: 'Δήμητρα Σωτηρίου',
    monthlyFee: 55,
    registrationFee: 40,
    scheduleSummary: 'Τε 17:00 · Σάβ 11:15',
    genderMix: 'mixed',
    birthYearMin: 2010,
    birthYearMax: 2013,
    facility: 'Κολυμβητήριο',
    slots: [
      { dayOfWeek: 3, startTime: '17:00', endTime: '18:15' },
      { dayOfWeek: 6, startTime: '11:15', endTime: '12:30' },
    ],
    trainingNotesPast: 'Πεταλούδα & μικτή ατομική',
    trainingNotesFuture: 'Σετ αντοχής 8×50μ',
    showcaseIds: [],
  },
];

const SHOWCASE: Record<string, Partial<Student>> = {
  demo_ath_f1: {
    firstName: 'Δημήτρης',
    lastName: 'Ιωάννου',
    email: 'dimitris.ioannou@demo.local',
    phone: '6942000001',
    birthDate: '2014-03-12',
    guardianName: 'Κώστας Ιωάννου',
    guardianPhone: '6943000001',
    amka: '12031401234',
    gender: 'boy',
    fatherFirstName: 'Κώστας',
    motherFirstName: 'Άννα',
    fatherEmail: 'kostas.ioannou@demo.local',
    motherEmail: 'anna.ioannou@demo.local',
    motherPhone: '6943000011',
    address: 'Μεσογείων 45',
    postalCode: '11526',
    city: 'Αθήνα',
    registrationNumber: 'REG-1001',
    uniformSize: 'M',
    gdprConsent: 'full',
    gdprItems: {
      personalData: true,
      photoUse: true,
      gallery: true,
      communication: true,
      medical: true,
      amkaHealthCard: true,
    },
    comments: 'Αρχηγός ομάδας U12 Μπάσκετ',
  },
  demo_ath_f2: {
    firstName: 'Γιάννης',
    lastName: 'Νικολάου',
    email: 'giannis.nikolaou@demo.local',
    phone: '6942000002',
    birthDate: '2014-07-22',
    guardianName: 'Πέτρος Νικολάου',
    guardianPhone: '6943000002',
    gender: 'boy',
    fatherFirstName: 'Πέτρος',
    motherFirstName: 'Ειρήνη',
    city: 'Αθήνα',
    registrationNumber: 'REG-1002',
    uniformSize: 'S',
  },
  demo_ath_f3: {
    firstName: 'Αλέξανδρος',
    lastName: 'Βασιλείου',
    email: 'alex.vasileiou@demo.local',
    phone: '6942000003',
    birthDate: '2015-01-08',
    guardianName: 'Μαρία Βασιλείου',
    guardianPhone: '6943000003',
    gender: 'boy',
    city: 'Αθήνα',
    registrationNumber: 'REG-1003',
    uniformSize: 'S',
  },
  demo_ath_f4: {
    firstName: 'Παύλος',
    lastName: 'Γεωργίου',
    email: 'pavlos.geo@demo.local',
    phone: '6942000004',
    birthDate: '2014-12-01',
    guardianName: 'Ελένη Γεωργίου',
    guardianPhone: '6943000004',
    gender: 'boy',
    city: 'Πειραιάς',
    registrationNumber: 'REG-1004',
    healthCardStatus: 'Ληγμένη',
    uniformSize: 'L',
    comments: 'Οφειλή μήνα — υπενθύμιση',
  },
  demo_ath_f5: {
    firstName: 'Χρήστος',
    lastName: 'Αντωνίου',
    email: '',
    phone: '',
    birthDate: '2015-04-18',
    guardianName: 'Θανάσης Αντωνίου',
    guardianPhone: '6943000005',
    status: 'trial',
    gender: 'boy',
    city: 'Αθήνα',
    healthCard: false,
    healthCardStatus: 'Όχι',
    uniformReceived: false,
    registrationCharge: false,
    gdprConsent: 'pending',
    comments: 'Δοκιμαστική περίοδος 1 μήνα',
  },
  demo_ath_b1: {
    firstName: 'Ελένη',
    lastName: 'Χριστοδούλου',
    email: 'eleni.christ@demo.local',
    phone: '6942000011',
    birthDate: '2012-11-03',
    guardianName: 'Σοφία Χριστοδούλου',
    guardianPhone: '6943000011',
    gender: 'girl',
    fatherFirstName: 'Ανδρέας',
    motherFirstName: 'Σοφία',
    city: 'Αθήνα',
    registrationNumber: 'REG-2001',
    uniformSize: 'M',
    seasonTicket: true,
  },
  demo_ath_b2: {
    firstName: 'Αναστασία',
    lastName: 'Μαρίνου',
    email: 'anastasia.marinou@demo.local',
    phone: '6942000012',
    birthDate: '2013-05-19',
    guardianName: 'Λευτέρης Μαρίνου',
    guardianPhone: '6943000012',
    gender: 'girl',
    city: 'Αθήνα',
    registrationNumber: 'REG-2002',
    uniformReceived: false,
    uniformSize: 'S',
    subscriptionDiscount: true,
    discountAmount: 10,
    discountReason: 'Αδελφική έκπτωση',
  },
  demo_ath_b3: {
    firstName: 'Μαρία',
    lastName: 'Παπακώστα',
    email: 'maria.papakosta@demo.local',
    phone: '6942000013',
    birthDate: '2012-08-14',
    guardianName: 'Γιώργος Παπακώστας',
    guardianPhone: '6943000013',
    gender: 'girl',
    city: 'Αθήνα',
    registrationNumber: 'REG-2003',
    uniformSize: 'M',
  },
  demo_ath_b4: {
    firstName: 'Ιωάννα',
    lastName: 'Σακελλαρίου',
    email: 'ioanna.sak@demo.local',
    phone: '6942000014',
    birthDate: '2013-02-27',
    guardianName: 'Καίτη Σακελλαρίου',
    guardianPhone: '6943000014',
    gender: 'girl',
    city: 'Αθήνα',
    registrationNumber: 'REG-2004',
    uniformSize: 'S',
  },
  demo_ath_b5: {
    firstName: 'Κατερίνα',
    lastName: 'Λάμπρου',
    email: 'katerina.lambrou@demo.local',
    phone: '6942000015',
    birthDate: '2012-09-30',
    guardianName: 'Νίκος Λάμπρου',
    guardianPhone: '6943000015',
    gender: 'girl',
    city: 'Αθήνα',
    registrationNumber: 'REG-2005',
    uniformSize: 'L',
  },
  demo_ath_s1: {
    firstName: 'Μιχάλης',
    lastName: 'Σταματίου',
    email: 'michalis.stamat@demo.local',
    phone: '6942000021',
    birthDate: '2015-06-14',
    guardianName: 'Όλγα Σταματίου',
    guardianPhone: '6943000021',
    gender: 'boy',
    city: 'Αθήνα',
    registrationNumber: 'REG-3001',
    uniformSize: 'XS',
  },
  demo_ath_s2: {
    firstName: 'Σοφία',
    lastName: 'Δημητρίου',
    email: 'sofia.dim@demo.local',
    phone: '6942000022',
    birthDate: '2016-02-25',
    guardianName: 'Χρήστος Δημητρίου',
    guardianPhone: '6943000022',
    gender: 'girl',
    city: 'Αθήνα',
    registrationNumber: 'REG-3002',
    uniformSize: 'XS',
  },
  demo_ath_s3: {
    firstName: 'Ανδρέας',
    lastName: 'Καρράς',
    email: 'andreas.karras@demo.local',
    phone: '6942000023',
    birthDate: '2015-09-09',
    guardianName: 'Δήμητρα Καρρά',
    guardianPhone: '6943000023',
    gender: 'boy',
    city: 'Αθήνα',
    registrationNumber: 'REG-3003',
    uniformSize: 'S',
  },
  demo_ath_s4: {
    firstName: 'Νεφέλη',
    lastName: 'Ρήγα',
    email: 'nefeli.riga@demo.local',
    phone: '6942000024',
    birthDate: '2016-11-21',
    guardianName: 'Παναγιώτης Ρήγας',
    guardianPhone: '6943000024',
    gender: 'girl',
    city: 'Αθήνα',
    registrationNumber: 'REG-3004',
    uniformReceived: false,
    uniformSize: 'XS',
  },
  demo_ath_s5: {
    firstName: 'Λεωνίδας',
    lastName: 'Μάρκου',
    email: 'leonidas.markou@demo.local',
    phone: '6942000025',
    birthDate: '2015-03-03',
    guardianName: 'Βασιλική Μάρκου',
    guardianPhone: '6943000025',
    gender: 'boy',
    city: 'Αθήνα',
    registrationNumber: 'REG-3005',
    uniformSize: 'S',
  },
};

function athleteIdFor(spec: ClassSpec, index: number): string {
  return spec.showcaseIds[index] ?? `demo_ath_${spec.short}_${pad2(index + 1)}`;
}

function buildAthlete(
  spec: ClassSpec,
  index: number,
  globalIndex: number,
  enrolled: string,
  recentEnrolled: string,
): Student {
  const gender: 'boy' | 'girl' =
    spec.genderMix === 'mixed' ? (index % 2 === 0 ? 'boy' : 'girl') : spec.genderMix;
  const firstPool = gender === 'girl' ? GIRL_FIRST : BOY_FIRST;
  const firstName = firstPool[globalIndex % firstPool.length];
  const lastName = LAST_NAMES[Math.floor(globalIndex / firstPool.length) % LAST_NAMES.length];
  const id = athleteIdFor(spec, index);
  const yearSpan = spec.birthYearMax - spec.birthYearMin + 1;
  const birthYear = spec.birthYearMin + (index % yearSpan);
  const father = FATHER_FIRST[index % FATHER_FIRST.length];
  const mother = MOTHER_FIRST[index % MOTHER_FIRST.length];

  const base: Student = {
    id,
    firstName,
    lastName,
    email: `${id.replace(/_/g, '.')}@demo.local`,
    phone: `6942${String(100000 + globalIndex).slice(-6)}`,
    birthDate: `${birthYear}-${pad2((index % 12) + 1)}-${pad2((index % 27) + 1)}`,
    guardianName: `${father} ${lastName}`,
    guardianPhone: `6943${String(100000 + globalIndex).slice(-6)}`,
    classId: spec.id,
    status: 'active',
    monthlyFee: spec.monthlyFee,
    enrolledAt: enrolled,
    gender,
    fatherFirstName: father,
    motherFirstName: mother,
    city: CITIES[index % CITIES.length],
    clubName: 'DEMO',
    registrationNumber: `REG-${spec.short.toUpperCase()}-${pad2(index + 1)}`,
    sport: spec.sport,
    healthCard: true,
    healthCardStatus: 'Έγκυρη',
    uniformReceived: true,
    uniformSize: UNIFORM_SIZES[index % UNIFORM_SIZES.length],
    registrationFee: spec.registrationFee,
    registrationCharge: true,
    monthlyCharge: true,
    gdprConsent: 'full',
    coachName: spec.coachFullName,
  };

  const showcase = SHOWCASE[id];
  if (!showcase) return base;

  const recentIds = new Set(['demo_ath_f3', 'demo_ath_b4', 'demo_ath_s2', 'demo_ath_s4']);
  return {
    ...base,
    ...showcase,
    id,
    classId: spec.id,
    sport: spec.sport,
    monthlyFee: spec.monthlyFee,
    clubName: 'DEMO',
    enrolledAt: id === 'demo_ath_f5' ? daysFromToday(-10) : recentIds.has(id) ? recentEnrolled : enrolled,
    coachName: spec.coachFullName,
    amkaConsentAt: showcase.gdprItems?.amkaHealthCard ? enrolled : showcase.amkaConsentAt,
  };
}

/**
 * Πλήρες demo dataset για παρουσίαση συλλόγου DEMO.
 * 3 αθλήματα × 2 τμήματα × 16 αθλητές, 2 προπονητές ανά άθλημα.
 */
export function buildDemoShowcaseData(now = new Date()): AppData {
  const today = localDateIso(now);
  const enrolled = daysFromToday(-120, now);
  const recentEnrolled = daysFromToday(-40, now);
  const hire = daysFromToday(-400, now);
  const seasonStart = `${now.getFullYear()}-09-01`;
  const seasonEnd = `${now.getFullYear() + 1}-06-30`;
  const seasonLabel = `${now.getFullYear()}-${now.getFullYear() + 1}`;
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const coaches = [
    {
      id: 'demo_coach_1',
      firstName: 'Νίκος',
      lastName: 'Παπαδόπουλος',
      email: 'coach.nikos@demo.sportsuite.local',
      phone: '6941000001',
      sport: 'Μπάσκετ',
      hireDate: hire,
      active: true,
    },
    {
      id: 'demo_coach_2',
      firstName: 'Μαρία',
      lastName: 'Κωνσταντίνου',
      email: 'coach.maria@demo.sportsuite.local',
      phone: '6941000002',
      sport: 'Μπάσκετ',
      hireDate: daysFromToday(-300, now),
      active: true,
    },
    {
      id: 'demo_coach_5',
      firstName: 'Κώστας',
      lastName: 'Νικολαΐδης',
      email: 'coach.kostas@demo.sportsuite.local',
      phone: '6941000005',
      sport: 'Βόλεϊ',
      hireDate: daysFromToday(-280, now),
      active: true,
    },
    {
      id: 'demo_coach_6',
      firstName: 'Ελένη',
      lastName: 'Παππά',
      email: 'coach.eleni@demo.sportsuite.local',
      phone: '6941000006',
      sport: 'Βόλεϊ',
      hireDate: daysFromToday(-220, now),
      active: true,
    },
    {
      id: 'demo_coach_3',
      firstName: 'Γιώργος',
      lastName: 'Αλεξίου',
      email: 'coach.giorgos@demo.sportsuite.local',
      phone: '6941000003',
      sport: 'Κολύμβηση',
      hireDate: daysFromToday(-200, now),
      active: true,
    },
    {
      id: 'demo_coach_4',
      firstName: 'Δήμητρα',
      lastName: 'Σωτηρίου',
      email: 'coach.dimitra@demo.sportsuite.local',
      phone: '6941000004',
      sport: 'Κολύμβηση',
      hireDate: daysFromToday(-180, now),
      active: true,
    },
  ];

  const classes = CLASS_SPECS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    sport: spec.sport,
    ageGroup: spec.ageGroup,
    coachId: spec.coachId,
    maxStudents: ATHLETES_PER_CLASS,
    scheduleSummary: spec.scheduleSummary,
    monthlyFee: spec.monthlyFee,
    startDate: seasonStart,
    endDate: seasonEnd,
  }));

  const schedule = CLASS_SPECS.flatMap((spec, classIndex) =>
    spec.slots.map((slot, slotIndex) => ({
      id: `demo_sch_${classIndex + 1}_${slotIndex + 1}`,
      classId: spec.id,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      location: spec.facility,
    })),
  );

  const students = CLASS_SPECS.flatMap((spec, classIndex) =>
    Array.from({ length: ATHLETES_PER_CLASS }, (_, index) =>
      buildAthlete(spec, index, classIndex * ATHLETES_PER_CLASS + index, enrolled, recentEnrolled),
    ),
  );

  const trainings = CLASS_SPECS.flatMap((spec, classIndex) => {
    const slot = spec.slots[0];
    return [
      {
        id: `demo_tr_${spec.short}_past`,
        date: daysFromToday(-1 - classIndex, now),
        startTime: slot.startTime,
        endTime: slot.endTime,
        location: spec.facility,
        notes: spec.trainingNotesPast,
        classId: spec.id,
      },
      {
        id: `demo_tr_${spec.short}_future`,
        date: daysFromToday(2 + classIndex, now),
        startTime: slot.startTime,
        endTime: slot.endTime,
        location: spec.facility,
        notes: spec.trainingNotesFuture,
        classId: spec.id,
      },
    ];
  });

  const attendance = CLASS_SPECS.flatMap((spec, classIndex) => {
    const date = daysFromToday(-1 - classIndex, now);
    return Array.from({ length: ATHLETES_PER_CLASS }, (_, index) => {
      const absent = index === 4;
      return {
        id: `demo_att_${spec.short}_${pad2(index + 1)}`,
        classId: spec.id,
        studentId: athleteIdFor(spec, index),
        date,
        present: !absent,
        notes: absent ? (spec.short === 'bask_u12' ? 'Άρρωστος' : 'Απουσία') : undefined,
      };
    });
  });

  const feeChargeTemplates = CLASS_SPECS.map((spec, classIndex) => ({
    id: `demo_fee_${classIndex + 1}`,
    season: seasonLabel,
    sport: spec.sport,
    typeLabel: `Μηνιαία συνδρομή ${spec.name}`,
    monthlyAmount: spec.monthlyFee,
    appliesTo: 'class' as const,
    classId: spec.id,
    months: FEE_MONTHS,
    reminderDays: spec.sport === 'Κολύμβηση' ? 7 : 5,
    registrationFee: spec.registrationFee,
    seasonTicketAmount: spec.sport === 'Κολύμβηση' ? 0 : spec.monthlyFee * 9,
    seasonTicketMonths: spec.sport === 'Κολύμβηση' ? [] : [9],
    customChargeAmount: 0,
    autoGenerate: true,
    createdAt: daysFromToday(-110, now),
  }));

  const firstVolleyId = athleteIdFor(CLASS_SPECS[2], 0);

  return {
    sports: [
      { id: 'demo_sport_bask', name: 'Μπάσκετ', active: true, category: 'team' },
      { id: 'demo_sport_voll', name: 'Βόλεϊ', active: true, category: 'team' },
      { id: 'demo_sport_swim', name: 'Κολύμβηση', active: true, category: 'water' },
    ],
    associations: [
      {
        id: 'demo_assoc_1',
        name: 'ΕΣΚΑ',
        city: 'Αθήνα',
        phone: '2107654321',
        email: 'info@eska.gr',
        address: 'Πατησίων 100',
        active: true,
      },
      {
        id: 'demo_assoc_2',
        name: 'ΕΟΠΕ',
        city: 'Αθήνα',
        phone: '2102223344',
        email: 'info@volleyball.gr',
        address: 'Κηφισίας 37',
        active: true,
      },
      {
        id: 'demo_assoc_3',
        name: 'ΚΟΕ',
        city: 'Αθήνα',
        phone: '2103334455',
        email: 'info@koe.org.gr',
        address: 'Λεωφ. Συγγρού 137',
        active: true,
      },
    ],
    facilities: [
      {
        id: 'demo_fac_1',
        name: 'Κλειστό 1',
        active: true,
        sports: ['Μπάσκετ'],
        timeLayout: '08:00-00:00-15',
        sortOrder: 1,
      },
      {
        id: 'demo_fac_2',
        name: 'Κλειστό 2',
        active: true,
        sports: ['Βόλεϊ'],
        timeLayout: '08:00-00:00-15',
        sortOrder: 2,
      },
      {
        id: 'demo_fac_3',
        name: 'Κολυμβητήριο',
        active: true,
        sports: ['Κολύμβηση'],
        timeLayout: '08:00-00:00-15',
        sortOrder: 3,
      },
    ],
    coaches,
    classes,
    schedule,
    staff: [
      {
        id: 'demo_staff_1',
        fullName: 'Ελένη Γραμματέα',
        email: 'secretariat@demo.sportsuite.local',
        phone: '2101112233',
        role: 'secretariat',
        active: true,
        hireDate: hire,
      },
      {
        id: 'demo_staff_2',
        fullName: 'Αντώνης Διαχειριστής',
        email: 'admin.staff@demo.sportsuite.local',
        phone: '2101112244',
        role: 'admin',
        active: true,
        hireDate: hire,
      },
      ...coaches.map((coach, index) => ({
        id: `demo_staff_c${index + 1}`,
        fullName: `${coach.firstName} ${coach.lastName}`,
        email: coach.email,
        phone: coach.phone,
        role: 'coach' as const,
        active: true,
        hireDate: coach.hireDate,
        teamLabel: coach.sport,
      })),
    ],
    students,
    trainings,
    attendance,
    transactions: [
      {
        id: 'demo_txn_1',
        athleteId: 'demo_ath_f1',
        amount: 60,
        receiptNumber: 'R-1001',
        type: 'charge',
        month: 9,
        year,
        paymentMethod: '',
        comments: 'Εγγραφή σεζόν',
        createdAt: daysFromToday(-100, now),
      },
      {
        id: 'demo_txn_2',
        athleteId: 'demo_ath_f1',
        amount: 60,
        receiptNumber: 'R-1001P',
        type: 'payment',
        month: 9,
        year,
        paymentMethod: 'cash',
        comments: 'Εξόφληση εγγραφής',
        createdAt: daysFromToday(-98, now),
        allocatesChargeId: 'demo_txn_1',
      },
      {
        id: 'demo_txn_3',
        athleteId: 'demo_ath_f1',
        amount: 50,
        receiptNumber: 'R-1101',
        type: 'charge',
        month,
        year,
        paymentMethod: '',
        comments: 'Μηνιαία συνδρομή',
        createdAt: daysFromToday(-5, now),
      },
      {
        id: 'demo_txn_4',
        athleteId: 'demo_ath_f1',
        amount: 50,
        receiptNumber: 'R-1101P',
        type: 'payment',
        month,
        year,
        paymentMethod: 'card',
        comments: 'Πληρωμή συνδρομής',
        createdAt: daysFromToday(-4, now),
        allocatesChargeId: 'demo_txn_3',
      },
      {
        id: 'demo_txn_5',
        athleteId: 'demo_ath_b1',
        amount: 50,
        receiptNumber: 'R-2101',
        type: 'charge',
        month,
        year,
        paymentMethod: '',
        comments: 'Μηνιαία συνδρομή μπάσκετ',
        createdAt: daysFromToday(-6, now),
      },
      {
        id: 'demo_txn_6',
        athleteId: 'demo_ath_b1',
        amount: 50,
        receiptNumber: 'R-2101P',
        type: 'payment',
        month,
        year,
        paymentMethod: 'transfer',
        comments: 'Έμβασμα',
        createdAt: today,
        allocatesChargeId: 'demo_txn_5',
      },
      {
        id: 'demo_txn_7',
        athleteId: 'demo_ath_f4',
        amount: 50,
        receiptNumber: 'R-1901',
        type: 'charge',
        month,
        year,
        paymentMethod: '',
        comments: 'Μηνιαία συνδρομή — εκκρεμεί',
        createdAt: daysFromToday(-10, now),
      },
      {
        id: 'demo_txn_8',
        athleteId: 'demo_ath_s1',
        amount: 55,
        receiptNumber: 'R-3101',
        type: 'charge',
        month,
        year,
        paymentMethod: '',
        comments: 'Συνδρομή κολύμβησης',
        createdAt: daysFromToday(-8, now),
      },
      {
        id: 'demo_txn_9',
        athleteId: 'demo_ath_s1',
        amount: 55,
        receiptNumber: 'R-3101P',
        type: 'payment',
        month,
        year,
        paymentMethod: 'viva',
        comments: 'Viva Wallet',
        createdAt: daysFromToday(-7, now),
        allocatesChargeId: 'demo_txn_8',
      },
      {
        id: 'demo_txn_10',
        athleteId: firstVolleyId,
        amount: 48,
        receiptNumber: 'R-4101',
        type: 'charge',
        month,
        year,
        paymentMethod: '',
        comments: 'Συνδρομή βόλεϊ',
        createdAt: daysFromToday(-9, now),
      },
      {
        id: 'demo_txn_11',
        athleteId: firstVolleyId,
        amount: 48,
        receiptNumber: 'R-4101P',
        type: 'payment',
        month,
        year,
        paymentMethod: 'card',
        comments: 'Πληρωμή συνδρομής βόλεϊ',
        createdAt: daysFromToday(-8, now),
        allocatesChargeId: 'demo_txn_10',
      },
    ],
    revenues: [
      {
        id: 'demo_rev_1',
        date: today,
        amount: 50,
        category: 'tuition',
        subcategory: 'Συνδρομές',
        description: 'Συνδρομή Ελένης Χριστοδούλου',
        studentId: 'demo_ath_b1',
        paymentStatus: 'paid',
        clubName: 'DEMO',
        sport: 'Μπάσκετ',
        surname: 'Χριστοδούλου',
        firstName: 'Ελένη',
      },
      {
        id: 'demo_rev_2',
        date: daysFromToday(-4, now),
        amount: 50,
        category: 'tuition',
        subcategory: 'Συνδρομές',
        description: 'Συνδρομή Δημήτρη Ιωάννου',
        studentId: 'demo_ath_f1',
        paymentStatus: 'paid',
        clubName: 'DEMO',
        sport: 'Μπάσκετ',
      },
      {
        id: 'demo_rev_3',
        date: daysFromToday(-7, now),
        amount: 55,
        category: 'tuition',
        description: 'Συνδρομή Μιχάλη Σταματίου (Viva)',
        studentId: 'demo_ath_s1',
        paymentStatus: 'paid',
        clubName: 'DEMO',
        sport: 'Κολύμβηση',
      },
      {
        id: 'demo_rev_4',
        date: daysFromToday(-20, now),
        amount: 120,
        category: 'merchandise',
        subcategory: 'Είδη συλλόγου',
        description: 'Πώληση εμφανίσεων',
        paymentStatus: 'paid',
        clubName: 'DEMO',
      },
      {
        id: 'demo_rev_5',
        date: daysFromToday(-15, now),
        amount: 200,
        category: 'events',
        description: 'Τουρνουά φιλίας — συμμετοχές',
        paymentStatus: 'paid',
        clubName: 'DEMO',
      },
      {
        id: 'demo_rev_6',
        date: daysFromToday(-2, now),
        amount: 50,
        category: 'tuition',
        description: 'Εκκρεμής συνδρομή Παύλου Γεωργίου',
        studentId: 'demo_ath_f4',
        paymentStatus: 'overdue',
        clubName: 'DEMO',
        sport: 'Μπάσκετ',
      },
      {
        id: 'demo_rev_7',
        date: daysFromToday(-8, now),
        amount: 48,
        category: 'tuition',
        subcategory: 'Συνδρομές',
        description: 'Συνδρομή βόλεϊ U14',
        studentId: firstVolleyId,
        paymentStatus: 'paid',
        clubName: 'DEMO',
        sport: 'Βόλεϊ',
      },
    ],
    expenses: [
      {
        id: 'demo_exp_1',
        date: daysFromToday(-12, now),
        amount: 800,
        category: 'rent',
        subcategory: 'Ενοίκιο',
        description: 'Ενοίκιο εγκαταστάσεων',
        vendor: 'Ιδιοκτήτης Κλειστού',
        clubName: 'DEMO',
      },
      {
        id: 'demo_exp_2',
        date: daysFromToday(-10, now),
        amount: 2400,
        category: 'salaries',
        subcategory: 'Μισθοδοσία',
        description: 'Μισθοί προπονητών (μήνας)',
        clubName: 'DEMO',
      },
      {
        id: 'demo_exp_3',
        date: daysFromToday(-8, now),
        amount: 180,
        category: 'equipment',
        description: 'Μπάλες μπάσκετ & κώνοι',
        vendor: 'SportGear AE',
        clubName: 'DEMO',
        sport: 'Μπάσκετ',
      },
      {
        id: 'demo_exp_4',
        date: daysFromToday(-6, now),
        amount: 95,
        category: 'utilities',
        description: 'Ρεύμα κλειστού',
        vendor: 'ΔΕΔΔΗΕ',
        clubName: 'DEMO',
      },
      {
        id: 'demo_exp_5',
        date: daysFromToday(-5, now),
        amount: 150,
        category: 'marketing',
        description: 'Facebook / Instagram ads',
        clubName: 'DEMO',
      },
      {
        id: 'demo_exp_6',
        date: daysFromToday(-3, now),
        amount: 420,
        category: 'other',
        subcategory: 'Αγώνες',
        description: 'Έξοδα εκτός έδρας U12 μπάσκετ',
        clubName: 'DEMO',
        sport: 'Μπάσκετ',
        matchDetails: {
          sport: 'Μπάσκετ',
          category: 'Πρωτάθλημα',
          teams: 'DEMO U12 vs Αντίπαλος U12',
          referees: 2,
          judges: 1,
          travelAllowance: 80,
          transportBus: 200,
          transportPlane: 0,
          transportShip: 0,
          transportOther: 0,
          accommodation: 0,
          food: 140,
        },
      },
      {
        id: 'demo_exp_7',
        date: daysFromToday(-4, now),
        amount: 90,
        category: 'equipment',
        description: 'Μπάλες βόλεϊ Mikasa',
        vendor: 'SportGear AE',
        clubName: 'DEMO',
        sport: 'Βόλεϊ',
      },
    ],
    budgets: [
      {
        id: 'demo_bud_1',
        seasonStart: year,
        type: 'income',
        subcategory: 'Συνδρομές',
        amount: 16000,
        clubName: 'DEMO',
        sport: 'Μπάσκετ',
        notes: 'Προϋπολογισμός σεζόν',
      },
      {
        id: 'demo_bud_1b',
        seasonStart: year,
        type: 'income',
        subcategory: 'Συνδρομές',
        amount: 15400,
        clubName: 'DEMO',
        sport: 'Βόλεϊ',
      },
      {
        id: 'demo_bud_1c',
        seasonStart: year,
        type: 'income',
        subcategory: 'Συνδρομές',
        amount: 17600,
        clubName: 'DEMO',
        sport: 'Κολύμβηση',
      },
      {
        id: 'demo_bud_2',
        seasonStart: year,
        type: 'income',
        subcategory: 'Χορηγίες',
        amount: 3000,
        clubName: 'DEMO',
      },
      {
        id: 'demo_bud_3',
        seasonStart: year,
        type: 'expense',
        subcategory: 'Μισθοδοσία',
        amount: 28800,
        clubName: 'DEMO',
      },
      {
        id: 'demo_bud_4',
        seasonStart: year,
        type: 'expense',
        subcategory: 'Εγκαταστάσεις',
        amount: 9600,
        clubName: 'DEMO',
      },
    ],
    products: [
      {
        id: 'demo_prod_1',
        name: 'Εμφάνιση εντός έδρας',
        category: 'Εμφανίσεις',
        sku: 'KIT-HOME-M',
        salePrice: 35,
        size: 'M',
        sizeGroup: 'adult',
        notes: 'Σετ φανέλα-σορτς',
        stockQty: 24,
        createdAt: daysFromToday(-90, now),
      },
      {
        id: 'demo_prod_2',
        name: 'Εμφάνιση εντός έδρας',
        category: 'Εμφανίσεις',
        sku: 'KIT-HOME-S',
        salePrice: 35,
        size: 'S',
        sizeGroup: 'kids',
        notes: 'Παιδικό',
        stockQty: 18,
        createdAt: daysFromToday(-90, now),
      },
      {
        id: 'demo_prod_3',
        name: 'Μπάλα μπάσκετ',
        category: 'Εξοπλισμός',
        sku: 'BALL-BASK-7',
        salePrice: 28,
        size: '7',
        sizeGroup: '',
        notes: 'Size 7',
        stockQty: 12,
        createdAt: daysFromToday(-60, now),
      },
      {
        id: 'demo_prod_4',
        name: 'Φανέλα προπόνησης',
        category: 'Ρουχισμός',
        sku: 'TRN-TEE-L',
        salePrice: 18,
        size: 'L',
        sizeGroup: 'adult',
        notes: '',
        stockQty: 30,
        createdAt: daysFromToday(-40, now),
      },
      {
        id: 'demo_prod_5',
        name: 'Μπάλα βόλεϊ',
        category: 'Εξοπλισμός',
        sku: 'BALL-VOLL-5',
        salePrice: 32,
        size: '5',
        sizeGroup: '',
        notes: 'Επίσημη πετοσφαίρισης',
        stockQty: 10,
        createdAt: daysFromToday(-50, now),
      },
    ],
    stockMovements: [
      {
        id: 'demo_sm_1',
        productId: 'demo_prod_1',
        type: 'in',
        quantity: 30,
        note: 'Αρχική παραλαβή',
        createdAt: daysFromToday(-90, now),
        createdByName: 'Ελένη Γραμματέα',
      },
      {
        id: 'demo_sm_2',
        productId: 'demo_prod_1',
        type: 'out',
        quantity: 6,
        note: 'Πωλήσεις αθλητών',
        createdAt: daysFromToday(-20, now),
        createdByName: 'Ελένη Γραμματέα',
      },
      {
        id: 'demo_sm_3',
        productId: 'demo_prod_3',
        type: 'in',
        quantity: 15,
        note: 'Παραγγελία SportGear',
        createdAt: daysFromToday(-60, now),
        createdByName: 'Αντώνης Διαχειριστής',
      },
      {
        id: 'demo_sm_4',
        productId: 'demo_prod_3',
        type: 'out',
        quantity: 3,
        note: 'Χρήση προπονήσεων',
        createdAt: daysFromToday(-10, now),
        createdByName: 'Νίκος Παπαδόπουλος',
      },
      {
        id: 'demo_sm_5',
        productId: 'demo_prod_2',
        type: 'adjust',
        quantity: 18,
        note: 'Απογραφή',
        createdAt: daysFromToday(-5, now),
        createdByName: 'Ελένη Γραμματέα',
      },
      {
        id: 'demo_sm_6',
        productId: 'demo_prod_5',
        type: 'in',
        quantity: 10,
        note: 'Παραλαβή μπαλών βόλεϊ',
        createdAt: daysFromToday(-50, now),
        createdByName: 'Ελένη Γραμματέα',
      },
    ],
    partnerBusinesses: [
      {
        id: 'demo_part_1',
        name: 'SportGear AE',
        url: 'https://example.com/sportgear',
        status: 'active',
        categories: 'Εξοπλισμός, Ρουχισμός',
        isSponsor: true,
        lastModifiedBy: 'Αντώνης Διαχειριστής',
        lastModifiedAt: daysFromToday(-30, now),
        createdAt: daysFromToday(-200, now),
      },
      {
        id: 'demo_part_2',
        name: 'Υγεία Ιατρείο Αθλητών',
        url: 'https://example.com/ygeia',
        status: 'active',
        categories: 'Ιατρικές υπηρεσίες',
        isSponsor: false,
        lastModifiedBy: 'Ελένη Γραμματέα',
        lastModifiedAt: daysFromToday(-15, now),
        createdAt: daysFromToday(-100, now),
      },
      {
        id: 'demo_part_3',
        name: 'Cafe Finish Line',
        url: '',
        status: 'inactive',
        categories: 'Εστίαση',
        isSponsor: false,
        lastModifiedBy: 'Αντώνης Διαχειριστής',
        lastModifiedAt: daysFromToday(-60, now),
        createdAt: daysFromToday(-150, now),
      },
    ],
    partnerOffers: [
      {
        id: 'demo_offer_1',
        name: '-15% σε εμφανίσεις',
        businessId: 'demo_part_1',
        status: 'active',
        createdAt: daysFromToday(-25, now),
      },
      {
        id: 'demo_offer_2',
        name: 'Δωρεάν καρδιολογικός έλεγχος / έτος',
        businessId: 'demo_part_2',
        status: 'active',
        createdAt: daysFromToday(-20, now),
      },
    ],
    feeChargeTemplates,
    feeReminderLogs: [
      {
        id: 'demo_fr_1',
        athleteId: 'demo_ath_f4',
        templateId: 'demo_fee_1',
        amount: 50,
        note: 'Email υπενθύμισης οφειλής',
        createdAt: daysFromToday(-2, now),
      },
      {
        id: 'demo_fr_2',
        athleteId: 'demo_ath_b2',
        templateId: 'demo_fee_2',
        amount: 40,
        note: 'Υπενθύμιση με έκπτωση αδελφού',
        createdAt: daysFromToday(-1, now),
      },
    ],
    announcements: [
      {
        id: 'demo_ann_1',
        title: 'Έναρξη νέας σεζόν',
        message:
          'Καλώς ήρθατε στη νέα αγωνιστική περίοδο. Οι προπονήσεις ξεκινούν σύμφωνα με το πρόγραμμα κάθε τμήματος (Μπάσκετ, Βόλεϊ, Κολύμβηση).',
        createdAt: daysFromToday(-20, now),
        targetType: 'club',
        targetId: null,
        highPriority: true,
        audienceRoles: ['athletes', 'parents', 'coaches', 'staff'],
        visibleFrom: daysFromToday(-20, now),
      },
      {
        id: 'demo_ann_2',
        title: 'U12 Μπάσκετ — φιλικός αγώνας',
        message: 'Το Σάββατο στις 11:00 φιλικός αγώνας στο Κλειστό 1. Παρακαλούμε έγκαιρη προσέλευση.',
        createdAt: daysFromToday(-3, now),
        targetType: 'team',
        targetId: 'demo_class_bask_u12',
        highPriority: false,
        audienceRoles: ['athletes', 'parents', 'coaches'],
        classIds: ['demo_class_bask_u12'],
        teamsLabel: 'U12 Αγόρια',
      },
      {
        id: 'demo_ann_3',
        title: 'Ιατρικές κάρτες',
        message: 'Παρακαλούνται οι γονείς να ανανεώσουν τις ιατρικές κάρτες που λήγουν εντός του μήνα.',
        createdAt: daysFromToday(-1, now),
        targetType: 'club',
        targetId: null,
        highPriority: true,
        audienceRoles: ['parents', 'staff'],
      },
    ],
    photos: [
      {
        id: 'demo_photo_1',
        imageUrl: svgPhoto('Μπάσκετ U12', 25),
        caption: 'Προπόνηση U12 Μπάσκετ',
        fileName: 'u12-basket.svg',
        createdAt: daysFromToday(-10, now),
      },
      {
        id: 'demo_photo_2',
        imageUrl: svgPhoto('Βόλεϊ U16', 200),
        caption: 'U16 Κορίτσια — εντός έδρας',
        fileName: 'u16-volley.svg',
        createdAt: daysFromToday(-7, now),
      },
      {
        id: 'demo_photo_3',
        imageUrl: svgPhoto('Κολύμβηση', 190),
        caption: 'Κολύμβηση αρχαρίων',
        fileName: 'swim.svg',
        createdAt: daysFromToday(-4, now),
      },
    ],
    progressReports: [
      {
        id: 'demo_pr_1',
        athleteId: 'demo_ath_f1',
        date: daysFromToday(-14, now),
        title: 'Μηνιαία αξιολόγηση',
        notes: 'Εξαιρετική πρόοδος στο σουτ και στην ηγεσία. Να συνεχίσει την εργασία στο αριστερό χέρι.',
        rating: 5,
        createdByName: 'Νίκος Παπαδόπουλος',
        createdAt: daysFromToday(-14, now),
      },
      {
        id: 'demo_pr_2',
        athleteId: 'demo_ath_b1',
        date: daysFromToday(-10, now),
        title: 'Τεχνική σουτ',
        notes: 'Βελτίωση ποσοστού τρίποντων. Καλή άμυνα περιφέρειας.',
        rating: 4,
        createdByName: 'Μαρία Κωνσταντίνου',
        createdAt: daysFromToday(-10, now),
      },
      {
        id: 'demo_pr_3',
        athleteId: 'demo_ath_s1',
        date: daysFromToday(-7, now),
        title: 'Τεχνική κολύμβησης',
        notes: 'Σταθερή βελτίωση στο ελεύθερο. Επόμενος στόχος: 50μ χωρίς στάση.',
        rating: 4,
        createdByName: 'Γιώργος Αλεξίου',
        createdAt: daysFromToday(-7, now),
      },
    ],
    parentLinks: [
      {
        id: 'demo_plink_1',
        parentUserId: 'user_demo_parent',
        athleteId: 'demo_ath_f1',
        createdAt: daysFromToday(-90, now),
      },
      {
        id: 'demo_plink_2',
        parentUserId: 'user_demo_parent',
        athleteId: 'demo_ath_f2',
        createdAt: daysFromToday(-90, now),
      },
      {
        id: 'demo_plink_3',
        parentUserId: 'user_demo_parent_b',
        athleteId: 'demo_ath_b1',
        createdAt: daysFromToday(-60, now),
      },
    ],
    registrationApplications: [],
    sizeChart: {
      kids: ['6 y.o', '8 y.o', '10 y.o', '12 y.o', 'Small', 'Medium', 'Large', 'XLarge', 'XXLarge'],
      men: [],
      women: [],
    },
    clothingPackages: [
      {
        id: 'basic',
        name: 'BASIC (ΠΟΥΓΚΙ - DOUBLE FACE - SHORTS - TSHIRT)',
      },
      {
        id: 'upgraded',
        name: 'ΑΝΑΒΑΘΜΙΣΜΕΝΟ (DOUBLE FACE - SHORTS - TSHIRT - ΤΣΑΝΤΑ ΠΛΑΤΗΣ - ΖΑΚΕΤΑ ΦΟΥΤΕΡ ΚΟΥΚΟΥΛΑ - ΠΑΝΤΕΛΟΝΙ ΦΟΡΜΑΣ)',
      },
    ],
    discountReasons: defaultDiscountReasons(),
    termsOfUseHtml: `<h2>Όροι χρήσης (DEMO)</h2><p>Τα δεδομένα του συλλόγου DEMO είναι πλασματικά.</p>${DEFAULT_TERMS_OF_USE_HTML}`,
  };
}
