import type { PublicJoinExtras } from '../shared/publicJoinExtras.js';

export type StudentStatus = 'active' | 'inactive' | 'trial';
export type PaymentStatus = 'paid' | 'pending' | 'overdue';
export type ExpenseCategory =
  | 'rent'
  | 'salaries'
  | 'equipment'
  | 'utilities'
  | 'marketing'
  | 'other';
export type RevenueCategory =
  | 'tuition'
  | 'registration'
  | 'merchandise'
  | 'events'
  | 'other';
export type Gender = 'boy' | 'girl' | 'other' | '';
export type TransactionType = 'charge' | 'payment';
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'viva' | 'stripe' | 'eurobank' | 'other' | '';

export interface AthleteTransaction {
  id: string;
  athleteId: string;
  amount: number;
  receiptNumber: string;
  /** Σειρά βιβλίου αποδείξεων (π.χ. Α). */
  receiptSeries?: string;
  /** Αύξων αριθμός βιβλίου αποδείξεων. */
  receiptSeq?: number;
  type: TransactionType;
  month: number;
  year: number;
  paymentMethod: PaymentMethod;
  comments: string;
  createdAt: string;
  /** Για type=payment: χρέωση στην οποία αντιστοιχίστηκε. */
  allocatesChargeId?: string | null;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  guardianName: string;
  guardianPhone: string;
  /** Κύριο τμήμα (εμφάνιση / προεπιλογή). */
  classId: string | null;
  /** Όλα τα τμήματα στα οποία ανήκει ο αθλητής. */
  classIds?: string[];
  status: StudentStatus;
  monthlyFee: number;
  enrolledAt: string;
  // Academio-style profile
  amka?: string;
  /** Αριθμός Δελτίου Ταυτότητας. */
  adt?: string;
  gender?: Gender;
  fatherFirstName?: string;
  motherFirstName?: string;
  fatherEmail?: string;
  motherEmail?: string;
  motherPhone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  clubName?: string;
  registrationNumber?: string;
  /** Κύριο άθλημα (εμφάνιση / προεπιλογή). */
  sport?: string;
  /** Όλα τα αθλήματα του αθλητή. */
  sports?: string[];
  healthCardStatus?: string;
  healthCard?: boolean;
  /** Λήξη ιατρικής κάρτας / πιστοποιητικού (YYYY-MM-DD). */
  healthCardExpires?: string;
  /** Λήξη συναίνεσης GDPR / όρων (YYYY-MM-DD). */
  consentExpires?: string;
  uniformReceived?: boolean;
  uniformSize?: string;
  /** Επιλεγμένα πακέτα ρουχισμού συλλόγου. */
  clothingPackageIds?: string[];
  /** Επιλογές δημόσιας φόρμας (πακέτο, ΙΣΤΟΣ, πληρωμή, δηλώσεις). */
  joinExtras?: PublicJoinExtras;
  registrationFee?: number;
  registrationCharge?: boolean;
  monthlyCharge?: boolean;
  customCharge?: boolean;
  seasonTicket?: boolean;
  subscriptionDiscount?: boolean;
  discountAmount?: number;
  discountReason?: string;
  /** Επιλεγμένοι λόγοι έκπτωσης συλλόγου. */
  discountReasonIds?: string[];
  comments?: string;
  photoUrl?: string | null;
  /** Στιγμιότυπο υποβληθείσας δημόσιας φόρμας εγγραφής. */
  registrationFormImageUrl?: string | null;
  gdprConsent?: 'full' | 'pending' | 'locked';
  gdprItems?: {
    personalData: boolean;
    photoUse: boolean;
    gallery: boolean;
    communication: boolean;
    medical: boolean;
    /** Ρητή συγκατάθεση για συλλογή/επεξεργασία ΑΜΚΑ (κάρτα υγείας). */
    amkaHealthCard?: boolean;
  };
  /** Πότε δόθηκε η συγκατάθεση ΑΜΚΑ (ISO). */
  amkaConsentAt?: string;
  /** Πότε ολοκληρώθηκε σφράγιση κάρτας υγείας και διαγράφηκε ο ΑΜΚΑ. */
  healthCardSealedAt?: string;
  placeOfBirth?: string;
  nationality?: string;
  communicationLanguage?: string;
  county?: string;
  jerseyNumber?: string;
  position?: string;
  athleticLevel?: string;
  athleticStartDate?: string;
  /** Κύριος προπονητής (εμφάνιση / προεπιλογή). */
  coachName?: string;
  /** Όλοι οι προπονητές του αθλητή. */
  coachNames?: string[];
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
  emergencyAltPhone?: string;
  doctorName?: string;
  doctorPhone?: string;
  bloodType?: string;
  allergies?: string;
  chronicConditions?: string;
  medication?: string;
  registrationExpires?: string;
  autoRenewal?: boolean;
}

export interface Coach {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  sport: string;
  hireDate: string;
  active: boolean;
  photoUrl?: string | null;
  /** Κωδικός προπονητή στη Γενική Γραμματεία Αθλητισμού. */
  ggaCode?: string;
  /** Επίπεδο άδειας άσκησης επαγγέλματος: A, B ή Γ. */
  licenseLevel?: '' | 'A' | 'B' | 'Γ';
  licenseDocumentUrl?: string | null;
  licenseDocumentName?: string | null;
  licenseValidFrom?: string;
  licenseValidUntil?: string;
  firstAidDocumentUrl?: string | null;
  firstAidDocumentName?: string | null;
  firstAidValidFrom?: string;
  firstAidValidUntil?: string;
}

export type ClassGender = 'male' | 'female' | 'mixed' | '';

export interface AcademyClass {
  id: string;
  name: string;
  sport: string;
  /** Κατηγορία (π.χ. Αγωνιστικά, U16). */
  ageGroup: string;
  coachId: string | null;
  maxStudents: number;
  scheduleSummary: string;
  monthlyFee: number;
  startDate?: string;
  endDate?: string;
  /** Σεζόν συλλόγου στην οποία ανήκει το τμήμα. */
  seasonId?: string | null;
  gender?: ClassGender;
  birthYearFrom?: number | null;
  birthYearTo?: number | null;
  /** Χειροκίνητη απενεργοποίηση (Μη ενεργά). */
  manualInactive?: boolean;
}

/** Σεζόν συλλόγου (Ρυθμίσεις → Σεζόν) — καθορίζει ενεργά τμήματα/εγγραφές. */
export interface ClubSeason {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface ScheduleSlot {
  id: string;
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string;
}

export interface AttendanceRecord {
  id: string;
  classId: string;
  studentId: string;
  date: string;
  present: boolean;
  notes?: string;
}

export interface Revenue {
  id: string;
  date: string;
  amount: number;
  category: RevenueCategory;
  description: string;
  studentId?: string;
  paymentStatus: PaymentStatus;
  subcategory?: string;
  clubName?: string;
  sport?: string;
  surname?: string;
  firstName?: string;
  subscriptionPeriod?: string;
  notes?: string;
  paymentMethod?: PaymentMethod;
  accountId?: string;
  vatRate?: number;
  linkedTransactionId?: string;
  createdByUserId?: string;
  createdByEmail?: string;
}

export interface MatchExpenseDetails {
  sport: string;
  category: string;
  teams: string;
  referees: number;
  judges: number;
  travelAllowance: number;
  transportBus: number;
  transportPlane: number;
  transportShip: number;
  transportOther: number;
  accommodation: number;
  food: number;
}

export interface Expense {
  id: string;
  date: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  vendor?: string;
  subcategory?: string;
  clubName?: string;
  sport?: string;
  /** Όνομα τμήματος (AcademyClass). */
  className?: string;
  surname?: string;
  firstName?: string;
  studentId?: string;
  notes?: string;
  matchDetails?: MatchExpenseDetails;
  paymentMethod?: PaymentMethod;
  accountId?: string;
  vatRate?: number;
  createdByUserId?: string;
  createdByEmail?: string;
}

export interface CashAccount {
  id: string;
  name: string;
  kind: 'cash' | 'bank' | 'other';
  openingBalance: number;
  active: boolean;
}

export interface Training {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  classId: string | null;
}

export interface StaffMember {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  role: 'admin' | 'coach' | 'secretariat' | 'employee';
  active: boolean;
  hireDate: string;
  teamLabel?: string;
  photoUrl?: string | null;
}

export interface Association {
  id: string;
  name: string;
  city: string;
  phone: string;
  email: string;
  address: string;
  active: boolean;
}

/** Γήπεδο / εγκατάσταση συλλόγου (Ρυθμίσεις → Γήπεδο). */
export interface Facility {
  id: string;
  name: string;
  active: boolean;
  sports: string[];
  /** π.χ. 08:00-00:00-15 */
  timeLayout: string;
  sortOrder: number;
  /** Φωτογραφία γηπέδου στο δημόσιο link ενοικίασης. */
  photoUrl?: string | null;
}

export interface RentalWindow {
  days: number[];
  startTime: string;
  endTime: string;
}

export interface FacilityRentalRule {
  facilityId: string;
  enabled: boolean;
  slotMinutes: number;
  windows: RentalWindow[];
  /** @deprecated χρήση hourlyRateFull */
  hourlyRate: number;
  hourlyRateFull: number;
  hourlyRateHalf: number;
  /** Το γήπεδο προσφέρει αποδυτήρια στην ενοικίαση. */
  lockerRoomAvailable?: boolean;
  /** Επιπλέον χρέωση (€) αν επιλεγεί χρήση αποδυτηρίου. */
  lockerRoomFee?: number;
}

export type RentalCourtShare = 'full' | 'half';

export interface RentalSettings {
  publicEnabled: boolean;
  notes: string;
  rules: FacilityRentalRule[];
  /** Κεφαλίδα δημόσιου link ενοικίασης. */
  heroImageUrl?: string | null;
  /** Στυλ καρτών γηπέδου στη δημόσια σελίδα (Cinematic). */
  photoLook?: 'g';
}

export interface RentalBooking {
  id: string;
  facilityId: string;
  facilityName: string;
  date: string;
  startTime: string;
  endTime: string;
  courtShare: RentalCourtShare;
  useLockerRoom?: boolean;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  notes: string;
  amount: number;
  /** Ειδική έκπτωση σε € (αφαιρείται από το ποσό ώρας). */
  specialDiscount?: number;
  source: 'secretariat' | 'public';
  status: 'confirmed' | 'cancelled';
  createdAt: string;
  createdByName: string;
}

export interface SportItem {
  id: string;
  name: string;
  active: boolean;
  category?:
    | 'team'
    | 'individual'
    | 'water'
    | 'martial'
    | 'racket'
    | 'dance'
    | 'gym'
    | 'winter'
    | 'other';
}

export type AnnouncementAudienceRole = 'athletes' | 'coaches' | 'staff' | 'parents';
export type AnnouncementRecipientKind = 'athlete' | 'coach' | 'staff' | 'parent';

export interface AnnouncementRecipient {
  kind: AnnouncementRecipientKind;
  id: string;
}

export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'urgent';
export type AnnouncementStatus = 'draft' | 'published';

export interface Announcement {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  targetType: 'club' | 'team';
  targetId: string | null;
  highPriority?: boolean;
  priority?: AnnouncementPriority;
  status?: AnnouncementStatus;
  createdBy?: string;
  imageUrl?: string | null;
  visibleFrom?: string;
  visibleUntil?: string;
  showTo?: string;
  sportCategories?: string;
  teamsLabel?: string;
  audienceRoles?: AnnouncementAudienceRole[];
  classIds?: string[];
  recipientIds?: AnnouncementRecipient[];
}

export interface BudgetLine {
  id: string;
  seasonStart: number;
  type: 'income' | 'expense';
  subcategory: string;
  amount: number;
  clubName?: string;
  sport?: string;
  notes?: string;
}

export type ProductSizeGroup = 'kids' | 'adult';

export interface WarehouseProduct {
  id: string;
  name: string;
  category: string;
  sku: string;
  salePrice: number;
  size: string;
  /** Παιδικό ή Ανδρικό/Γυναικείο — για εμφάνιση στην αποθήκη. */
  sizeGroup?: ProductSizeGroup | '';
  notes: string;
  /** Τρέχον απόθεμα τεμαχίων. */
  stockQty: number;
  createdAt: string;
  brand?: string;
  barcode?: string;
  color?: string;
  /** Κόστος κτήσης ανά τεμάχιο. */
  costPrice?: number;
  /** Ελάχιστο απόθεμα για ειδοποίηση. */
  minStock?: number;
  imageUrl?: string | null;
}

export type StockMovementType = 'in' | 'out' | 'adjust';

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  note: string;
  createdAt: string;
  createdByName: string;
}

export type PartnerStatus = 'active' | 'inactive';

export interface PartnerBusiness {
  id: string;
  name: string;
  url: string;
  status: PartnerStatus;
  categories: string;
  isSponsor: boolean;
  lastModifiedBy: string;
  lastModifiedAt: string;
  createdAt: string;
  address?: string;
  logoUrl?: string | null;
  favorite?: boolean;
}

export interface PartnerOffer {
  id: string;
  name: string;
  businessId: string;
  status: PartnerStatus;
  createdAt: string;
  discountText?: string;
  conditions?: string;
}

export type SizeChartCategory = 'kids' | 'men' | 'women';

export interface SizeChart {
  kids: string[];
  men: string[];
  women: string[];
  /** Custom titles for the kids / adult groups in the μεγεθολόγιο. */
  groupLabels?: {
    kids?: string;
    adult?: string;
  };
}

export interface ClothingPackageDef {
  id: string;
  name: string;
}

export interface DiscountReasonDef {
  id: string;
  name: string;
  /** Κενό = ισχύει για όλα τα αθλήματα. */
  sport: string;
}

/** Εύρος αριθμών αποδείξεων είσπραξης (π.χ. σειρά Α, 1–50). */
export interface ReceiptNumberRange {
  id: string;
  series: string;
  from: number;
  to: number;
}

/** Εκδοθείσα ή ακυρωμένη απόδειξη — ο αριθμός δεν επαναχρησιμοποιείται. */
export interface ReceiptIssueRecord {
  id: string;
  series: string;
  number: number;
  transactionId?: string | null;
  athleteId?: string | null;
  issuedAt: string;
  emailedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
}

/** Πρότυπο χρεώσεων συνδρομών (Συνδρομές / Πληρωμές). */
export interface FeeChargeTemplate {
  id: string;
  season: string;
  sport: string;
  typeLabel: string;
  monthlyAmount: number;
  /** Academio-style: σε ποιους αθλητές ισχύει η χρέωση. */
  appliesTo: 'all' | 'monthly' | 'registration' | 'seasonTicket' | 'class' | 'customCharge';
  classId?: string | null;
  months: number[];
  reminderDays: number;
  registrationFee: number;
  seasonTicketAmount: number;
  seasonTicketMonths: number[];
  /** Ποσό προγράμματος προσαρμοσμένης χρέωσης (π.χ. Πρόγραμμα Ιστός). */
  customChargeAmount: number;
  createdAt: string;
  /** Αυτόματη δημιουργία χρεώσεων όταν αλλάζει μήνας. */
  autoGenerate?: boolean;
  lastGeneratedAt?: string | null;
}

export type MatchVenue = 'home' | 'away' | 'neutral';
export type MatchStatus = 'scheduled' | 'played' | 'cancelled';

/** Αγώνας συλλόγου (φύλλο / αποτέλεσμα). */
export interface Match {
  id: string;
  date: string;
  time: string;
  opponent: string;
  sport: string;
  classId: string | null;
  venue: MatchVenue;
  location: string;
  status: MatchStatus;
  ourScore: number | null;
  opponentScore: number | null;
  notes: string;
  createdAt: string;
}

export interface FeeReminderLog {
  id: string;
  athleteId: string;
  templateId?: string;
  amount: number;
  note: string;
  createdAt: string;
}

export type AmkaAccessAction = 'view' | 'edit' | 'delete' | 'consent' | 'seal';

/** Audit log ΑΜΚΑ — χωρίς αποθήκευση της τιμής ΑΜΚΑ. */
export interface AmkaAccessLog {
  id: string;
  at: string;
  userId: string;
  userName: string;
  athleteId: string;
  athleteName: string;
  action: AmkaAccessAction;
}

export interface GalleryPhoto {
  id: string;
  imageUrl: string;
  caption: string;
  fileName: string;
  createdAt: string;
  album?: string;
  /** Αθλητές που εμφανίζονται — απαιτείται συγκατάθεση photoUse+gallery. */
  athleteIds?: string[];
  /** Ανήλικοι στη φωτογραφία (extra GDPR flag). */
  includesMinors?: boolean;
  consentVerifiedAt?: string;
}

export type GdprAuditAction =
  | 'export'
  | 'erase'
  | 'correct'
  | 'consent'
  | 'consent_revoke'
  | 'retention'
  | 'cookie';

export interface GdprAuditLog {
  id: string;
  at: string;
  action: GdprAuditAction;
  actorUserId?: string;
  actorEmail?: string;
  subjectAthleteId?: string;
  subjectEmail?: string;
  detail?: string;
  ip?: string;
}

/** Σύνδεση λογαριασμού γονέα με αθλητή. */
export interface ParentAthleteLink {
  id: string;
  parentUserId: string;
  athleteId: string;
  createdAt: string;
}

/** Αναφορά προόδου αθλητή (προπονητής / γραμματεία). */
export interface ProgressReport {
  id: string;
  athleteId: string;
  date: string;
  title: string;
  notes: string;
  rating: number;
  createdByName: string;
  createdAt: string;
}

export type RegistrationApplicationKind = 'full' | 'trial' | 'waitlist';
export type RegistrationApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface RegistrationApplication {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: Gender;
  guardianName: string;
  guardianPhone: string;
  email: string;
  classId: string | null;
  kind: RegistrationApplicationKind;
  status: RegistrationApplicationStatus;
  notes: string;
  createdAt: string;
  /** Αθλητής που δημιουργήθηκε μετά από έγκριση / auto-approve. */
  athleteId?: string | null;
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
  gdprItems?: Student['gdprItems'];
  amkaConsentAt?: string;
  /** Υπογραφή γονέα/κηδεμόνα (data URL PNG). */
  guardianSignature?: string;
  /** Στιγμιότυπο της υποβληθείσας φόρμας (JPEG data URL ή Blob URL). */
  formSnapshotUrl?: string | null;
}

export type DocumentProtocolDirection = 'incoming' | 'outgoing';
export type DocumentProtocolStatus = 'recorded' | 'pending' | 'archived';

export interface DocumentProtocolEntry {
  id: string;
  /** Αυτόματος αριθμός π.χ. 2026/0001 */
  protocolNumber: string;
  direction: DocumentProtocolDirection;
  sport: string;
  date: string;
  subject: string;
  party: string;
  notes: string;
  fileName?: string | null;
  fileDataUrl?: string | null;
  status: DocumentProtocolStatus;
  createdAt: string;
  createdByName: string;
}

export interface AppData {
  students: Student[];
  coaches: Coach[];
  classes: AcademyClass[];
  schedule: ScheduleSlot[];
  attendance: AttendanceRecord[];
  revenues: Revenue[];
  expenses: Expense[];
  transactions: AthleteTransaction[];
  /** Κινήσεις που διαγράφηκαν ρητά — δεν επαναφέρονται από cloud/login. */
  deletedTransactionIds?: string[];
  /** Αθλητές που διαγράφηκαν ρητά — δεν επαναφέρονται από παλιό mirror. */
  deletedStudentIds?: string[];
  /** Αυτόματες χρεώσεις συνδρομής που ο χρήστης διέγραψε — δεν ξαναδημιουργούνται. */
  suppressedFeeChargeKeys?: string[];
  trainings: Training[];
  staff: StaffMember[];
  associations: Association[];
  facilities: Facility[];
  sports: SportItem[];
  /** Σεζόν συλλόγου με ημερομηνίες έναρξης/λήξης. */
  clubSeasons?: ClubSeason[];
  announcements: Announcement[];
  budgets: BudgetLine[];
  products: WarehouseProduct[];
  stockMovements: StockMovement[];
  partnerBusinesses: PartnerBusiness[];
  partnerOffers: PartnerOffer[];
  feeChargeTemplates: FeeChargeTemplate[];
  feeReminderLogs: FeeReminderLog[];
  /** Audit logs πρόσβασης ΑΜΚΑ (12 μήνες, χωρίς τιμή ΑΜΚΑ). */
  amkaAccessLogs?: AmkaAccessLog[];
  /** Γενικά GDPR audit logs (DSAR, consent, retention). */
  gdprAuditLogs?: GdprAuditLog[];
  /** Emails που έχουν κάνει unsubscribe από επικοινωνίες συλλόγου. */
  emailUnsubscribes?: string[];
  photos: GalleryPhoto[];
  parentLinks: ParentAthleteLink[];
  progressReports: ProgressReport[];
  registrationApplications: RegistrationApplication[];
  sizeChart: SizeChart;
  /** Πακέτα ρουχισμού που ορίζει ο σύλλογος. */
  clothingPackages?: ClothingPackageDef[];
  /** Λόγοι έκπτωσης συνδρομής ανά άθλημα. Κενό μέχρι να τους ορίσει ο σύλλογος. */
  discountReasons?: DiscountReasonDef[];
  /** Εύρη σειράς/αριθμών αποδείξεων είσπραξης. */
  receiptNumberRanges?: ReceiptNumberRange[];
  /** Εκδοθείσες/ακυρωμένες αποδείξεις (η αρίθμηση δεν γυρίζει πίσω). */
  receiptIssues?: ReceiptIssueRecord[];
  /** HTML όρων χρήσης / πολιτικής απορρήτου (εγγραφή). */
  termsOfUseHtml?: string;
  /** Συμφωνία επεξεργασίας (DPA) συλλόγου–πλατφόρμας. */
  dpaHtml?: string;
  /** Πολιτική διατήρησης δεδομένων. */
  retentionPolicyHtml?: string;
  /** Μήνες διατήρησης ευαίσθητων δεδομένων ανενεργών αθλητών. */
  dataRetentionMonths?: number;
  cashAccounts?: CashAccount[];
  /** Κλειστοί μήνες YYYY-MM — δεν επιτρέπεται επεξεργασία κινήσεων. */
  closedFinanceMonths?: string[];
  matches?: Match[];
  rentalSettings?: RentalSettings;
  rentalBookings?: RentalBooking[];
  /** Πρωτόκολλο εισερχόμενων/εξερχόμενων εγγράφων. */
  documentProtocolEntries?: DocumentProtocolEntry[];
  /** Τοπικό ρολόι τελευταίας αλλαγής στο browser — για να μην σβήνει εισαγωγή από παλιό cloud. */
  localWrittenAt?: number;
}
