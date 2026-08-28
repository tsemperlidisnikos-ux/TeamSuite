export function normalizeSportKey(value: string | undefined | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export function isVolleyballSport(sport: string | undefined | null): boolean {
  const key = normalizeSportKey(sport);
  if (!key) return false;
  const compact = key.replace(/[^a-zα-ω0-9]/g, '');
  return (
    key.includes('volley') ||
    key.includes('voley') ||
    compact.includes('volleyball') ||
    compact.includes('voleyball') ||
    key.includes('volei') ||
    key.includes('vollei') ||
    key.includes('petosfair') ||
    key.includes('petosfairi') ||
    key.includes('πετοσφαιρ') ||
    key.includes('βολευ') ||
    key.includes('βολει') ||
    key.includes('beach volley') ||
    key.includes('beachvolley') ||
    key.includes('snow volley')
  );
}
