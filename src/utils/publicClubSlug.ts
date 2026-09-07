export type ClubSlugSource = {
  id?: string;
  name?: string;
  publicRegistration?: { slug?: string } | null;
};

const GREEK_TO_LATIN: Record<string, string> = {
  α: 'a',
  ά: 'a',
  β: 'b',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  έ: 'e',
  ζ: 'z',
  η: 'i',
  ή: 'i',
  θ: 'th',
  ι: 'i',
  ί: 'i',
  ϊ: 'i',
  ΐ: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  ο: 'o',
  ό: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  ς: 's',
  τ: 't',
  υ: 'y',
  ύ: 'y',
  ϋ: 'y',
  ΰ: 'y',
  φ: 'f',
  χ: 'ch',
  ψ: 'ps',
  ω: 'o',
  ώ: 'o',
};

function foldToLatin(value: string): string {
  return Array.from(value.toLowerCase())
    .map((ch) => GREEK_TO_LATIN[ch] ?? ch)
    .join('');
}

function compactSlug(raw: string): string {
  return (
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'club'
  );
}

/** Older slug (Greek names collapsed to `club`). */
export function legacyAsciiSlug(name: string): string {
  return compactSlug(name);
}

/** Latin slug with Greek→greeklish (π.χ. ΑΠΟΛΛΩΝ ΠΑΤΡΩΝ → as-apollon-patron). */
export function slugifyClubName(name: string): string {
  return compactSlug(foldToLatin(name));
}

export function sanitizePublicSlug(value: string): string {
  return compactSlug(foldToLatin(value));
}

export function storedPublicSlug(club: ClubSlugSource): string {
  return String(club.publicRegistration?.slug ?? '')
    .trim()
    .toLowerCase();
}

export function resolveClubPublicSlug(club: ClubSlugSource): string {
  return storedPublicSlug(club) || slugifyClubName(club.name ?? '');
}

export function clubMatchesPublicSlug(club: ClubSlugSource, slug: string): boolean {
  const want = slug.trim().toLowerCase();
  if (!want) return false;
  const stored = storedPublicSlug(club);
  const modern = slugifyClubName(club.name ?? '');
  const legacy = legacyAsciiSlug(club.name ?? '');
  if (stored) return stored === want || modern === want || (legacy === want && stored === legacy);
  return modern === want || legacy === want;
}

export function usedPublicSlugs(clubs: ClubSlugSource[], excludeClubId?: string): Set<string> {
  const used = new Set<string>();
  for (const club of clubs) {
    if (excludeClubId && club.id === excludeClubId) continue;
    const stored = storedPublicSlug(club);
    const modern = slugifyClubName(club.name ?? '');
    const legacy = legacyAsciiSlug(club.name ?? '');
    if (stored) used.add(stored);
    else {
      used.add(modern);
      if (legacy !== modern) used.add(legacy);
    }
    used.add(modern);
  }
  return used;
}

export function allocateUniquePublicSlug(desired: string, taken: Set<string>): string {
  const base = sanitizePublicSlug(desired);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function listPublicSlugCollisions(
  clubs: Array<ClubSlugSource & { name?: string }>,
): Array<{ slug: string; names: string[] }> {
  const bySlug = new Map<string, string[]>();
  for (const club of clubs) {
    const slug = resolveClubPublicSlug(club);
    const names = bySlug.get(slug) ?? [];
    names.push((club.name ?? club.id ?? slug).trim() || slug);
    bySlug.set(slug, names);
  }
  return [...bySlug.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([slug, names]) => ({ slug, names }));
}
