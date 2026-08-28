import type { SizeChart, SizeChartCategory } from '../types';

export type SizeChartGroupId = 'kids' | 'adult';

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

/** Optgroups: Παιδικό + Ανδρικό/Γυναικείο. */
export function sizeChartOptGroups(chart: SizeChart | undefined | null) {
  if (!chart) return [];
  const labels = resolvedSizeChartGroupLabels(chart);
  return [
    {
      category: 'kids' as const,
      label: labels.kids,
      sizes: (chart.kids ?? []).map((s) => s.trim()).filter(Boolean),
    },
    {
      category: 'adult' as const,
      label: labels.adult,
      sizes: adultSizesFromChart(chart),
    },
  ].filter((group) => group.sizes.length > 0);
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
  sizeGroup?: string | null,
  chart?: SizeChart | null,
): string {
  const value = (size ?? '').trim();
  if (!value) return '—';
  const group = sizeGroupLabel(sizeGroup, chart);
  return group ? `${value} · ${group}` : value;
}
