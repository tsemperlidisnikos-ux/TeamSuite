export interface LicensePackageFeature {
  label: string;
  included: boolean;
}

export interface LicensePackage {
  id: string;
  name: string;
  athleteLicenses: number;
  /** Net price for the 12-month period (€, before VAT). */
  price: number;
  /** Billing period length in months (fixed to 12). */
  periodMonths: number;
  description: string;
  features: LicensePackageFeature[];
  popular?: boolean;
  active: boolean;
  /** Kept for compatibility with older saved data / reports. */
  monthlyPrice: number;
  yearlyPrice: number;
}

/** Billing period: platform plan is annual only. */
export const PERIOD_MONTH_OPTIONS = [12] as const;

/** Greek VAT rate used on the official license price list. */
export const LICENSE_VAT_RATE = 0.24;

const PACKAGES_KEY = 'academyhub-license-packages-v5';
const LEGACY_PACKAGES_KEYS = [
  'academyhub-license-packages-v4',
  'academyhub-license-packages-v3',
  'academyhub-license-packages-v2',
] as const;

/** Cached catalog options for dropdowns; cleared on save/migrate. */
let assignableCache: LicensePackage[] | null = null;

export const GROWTH_PACKAGE_ID = 'pkg_growth';

/** Stable id for a catalog seat tier (used when assigning a club). */
export function seatPackageId(athleteLicenses: number): string {
  return `pkg_seats_${clampAthleteLicenses(athleteLicenses)}`;
}

export function parseSeatPackageId(packageId: string | null | undefined): number | null {
  if (!packageId) return null;
  const match = /^pkg_seats_(\d+)$/.exec(packageId.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? clampAthleteLicenses(n) : null;
}

/** Athlete license options: 100, 150, …, 1000 */
export const ATHLETE_LICENSE_OPTIONS: number[] = Array.from(
  { length: Math.floor((1000 - 100) / 50) + 1 },
  (_, i) => 100 + i * 50,
);

/**
 * Official net prices (€ / 12 μήνες) by athlete seats.
 * Formula: 294 + ((seats - 100) / 50) * 120
 */
export const LICENSE_NET_PRICE_BY_ATHLETES: Record<number, number> = {
  50: 174,
  100: 294,
  150: 414,
  200: 534,
  250: 654,
  300: 774,
  350: 894,
  400: 1014,
  450: 1134,
  500: 1254,
  550: 1374,
  600: 1494,
  650: 1614,
  700: 1734,
  750: 1854,
  800: 1974,
  850: 2094,
  900: 2214,
  950: 2334,
  1000: 2454,
};

const TIER_BASE_SEATS: Record<string, number> = {
  Start: 100,
  Club: 200,
  Academy: 400,
  Pro: 650,
  'Pro Plus': 850,
};

export function clampAthleteLicenses(value: number): number {
  if (!Number.isFinite(value) || value < 50) return 50;
  if (value > 1000) return 1000;
  if (value === 50) return 50;
  const stepped = Math.round((value - 100) / 50) * 50 + 100;
  return Math.min(1000, Math.max(100, stepped));
}

export function licenseTierBaseName(athleteLicenses: number): string {
  const n = clampAthleteLicenses(athleteLicenses);
  if (n <= 150) return 'Start';
  if (n <= 350) return 'Club';
  if (n <= 600) return 'Academy';
  if (n <= 800) return 'Pro';
  return 'Pro Plus';
}

/** Display name from official list (e.g. Start, Club + 50, Pro Plus 100). */
export function licenseTierLabel(athleteLicenses: number): string {
  const n = clampAthleteLicenses(athleteLicenses);
  const base = licenseTierBaseName(n);
  if (base === 'Pro Plus') return `Pro Plus ${Math.round(n / 10)}`;
  const extra = n - (TIER_BASE_SEATS[base] ?? n);
  if (extra <= 0) return base;
  return `${base} + ${extra}`;
}

export function catalogNetPriceForAthletes(athleteLicenses: number): number {
  const n = clampAthleteLicenses(athleteLicenses);
  if (LICENSE_NET_PRICE_BY_ATHLETES[n] != null) return LICENSE_NET_PRICE_BY_ATHLETES[n];
  return Math.round((294 + ((n - 100) / 50) * 120) * 100) / 100;
}

export function licenseVatAmount(netPrice: number, rate = LICENSE_VAT_RATE): number {
  return Math.round(Math.max(0, netPrice) * rate * 100) / 100;
}

export function licenseGrossPrice(netPrice: number, rate = LICENSE_VAT_RATE): number {
  return Math.round((Math.max(0, netPrice) + licenseVatAmount(netPrice, rate)) * 100) / 100;
}

export function formatLicenseEuro(amount: number): string {
  return amount.toLocaleString('el-GR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Apply official catalog name + net price for the selected seat count. */
export function applyCatalogPricing(pkg: LicensePackage): LicensePackage {
  const athleteLicenses = clampAthleteLicenses(pkg.athleteLicenses);
  const price = catalogNetPriceForAthletes(athleteLicenses);
  return {
    ...pkg,
    athleteLicenses,
    name: licenseTierLabel(athleteLicenses),
    price,
    periodMonths: 12,
    monthlyPrice: Math.round((price / 12) * 100) / 100,
    yearlyPrice: price,
  };
}

const defaultFeatures: LicensePackageFeature[] = [];

const defaultGrowthPackage: LicensePackage = applyCatalogPricing({
  id: GROWTH_PACKAGE_ID,
  name: 'Start',
  athleteLicenses: 100,
  price: 294,
  periodMonths: 12,
  description: 'Ετήσιο πακέτο αδειών αθλητών. Η τιμή ορίζεται από τον επίσημο τιμοκατάλογο ανά αριθμό αθλητών.',
  features: defaultFeatures,
  popular: true,
  active: true,
  monthlyPrice: 24.5,
  yearlyPrice: 294,
});

const defaultPackages: LicensePackage[] = [structuredClone(defaultGrowthPackage)];

function normalizePackage(raw: Partial<LicensePackage> & { id?: string }): LicensePackage | null {
  const fallback = defaultGrowthPackage;
  if (!raw || typeof raw !== 'object') return null;

  const athleteLicenses = clampAthleteLicenses(
    typeof raw.athleteLicenses === 'number' ? raw.athleteLicenses : fallback.athleteLicenses,
  );
  const catalogPrice = catalogNetPriceForAthletes(athleteLicenses);
  const hasCustomPrice =
    typeof raw.price === 'number' &&
    Number.isFinite(raw.price) &&
    Math.abs(raw.price - catalogPrice) > 0.009;
  const price = hasCustomPrice
    ? Math.max(0, raw.price as number)
    : catalogPrice;

  return {
    id: GROWTH_PACKAGE_ID,
    name: licenseTierLabel(athleteLicenses),
    athleteLicenses,
    price,
    periodMonths: 12,
    description:
      typeof raw.description === 'string' && raw.description.trim()
        ? raw.description
        : fallback.description,
    features: defaultFeatures,
    popular: true,
    active: raw.active !== false,
    monthlyPrice: Math.round((price / 12) * 100) / 100,
    yearlyPrice: price,
  };
}

function pickGrowthFromList(parsed: unknown[]): LicensePackage {
  const growthRaw =
    parsed.find(
      (item) =>
        item &&
        typeof item === 'object' &&
        (item as { id?: string }).id === GROWTH_PACKAGE_ID,
    ) ?? parsed[0];
  return (
    normalizePackage((growthRaw ?? {}) as Partial<LicensePackage>) ??
    structuredClone(defaultGrowthPackage)
  );
}

export function getLicensePackages(): LicensePackage[] {
  try {
    const raw = localStorage.getItem(PACKAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return [pickGrowthFromList(parsed)];
      }
    }

    for (const legacyKey of LEGACY_PACKAGES_KEYS) {
      const legacy = localStorage.getItem(legacyKey);
      if (!legacy) continue;
      const parsed = JSON.parse(legacy) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Migrate to catalog prices for the stored seat count
        const migrated = applyCatalogPricing(pickGrowthFromList(parsed));
        localStorage.setItem(PACKAGES_KEY, JSON.stringify([migrated]));
        assignableCache = null;
        return [migrated];
      }
    }

    const next = structuredClone(defaultPackages);
    localStorage.setItem(PACKAGES_KEY, JSON.stringify(next));
    assignableCache = null;
    return next;
  } catch {
    return structuredClone(defaultPackages);
  }
}

export function saveLicensePackages(packages: LicensePackage[]): void {
  const growth =
    packages
      .map((pkg) => normalizePackage(pkg))
      .find((item): item is LicensePackage => Boolean(item)) ??
    structuredClone(defaultGrowthPackage);
  localStorage.setItem(PACKAGES_KEY, JSON.stringify([growth]));
  assignableCache = null;
}

/**
 * All seat tiers from the official catalog for assignment dropdowns.
 * Uses Platform Admin template (active/features/description); prices from catalog.
 */
export function listAssignableLicensePackages(): LicensePackage[] {
  if (assignableCache) return assignableCache;

  const template = getLicensePackages()[0];
  if (!template || template.active === false) {
    assignableCache = [];
    return assignableCache;
  }

  assignableCache = ATHLETE_LICENSE_OPTIONS.map((seats) => {
    const price = catalogNetPriceForAthletes(seats);
    return {
      id: seatPackageId(seats),
      name: licenseTierLabel(seats),
      athleteLicenses: seats,
      price,
      periodMonths: 12,
      description: template.description,
      features: template.features,
      popular: true,
      active: true,
      monthlyPrice: Math.round((price / 12) * 100) / 100,
      yearlyPrice: price,
    };
  });
  return assignableCache;
}

export function findAssignableLicensePackage(packageId: string | null | undefined): LicensePackage | null {
  if (!packageId) return null;
  return listAssignableLicensePackages().find((p) => p.id === packageId) ?? null;
}

export function periodLabel(months: number): string {
  const n = Math.max(1, Math.round(months || 1));
  if (n === 1) return '1 μήνα';
  return `${n} μήνες`;
}

/** Lightweight package snapshot for a seat count (no full catalog rebuild). */
export function packageForAthleteSeats(athleteLicenses: number): LicensePackage {
  const seats = clampAthleteLicenses(athleteLicenses);
  const price = catalogNetPriceForAthletes(seats);
  return {
    id: seatPackageId(seats),
    name: licenseTierLabel(seats),
    athleteLicenses: seats,
    price,
    periodMonths: 12,
    description: '',
    features: defaultFeatures,
    popular: true,
    active: true,
    monthlyPrice: Math.round((price / 12) * 100) / 100,
    yearlyPrice: price,
  };
}

/** Εύρεση πακέτου συνδρομής συλλόγου από id ή από όριο αδειών. */
export function resolveClubLicensePackage(club: {
  licensePackageId?: string | null;
  athleteLicenseLimit?: number;
}): LicensePackage | null {
  const packageId = (club.licensePackageId ?? '').trim();
  // Explicit «Χωρίς πακέτο (χειροκίνητο όριο)» — never invent Start/Club from the seat count.
  if (!packageId) return null;

  const fromSeatId = parseSeatPackageId(packageId);
  if (fromSeatId != null) return packageForAthleteSeats(fromSeatId);

  if (packageId === GROWTH_PACKAGE_ID) {
    const limit = Number(club.athleteLicenseLimit);
    if (Number.isFinite(limit) && limit > 0) return packageForAthleteSeats(limit);
    return packageForAthleteSeats(100);
  }

  return findAssignableLicensePackage(packageId);
}
