/** Keep /api/club-media query paths encoded so Vite/CSS do not split on `/`. */
export function encodeClubMediaAppUrl(url: string): string {
  const raw = url.trim();
  if (!raw.startsWith('/api/club-media')) return raw;
  try {
    const parsed = new URL(raw, 'https://teamsuite.local');
    const p = parsed.searchParams.get('p')?.trim() ?? '';
    if (!p) return raw;
    return `/api/club-media?p=${encodeURIComponent(p)}`;
  } catch {
    return raw;
  }
}
