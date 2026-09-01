export const INCOME_SUBCATEGORIES = [
  'ΕΙΣΙΤΗΡΙΑ ΑΓΩΝΩΝ',
  'ΕΙΣΙΤΗΡΙΑ ΕΚΔΗΛΩΣΕΩΝ',
  'ΕΚΔΗΛΩΣΕΙΣ',
  'ΧΟΡΗΓΙΕΣ',
  'ΕΠΙΧΟΡΗΓΗΣΕΙΣ',
  'ΔΩΡΕΕΣ',
  'ΠΑΡΟΧΕΣ',
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

export function personNameKind(subcategory: string): 'athletes' | 'members' {
  return subcategory === 'ΣΥΝΔΡΟΜΕΣ ΜΕΛΩΝ' ? 'members' : 'athletes';
}

export function mapIncomeSubcategoryToCategory(
  subcategory: string,
  description: string,
): 'tuition' | 'registration' | 'merchandise' | 'events' | 'other' {
  if (description === 'ΕΓΓΡΑΦΗ') return 'registration';
  if (subcategory.startsWith('ΣΥΝΔΡΟΜΕΣ')) return 'tuition';
  if (subcategory.startsWith('ΕΙΣΙΤΗΡΙΑ') || subcategory === 'ΕΚΔΗΛΩΣΕΙΣ') return 'events';
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

export function matchExpenseTotal(details: {
  referees: number;
  judges: number;
  travelAllowance: number;
  transportBus: number;
  transportPlane: number;
  transportShip: number;
  transportOther: number;
  accommodation: number;
  food: number;
}): number {
  return (
    details.referees +
    details.judges +
    details.travelAllowance +
    details.transportBus +
    details.transportPlane +
    details.transportShip +
    details.transportOther +
    details.accommodation +
    details.food
  );
}
