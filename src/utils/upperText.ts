/** Κεφαλαία με ελληνικό locale (π.χ. ς → Σ). */
export function toUpperEl(value: string | undefined | null): string {
  return String(value ?? '').toLocaleUpperCase('el-GR');
}
