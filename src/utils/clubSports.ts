import { resolveCatalogSportName } from '../shared/sportsCatalog';
import type { SportItem } from '../types';
import { normalizeSportKey } from './sport';

function canonicalSportLabel(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  return resolveCatalogSportName(trimmed) ?? trimmed;
}

/** Σύγκριση αθλημάτων με aliases καταλόγου (π.χ. Basketball ≡ Μπάσκετ). */
export function clubSportsMatch(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  const left = canonicalSportLabel(String(a ?? ''));
  const right = canonicalSportLabel(String(b ?? ''));
  const ka = normalizeSportKey(left);
  const kb = normalizeSportKey(right);
  return Boolean(ka && kb && ka === kb);
}

/** Ενεργά αθλήματα συλλόγου (Ρυθμίσεις → Άθλημα), μοναδικά με κανονικά ονόματα. */
export function listActiveClubSportNames(
  sports: SportItem[] | undefined | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of sports ?? []) {
    if (!item?.active) continue;
    const canonical = canonicalSportLabel(item.name);
    if (!canonical) continue;
    const key = normalizeSportKey(canonical);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(canonical);
  }
  return out.sort((a, b) => a.localeCompare(b, 'el'));
}

export function activeClubSportSelectOptions(
  sports: SportItem[] | undefined | null,
  opts?: {
    includeEmpty?: boolean;
    emptyLabel?: string;
    /** Τρέχουσες τιμές (π.χ. αθλητή) — εμφανίζονται μόνο αν δεν ανήκουν ήδη στον κατάλογο συλλόγου. */
    retain?: string[];
  },
): Array<{ value: string; label: string }> {
  const names = listActiveClubSportNames(sports);
  const seen = new Set(names.map((n) => normalizeSportKey(n)));

  for (const raw of opts?.retain ?? []) {
    const canonical = canonicalSportLabel(raw);
    if (!canonical) continue;
    const key = normalizeSportKey(canonical);
    if (!key || seen.has(key)) continue;
    // Μην προσθέτεις alias παλιού ονόματος αν το σύλλογος έχει ήδη το canonical ενεργό.
    seen.add(key);
    names.push(canonical);
  }

  names.sort((a, b) => a.localeCompare(b, 'el'));
  const options = names.map((name) => ({ value: name, label: name }));
  if (opts?.includeEmpty === false) return options;
  return [{ value: '', label: opts?.emptyLabel ?? '—' }, ...options];
}
