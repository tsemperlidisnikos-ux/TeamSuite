/** Compare Greek names even when one side is ALL CAPS without tonos. */
export function normalizePersonKey(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) =>
      String(part ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLocaleLowerCase('el'),
    )
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
}
