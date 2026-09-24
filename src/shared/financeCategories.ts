export const INCOME_SUBCATEGORIES = [
  'ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ',
  'ΕΙΣΙΤΗΡΙΑ ΕΚΔΗΛΩΣΕΩΝ',
  'ΕΚΔΗΛΩΣΕΙΣ',
  'ΧΟΡΗΓΙΕΣ',
  'ΕΠΙΧΟΡΗΓΗΣΕΙΣ',
  'ΔΩΡΕΕΣ',
  'ΠΑΡΟΧΕΣ',
  'ΕΝΟΙΚΙΑΣΗ ΓΗΠΕΔΟΥ',
  'ΚΑΝΤΙΝΑ / ΚΥΛΙΚΕΙΟ',
  'ΠΩΛΗΣΕΙΣ ΕΙΔΩΝ',
  'ΔΙΑΦΗΜΙΣΕΙΣ / ΠΙΝΑΚΙΔΕΣ',
  'ΛΟΙΠΑ ΕΣΟΔΑ',
] as const;

export const DEFAULT_INCOME_DESCRIPTIONS: Record<
  (typeof INCOME_SUBCATEGORIES)[number],
  readonly string[]
> = {
  'ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ': [
    'ΕΙΣΙΤΗΡΙΟ ΕΝΗΛΙΚΩΝ',
    'ΕΙΣΙΤΗΡΙΟ ΠΑΙΔΙΩΝ',
    'ΕΠΟΧΙΑΚΗ ΚΑΡΤΑ',
    'ΕΙΣΙΤΗΡΙΟ ΔΙΑΡΚΕΙΑΣ',
  ],
  'ΕΙΣΙΤΗΡΙΑ ΕΚΔΗΛΩΣΕΩΝ': ['ΕΙΣΙΤΗΡΙΟ', 'VIP', 'ΠΡΟΣΚΛΗΣΗ ΜΕ ΑΝΤΙΤΙΜΟ'],
  ΕΚΔΗΛΩΣΕΙΣ: ['ΔΕΙΠΝΟ', 'ΜΠΑΡΜΠΕΚΙΟΥ', 'ΛΟΤΑΡΙΑ', 'ΑΦΙΕΡΩΜΑ'],
  ΧΟΡΗΓΙΕΣ: ['ΧΡΗΜΑΤΙΚΗ', 'ΣΕ ΕΙΔΟΣ', 'ΤΙΤΛΟΣ ΧΟΡΗΓΟΥ'],
  ΕΠΙΧΟΡΗΓΗΣΕΙΣ: ['ΔΗΜΟΣ', 'ΓΓΑ', 'ΕΝΩΣΗ / ΟΜΟΣΠΟΝΔΙΑ', 'ΑΛΛΗ ΕΠΙΧΟΡΗΓΗΣΗ'],
  ΔΩΡΕΕΣ: ['ΧΡΗΜΑΤΙΚΗ ΔΩΡΕΑ', 'ΔΩΡΕΑ ΣΕ ΕΙΔΟΣ'],
  ΠΑΡΟΧΕΣ: [
    'ΠΑΡΟΧΗ ΥΠΗΡΕΣΙΑΣ',
    'ΕΚΜΙΣΘΩΣΗ ΧΩΡΟΥ',
    'ΕΚΠΑΙΔΕΥΤΙΚΟ ΠΡΟΓΡΑΜΜΑ',
    'ΑΤΟΜΙΚΕΣ ΠΡΟΠΟΝΗΣΕΙΣ',
    'ΠΡΟΓΡΑΜΜΑ ΕΝΔΥΝΑΜΩΣΗΣ',
    'CAMPS / CLINICS',
    'ΣΕΜΙΝΑΡΙΑ',
    'ΑΛΛΗ ΠΑΡΟΧΗ',
  ],
  'ΕΝΟΙΚΙΑΣΗ ΓΗΠΕΔΟΥ': ['ΕΝΟΙΚΙΑΣΗ ΓΗΠΕΔΟΥ', 'ΕΚΜΙΣΘΩΣΗ ΧΩΡΟΥ'],
  'ΚΑΝΤΙΝΑ / ΚΥΛΙΚΕΙΟ': ['ΠΩΛΗΣΕΙΣ ΗΜΕΡΑΣ', 'ΕΚΔΗΛΩΣΗ'],
  'ΠΩΛΗΣΕΙΣ ΕΙΔΩΝ': ['ΣΤΟΛΕΣ', 'ΜΠΑΛΕΣ', 'ΑΞΕΣΟΥΑΡ', 'ΑΛΛΑ ΕΙΔΗ'],
  'ΔΙΑΦΗΜΙΣΕΙΣ / ΠΙΝΑΚΙΔΕΣ': ['ΠΙΝΑΚΙΔΑ ΓΗΠΕΔΟΥ', 'ΦΑΝΕΛΑ', 'ΕΝΤΥΠΟ / SITE'],
  'ΛΟΙΠΑ ΕΣΟΔΑ': ['ΕΠΙΣΤΡΟΦΗ ΧΡΗΜΑΤΩΝ', 'ΤΟΚΟΙ', 'ΑΛΛΟ'],
};

export const EXPENSE_SUBCATEGORIES = [
  'ΑΓΩΝΕΣ',
  'ΕΓΚΑΤΑΣΤΑΣΗ',
  'ΑΘΛΗΤΕΣ',
  'ΠΡΟΠΟΝΗΤΕΣ / ΓΥΜΝΑΣΤΕΣ',
  'ΠΡΟΣΩΠΙΚΟ',
  'ΙΑΤΡΙΚΑ',
  'ΕΞΟΠΛΙΣΜΟΣ / ΥΛΙΚΑ',
  'ΜΕΤΑΚΙΝΗΣΕΙΣ',
  'ΑΣΦΑΛΙΣΤΡΑ / ΤΕΛΗ ΕΓΓΡΑΦΩΝ',
  'ΔΙΟΙΚΗΤΙΚΑ',
  'ΕΚΔΗΛΩΣΕΙΣ',
  'MARKETING',
  'ΛΟΙΠΑ ΕΞΟΔΑ',
] as const;

export const DEFAULT_EXPENSE_DESCRIPTIONS: Record<
  (typeof EXPENSE_SUBCATEGORIES)[number],
  readonly string[]
> = {
  ΑΓΩΝΕΣ: [
    'ΔΙΑΙΤΗΣΙΑ',
    'ΚΡΙΤΕΣ',
    'ΟΔΟΙΠΟΡΙΚΑ',
    'ΜΕΤΑΚΙΝΗΣΗ',
    'ΔΙΑΜΟΝΗ',
    'ΔΙΑΤΡΟΦΗ',
    'ΙΑΤΡΟΣ',
    'ΚΟΜΙΣΑΡΙΟΣ',
    'ΠΑΡΑΤΗΡΗΤΗΣ',
    'VIDEO OBSERVER',
    'ΑΛΛΟ ΕΞΟΔΟ ΑΓΩΝΑ',
  ],
  ΕΓΚΑΤΑΣΤΑΣΗ: [
    'ΕΝΟΙΚΙΟ ΓΗΠΕΔΟΥ',
    'ΗΛΕΚΤΡΙΚΟ ΡΕΥΜΑ',
    'ΝΕΡΟ',
    'ΣΥΝΤΗΡΗΣΗ',
    'ΘΕΡΜΑΝΣΗ',
    'ΤΗΛΕΦΩΝΙΑ',
  ],
  ΑΘΛΗΤΕΣ: [
    "AGENT'S FEE",
    'ΑΣΦΑΛΙΣΤΙΚΕΣ ΕΙΣΦΟΡΕΣ',
    'ΕΝΟΙΚΙΟ ΑΥΤΟΚΙΝΗΤΟΥ',
    'ΕΝΟΙΚΙΟ ΣΠΙΤΙΟΥ',
    'ΜΗΝΙΑΙΟΣ ΜΙΣΘΟΣ',
    'ΔΙΑΤΡΟΦΗ',
  ],
  'ΠΡΟΠΟΝΗΤΕΣ / ΓΥΜΝΑΣΤΕΣ': [
    'ΜΗΝΙΑΙΟΣ ΜΙΣΘΟΣ',
    'ΗΜΕΡΟΜΙΣΘΙΟ',
    'ΑΣΦΑΛΙΣΤΙΚΕΣ ΕΙΣΦΟΡΕΣ',
    'ΜΕΤΑΚΙΝΗΣΗ',
    'ΕΝΟΙΚΙΟ ΑΥΤΟΚΙΝΗΤΟΥ',
    'ΕΝΟΙΚΙΟ ΣΠΙΤΙΟΥ',
    'ΔΙΑΤΡΟΦΗ',
  ],
  ΠΡΟΣΩΠΙΚΟ: ['ΜΗΝΙΑΙΟΣ ΜΙΣΘΟΣ', 'ΗΜΕΡΟΜΙΣΘΙΟ', 'ΑΣΦΑΛΙΣΤΙΚΕΣ ΕΙΣΦΟΡΕΣ', 'ΜΕΤΑΚΙΝΗΣΗ'],
  ΙΑΤΡΙΚΑ: [
    'ΚΑΡΔΙΟΛΟΓΙΚΟΣ',
    'ΟΡΘΟΠΕΔΙΚΟΣ',
    'ΦΥΣΙΚΟΘΕΡΑΠΕΙΑ',
    'ΜΑΓΝΗΤΙΚΗ',
    'ΑΚΤΙΝΟΓΡΑΦΙΑ',
    'ΦΑΡΜΑΚΑ',
    'ΑΣΦΑΛΙΣΗ ΑΘΛΗΤΗ',
    'ΝΟΣΗΛΕΙΑ',
  ],
  'ΕΞΟΠΛΙΣΜΟΣ / ΥΛΙΚΑ': [
    'ΣΤΟΛΕΣ',
    'ΜΠΑΛΕΣ',
    'ΠΑΠΟΥΤΣΙΑ',
    'ΙΜΑΤΙΣΜΟΣ',
    'ΑΝΑΛΩΣΙΜΑ',
    'ΙΑΤΡΙΚΟΣ ΕΞΟΠΛΙΣΜΟΣ',
    'ΤΕΧΝΟΛΟΓΙΚΟΣ ΕΞΟΠΛΙΣΜΟΣ',
    'ΑΛΛΟΣ ΕΞΟΠΛΙΣΜΟΣ',
  ],
  ΜΕΤΑΚΙΝΗΣΕΙΣ: ['ΛΕΩΦΟΡΕΙΟ', 'ΚΑΥΣΙΜΑ', 'ΔΙΟΔΙΑ', 'ΑΕΡΟΠΟΡΙΚΑ', 'ΔΙΑΜΟΝΗ ΕΚΤΟΣ ΑΓΩΝΑ'],
  'ΑΣΦΑΛΙΣΤΡΑ / ΤΕΛΗ ΕΓΓΡΑΦΩΝ': [
    'ΑΣΦΑΛΙΣΤΡΟ ΟΜΑΔΑΣ',
    'ΠΑΡΑΣΤΗΜΑ ΕΝΩΣΗΣ',
    'ΚΑΡΤΑ ΥΓΕΙΑΣ',
    'ΤΕΛΟΣ ΕΓΓΡΑΦΗΣ',
  ],
  ΔΙΟΙΚΗΤΙΚΑ: ['ΛΟΓΙΣΤΗΣ', 'ΔΙΚΗΓΟΡΟΣ', 'ΓΡΑΦΙΚΗ ΥΛΗ', 'ΤΡΑΠΕΖΙΚΑ ΕΞΟΔΑ', 'ΛΟΙΠΑ ΔΙΟΙΚΗΤΙΚΑ'],
  ΕΚΔΗΛΩΣΕΙΣ: ['ΔΙΟΡΓΑΝΩΣΗ', 'ΦΑΓΗΤΟ / ΚΕΤΕΡΙΝΓΚ', 'ΗΧΟΣ / ΦΩΤΙΣΜΟΣ', 'ΔΙΑΚΟΣΜΗΣΗ'],
  MARKETING: [
    'ΔΙΑΦΗΜΙΣΗ ONLINE',
    'ΕΝΤΥΠΑ / ΦΥΛΛΑΔΙΑ',
    'SOCIAL MEDIA',
    'BANNER / ΠΙΝΑΚΙΔΕΣ',
    'ΠΡΟΩΘΗΤΙΚΑ ΕΙΔΗ',
    'ΒΙΝΤΕΟ',
    'ΦΩΤΟΓΡΑΦΙΕΣ',
    'ΑΛΛΟ MARKETING',
  ],
  'ΛΟΙΠΑ ΕΞΟΔΑ': ['ΑΠΡΟΣΒΛΕΠΤΑ', 'ΕΠΙΣΤΡΟΦΗ ΧΡΗΜΑΤΩΝ', 'ΜΕΤΑΓΡΑΦΗ ΑΘΛΗΤΗ / ΡΙΑΣ', 'ΑΛΛΟ'],
};

export type IncomeSubcategory = (typeof INCOME_SUBCATEGORIES)[number];
export type ExpenseSubcategory = (typeof EXPENSE_SUBCATEGORIES)[number];

export function isCanteenFinanceCategory(subcategory: string): boolean {
  const key = subcategory
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    key.includes('ΚΑΝΤΙΝΑ') ||
    key.includes('ΚΥΛΙΚΕΙΟ') ||
    key.includes('KANTINA') ||
    key.includes('KYLIKEIO') ||
    key.includes('CANTEEN')
  );
}

export function requiresPersonName(subcategory: string): boolean {
  return (
    subcategory === 'ΣΥΝΔΡΟΜΕΣ ΑΘΛΗΤΩΝ' ||
    subcategory === 'ΣΥΝΔΡΟΜΕΣ ΜΕΛΩΝ' ||
    subcategory === 'ΑΘΛΗΤΕΣ' ||
    subcategory === 'ΙΑΤΡΙΚΑ'
  );
}

export function isSubscriptionSubcategory(subcategory: string): boolean {
  return subcategory === 'ΣΥΝΔΡΟΜΕΣ ΑΘΛΗΤΩΝ' || subcategory === 'ΣΥΝΔΡΟΜΕΣ ΜΕΛΩΝ';
}

export function usesMatchExpenseForm(subcategory: string): boolean {
  return subcategory === 'ΑΓΩΝΕΣ';
}

/** Τμήμα εξόδου όταν η υποκατηγορία είναι Προσωπικό (ανεξάρτητα σωματείου). */
export const STAFF_EXPENSE_CLASS_NAME = 'Προσωπικό';

export function isStaffFinanceCategory(subcategory: string): boolean {
  return subcategory.trim() === 'ΠΡΟΣΩΠΙΚΟ';
}

export function isAdministrativeFinanceCategory(subcategory: string): boolean {
  return subcategory.trim() === 'ΔΙΟΙΚΗΤΙΚΑ';
}

/** Άθλημα/τμήμα δεν ισχύουν σε καντίνα, προσωπικό και διοικητικά. */
export function expenseSkipsSportAndClass(subcategory: string): boolean {
  return (
    isCanteenFinanceCategory(subcategory) ||
    isStaffFinanceCategory(subcategory) ||
    isAdministrativeFinanceCategory(subcategory)
  );
}

export function personNameKind(subcategory: string): 'athletes' | 'members' {
  return subcategory === 'ΣΥΝΔΡΟΜΕΣ ΜΕΛΩΝ' ? 'members' : 'athletes';
}

export function mapIncomeSubcategoryToCategory(
  subcategory: string,
  description: string,
): 'tuition' | 'registration' | 'merchandise' | 'events' | 'other' {
  if (description === 'ΕΓΓΡΑΦΗ') return 'registration';
  if (subcategory.startsWith('ΣΥΝΔΡΟΜΕΣ')) return 'tuition';
  if (subcategory === 'ΕΝΟΙΚΙΑΣΗ ΓΗΠΕΔΟΥ' || subcategory.startsWith('ΕΙΣΙΤΗΡΙΑ') || subcategory === 'ΕΚΔΗΛΩΣΕΙΣ') {
    return 'events';
  }
  if (subcategory === 'ΠΩΛΗΣΕΙΣ ΕΙΔΩΝ' || subcategory === 'ΚΑΝΤΙΝΑ / ΚΥΛΙΚΕΙΟ') {
    return 'merchandise';
  }
  return 'other';
}

export function mapExpenseSubcategoryToCategory(
  subcategory: string,
): 'rent' | 'salaries' | 'equipment' | 'utilities' | 'marketing' | 'other' {
  if (subcategory === 'ΕΓΚΑΤΑΣΤΑΣΗ') return 'utilities';
  if (
    subcategory === 'ΠΡΟΠΟΝΗΤΕΣ / ΓΥΜΝΑΣΤΕΣ' ||
    subcategory === 'ΠΡΟΣΩΠΙΚΟ' ||
    subcategory === 'ΑΘΛΗΤΕΣ'
  ) {
    return 'salaries';
  }
  if (subcategory === 'ΕΞΟΠΛΙΣΜΟΣ / ΥΛΙΚΑ') return 'equipment';
  if (subcategory === 'MARKETING') return 'marketing';
  if (subcategory === 'ΕΚΔΗΛΩΣΕΙΣ' || subcategory === 'ΑΓΩΝΕΣ') return 'other';
  return 'other';
}

export function normalizeMatchExpenseDetails(details: {
  sport?: string;
  category?: string;
  teams?: string;
  referees?: number;
  judges?: number;
  commissioner?: number;
  observer?: number;
  doctor?: number;
  travelAllowance?: number;
  travelReferees?: number;
  travelJudges?: number;
  travelCommissioner?: number;
  travelObserver?: number;
  transportBus?: number;
  transportPlane?: number;
  transportShip?: number;
  transportOther?: number;
  accommodation?: number;
  food?: number;
}): {
  sport: string;
  category: string;
  teams: string;
  referees: number;
  judges: number;
  commissioner: number;
  observer: number;
  doctor: number;
  travelAllowance: number;
  travelReferees: number;
  travelJudges: number;
  travelCommissioner: number;
  travelObserver: number;
  transportBus: number;
  transportPlane: number;
  transportShip: number;
  transportOther: number;
  accommodation: number;
  food: number;
} {
  const travelReferees = details.travelReferees ?? 0;
  const travelJudges = details.travelJudges ?? 0;
  const travelCommissioner = details.travelCommissioner ?? 0;
  const travelObserver = details.travelObserver ?? 0;
  const breakdown = travelReferees + travelJudges + travelCommissioner + travelObserver;
  const travelAllowance = details.travelAllowance ?? 0;
  return {
    sport: details.sport ?? '',
    category: details.category ?? '',
    teams: details.teams ?? '',
    referees: details.referees ?? 0,
    judges: details.judges ?? 0,
    commissioner: details.commissioner ?? 0,
    observer: details.observer ?? 0,
    doctor: details.doctor ?? 0,
    travelReferees: breakdown > 0 ? travelReferees : travelAllowance,
    travelJudges,
    travelCommissioner,
    travelObserver,
    travelAllowance: breakdown > 0 ? breakdown : travelAllowance,
    transportBus: details.transportBus ?? 0,
    transportPlane: details.transportPlane ?? 0,
    transportShip: details.transportShip ?? 0,
    transportOther: details.transportOther ?? 0,
    accommodation: details.accommodation ?? 0,
    food: details.food ?? 0,
  };
}

export function matchTravelTotal(details: {
  travelAllowance?: number;
  travelReferees?: number;
  travelJudges?: number;
  travelCommissioner?: number;
  travelObserver?: number;
}): number {
  const breakdown =
    (details.travelReferees ?? 0) +
    (details.travelJudges ?? 0) +
    (details.travelCommissioner ?? 0) +
    (details.travelObserver ?? 0);
  return breakdown > 0 ? breakdown : details.travelAllowance ?? 0;
}

export function matchExpenseTotal(details: {
  referees?: number;
  judges?: number;
  commissioner?: number;
  observer?: number;
  doctor?: number;
  travelAllowance?: number;
  travelReferees?: number;
  travelJudges?: number;
  travelCommissioner?: number;
  travelObserver?: number;
  transportBus?: number;
  transportPlane?: number;
  transportShip?: number;
  transportOther?: number;
  accommodation?: number;
  food?: number;
}): number {
  return (
    (details.referees ?? 0) +
    (details.judges ?? 0) +
    (details.commissioner ?? 0) +
    (details.observer ?? 0) +
    (details.doctor ?? 0) +
    matchTravelTotal(details) +
    (details.transportBus ?? 0) +
    (details.transportPlane ?? 0) +
    (details.transportShip ?? 0) +
    (details.transportOther ?? 0) +
    (details.accommodation ?? 0) +
    (details.food ?? 0)
  );
}
