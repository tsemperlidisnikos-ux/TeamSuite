import type { Student } from '../types';

export type PreferredParentEmail = 'father' | 'mother' | 'both' | 'athlete';

export function normalizePreferredParentEmail(
  value: string | null | undefined,
): PreferredParentEmail {
  if (
    value === 'father' ||
    value === 'mother' ||
    value === 'both' ||
    value === 'athlete'
  ) {
    return value;
  }
  return 'both';
}

function isEmail(raw: string | null | undefined): raw is string {
  const email = (raw ?? '').trim();
  return email.includes('@');
}

function uniqueLower(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const email = raw.trim();
    const key = email.toLowerCase();
    if (!email.includes('@') || seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/**
 * Emails ενημερώσεων σύμφωνα με «Κύριο για ενημερώσεις».
 * Πάντα έως ένα ανά αθλητή (ακόμα και σε «Και τα δύο»).
 */
export function parentNotifyEmails(
  student: Pick<
    Student,
    'fatherEmail' | 'motherEmail' | 'email' | 'preferredParentEmail'
  >,
): string[] {
  const pref = normalizePreferredParentEmail(student.preferredParentEmail);
  const father = (student.fatherEmail ?? '').trim();
  const mother = (student.motherEmail ?? '').trim();
  const athlete = (student.email ?? '').trim();
  const out: string[] = [];

  if (pref === 'athlete') {
    if (isEmail(athlete)) out.push(athlete);
    else if (isEmail(mother)) out.push(mother);
    else if (isEmail(father)) out.push(father);
  } else if (pref === 'father') {
    if (isEmail(father)) out.push(father);
    else if (isEmail(mother)) out.push(mother);
    else if (isEmail(athlete)) out.push(athlete);
  } else if (pref === 'mother') {
    if (isEmail(mother)) out.push(mother);
    else if (isEmail(father)) out.push(father);
    else if (isEmail(athlete)) out.push(athlete);
  } else {
    // both → ένα κύριο: μητέρα, αλλιώς πατέρας, αλλιώς αθλητής
    if (isEmail(mother)) out.push(mother);
    else if (isEmail(father)) out.push(father);
    else if (isEmail(athlete)) out.push(athlete);
  }

  return uniqueLower(out);
}

/** Alias: ίδιος κανόνας παντού (ανακοινώσεις, κάρτα υγείας, SMS κ.λπ.). */
export function preferredNotifyEmails(
  student: Pick<
    Student,
    'fatherEmail' | 'motherEmail' | 'email' | 'preferredParentEmail'
  >,
): string[] {
  return parentNotifyEmails(student);
}

/** Ένα κύριο email για ενημερώσεις / πληρωμές. */
export function primaryParentNotifyEmail(
  student: Pick<
    Student,
    'fatherEmail' | 'motherEmail' | 'email' | 'preferredParentEmail'
  >,
): string {
  return parentNotifyEmails(student)[0] ?? '';
}

/**
 * @deprecated Χρησιμοποίησε `primaryParentNotifyEmail` (περιλαμβάνει και αθλητή).
 * Κρατιέται για συμβατότητα· συμπεριφέρεται όπως το κύριο email ενημερώσεων.
 */
export function primaryGuardianNotifyEmail(
  student: Pick<
    Student,
    'fatherEmail' | 'motherEmail' | 'email' | 'preferredParentEmail'
  >,
): string {
  return primaryParentNotifyEmail(student);
}

/** Τηλέφωνα ενημερώσεων σύμφωνα με «Κύριο για ενημερώσεις». */
export function preferredNotifyPhones(student: {
  phone?: string | null;
  guardianPhone?: string | null;
  motherPhone?: string | null;
  preferredParentEmail?: string | null;
}): string[] {
  const pref = normalizePreferredParentEmail(student.preferredParentEmail);
  const father = (student.guardianPhone ?? '').trim();
  const mother = (student.motherPhone ?? '').trim();
  const athlete = (student.phone ?? '').trim();
  const ordered: string[] = [];

  if (pref === 'athlete') {
    if (athlete) ordered.push(athlete);
    else if (mother) ordered.push(mother);
    else if (father) ordered.push(father);
  } else if (pref === 'father') {
    if (father) ordered.push(father);
    else if (mother) ordered.push(mother);
    else if (athlete) ordered.push(athlete);
  } else if (pref === 'mother') {
    if (mother) ordered.push(mother);
    else if (father) ordered.push(father);
    else if (athlete) ordered.push(athlete);
  } else {
    if (mother) ordered.push(mother);
    else if (father) ordered.push(father);
    else if (athlete) ordered.push(athlete);
  }

  return ordered.slice(0, 1);
}
