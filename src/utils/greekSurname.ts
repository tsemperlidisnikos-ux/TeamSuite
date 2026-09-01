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

function isPlaceholderToken(value: string): boolean {
  return /^[-–—]+$/.test(value.trim());
}

function surnameStem(word: string): string {
  const upper = word.trim().toLocaleUpperCase('el');
  return upper.replace(/(ΠΟΥΛΟΣ|ΠΟΥΛΟΥ|ΟΣ|ΟΥ|ΗΣ|Η|ΑΣ|Α)$/u, '');
}

export function isSameGreekSurname(a: string, b: string): boolean {
  const left = a.trim().toLocaleUpperCase('el');
  const right = b.trim().toLocaleUpperCase('el');
  if (!left || !right) return false;
  if (left === right) return true;
  const s1 = surnameStem(left);
  const s2 = surnameStem(right);
  return s1.length >= 4 && s1 === s2;
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

/** Όνομα + επώνυμο χωρίς δεύτερο επώνυμο αν το όνομα το περιέχει ήδη. */
export function composeGivenAndSurname(
  givenName: string | undefined,
  lastName: string | undefined,
  options?: { feminine?: boolean },
): string {
  const givenRaw = (givenName ?? '').trim();
  const given = givenRaw && !isPlaceholderToken(givenRaw) ? givenRaw : '';
  const lastRaw = (lastName ?? '').trim();
  const last = options?.feminine ? feminineGreekSurname(lastRaw) : lastRaw;
  if (!given) return last;
  if (!last) return given;
  const givenLast = given.split(/\s+/).pop() ?? '';
  if (isSameGreekSurname(givenLast, lastRaw) || isSameGreekSurname(givenLast, last)) {
    return given;
  }
  return `${given} ${last}`.trim();
}

export function collapseDuplicateSurname(fullName: string): string {
  const tokens = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part && !isPlaceholderToken(part));
  while (tokens.length >= 2) {
    const prev = tokens[tokens.length - 2] ?? '';
    const last = tokens[tokens.length - 1] ?? '';
    if (isSameGreekSurname(prev, last)) {
      tokens.pop();
      continue;
    }
    break;
  }
  return tokens.join(' ');
}

export function guardianDisplayName(student: {
  fatherFirstName?: string;
  lastName?: string;
  guardianName?: string;
}): string {
  return (
    composeGivenAndSurname(student.fatherFirstName, student.lastName) ||
    collapseDuplicateSurname(student.guardianName ?? '')
  );
}

export function motherFullName(firstName: string | undefined, lastName: string | undefined): string {
  return composeGivenAndSurname(firstName, lastName, { feminine: true });
}
