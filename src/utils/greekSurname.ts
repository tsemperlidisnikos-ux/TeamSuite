/** Κλίση ελληνικού επωνύμου: αρσενικό (πατέρας) / θηλυκό (μητέρα). */

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

function inflectSurnameTokenFeminine(word: string): string {
  return (
    replaceEnding(word, 'ΠΟΥΛΟΣ', 'ΠΟΥΛΟΥ') ??
    replaceEnding(word, 'ΑΚΟΣ', 'ΑΚΟΥ') ??
    replaceEnding(word, 'ΑΚΗΣ', 'ΑΚΗ') ??
    replaceEnding(word, 'ΙΔΗΣ', 'ΙΔΗ') ??
    replaceEnding(word, 'ΙΑΔΗΣ', 'ΙΑΔΗ') ??
    replaceEnding(word, 'ΟΓΛΟΥ', 'ΟΓΛΟΥ') ?? // άκλιτο
    replaceEnding(word, 'ΕΥΣ', 'ΕΩΣ') ??
    replaceEnding(word, 'ΟΣ', 'ΟΥ') ??
    replaceEnding(word, 'ΗΣ', 'Η') ??
    replaceEnding(word, 'ΑΣ', 'Α') ??
    word
  );
}

function inflectSurnameTokenMasculine(word: string): string {
  return (
    replaceEnding(word, 'ΠΟΥΛΟΥ', 'ΠΟΥΛΟΣ') ??
    replaceEnding(word, 'ΑΚΟΥ', 'ΑΚΟΣ') ??
    replaceEnding(word, 'ΑΚΗ', 'ΑΚΗΣ') ??
    replaceEnding(word, 'ΙΔΗ', 'ΙΔΗΣ') ??
    replaceEnding(word, 'ΙΑΔΗ', 'ΙΑΔΗΣ') ??
    replaceEnding(word, 'ΕΩΣ', 'ΕΥΣ') ??
    replaceEnding(word, 'ΟΥ', 'ΟΣ') ??
    replaceEnding(word, 'Η', 'ΗΣ') ??
    replaceEnding(word, 'Α', 'ΑΣ') ??
    word
  );
}

function isPlaceholderToken(value: string): boolean {
  return /^[-–—]+$/.test(value.trim());
}

function surnameStem(word: string): string {
  const upper = word.trim().toLocaleUpperCase('el');
  return upper.replace(
    /(ΠΟΥΛΟΣ|ΠΟΥΛΟΥ|ΑΚΟΣ|ΑΚΟΥ|ΑΚΗΣ|ΑΚΗ|ΙΑΔΗΣ|ΙΑΔΗ|ΙΔΗΣ|ΙΔΗ|ΕΥΣ|ΕΩΣ|ΟΓΛΟΥ|ΟΣ|ΟΥ|ΗΣ|Η|ΑΣ|Α)$/u,
    '',
  );
}

function lastSurnameToken(lastName: string): string {
  const parts = lastName.trim().split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

function isMasculineSurnameToken(word: string): boolean {
  const upper = word.toLocaleUpperCase('el');
  if (!upper) return false;
  if (upper.endsWith('ΠΟΥΛΟΣ') || upper.endsWith('ΑΚΟΣ') || upper.endsWith('ΑΚΗΣ')) return true;
  if (upper.endsWith('ΙΔΗΣ') || upper.endsWith('ΙΑΔΗΣ') || upper.endsWith('ΕΥΣ')) return true;
  if (upper.endsWith('ΟΓΛΟΥ')) return true; // άκλιτο, ίδιο και για τους δύο
  if (upper.endsWith('ΠΟΥΛΟΥ') || upper.endsWith('ΑΚΟΥ')) return false;
  if (upper.endsWith('ΗΣ') || upper.endsWith('ΑΣ')) return true;
  if (upper.endsWith('ΟΣ')) return true;
  return false;
}

function isFeminineSurnameToken(word: string): boolean {
  const upper = word.toLocaleUpperCase('el');
  if (!upper) return false;
  if (upper.endsWith('ΠΟΥΛΟΥ') || upper.endsWith('ΑΚΟΥ')) return true;
  if (upper.endsWith('ΑΚΗ') && !upper.endsWith('ΑΚΗΣ')) return true;
  if (upper.endsWith('ΙΔΗ') && !upper.endsWith('ΙΔΗΣ')) return true;
  if (upper.endsWith('ΙΑΔΗ') && !upper.endsWith('ΙΑΔΗΣ')) return true;
  if (upper.endsWith('ΕΩΣ')) return true;
  if (upper.endsWith('ΟΓΛΟΥ')) return true;
  if (upper.endsWith('ΠΟΥΛΟΣ') || upper.endsWith('ΑΚΟΣ') || upper.endsWith('ΑΚΗΣ')) return false;
  if (upper.endsWith('ΗΣ') || upper.endsWith('ΑΣ') || upper.endsWith('ΟΣ') || upper.endsWith('ΕΥΣ'))
    return false;
  if (upper.endsWith('ΟΥ')) return true;
  if (upper.endsWith('Η') || upper.endsWith('Α')) return true;
  return false;
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
  if (isFeminineSurnameToken(last)) return trimmed;
  parts[parts.length - 1] = inflectSurnameTokenFeminine(last);
  return parts.join(' ');
}

export function masculineGreekSurname(lastName: string): string {
  const trimmed = lastName.trim();
  if (!trimmed) return trimmed;
  const parts = trimmed.split(/\s+/);
  const last = parts[parts.length - 1] ?? '';
  if (isMasculineSurnameToken(last)) return trimmed;
  parts[parts.length - 1] = inflectSurnameTokenMasculine(last);
  return parts.join(' ');
}

/** Όνομα + επώνυμο χωρίς δεύτερο επώνυμο αν το όνομα το περιέχει ήδη. */
export function composeGivenAndSurname(
  givenName: string | undefined,
  lastName: string | undefined,
  options?: { feminine?: boolean; masculine?: boolean },
): string {
  const givenRaw = (givenName ?? '').trim();
  const given = givenRaw && !isPlaceholderToken(givenRaw) ? givenRaw : '';
  const lastRaw = (lastName ?? '').trim();
  const last = options?.feminine
    ? feminineGreekSurname(lastRaw)
    : options?.masculine
      ? masculineGreekSurname(lastRaw)
      : lastRaw;
  if (!given) return last;
  if (!last) return given;
  const givenLast = given.split(/\s+/).pop() ?? '';
  if (isSameGreekSurname(givenLast, lastRaw) || isSameGreekSurname(givenLast, last)) {
    // Αν το όνομα περιέχει ήδη επώνυμο, διόρθωσε την κατάληξη του.
    if (options?.feminine || options?.masculine) {
      const tokens = given.split(/\s+/);
      const surnameIdx = tokens.length - 1;
      const fixed = options.feminine
        ? feminineGreekSurname(tokens[surnameIdx] ?? '')
        : masculineGreekSurname(tokens[surnameIdx] ?? '');
      tokens[surnameIdx] = fixed;
      return tokens.join(' ');
    }
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

export function fatherFullName(
  firstName: string | undefined,
  lastName: string | undefined,
): string {
  return composeGivenAndSurname(firstName, lastName, { masculine: true });
}

export function motherFullName(
  firstName: string | undefined,
  lastName: string | undefined,
): string {
  return composeGivenAndSurname(firstName, lastName, { feminine: true });
}

/**
 * Εμφάνιση γονέα με σωστή κατάληξη επωνύμου.
 * Πατέρας → αρσενικό (-ΟΣ/-ΗΣ…), μητέρα → θηλυκό (-ΟΥ/-Η…).
 * Αν υπάρχει προτίμηση ενημερώσεων, προτιμά τον αντίστοιχο γονέα.
 */
export function guardianDisplayName(student: {
  fatherFirstName?: string;
  motherFirstName?: string;
  lastName?: string;
  guardianName?: string;
  preferredParentEmail?: string | null;
}): string {
  const father = fatherFullName(student.fatherFirstName, student.lastName);
  const mother = motherFullName(student.motherFirstName, student.lastName);
  const pref = (student.preferredParentEmail ?? '').trim();

  if (pref === 'mother' && mother) return mother;
  if (pref === 'father' && father) return father;
  if (father && mother) return father;
  if (father) return father;
  if (mother) return mother;

  const fallback = collapseDuplicateSurname(student.guardianName ?? '');
  if (!fallback) return '';
  // Διόρθωση κατάληξης σε παλιό ελεύθερο κείμενο «Γονέας».
  const token = lastSurnameToken(fallback);
  if (isFeminineSurnameToken(token)) return feminineGreekSurname(fallback);
  return masculineGreekSurname(fallback);
}
