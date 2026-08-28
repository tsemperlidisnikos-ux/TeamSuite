import { z } from 'zod';

export const studentSchema = z.object({
  firstName: z.string().min(2, 'Το όνομα είναι υποχρεωτικό'),
  lastName: z.string().min(2, 'Το επώνυμο είναι υποχρεωτικό'),
  email: z.string().email('Μη έγκυρο email').or(z.literal('')),
  phone: z.string().optional().default(''),
  birthDate: z.string().optional().default(''),
  guardianName: z.string().optional().default(''),
  guardianPhone: z.string().optional().default(''),
  classId: z.string().nullable(),
  classIds: z.array(z.string()).optional().default([]),
  status: z.enum(['active', 'inactive', 'trial']),
  monthlyFee: z.coerce.number().min(0, 'Το μηνιαίο δίδακτρο πρέπει να είναι ≥ 0'),
  amka: z.string().optional(),
  gender: z.enum(['boy', 'girl', 'other', '']).optional(),
  fatherFirstName: z.string().optional(),
  motherFirstName: z.string().optional(),
  fatherEmail: z.string().optional(),
  motherEmail: z.string().optional(),
  motherPhone: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  clubName: z.string().optional(),
  registrationNumber: z.string().optional(),
  sport: z.string().optional(),
  sports: z.array(z.string()).optional().default([]),
  healthCardStatus: z.string().optional(),
  healthCard: z.boolean().optional(),
  healthCardExpires: z.string().optional().default(''),
  consentExpires: z.string().optional().default(''),
  uniformReceived: z.boolean().optional(),
  uniformSize: z.string().optional(),
  joinExtras: z
    .object({
      clothingPackage: z.enum(['basic', 'upgraded']),
      istosProgram: z.enum(['yes', 'no']),
      preferredPayment: z.enum(['cash', 'card', 'transfer']),
      healthDeclaration: z.enum(['allow', 'deny']),
      liabilityAcceptance: z.enum(['accept', 'decline']),
      mediaConsent: z.enum(['consent', 'decline']),
    })
    .optional(),
  registrationFee: z.coerce.number().optional(),
  registrationCharge: z.boolean().optional(),
  monthlyCharge: z.boolean().optional(),
  customCharge: z.boolean().optional(),
  seasonTicket: z.boolean().optional(),
  subscriptionDiscount: z.boolean().optional(),
  discountAmount: z.coerce.number().optional(),
  discountReason: z.string().optional(),
  comments: z.string().optional(),
  photoUrl: z.string().nullable().optional(),
  gdprConsent: z.enum(['full', 'pending', 'locked']).optional(),
  gdprItems: z
    .object({
      personalData: z.boolean(),
      photoUse: z.boolean(),
      gallery: z.boolean(),
      communication: z.boolean(),
      medical: z.boolean(),
      amkaHealthCard: z.boolean().optional(),
    })
    .optional(),
  amkaConsentAt: z.string().optional(),
  healthCardSealedAt: z.string().optional(),
  placeOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  communicationLanguage: z.string().optional(),
  county: z.string().optional(),
  jerseyNumber: z.string().optional(),
  position: z.string().optional(),
  athleticLevel: z.string().optional(),
  athleticStartDate: z.string().optional(),
  coachName: z.string().optional(),
  coachNames: z.array(z.string()).optional().default([]),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  emergencyRelation: z.string().optional(),
  emergencyAltPhone: z.string().optional(),
  doctorName: z.string().optional(),
  doctorPhone: z.string().optional(),
  bloodType: z.string().optional(),
  allergies: z.string().optional(),
  chronicConditions: z.string().optional(),
  medication: z.string().optional(),
  registrationExpires: z.string().optional(),
  autoRenewal: z.boolean().optional(),
});

export const coachSchema = z.object({
  firstName: z.string().min(2, 'Το όνομα είναι υποχρεωτικό'),
  lastName: z.string().min(2, 'Το επώνυμο είναι υποχρεωτικό'),
  email: z.string().email('Μη έγκυρο email'),
  phone: z.string().min(10, 'Μη έγκυρο τηλέφωνο'),
  sport: z.string().min(1, 'Επιλέξτε άθλημα'),
  active: z.boolean(),
  photoUrl: z.string().nullable().optional().default(null),
  ggaCode: z.string().optional().default(''),
  hireDate: z.string().optional().default(''),
  licenseLevel: z.enum(['', 'A', 'B', 'Γ']).optional().default(''),
  licenseDocumentUrl: z.string().nullable().optional().default(null),
  licenseDocumentName: z.string().nullable().optional().default(null),
  licenseValidFrom: z.string().optional().default(''),
  licenseValidUntil: z.string().optional().default(''),
  firstAidDocumentUrl: z.string().nullable().optional().default(null),
  firstAidDocumentName: z.string().nullable().optional().default(null),
  firstAidValidFrom: z.string().optional().default(''),
  firstAidValidUntil: z.string().optional().default(''),
});

export const classSchema = z.object({
  name: z.string().min(2, 'Το όνομα τμήματος είναι υποχρεωτικό'),
  sport: z.string().optional().default(''),
  ageGroup: z.string().optional().default(''),
  coachId: z.string().nullable().optional().default(null),
  maxStudents: z.coerce.number().int().min(1).optional().default(18),
  scheduleSummary: z.string().optional().default(''),
  monthlyFee: z.coerce.number().min(0).optional().default(55),
  startDate: z.string().optional().default(''),
  endDate: z.string().optional().default(''),
  seasonId: z.string().nullable().optional().default(null),
  gender: z.enum(['male', 'female', 'mixed', '']).optional().default(''),
  birthYearFrom: z.coerce.number().int().min(1900).max(2100).nullable().optional().default(null),
  birthYearTo: z.coerce.number().int().min(1900).max(2100).nullable().optional().default(null),
  manualInactive: z.coerce.boolean().optional().default(false),
});

export const clubSeasonSchema = z
  .object({
    name: z.string().optional().default(''),
    startDate: z.string().min(1, 'Η ημερομηνία έναρξης είναι υποχρεωτική'),
    endDate: z.string().min(1, 'Η ημερομηνία λήξης είναι υποχρεωτική'),
  })
  .superRefine((val, ctx) => {
    if (val.startDate && val.endDate && val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Η λήξη πρέπει να είναι μετά την έναρξη',
        path: ['endDate'],
      });
    }
  });

export type ClubSeasonInput = z.infer<typeof clubSeasonSchema>;

export const scheduleSlotSchema = z.object({
  classId: z.string().min(1, 'Επιλέξτε τμήμα'),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().min(1, 'Ώρα έναρξης υποχρεωτική'),
  endTime: z.string().min(1, 'Ώρα λήξης υποχρεωτική'),
  location: z.string().min(1, 'Ο χώρος είναι υποχρεωτικός'),
});

export const revenueSchema = z.object({
  date: z.string().min(1, 'Η ημερομηνία είναι υποχρεωτική'),
  amount: z.coerce.number().positive('Το ποσό πρέπει να είναι θετικό'),
  category: z.enum(['tuition', 'registration', 'merchandise', 'events', 'other']),
  description: z.string().min(2, 'Η περιγραφή είναι υποχρεωτική'),
  studentId: z.string().optional(),
  paymentStatus: z.enum(['paid', 'pending', 'overdue']).default('paid'),
  subcategory: z.string().optional().default(''),
  clubName: z.string().optional().default(''),
  sport: z.string().optional().default(''),
  surname: z.string().optional().default(''),
  firstName: z.string().optional().default(''),
  subscriptionPeriod: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'viva', 'other', '']).optional(),
  accountId: z.string().optional(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
  linkedTransactionId: z.string().optional(),
});

const matchExpenseDetailsSchema = z.object({
  sport: z.string().default(''),
  category: z.string().default(''),
  teams: z.string().default(''),
  referees: z.coerce.number().min(0).default(0),
  judges: z.coerce.number().min(0).default(0),
  travelAllowance: z.coerce.number().min(0).default(0),
  transportBus: z.coerce.number().min(0).default(0),
  transportPlane: z.coerce.number().min(0).default(0),
  transportShip: z.coerce.number().min(0).default(0),
  transportOther: z.coerce.number().min(0).default(0),
  accommodation: z.coerce.number().min(0).default(0),
  food: z.coerce.number().min(0).default(0),
});

export const expenseSchema = z.object({
  date: z.string().min(1, 'Η ημερομηνία είναι υποχρεωτική'),
  amount: z.coerce.number().positive('Το ποσό πρέπει να είναι θετικό'),
  category: z.enum(['rent', 'salaries', 'equipment', 'utilities', 'marketing', 'other']),
  description: z.string().min(2, 'Η περιγραφή είναι υποχρεωτική'),
  vendor: z.string().optional().default(''),
  subcategory: z.string().optional().default(''),
  clubName: z.string().optional().default(''),
  sport: z.string().optional().default(''),
  className: z.string().optional().default(''),
  surname: z.string().optional().default(''),
  firstName: z.string().optional().default(''),
  studentId: z.string().optional(),
  notes: z.string().optional().default(''),
  matchDetails: matchExpenseDetailsSchema.optional(),
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'viva', 'other', '']).optional(),
  accountId: z.string().optional(),
  vatRate: z.coerce.number().min(0).max(100).optional(),
});

export type StudentInput = z.infer<typeof studentSchema>;
export type CoachInput = z.infer<typeof coachSchema>;
export type ClassInput = z.infer<typeof classSchema>;
export type ScheduleSlotInput = z.infer<typeof scheduleSlotSchema>;
export type RevenueInput = z.infer<typeof revenueSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const transactionSchema = z.object({
  athleteId: z.string().min(1, 'Επιλέξτε αθλητή'),
  amount: z.coerce.number().positive('Το ποσό πρέπει να είναι θετικό'),
  receiptNumber: z.string().optional().default(''),
  type: z.enum(['charge', 'payment']),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000),
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'viva', 'other', '']),
  comments: z.string().optional().default(''),
  allocatesChargeId: z.string().nullable().optional(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;

export const matchSchema = z.object({
  date: z.string().min(1, 'Η ημερομηνία είναι υποχρεωτική'),
  time: z.string().optional().default(''),
  opponent: z.string().min(1, 'Ο αντίπαλος είναι υποχρεωτικός'),
  sport: z.string().optional().default(''),
  classId: z.string().nullable().optional().default(null),
  venue: z.enum(['home', 'away', 'neutral']).default('home'),
  location: z.string().optional().default(''),
  status: z.enum(['scheduled', 'played', 'cancelled']).default('scheduled'),
  ourScore: z.coerce.number().int().min(0).nullable().optional(),
  opponentScore: z.coerce.number().int().min(0).nullable().optional(),
  notes: z.string().optional().default(''),
});

export type MatchInput = z.infer<typeof matchSchema>;

export const trainingSchema = z.object({
  date: z.string().min(1, 'Η ημερομηνία είναι υποχρεωτική'),
  startTime: z.string().min(1, 'Η ώρα έναρξης είναι υποχρεωτική'),
  endTime: z.string().min(1, 'Η ώρα λήξης είναι υποχρεωτική'),
  location: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  classId: z.string().nullable().optional(),
});

export type TrainingInput = z.infer<typeof trainingSchema>;

export const associationSchema = z.object({
  name: z.string().min(2, 'Το όνομα συλλόγου είναι υποχρεωτικό'),
  city: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z
    .union([z.literal(''), z.string().email('Μη έγκυρο email')])
    .optional()
    .default(''),
  address: z.string().optional().default(''),
  active: z.coerce.boolean().default(true),
});

export type AssociationInput = z.infer<typeof associationSchema>;

export const FACILITY_TIME_LAYOUT_IDS = [
  '08:00-00:00-15',
  '08:00-00:00-30',
  '07:00-23:00-30',
  '09:00-22:00-60',
] as const;

export const facilitySchema = z.object({
  name: z.string().min(2, 'Το όνομα εγκατάστασης είναι υποχρεωτικό'),
  active: z.coerce.boolean().default(true),
  sports: z.array(z.string().min(1)).min(1, 'Επιλέξτε τουλάχιστον ένα άθλημα'),
  timeLayout: z.enum(FACILITY_TIME_LAYOUT_IDS).default('08:00-00:00-15'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(1),
});

export type FacilityInput = z.infer<typeof facilitySchema>;

export const rentalBookingInputSchema = z.object({
  facilityId: z.string().min(1, 'Επιλέξτε γήπεδο'),
  date: z.string().min(10, 'Η ημερομηνία είναι υποχρεωτική'),
  startTime: z.string().min(4, 'Ώρα έναρξης υποχρεωτική'),
  endTime: z.string().min(4, 'Ώρα λήξης υποχρεωτική'),
  courtShare: z.enum(['full', 'half']).default('full'),
  customerName: z.string().min(2, 'Το ονοματεπώνυμο είναι υποχρεωτικό'),
  customerPhone: z.string().min(6, 'Το τηλέφωνο είναι υποχρεωτικό'),
  customerEmail: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  amount: z.coerce.number().min(0).optional().default(0),
});

export type RentalBookingInput = z.infer<typeof rentalBookingInputSchema>;

export const rentalSettingsSchema = z.object({
  publicEnabled: z.boolean().default(false),
  notes: z.string().optional().default(''),
  rules: z.array(
    z.object({
      facilityId: z.string().min(1),
      enabled: z.boolean().default(false),
      slotMinutes: z.coerce.number().int().min(30).max(180).default(60),
      windows: z.array(
        z.object({
          days: z.array(z.coerce.number().int().min(0).max(6)).min(1),
          startTime: z.string().min(4),
          endTime: z.string().min(4),
        }),
      ),
      hourlyRate: z.coerce.number().min(0).optional().default(0),
      hourlyRateFull: z.coerce.number().min(0).optional().default(0),
      hourlyRateHalf: z.coerce.number().min(0).optional().default(0),
    }),
  ),
});

export type RentalSettingsInput = z.infer<typeof rentalSettingsSchema>;

export const sportItemSchema = z.object({
  name: z.string().min(2, 'Το όνομα αθλήματος είναι υποχρεωτικό'),
  active: z.boolean().default(true),
  category: z
    .enum(['team', 'individual', 'water', 'martial', 'racket', 'dance', 'gym', 'winter', 'other'])
    .default('other'),
});

export type SportItemInput = z.infer<typeof sportItemSchema>;

export const announcementSchema = z.object({
  title: z.string().min(2, 'Ο τίτλος είναι υποχρεωτικός'),
  message: z.string().min(2, 'Το μήνυμα είναι υποχρεωτικό'),
  targetType: z.enum(['club', 'team']).default('club'),
  targetId: z.string().nullable().optional().default(null),
  highPriority: z.boolean().optional().default(false),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  status: z.enum(['draft', 'published']).optional().default('published'),
  createdBy: z.string().optional().default(''),
  imageUrl: z.string().nullable().optional().default(null),
  visibleFrom: z.string().optional().default(''),
  visibleUntil: z.string().optional().default(''),
  showTo: z.string().optional().default(''),
  sportCategories: z.string().optional().default(''),
  teamsLabel: z.string().optional().default(''),
  audienceRoles: z
    .array(z.enum(['athletes', 'coaches', 'staff', 'parents']))
    .optional()
    .default([]),
  classIds: z.array(z.string()).optional().default([]),
  recipientIds: z
    .array(
      z.object({
        kind: z.enum(['athlete', 'coach', 'staff', 'parent']),
        id: z.string(),
      }),
    )
    .optional()
    .default([]),
});

export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const budgetSchema = z.object({
  seasonStart: z.coerce.number().int().min(2000),
  type: z.enum(['income', 'expense']),
  subcategory: z.string().min(1, 'Επιλέξτε υποκατηγορία'),
  amount: z.coerce.number().min(0, 'Το ποσό πρέπει να είναι ≥ 0'),
  clubName: z.string().optional().default(''),
  sport: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

export type BudgetInput = z.infer<typeof budgetSchema>;

export const PRODUCT_CATEGORIES = [
  'ΡΟΥΧΙΣΜΟΣ',
  'ΥΠΟΔΗΜΑΤΑ',
  'ΕΞΟΠΛΙΣΜΟΣ',
  'ΑΞΕΣΟΥΑΡ',
  'ΑΛΛΟ',
] as const;

export const warehouseProductSchema = z.object({
  name: z.string().min(1, 'Το όνομα είναι υποχρεωτικό'),
  category: z.string().min(1, 'Επιλέξτε κατηγορία'),
  sku: z.string().optional().default(''),
  salePrice: z.coerce.number().min(0, 'Η τιμή πρέπει να είναι ≥ 0'),
  size: z.string().optional().default(''),
  sizeGroup: z.enum(['kids', 'adult', '']).optional().default(''),
  notes: z.string().optional().default(''),
  stockQty: z.coerce.number().int().min(0).optional().default(0),
  brand: z.string().optional().default(''),
  barcode: z.string().optional().default(''),
  color: z.string().optional().default(''),
  costPrice: z.coerce.number().min(0).optional().default(0),
  minStock: z.coerce.number().int().min(0).optional().default(5),
  imageUrl: z.string().nullable().optional().default(null),
});

export type WarehouseProductInput = z.infer<typeof warehouseProductSchema>;

export const stockMovementSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(['in', 'out', 'adjust']),
  quantity: z.coerce.number().int().positive('Η ποσότητα πρέπει να είναι θετική'),
  note: z.string().optional().default(''),
});

export type StockMovementInput = z.infer<typeof stockMovementSchema>;

export const partnerBusinessSchema = z.object({
  name: z.string().min(1, 'Το όνομα είναι υποχρεωτικό'),
  url: z.string().optional().default(''),
  status: z.enum(['active', 'inactive']),
  categories: z.string().optional().default(''),
  isSponsor: z.boolean().optional().default(false),
  address: z.string().optional().default(''),
  logoUrl: z.string().nullable().optional().default(null),
  favorite: z.boolean().optional().default(false),
});

export type PartnerBusinessInput = z.infer<typeof partnerBusinessSchema>;

export const partnerOfferSchema = z.object({
  name: z.string().min(1, 'Το όνομα είναι υποχρεωτικό'),
  businessId: z.string().min(1, 'Επιλέξτε επιχείρηση'),
  status: z.enum(['active', 'inactive']),
  discountText: z.string().optional().default(''),
  conditions: z.string().optional().default(''),
});

export type PartnerOfferInput = z.infer<typeof partnerOfferSchema>;

export const feeChargeTemplateSchema = z.object({
  season: z.string().min(1, 'Επιλέξτε σεζόν'),
  sport: z.string().optional().default(''),
  typeLabel: z.string().min(1, 'Συμπληρώστε τύπο').default('Συνδρομή'),
  monthlyAmount: z.coerce.number().min(0, 'Το ποσό πρέπει να είναι ≥ 0'),
  appliesTo: z
    .enum(['all', 'monthly', 'registration', 'seasonTicket', 'class', 'customCharge'])
    .default('all'),
  classId: z.string().nullable().optional().default(null),
  months: z.array(z.coerce.number().int().min(1).max(12)).default([]),
  reminderDays: z.coerce.number().int().min(0).default(7),
  registrationFee: z.coerce.number().min(0).optional().default(0),
  seasonTicketAmount: z.coerce.number().min(0).optional().default(0),
  seasonTicketMonths: z.array(z.coerce.number().int().min(1).max(12)).default([]),
  customChargeAmount: z.coerce.number().min(0).optional().default(0),
  autoGenerate: z.boolean().optional().default(false),
});

export type FeeChargeTemplateInput = z.infer<typeof feeChargeTemplateSchema>;

export const galleryPhotoSchema = z.object({
  imageUrl: z.string().min(1, 'Επιλέξτε φωτογραφία'),
  caption: z.string().optional().default(''),
  fileName: z.string().optional().default(''),
  album: z.string().optional().default(''),
  athleteIds: z.array(z.string()).optional().default([]),
});

export type GalleryPhotoInput = z.infer<typeof galleryPhotoSchema>;

export const documentProtocolSchema = z.object({
  /** Προαιρετικό override — μόνο admin συλλόγου / platform admin. */
  protocolNumber: z.string().optional().default(''),
  direction: z.enum(['incoming', 'outgoing']),
  sport: z.string().optional().default(''),
  subject: z.string().min(1, 'Το θέμα είναι υποχρεωτικό'),
  party: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  fileName: z.string().nullable().optional().default(null),
  fileDataUrl: z.string().nullable().optional().default(null),
  status: z.enum(['recorded', 'pending', 'archived']).optional().default('recorded'),
  date: z.string().optional().default(''),
});

export type DocumentProtocolInput = z.infer<typeof documentProtocolSchema>;
