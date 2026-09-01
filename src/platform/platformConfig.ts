import {
  DEFAULT_EXPENSE_DESCRIPTIONS,
  DEFAULT_INCOME_DESCRIPTIONS,
  EXPENSE_SUBCATEGORIES,
  INCOME_SUBCATEGORIES,
} from '../shared/financeCategories';

export const SCF_MODULES = [
  { id: 'dashboard', label: 'DASHBOARD', path: '/' },
  { id: 'income', label: 'ΕΣΟΔΑ', path: '/finance' },
  { id: 'expense', label: 'ΕΞΟΔΑ', path: '/finance' },
  { id: 'budget', label: 'ΠΡΟΫΠΟΛΟΓΙΣΜΟΣ', path: '/finance' },
  { id: 'reports', label: 'ΕΚΤΥΠΩΣΕΙΣ', path: '/finance' },
] as const;

export type ScfModuleId = (typeof SCF_MODULES)[number]['id'];

/** Καρτέλες σελίδας Οικονομικά — καθολική ενεργοποίηση από Platform Admin. */
export const FINANCE_TABS = [
  { id: 'analysis', label: 'Ανάλυση' },
  { id: 'revenues', label: 'Έσοδα' },
  { id: 'expenses', label: 'Έξοδα' },
  { id: 'accounts', label: 'Ταμεία' },
  { id: 'balance', label: 'Ισοζύγιο' },
  { id: 'budget', label: 'Προϋπολογισμός' },
  { id: 'reports', label: 'Αναφορές' },
] as const;

export type FinanceTabId = (typeof FINANCE_TABS)[number]['id'];

export const ACADEMY_MODULES = [
  { id: 'dashboard', label: 'Επισκόπηση', path: '/' },
  { id: 'calendar', label: 'Ημερολόγιο', path: '/calendar' },
  { id: 'athletes', label: 'Αθλητές', path: '/athletes' },
  { id: 'staff', label: 'Προσωπικό', path: '/staff' },
  { id: 'coaches', label: 'Προπονητές', path: '/coaches' },
  { id: 'classes', label: 'Τμήματα', path: '/classes' },
  { id: 'parents', label: 'Γονείς', path: '/parents' },
  { id: 'trainings', label: 'Προπονήσεις', path: '/trainings' },
  { id: 'matches', label: 'Αγώνες', path: '/matches' },
  { id: 'schedule', label: 'Πρόγραμμα', path: '/schedule' },
  { id: 'attendance', label: 'Παρουσίες', path: '/attendance' },
  { id: 'associations', label: 'Σωματείο', path: '/associations' },
  { id: 'sports', label: 'Άθλημα', path: '/sports' },
  { id: 'announcements', label: 'Ανακοινώσεις', path: '/announcements' },
  { id: 'prints', label: 'Εκτυπώσεις', path: '/prints' },
  { id: 'rental', label: 'Ενοικίαση', path: '/rental' },
  { id: 'photos', label: 'Φωτογραφίες', path: '/photos' },
  { id: 'warehouse', label: 'Αποθήκη', path: '/warehouse' },
  { id: 'fees', label: 'Συνδρομές / Πληρωμές', path: '/fees' },
  { id: 'transactions', label: 'Συναλλαγές', path: '/transactions' },
  { id: 'partnerBusinesses', label: 'Συμβεβλημένες Επιχειρήσεις', path: '/partner-businesses' },
  { id: 'documentProtocol', label: 'Πρωτόκολλο Εγγράφων', path: '/document-protocol' },
  { id: 'settings', label: 'Ρυθμίσεις', path: '/settings' },
  { id: 'finance', label: 'Οικονομικά', path: '/finance' },
] as const;

export type AcademyModuleId = (typeof ACADEMY_MODULES)[number]['id'];

/* -------------------------------------------------------------------------- */
/* Δικαιώματα ρόλων συλλόγου                                                  */
/* -------------------------------------------------------------------------- */

export const CLUB_ROLES = [
  'admin',
  'doctor',
  'secretariat',
  'coach',
  'staff',
  'athlete',
  'parent',
] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];

export const CLUB_ROLE_LABELS: Record<ClubRole, string> = {
  admin: 'Διαχειριστής συλλόγου',
  doctor: 'Ιατρός',
  coach: 'Προπονητής',
  secretariat: 'Γραμματεία',
  staff: 'Προσωπικό',
  athlete: 'Αθλητής',
  parent: 'Γονέας',
};

/** Δικαιώματα = πρόσβαση σε καρτέλες μενού (χωρίς dashboard). */
export const CLUB_PERMISSIONS = [
  'calendar',
  'athletes',
  'staff',
  'coaches',
  'classes',
  'parents',
  'trainings',
  'matches',
  'schedule',
  'attendance',
  'announcements',
  'prints',
  'rental',
  'photos',
  'warehouse',
  'fees',
  'transactions',
  'partnerBusinesses',
  'documentProtocol',
  'settings',
  'finance',
] as const;

export type ClubPermission = (typeof CLUB_PERMISSIONS)[number];

export const CLUB_PERMISSION_LABELS: Record<ClubPermission, string> = {
  calendar: 'Ημερολόγιο',
  athletes: 'Αθλητές',
  staff: 'Προσωπικό',
  coaches: 'Προπονητές',
  classes: 'Τμήματα',
  parents: 'Γονείς',
  trainings: 'Προπονήσεις',
  matches: 'Αγώνες',
  schedule: 'Πρόγραμμα',
  attendance: 'Παρουσίες',
  announcements: 'Ανακοινώσεις',
  prints: 'Εκτυπώσεις',
  rental: 'Ενοικίαση',
  photos: 'Φωτογραφίες',
  warehouse: 'Αποθήκη',
  fees: 'Συνδρομές / Πληρωμές',
  transactions: 'Συναλλαγές',
  partnerBusinesses: 'Συμβεβλημένες Επιχειρήσεις',
  documentProtocol: 'Πρωτόκολλο Εγγράφων',
  settings: 'Ρυθμίσεις',
  finance: 'Οικονομικά',
};

/** Ο ιατρός έχει πρόσβαση μόνο σε Αθλητές — όχι οικονομικά/ρυθμίσεις. */
export const DOCTOR_CLUB_PERMISSIONS: ClubPermission[] = ['athletes'];

export const DEFAULT_CLUB_ROLE_PERMISSIONS: Record<ClubRole, ClubPermission[]> = {
  admin: [...CLUB_PERMISSIONS],
  doctor: [...DOCTOR_CLUB_PERMISSIONS],
  coach: [
    'calendar',
    'athletes',
    'classes',
    'trainings',
    'matches',
    'schedule',
    'attendance',
    'announcements',
    'settings',
  ],
  secretariat: [
    'calendar',
    'athletes',
    'staff',
    'coaches',
    'classes',
    'parents',
    'announcements',
    'prints',
    'rental',
    'photos',
    'warehouse',
    'fees',
    'transactions',
    'partnerBusinesses',
    'documentProtocol',
    'settings',
    'finance',
  ],
  staff: ['calendar'],
  athlete: ['schedule', 'attendance', 'fees', 'announcements', 'settings'],
  parent: ['fees', 'announcements', 'settings'],
};

export type BackupFrequency = 'daily' | 'weekly' | 'monthly';
export type BackupDeliveryMode = 'download' | 'cloud' | 'both';

/** Κανόνας προγραμματισμένου backup (ώρα τοπική του browser). */
export type BackupScheduleRule = {
  enabled: boolean;
  frequency: BackupFrequency;
  /** HH:mm τοπική ώρα */
  timeLocal: string;
  /** 0=Κυρ … 6=Σαβ (μόνο weekly) */
  dayOfWeek?: number;
  /** 1–28 (μόνο monthly) */
  dayOfMonth?: number;
  /** download = αρχείο, cloud = Redis mirror, both = και τα δύο */
  mode: BackupDeliveryMode;
  lastRunAt?: string | null;
};

export type PlatformBackupSchedules = {
  /** Πλήρες backup εφαρμογής (users, clubs, config, όλα τα δεδομένα). */
  fullApp: BackupScheduleRule;
  /** Backup δεδομένων κάθε συλλόγου / χρήστη πλατφόρμας. */
  perClub: BackupScheduleRule;
  /**
   * Σύλλογοι που συμμετέχουν στο per-club backup.
   * Κενό = όλοι οι σύλλογοι.
   */
  clubIds: string[];
};

export function defaultBackupScheduleRule(
  overrides?: Partial<BackupScheduleRule>,
): BackupScheduleRule {
  return {
    enabled: false,
    frequency: 'daily',
    timeLocal: '02:00',
    dayOfWeek: 1,
    dayOfMonth: 1,
    mode: 'download',
    lastRunAt: null,
    ...overrides,
  };
}

export function defaultBackupSchedules(): PlatformBackupSchedules {
  return {
    fullApp: defaultBackupScheduleRule({ mode: 'download' }),
    perClub: defaultBackupScheduleRule({ mode: 'cloud' }),
    clubIds: [],
  };
}

/** Εμφάνιση εφαρμογής — ορίζεται από Platform Admin. */
export type AppearanceTheme = 'ocean-slate' | 'graphite-ember';

export const APPEARANCE_THEMES: Array<{
  id: AppearanceTheme;
  label: string;
  description: string;
}> = [
  {
    id: 'ocean-slate',
    label: 'Ocean Slate',
    description: 'Μαύρο chrome + sky teal accents, φωτεινό content.',
  },
  {
    id: 'graphite-ember',
    label: 'Graphite Ember',
    description: 'Κάρβουνο shell + πορτοκαλί ember accents.',
  },
];

export function sanitizeAppearanceTheme(value: unknown): AppearanceTheme {
  if (value === 'graphite-ember') return 'graphite-ember';
  /* ocean-slate default; legacy themes migrate here */
  return 'ocean-slate';
}

export function sanitizeFinanceTabs(value: unknown): FinanceTabId[] {
  const all = FINANCE_TABS.map((tab) => tab.id);
  const allowed = new Set<string>(all);
  if (!Array.isArray(value)) return all;
  const filtered = value.filter((id): id is FinanceTabId => allowed.has(String(id)));
  // Τουλάχιστον μία καρτέλα πάντα ενεργή.
  return filtered.length > 0 ? filtered : all;
}

export type PlatformConfig = {
  scfModulesByClub: Record<string, ScfModuleId[]>;
  academyModulesByClub: Record<string, AcademyModuleId[]>;
  /** Ενεργές καρτέλες Οικονομικών — ισχύουν για όλους τους συλλόγους. */
  financeTabs: FinanceTabId[];
  clubRolePermissions: Record<ClubRole, ClubPermission[]>;
  incomeCategories: string[];
  expenseCategories: string[];
  incomeDescriptions: Record<string, string[]>;
  expenseDescriptions: Record<string, string[]>;
  registryKinds: string[];
  seasons: string[];
  appLogoUrl?: string | null;
  /** Λογότυπο εφαρμογής (κεφαλίδα SS) ανά σύλλογο. Override του appLogoUrl. */
  clubAppLogos?: Record<string, string>;
  appName?: string;
  /** ocean-slate | graphite-ember */
  appearanceTheme?: AppearanceTheme;
  backupSchedules?: PlatformBackupSchedules;
};

const CONFIG_KEY = 'teamsuite-platform-config-v1';
const LEGACY_CONFIG_KEYS = [
  'academyhub-platform-config-v4',
  'academyhub-platform-config-v3',
  'academyhub-platform-config-v2',
  'academyhub-platform-config-v1',
] as const;
const PREVIEW_KEY = 'academyhub-preview-club-v1';
const FINANCE_DEFAULTS_KEY = 'academyhub-finance-catalog-defaults-v1';
const REMOVED_INCOME_CATEGORIES = new Set(['ΣΥΝΔΡΟΜΕΣ ΑΘΛΗΤΩΝ', 'ΣΥΝΔΡΟΜΕΣ ΜΕΛΩΝ']);

type FinanceCatalogSeed = {
  incomeCategories: string[];
  expenseCategories: string[];
  incomeDescriptions: Record<string, string[]>;
  expenseDescriptions: Record<string, string[]>;
};

function defaultDescriptions(
  map: Record<string, readonly string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(map).map(([key, values]) => [key, [...values]]),
  );
}

function builtInFinanceCatalogSeed(): FinanceCatalogSeed {
  return {
    incomeCategories: [...INCOME_SUBCATEGORIES].filter(
      (item) => !REMOVED_INCOME_CATEGORIES.has(item),
    ),
    expenseCategories: [...EXPENSE_SUBCATEGORIES],
    incomeDescriptions: defaultDescriptions(DEFAULT_INCOME_DESCRIPTIONS),
    expenseDescriptions: defaultDescriptions(DEFAULT_EXPENSE_DESCRIPTIONS),
  };
}

/** Προεπιλογές καταλόγου: όσα έχουν οριστεί στην εφαρμογή, αλλιώς built-in. */
export function getFinanceCatalogSeed(): FinanceCatalogSeed {
  try {
    const raw = localStorage.getItem(FINANCE_DEFAULTS_KEY);
    if (!raw) return builtInFinanceCatalogSeed();
    const parsed = JSON.parse(raw) as Partial<FinanceCatalogSeed>;
    if (!parsed.incomeCategories?.length || !parsed.expenseCategories?.length) {
      return builtInFinanceCatalogSeed();
    }
    return {
      incomeCategories: parsed.incomeCategories.filter(
        (item) => !REMOVED_INCOME_CATEGORIES.has(item),
      ),
      expenseCategories: [...parsed.expenseCategories],
      incomeDescriptions: parsed.incomeDescriptions
        ? structuredClone(parsed.incomeDescriptions)
        : {},
      expenseDescriptions: parsed.expenseDescriptions
        ? structuredClone(parsed.expenseDescriptions)
        : {},
    };
  } catch {
    return builtInFinanceCatalogSeed();
  }
}

/** Αποθηκεύει τις τρέχουσες κατηγορίες/υποκατηγορίες ως by-default για όλα. */
export function saveFinanceCatalogAsDefaults(config: PlatformConfig): FinanceCatalogSeed {
  const seed: FinanceCatalogSeed = {
    incomeCategories: config.incomeCategories.filter(
      (item) => !REMOVED_INCOME_CATEGORIES.has(item),
    ),
    expenseCategories: [...config.expenseCategories],
    incomeDescriptions: structuredClone(config.incomeDescriptions),
    expenseDescriptions: structuredClone(config.expenseDescriptions),
  };
  localStorage.setItem(FINANCE_DEFAULTS_KEY, JSON.stringify(seed));
  return seed;
}

function sanitizeClubRolePermissions(
  stored: Partial<Record<ClubRole, string[]>> | undefined,
): Record<ClubRole, ClubPermission[]> {
  const allowed = new Set<string>(CLUB_PERMISSIONS);
  const result = structuredClone(DEFAULT_CLUB_ROLE_PERMISSIONS);
  if (!stored) return result;
  for (const role of CLUB_ROLES) {
    const list = stored[role];
    if (!list) continue;
    // Ό,τι ορίζει ο Platform Admin — χωρίς αυτόματη προσθήκη modules
    // (π.χ. partnerBusinesses) που αγνοεί τις επιλογές του admin.
    result[role] = list.filter((p): p is ClubPermission => allowed.has(p));
  }
  return result;
}

function sanitizeClubAppLogos(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [id, url] of Object.entries(value as Record<string, unknown>)) {
    const key = String(id ?? '').trim();
    const href = typeof url === 'string' ? url.trim() : '';
    if (key && href) out[key] = href;
  }
  return out;
}

export function defaultPlatformConfig(): PlatformConfig {
  const seed = getFinanceCatalogSeed();
  return {
    scfModulesByClub: {},
    academyModulesByClub: {},
    financeTabs: FINANCE_TABS.map((tab) => tab.id),
    clubRolePermissions: structuredClone(DEFAULT_CLUB_ROLE_PERMISSIONS),
    incomeCategories: [...seed.incomeCategories],
    expenseCategories: [...seed.expenseCategories],
    incomeDescriptions: structuredClone(seed.incomeDescriptions),
    expenseDescriptions: structuredClone(seed.expenseDescriptions),
    registryKinds: ['ΑΘΛΗΤΕΣ', 'ΜΕΛΗ'],
    seasons: ['2025–2026', '2026–2027'],
    appLogoUrl: null,
    clubAppLogos: {},
    appName: 'TeamSuite',
    appearanceTheme: 'ocean-slate',
    backupSchedules: defaultBackupSchedules(),
  };
}

function sanitizeBackupSchedules(
  stored: Partial<PlatformBackupSchedules> | undefined,
): PlatformBackupSchedules {
  const base = defaultBackupSchedules();
  if (!stored) return base;
  const mergeRule = (
    rule: Partial<BackupScheduleRule> | undefined,
    fallback: BackupScheduleRule,
  ): BackupScheduleRule => ({
    ...fallback,
    ...(rule ?? {}),
    enabled: Boolean(rule?.enabled),
    frequency:
      rule?.frequency === 'weekly' || rule?.frequency === 'monthly' || rule?.frequency === 'daily'
        ? rule.frequency
        : fallback.frequency,
    timeLocal:
      typeof rule?.timeLocal === 'string' && /^\d{2}:\d{2}$/.test(rule.timeLocal)
        ? rule.timeLocal
        : fallback.timeLocal,
    mode:
      rule?.mode === 'cloud' || rule?.mode === 'both' || rule?.mode === 'download'
        ? rule.mode
        : fallback.mode,
    lastRunAt: rule?.lastRunAt ?? null,
  });
  return {
    fullApp: mergeRule(stored.fullApp, base.fullApp),
    perClub: mergeRule(stored.perClub, base.perClub),
    clubIds: Array.isArray(stored.clubIds)
      ? stored.clubIds.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

/** Επαναφέρει κατηγορίες/περιγραφές στις αποθηκευμένες προεπιλογές (by default). */
export function resetFinanceCatalogDefaults(config?: PlatformConfig): PlatformConfig {
  const current = config ?? loadPlatformConfigRaw();
  const seed = getFinanceCatalogSeed();
  const next: PlatformConfig = {
    ...current,
    incomeCategories: [...seed.incomeCategories],
    expenseCategories: [...seed.expenseCategories],
    incomeDescriptions: structuredClone(seed.incomeDescriptions),
    expenseDescriptions: structuredClone(seed.expenseDescriptions),
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

function loadPlatformConfigRaw(): PlatformConfig {
  const base = defaultPlatformConfig();
  try {
    let raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) {
      for (const key of LEGACY_CONFIG_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<PlatformConfig>;
    return {
      ...base,
      ...parsed,
      clubRolePermissions: sanitizeClubRolePermissions(
        (parsed as { clubRolePermissions?: Partial<Record<ClubRole, string[]>> })
          .clubRolePermissions,
      ),
      backupSchedules: sanitizeBackupSchedules(parsed.backupSchedules),
      incomeDescriptions: {
        ...base.incomeDescriptions,
        ...(parsed.incomeDescriptions ?? {}),
      },
      expenseDescriptions: {
        ...base.expenseDescriptions,
        ...(parsed.expenseDescriptions ?? {}),
      },
      incomeCategories:
        parsed.incomeCategories && parsed.incomeCategories.length > 0
          ? parsed.incomeCategories.filter((item) => !REMOVED_INCOME_CATEGORIES.has(item))
          : base.incomeCategories,
      expenseCategories:
        parsed.expenseCategories && parsed.expenseCategories.length > 0
          ? parsed.expenseCategories
          : base.expenseCategories,
    };
  } catch {
    return base;
  }
}

export function loadPlatformConfig(): PlatformConfig {
  const base = defaultPlatformConfig();
  try {
    const hasCurrent = Boolean(localStorage.getItem(CONFIG_KEY));
    if (!hasCurrent) {
      let legacyRaw: string | null = null;
      for (const key of LEGACY_CONFIG_KEYS) {
        legacyRaw = localStorage.getItem(key);
        if (legacyRaw) break;
      }
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw) as Partial<PlatformConfig>;
        const seed = getFinanceCatalogSeed();
        const migrated: PlatformConfig = {
          ...base,
          scfModulesByClub: parsed.scfModulesByClub ?? {},
          academyModulesByClub: parsed.academyModulesByClub ?? {},
          financeTabs: sanitizeFinanceTabs(
            (parsed as { financeTabs?: unknown }).financeTabs,
          ),
          clubRolePermissions: sanitizeClubRolePermissions(
            (parsed as { clubRolePermissions?: Partial<Record<ClubRole, string[]>> })
              .clubRolePermissions,
          ),
          registryKinds:
            parsed.registryKinds && parsed.registryKinds.length > 0
              ? parsed.registryKinds
              : base.registryKinds,
          seasons: parsed.seasons && parsed.seasons.length > 0 ? parsed.seasons : base.seasons,
          incomeCategories:
            parsed.incomeCategories && parsed.incomeCategories.length > 0
              ? parsed.incomeCategories.filter((item) => !REMOVED_INCOME_CATEGORIES.has(item))
              : [...seed.incomeCategories],
          expenseCategories:
            parsed.expenseCategories && parsed.expenseCategories.length > 0
              ? [...parsed.expenseCategories]
              : [...seed.expenseCategories],
          incomeDescriptions: resolveCatalogDescriptions(
            seed.incomeDescriptions,
            parsed.incomeDescriptions,
            parsed.incomeCategories && parsed.incomeCategories.length > 0
              ? parsed.incomeCategories.filter((item) => !REMOVED_INCOME_CATEGORIES.has(item))
              : seed.incomeCategories,
          ),
          expenseDescriptions: resolveCatalogDescriptions(
            seed.expenseDescriptions,
            parsed.expenseDescriptions,
            parsed.expenseCategories && parsed.expenseCategories.length > 0
              ? parsed.expenseCategories
              : seed.expenseCategories,
          ),
          appLogoUrl: parsed.appLogoUrl ?? base.appLogoUrl,
          clubAppLogos: sanitizeClubAppLogos(parsed.clubAppLogos),
          appName: parsed.appName ?? base.appName,
          appearanceTheme: sanitizeAppearanceTheme(parsed.appearanceTheme),
          backupSchedules: sanitizeBackupSchedules(parsed.backupSchedules),
        };
        localStorage.setItem(CONFIG_KEY, JSON.stringify(migrated));
        if (!localStorage.getItem(FINANCE_DEFAULTS_KEY)) {
          saveFinanceCatalogAsDefaults(migrated);
        }
        return migrated;
      }
      localStorage.setItem(CONFIG_KEY, JSON.stringify(base));
      return base;
    }

    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(base));
      return base;
    }
    const parsed = JSON.parse(raw) as Partial<PlatformConfig>;
    const seed = getFinanceCatalogSeed();
    const incomeCategories =
      parsed.incomeCategories && parsed.incomeCategories.length > 0
        ? parsed.incomeCategories.filter((item) => !REMOVED_INCOME_CATEGORIES.has(item))
        : [...seed.incomeCategories];
    const expenseCategories =
      parsed.expenseCategories && parsed.expenseCategories.length > 0
        ? [...parsed.expenseCategories]
        : [...seed.expenseCategories];

    const next: PlatformConfig = {
      ...base,
      ...parsed,
      financeTabs: sanitizeFinanceTabs(parsed.financeTabs),
      clubRolePermissions: sanitizeClubRolePermissions(
        (parsed as { clubRolePermissions?: Partial<Record<ClubRole, string[]>> })
          .clubRolePermissions,
      ),
      backupSchedules: sanitizeBackupSchedules(parsed.backupSchedules),
      appearanceTheme: sanitizeAppearanceTheme(parsed.appearanceTheme),
      clubAppLogos: sanitizeClubAppLogos(parsed.clubAppLogos),
      incomeCategories,
      expenseCategories,
      incomeDescriptions: resolveCatalogDescriptions(
        seed.incomeDescriptions,
        parsed.incomeDescriptions,
        incomeCategories,
      ),
      expenseDescriptions: resolveCatalogDescriptions(
        seed.expenseDescriptions,
        parsed.expenseDescriptions,
        expenseCategories,
      ),
    };
    if (!localStorage.getItem(FINANCE_DEFAULTS_KEY)) {
      saveFinanceCatalogAsDefaults(next);
    }
    return next;
  } catch {
    return base;
  }
}

export function getBackupSchedules(): PlatformBackupSchedules {
  return sanitizeBackupSchedules(loadPlatformConfig().backupSchedules);
}

export function saveBackupSchedules(schedules: PlatformBackupSchedules): PlatformConfig {
  const next: PlatformConfig = {
    ...loadPlatformConfig(),
    backupSchedules: sanitizeBackupSchedules(schedules),
  };
  savePlatformConfig(next);
  return next;
}

/** Κρατά τις αποθηκευμένες υποκατηγορίες· δεν επαναφέρει διαγραμμένες τιμές από defaults. */
function resolveCatalogDescriptions(
  defaults: Record<string, string[]>,
  stored: Record<string, string[]> | undefined,
  categories: string[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const category of categories) {
    if (stored && Object.prototype.hasOwnProperty.call(stored, category)) {
      result[category] = [...(stored[category] ?? [])];
    } else {
      result[category] = [...(defaults[category] ?? [])];
    }
  }
  return result;
}

export function savePlatformConfig(config: PlatformConfig): void {
  const next: PlatformConfig = {
    ...config,
    financeTabs: sanitizeFinanceTabs(config.financeTabs),
    appearanceTheme: sanitizeAppearanceTheme(config.appearanceTheme),
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  applyAppearanceTheme(next.appearanceTheme);
  window.dispatchEvent(new CustomEvent('academyhub-platform-updated'));
}

export function getAppName(): string {
  return loadPlatformConfig().appName?.trim() || 'TeamSuite';
}

export function getAppLogoUrl(): string | null {
  return loadPlatformConfig().appLogoUrl ?? null;
}

export function getAppLogoUrlForClub(clubId?: string | null): string | null {
  const config = loadPlatformConfig();
  const perClub = clubId ? (config.clubAppLogos?.[clubId] ?? '').trim() : '';
  if (perClub) return perClub;
  return config.appLogoUrl ?? null;
}

export function updateClubAppLogo(clubId: string, logoUrl: string | null): PlatformConfig {
  const current = loadPlatformConfig();
  const clubAppLogos = { ...(current.clubAppLogos ?? {}) };
  if (!logoUrl?.trim()) delete clubAppLogos[clubId];
  else clubAppLogos[clubId] = logoUrl.trim();
  const next = { ...current, clubAppLogos };
  savePlatformConfig(next);
  return next;
}

export function getAppearanceTheme(): AppearanceTheme {
  return sanitizeAppearanceTheme(loadPlatformConfig().appearanceTheme);
}

export function applyAppearanceTheme(theme?: AppearanceTheme): void {
  if (typeof document === 'undefined') return;
  const resolved = sanitizeAppearanceTheme(theme ?? getAppearanceTheme());
  document.documentElement.setAttribute('data-appearance', resolved);
}

export function setAppearanceTheme(theme: AppearanceTheme): PlatformConfig {
  const next: PlatformConfig = {
    ...loadPlatformConfig(),
    appearanceTheme: sanitizeAppearanceTheme(theme),
  };
  savePlatformConfig(next);
  return next;
}

export function applyPlatformBranding(partial: {
  appearanceTheme?: unknown;
  appName?: unknown;
  appLogoUrl?: unknown;
}): PlatformConfig {
  const current = loadPlatformConfig();
  const next: PlatformConfig = {
    ...current,
    appearanceTheme:
      partial.appearanceTheme !== undefined
        ? sanitizeAppearanceTheme(partial.appearanceTheme)
        : current.appearanceTheme,
    appName:
      typeof partial.appName === 'string' && partial.appName.trim()
        ? partial.appName.trim()
        : current.appName,
    appLogoUrl:
      partial.appLogoUrl === null
        ? null
        : typeof partial.appLogoUrl === 'string'
          ? partial.appLogoUrl
          : current.appLogoUrl,
  };
  savePlatformConfig(next);
  return next;
}

async function pullCloudAppearanceTheme(): Promise<void> {
  try {
    const response = await fetch('/api/sync/account?kind=branding', {
      cache: 'no-store',
    });
    const json = (await response.json()) as {
      ok?: boolean;
      appearanceTheme?: unknown;
      appName?: unknown;
      appLogoUrl?: unknown;
    };
    if (!response.ok || !json.ok) return;
    applyPlatformBranding(json);
  } catch {
    /* offline / no cloud bundle */
  }
}

const APPEARANCE_ROLLOUT_KEY = 'academyhub-ocean-slate-rollout-v1';

/** Εφαρμόζει το θέμα στην εκκίνηση και σε κάθε platform update. */
export function startAppearanceTheme(): void {
  try {
    /* One-time rollout: activate Ocean Slate (can revert in Platform Admin). */
    if (!localStorage.getItem(APPEARANCE_ROLLOUT_KEY)) {
      const next: PlatformConfig = {
        ...loadPlatformConfig(),
        appearanceTheme: 'ocean-slate',
      };
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      localStorage.setItem(APPEARANCE_ROLLOUT_KEY, '1');
    }
  } catch {
    /* ignore */
  }
  applyAppearanceTheme();
  window.addEventListener('academyhub-platform-updated', () => {
    applyAppearanceTheme();
  });
  void pullCloudAppearanceTheme();
}

export function updateAppLogo(logoUrl: string | null): PlatformConfig {
  const next = { ...loadPlatformConfig(), appLogoUrl: logoUrl };
  savePlatformConfig(next);
  return next;
}

export function getScfModulesForClub(clubId: string): ScfModuleId[] {
  const config = loadPlatformConfig();
  const allowed = new Set(SCF_MODULES.map((m) => m.id));
  const stored = config.scfModulesByClub[clubId] ?? SCF_MODULES.map((m) => m.id);
  const filtered = stored.filter((id): id is ScfModuleId => allowed.has(id as ScfModuleId));
  return filtered.length > 0 ? filtered : SCF_MODULES.map((m) => m.id);
}

/** Ενεργές καρτέλες Οικονομικών (καθολικά για όλους τους συλλόγους). */
export function getEnabledFinanceTabs(): FinanceTabId[] {
  return sanitizeFinanceTabs(loadPlatformConfig().financeTabs);
}

export function setEnabledFinanceTabs(tabs: FinanceTabId[]): PlatformConfig {
  const next: PlatformConfig = {
    ...loadPlatformConfig(),
    financeTabs: sanitizeFinanceTabs(tabs),
  };
  savePlatformConfig(next);
  return next;
}

export function getAcademyModulesForClub(clubId: string): AcademyModuleId[] {
  const config = loadPlatformConfig();
  const allIds = ACADEMY_MODULES.map((m) => m.id);
  const stored = config.academyModulesByClub[clubId];
  if (!stored) return allIds;
  const allowed = new Set(allIds);
  const filtered = stored.filter((id): id is AcademyModuleId => allowed.has(id as AcademyModuleId));
  // Newer modules (e.g. warehouse) appear even if older club configs omit them
  for (const id of [
    'calendar',
    'parents',
    'photos',
    'warehouse',
    'partnerBusinesses',
    'documentProtocol',
    'settings',
    'matches',
    'rental',
  ] as const) {
    if (!filtered.includes(id)) filtered.push(id);
  }
  return filtered.length > 0 ? filtered : allIds;
}

/** Καθολικές προεπιλογές δικαιωμάτων — ισχύουν για όλα τα σωματεία. */
export function getDefaultClubRolePermissions(): Record<ClubRole, ClubPermission[]> {
  return structuredClone(loadPlatformConfig().clubRolePermissions);
}

export function getPermissionsForClubRole(role: ClubRole): ClubPermission[] {
  return [...(loadPlatformConfig().clubRolePermissions[role] ?? DEFAULT_CLUB_ROLE_PERMISSIONS[role])];
}

export function sameClubPermissionSet(
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined,
): boolean {
  const left = [...(a ?? [])].filter(Boolean).sort();
  const right = [...(b ?? [])].filter(Boolean).sort();
  if (left.length !== right.length) return false;
  return left.every((p, i) => p === right[i]);
}

/** Modules που προστέθηκαν αργότερα — παλιά snapshots χωρίς αυτά θεωρούνται defaults. */
const LEGACY_ROLE_PERMISSION_MODULES: ClubPermission[] = [
  'documentProtocol',
  'partnerBusinesses',
  'photos',
  'parents',
  'matches',
  'warehouse',
  'calendar',
  'rental',
];

/** true αν ο χρήστης ακολουθεί (ή πρέπει να ακολουθεί) τα defaults ρόλου του Platform Admin. */
export function usesPlatformRolePermissionDefaults(
  role: string,
  permissions: readonly string[] | null | undefined,
): boolean {
  if (permissions == null) return true;
  if (role === 'platform_admin') return true;
  if (!isClubRole(role)) return false;
  if (permissions.length === 0) return true;
  if (sameClubPermissionSet(permissions, getPermissionsForClubRole(role))) return true;
  if (sameClubPermissionSet(permissions, DEFAULT_CLUB_ROLE_PERMISSIONS[role])) return true;

  // Παλιό stamped σύνολο: ίδια με τα defaults, απλώς λείπουν νεότερα modules
  const current = getPermissionsForClubRole(role);
  const stampSet = new Set(permissions);
  const onlyInStamp = permissions.filter((p) => !current.includes(p as ClubPermission));
  if (onlyInStamp.length > 0) return false;
  const onlyInCurrent = current.filter((p) => !stampSet.has(p));
  if (onlyInCurrent.length === 0) return true;
  return onlyInCurrent.every((p) =>
    (LEGACY_ROLE_PERMISSION_MODULES as readonly string[]).includes(p),
  );
}

/**
 * Αποθήκευση δικαιωμάτων χρήστη: null = ζωντανά defaults Platform Admin.
 * Μόνο πραγματικά custom σύνολα αποθηκεύονται ως snapshot.
 */
export function permissionsToStoreForRole(
  role: ClubRole,
  permissions: readonly string[],
): ClubPermission[] | null {
  const assigned = permissionsForClubRoleAssignment(role, permissions);
  if (usesPlatformRolePermissionDefaults(role, assigned)) return null;
  return assigned;
}

/** Καθαρίζει stamped defaults ώστε όλοι οι σύλλογοι να ακολουθούν το Platform Admin. */
export function clearStampedRoleDefaultPermissions<T extends { role: string; permissions?: string[] | null }>(
  users: T[],
  previousRoleDefaults?: Record<ClubRole, ClubPermission[]>,
): T[] {
  return users.map((user) => {
    if (!isClubRole(user.role)) return user;
    if (user.permissions == null) return user;
    // κενό snapshot ή αντίγραφο defaults → ζωντανά Platform Admin
    if (user.permissions.length === 0) {
      return { ...user, permissions: null };
    }
    if (usesPlatformRolePermissionDefaults(user.role, user.permissions)) {
      return { ...user, permissions: null };
    }
    if (
      previousRoleDefaults &&
      sameClubPermissionSet(user.permissions, previousRoleDefaults[user.role])
    ) {
      return { ...user, permissions: null };
    }
    return user;
  });
}

export function permissionsForClubRoleAssignment(
  _role: ClubRole,
  permissions: readonly string[],
): ClubPermission[] {
  const allowed = new Set<string>(CLUB_PERMISSIONS);
  return permissions.filter((p): p is ClubPermission => allowed.has(p));
}

export function isClubRole(role: string): role is ClubRole {
  return (CLUB_ROLES as readonly string[]).includes(role);
}

export function roleHasClubPermission(role: string, permission: ClubPermission): boolean {
  if (role === 'platform_admin') return true;
  if (!isClubRole(role)) return false;
  return getPermissionsForClubRole(role).includes(permission);
}

export function getEffectiveClubPermissions(user: {
  role: string;
  permissions?: string[] | null;
}): ClubPermission[] {
  if (user.role === 'platform_admin') return [...CLUB_PERMISSIONS];
  // null/undefined ή stamped αντίγραφο defaults → ζωντανά Platform Admin defaults
  if (usesPlatformRolePermissionDefaults(user.role, user.permissions)) {
    if (isClubRole(user.role)) return getPermissionsForClubRole(user.role);
    return [];
  }
  if (user.permissions) {
    const allowed = new Set<string>(CLUB_PERMISSIONS);
    return user.permissions.filter((p): p is ClubPermission => allowed.has(p));
  }
  return [];
}

export function userHasClubPermission(
  user: { role: string; permissions?: string[] | null },
  permission: ClubPermission,
): boolean {
  if (user.role === 'platform_admin') return true;
  return getEffectiveClubPermissions(user).includes(permission);
}

/** Έλεγχος πρόσβασης σε καρτέλα μενού (καθολικά defaults ρόλου ή overrides χρήστη). */
export function roleCanAccessModule(role: string, moduleId: AcademyModuleId): boolean {
  return userCanAccessModule({ role }, moduleId);
}

export function userCanAccessModule(
  user: { role: string; permissions?: string[] | null },
  moduleId: AcademyModuleId,
): boolean {
  if (user.role === 'platform_admin') return true;
  if (moduleId === 'dashboard') return true;
  if (moduleId === 'rental') {
    return userHasClubPermission(user, 'rental') || userHasClubPermission(user, 'prints');
  }
  if (moduleId === 'associations' || moduleId === 'sports') {
    return userHasClubPermission(user, 'settings');
  }
  if ((CLUB_PERMISSIONS as readonly string[]).includes(moduleId)) {
    return userHasClubPermission(user, moduleId as ClubPermission);
  }
  return false;
}

export function startPreview(clubId: string): void {
  localStorage.setItem(PREVIEW_KEY, clubId);
  window.dispatchEvent(new CustomEvent('academyhub-platform-updated'));
}

export function endPreview(): void {
  localStorage.removeItem(PREVIEW_KEY);
  window.dispatchEvent(new CustomEvent('academyhub-platform-updated'));
}

export function getPreviewClubId(): string | null {
  return localStorage.getItem(PREVIEW_KEY);
}

export function isPreviewMode(): boolean {
  return Boolean(getPreviewClubId());
}
