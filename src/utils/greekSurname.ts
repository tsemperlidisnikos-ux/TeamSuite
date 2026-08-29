/** Θηλυκό επώνυμο από τον ανδρικό τύπο (π.χ. Χριστόπουλος → Χριστοπούλου). */

function copyCase(sample: string, target: string): string {
  const sampleUpper = sample.toLocaleUpperCase('el');
  const sampleLower = sample.toLocaleLowerCase('el');
  if (sample === sampleUpper) return target.toLocaleUpperCase('el');
  if (sample === sampleLower) return target.toLocaleLowerCase('el');
  const lower = target.toLocaleLowerCase('el');
  return lower.charAt(0).toLocaleUpperCase('el') + lower.slice(1);
}

function replaceEnding(word: string, from: string, to: string): string | null {
  const fromUpper = from.toLocaleUpperCase('el');
  const wordUpper = word.toLocaleUpperCase('el');
  if (!wordUpper.endsWith(fromUpper)) return null;
  if (word.length <= fromUpper.length) return null;
  const prefix = word.slice(0, word.length - fromUpper.length);
  const oldEnding = word.slice(word.length - fromUpper.length);
  return prefix + copyCase(oldEnding, to);
}

function inflectSurnameToken(word: string): string {
  return (
    replaceEnding(word, 'ΠΟΥΛΟΣ', 'ΠΟΥΛΟΥ') ??
    replaceEnding(word, 'ΟΣ', 'ΟΥ') ??
    replaceEnding(word, 'ΗΣ', 'Η') ??
    replaceEnding(word, 'ΑΣ', 'Α') ??
    word
  );
}

export function feminineGreekSurname(lastName: string): string {
  const trimmed = lastName.trim();
  if (!trimmed) return trimmed;
  const parts = trimmed.split(/\s+/);
  const last = parts[parts.length - 1] ?? '';
  const upper = last.toLocaleUpperCase('el');
  if (
    upper.endsWith('ΟΥ') ||
    (upper.endsWith('Η') && !upper.endsWith('ΗΣ')) ||
    (upper.endsWith('Α') && !upper.endsWith('ΑΣ'))
  ) {
    return trimmed;
  }
  parts[parts.length - 1] = inflectSurnameToken(last);
  return parts.join(' ');
}

export function motherFullName(firstName: string | undefined, lastName: string | undefined): string {
  const first = (firstName ?? '').trim();
  const last = feminineGreekSurname((lastName ?? '').trim());
  return [first, last].filter(Boolean).join(' ');
}
