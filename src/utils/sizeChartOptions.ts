import type { SizeChart, SizeChartCategory } from '../types';

export type SizeChartGroupId = 'kids' | 'adult';

export const DEFAULT_SIZE_CHART_SIZES = [
  '6 y.o',
  '8 y.o',
  '10 y.o',
  '12 y.o',
  'Small',
  'Medium',
  'Large',
  'XLarge',
  'XXLarge',
];

export const SIZE_CHART_GROUP_LABELS: Record<SizeChartGroupId, string> = {
  kids: 'ΠΑΙΔΙΚΟ',
  adult: 'ΑΝΔΡΙΚΟ / ΓΥΝΑΙΚΕΙΟ',
};

/** Legacy labels — men/women map to the shared adult list. */
export const SIZE_CHART_CATEGORY_LABELS: Record<SizeChartCategory, string> = {
  kids: 'ΠΑΙΔΙΚΟ',
  men: 'ΑΝΔΡΙΚΟ / ΓΥΝΑΙΚΕΙΟ',
  women: 'ΑΝΔΡΙΚΟ / ΓΥΝΑΙΚΕΙΟ',
};

export function defaultSizeChart(): SizeChart {
  return { kids: [...DEFAULT_SIZE_CHART_SIZES], men: [], women: [] };
}

export function resolvedSizeChartGroupLabels(
  chart?: SizeChart | null,
): Record<SizeChartGroupId, string> {
  return {
    kids: chart?.groupLabels?.kids?.trim() || SIZE_CHART_GROUP_LABELS.kids,
    adult: chart?.groupLabels?.adult?.trim() || SIZE_CHART_GROUP_LABELS.adult,
  };
}

/** Unique adult sizes (Ανδρικό + Γυναικείο σε μία λίστα). */
export function adultSizesFromChart(chart: SizeChart | undefined | null): string[] {
  if (!chart) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const size of [...(chart.men ?? []), ...(chart.women ?? [])]) {
    const value = size.trim();
    if (!value) continue;
    const key = value.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/** Flat unique sizes from μεγεθολόγιο (for filters / simple selects). */
export function flattenSizeChart(chart: SizeChart | undefined | null): string[] {
  if (!chart) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const size of [...(chart.kids ?? []), ...adultSizesFromChart(chart)]) {
    const value = size.trim();
    if (!value) continue;
    const key = value.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function csvUpper(values: string[] | undefined): string {
  return (values ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean).join(',');
}

export function isLegacyDefaultSizeChart(chart: SizeChart | undefined | null): boolean {
  if (!chart) return true;
  const kids = csvUpper(chart.kids);
  const men = csvUpper(chart.men);
  const women = csvUpper(chart.women);
  const legacyKids = kids === '' || kids === 'XS,S,M,L,XL';
  const legacyMen = men === '' || men === 'XS,S,M,L,XL,XXL,XXXL' || men === 'XS,S,M,L,XL';
  const legacyWomen = women === '' || women === 'XS,S,M,L,XL';
  return legacyKids && legacyMen && legacyWomen;
}

export function normalizeSizeChart(chart: SizeChart | undefined | null): SizeChart {
  if (isLegacyDefaultSizeChart(chart)) return defaultSizeChart();
  return { kids: flattenSizeChart(chart), men: [], women: [] };
}

/** Single unlabeled list for selects. */
export function sizeChartOptGroups(chart: SizeChart | undefined | null) {
  const sizes = flattenSizeChart(chart);
  if (sizes.length === 0) return [];
  return [{ category: 'kids' as const, label: '', sizes }];
}

export function sizeGroupLabel(
  group: string | undefined | null,
  chart?: SizeChart | null,
): string {
  const labels = resolvedSizeChartGroupLabels(chart);
  if (group === 'kids') return labels.kids;
  if (group === 'adult' || group === 'men' || group === 'women') {
    return labels.adult;
  }
  return '';
}

export function formatProductSize(
  size: string | undefined | null,
  _sizeGroup?: string | null,
  _chart?: SizeChart | null,
): string {
  const value = (size ?? '').trim();
  return value || '—';
}
