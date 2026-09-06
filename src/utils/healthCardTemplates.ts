import {
  loadPlatformConfig,
  type HealthCardLayout,
  type HealthCardSportTemplate,
} from '../platform/platformConfig';
import { resolveCatalogSportName } from '../shared/sportsCatalog';
import { isBasketballSport, isVolleyballSport, normalizeSportKey } from './sport';

export const BUILTIN_HEALTH_CARD_STANDARD = '/health-card/health-card-template.pdf';
export const BUILTIN_HEALTH_CARD_VOLLEYBALL = '/health-card/health-card-volleyball-template.pdf';

export type ResolvedHealthCardTemplate = {
  templateUrl: string;
  layout: HealthCardLayout;
  volleyball: boolean;
  sportName: string;
};

function templateMap(): Record<string, HealthCardSportTemplate> {
  return loadPlatformConfig().healthCardTemplatesBySport ?? {};
}

function lookupMapped(sportName: string): HealthCardSportTemplate | null {
  const canonical = resolveCatalogSportName(sportName) ?? sportName.trim();
  if (!canonical) return null;
  const map = templateMap();
  const direct = map[canonical];
  if (direct) return direct;
  const want = normalizeSportKey(canonical);
  for (const [name, row] of Object.entries(map)) {
    if (normalizeSportKey(name) === want) return row;
  }
  return null;
}

function builtInForSport(sportName: string): ResolvedHealthCardTemplate {
  const volleyball = isVolleyballSport(sportName);
  return {
    templateUrl: volleyball ? BUILTIN_HEALTH_CARD_VOLLEYBALL : BUILTIN_HEALTH_CARD_STANDARD,
    layout: volleyball ? 'volleyball' : 'standard',
    volleyball,
    sportName,
  };
}

function fromMapped(
  sportName: string,
  mapped: HealthCardSportTemplate,
): ResolvedHealthCardTemplate {
  const custom = mapped.pdfUrl.trim();
  const urlLooksVolleyball =
    /volleyball-template/i.test(custom) || /volley/i.test(custom);
  const volleyball =
    mapped.layout === 'volleyball' ||
    urlLooksVolleyball ||
    isVolleyballSport(sportName) ||
    Boolean(custom && !isBasketballSport(sportName));
  return {
    templateUrl: custom
      ? custom
      : volleyball
        ? BUILTIN_HEALTH_CARD_VOLLEYBALL
        : BUILTIN_HEALTH_CARD_STANDARD,
    layout: volleyball ? 'volleyball' : 'standard',
    volleyball,
    sportName,
  };
}

/** Επιλέγει PDF κάρτας υγείας από τα αθλήματα του αθλητή (κύριο πρώτα). */
export function resolveHealthCardTemplate(
  primarySport?: string | null,
  extraSports?: string[] | null,
): ResolvedHealthCardTemplate {
  const ordered = [
    ...(primarySport?.trim() ? [primarySport.trim()] : []),
    ...(extraSports ?? []),
  ]
    .map((s) => (resolveCatalogSportName(s) ?? s.trim()))
    .filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of ordered) {
    const key = normalizeSportKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }

  for (const name of unique) {
    const mapped = lookupMapped(name);
    if (mapped) return fromMapped(name, mapped);
  }

  return builtInForSport(unique[0] ?? primarySport ?? '');
}
