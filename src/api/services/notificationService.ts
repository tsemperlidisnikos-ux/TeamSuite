import { getUsers } from '../../auth/auth';
import { getData } from '../../data/repository';
import type {
  AnnouncementAudienceRole,
  AnnouncementRecipient,
  Student,
} from '../../types';
import type { AnnouncementInput } from '../../schemas';
import { sportsMatch } from '../../utils/coachScope';
import { normalizeSportKey } from '../../utils/sport';
import { studentClassIds, studentInClass } from '../../utils/studentClasses';
import { studentHasSport } from '../../utils/studentSports';
import { getClubSms } from '../../auth/clubs';
import { localDateIso } from '../../utils/dates';
import { sendClubEmail } from './emailService';
import { sendClubSms, studentContactPhones } from './smsService';

function uniqueEmails(emails: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const raw of emails) {
    const email = (raw ?? '').trim().toLowerCase();
    if (email.includes('@')) set.add(email);
  }
  return [...set];
}

function studentContactEmails(student: Student): string[] {
  return uniqueEmails([student.motherEmail, student.fatherEmail, student.email]);
}

async function sendSmsToStudent(clubId: string, student: Student, text: string) {
  const sms = getClubSms(clubId);
  if (!sms.enabled) return { sent: [] as string[] };
  const sent: string[] = [];
  for (const to of studentContactPhones(student)) {
    const result = await sendClubSms({
      clubId,
      to,
      text,
      athleteId: student.id,
    });
    if (result.success) sent.push(to);
  }
  return { sent };
}

function idsOf(recipients: AnnouncementRecipient[], kind: AnnouncementRecipient['kind']): string[] {
  return recipients.filter((r) => r.kind === kind).map((r) => r.id);
}

function studentMatchesScope(
  student: Student,
  input: Pick<AnnouncementInput, 'sportCategories' | 'teamsLabel'>,
  data: ReturnType<typeof getData>,
): boolean {
  const sport = (input.sportCategories ?? '').trim();
  const club = (input.teamsLabel ?? '').trim();
  if (club && normalizeSportKey(student.clubName) !== normalizeSportKey(club)) return false;
  if (!sport) return true;
  if (studentHasSport(student, sport)) return true;
  return studentClassIds(student).some((id) =>
    sportsMatch(data.classes.find((c) => c.id === id)?.sport, sport),
  );
}

function athleteIdsForAnnouncement(
  input: Pick<
    AnnouncementInput,
    'classIds' | 'recipientIds' | 'targetType' | 'targetId' | 'sportCategories' | 'teamsLabel'
  >,
  data: ReturnType<typeof getData>,
): string[] {
  const recipients = input.recipientIds ?? [];
  const specificAthletes = idsOf(recipients, 'athlete');
  let ids: string[];
  if (specificAthletes.length > 0) {
    ids = [...new Set(specificAthletes)];
  } else {
    const classIds = input.classIds ?? [];
    if (classIds.length > 0) {
      ids = data.students
        .filter(
          (s) =>
            s.status !== 'inactive' &&
            studentClassIds(s).some((id) => classIds.includes(id)),
        )
        .map((s) => s.id);
    } else if (input.targetType === 'team' && input.targetId) {
      ids = data.students
        .filter((s) => studentInClass(s, input.targetId) && s.status !== 'inactive')
        .map((s) => s.id);
    } else {
      ids = data.students.filter((s) => s.status !== 'inactive').map((s) => s.id);
    }
  }

  return ids.filter((id) => {
    const student = data.students.find((s) => s.id === id);
    return student ? studentMatchesScope(student, input, data) : false;
  });
}

export function resolveAnnouncementEmails(
  input: Pick<
    AnnouncementInput,
    | 'audienceRoles'
    | 'classIds'
    | 'recipientIds'
    | 'targetType'
    | 'targetId'
    | 'sportCategories'
    | 'teamsLabel'
  >,
): string[] {
  const data = getData();
  const roles = new Set<AnnouncementAudienceRole>(input.audienceRoles ?? []);
  const recipients = input.recipientIds ?? [];
  const emails: Array<string | undefined | null> = [];
  const sport = (input.sportCategories ?? '').trim();

  const wholeClub = roles.size === 0 && recipients.length === 0 && (input.classIds ?? []).length === 0;
  const wantAthletes = wholeClub || roles.has('athletes') || idsOf(recipients, 'athlete').length > 0;
  const wantParents = wholeClub || roles.has('parents') || idsOf(recipients, 'parent').length > 0;
  const wantCoaches = wholeClub || roles.has('coaches') || idsOf(recipients, 'coach').length > 0;
  const wantStaff = wholeClub || roles.has('staff') || idsOf(recipients, 'staff').length > 0;

  const athleteIds = athleteIdsForAnnouncement(input, data);
  const athleteSet = new Set(athleteIds);

  if (wantAthletes || (wantParents && idsOf(recipients, 'parent').length === 0)) {
    for (const student of data.students) {
      if (!athleteSet.has(student.id)) continue;
      if (wantAthletes) emails.push(student.email);
      if (wantParents && idsOf(recipients, 'parent').length === 0) {
        emails.push(student.motherEmail, student.fatherEmail);
        for (const link of data.parentLinks ?? []) {
          if (link.athleteId !== student.id) continue;
          const parent = getUsers().find((u) => u.id === link.parentUserId && u.active);
          if (parent?.email) emails.push(parent.email);
        }
      }
    }
  }

  const specificParents = idsOf(recipients, 'parent');
  if (specificParents.length > 0) {
    for (const parentId of specificParents) {
      const parent = getUsers().find((u) => u.id === parentId && u.active);
      if (parent?.email) emails.push(parent.email);
    }
  }

  if (wantCoaches) {
    const coachIds = new Set(idsOf(recipients, 'coach'));
    for (const coach of data.coaches) {
      if (!coach.active) continue;
      if (coachIds.size > 0 && !coachIds.has(coach.id)) continue;
      if (sport && !sportsMatch(coach.sport, sport)) continue;
      emails.push(coach.email);
    }
  }

  if (wantStaff) {
    const staffIds = new Set(idsOf(recipients, 'staff'));
    for (const member of data.staff ?? []) {
      if (!member.active) continue;
      if (staffIds.size > 0 && !staffIds.has(member.id)) continue;
      emails.push(member.email);
    }
  }

  return uniqueEmails(emails);
}

export async function sendAnnouncementEmails(input: {
  clubId: string;
  title: string;
  message: string;
  emails: string[];
}) {
  const sent: string[] = [];
  const failed: Array<{ email: string; error: string }> = [];
  for (const to of input.emails) {
    const result = await sendClubEmail({
      clubId: input.clubId,
      to,
      subject: `Ανακοίνωση: ${input.title}`,
      text: `${input.title}\n\n${input.message}`,
      html: `<h2>${escapeHtml(input.title)}</h2><p>${escapeHtml(input.message).replace(/\n/g, '<br/>')}</p>`,
    });
    if (result.success) sent.push(to);
    else failed.push({ email: to, error: result.error ?? 'Αποτυχία' });
  }
  return { success: true as const, data: { sent, failed }, error: null };
}

export async function notifyAbsenceByEmail(input: {
  clubId: string;
  studentId: string;
  date: string;
  className?: string;
}) {
  const data = getData();
  const student = data.students.find((s) => s.id === input.studentId);
  if (!student) {
    return { success: false as const, data: null, error: 'Δεν βρέθηκε αθλητής' };
  }
  const emails = studentContactEmails(student);
  const name = `${student.lastName} ${student.firstName}`.trim();
  const subject = `Απουσία — ${name}`;
  const text = [
    `Σας ενημερώνουμε ότι καταχωρήθηκε απουσία.`,
    ``,
    `Αθλητής: ${name}`,
    `Ημερομηνία: ${input.date}`,
    input.className ? `Τμήμα: ${input.className}` : '',
    ``,
    `TeamSuite`,
  ]
    .filter(Boolean)
    .join('\n');
  const smsText = `Απουσία: ${name} · ${input.date}${input.className ? ` · ${input.className}` : ''}`;

  const sent: string[] = [];
  for (const to of emails) {
    const result = await sendClubEmail({
      clubId: input.clubId,
      to,
      subject,
      text,
      athleteId: student.id,
    });
    if (result.success) sent.push(to);
  }
  const sms = await sendSmsToStudent(input.clubId, student, smsText);
  sent.push(...sms.sent);

  return {
    success: sent.length > 0,
    data: { sent },
    error: sent.length ? null : 'Δεν στάλθηκε ειδοποίηση (email/SMS / συγκατάθεση / ρυθμίσεις)',
  };
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateIso(d);
}

export async function notifyClassSessionMessage(input: {
  clubId: string;
  classId: string;
  date: string;
  startTime?: string;
  className?: string;
  kind: 'cancelled' | 'tomorrow';
}) {
  const data = getData();
  const students = data.students.filter(
    (s) => s.status !== 'inactive' && studentInClass(s, input.classId),
  );
  const className =
    input.className || data.classes.find((c) => c.id === input.classId)?.name || 'τμήμα';
  const timeBit = input.startTime ? ` ${input.startTime}` : '';
  const text =
    input.kind === 'cancelled'
      ? `Ακύρωση προπόνησης ${className} στις ${input.date}${timeBit}.`
      : `Υπενθύμιση: προπόνηση ${className} αύριο ${input.date}${timeBit}.`;
  const subject =
    input.kind === 'cancelled' ? `Ακύρωση προπόνησης — ${className}` : `Προπόνηση αύριο — ${className}`;

  let sent = 0;
  let skipped = 0;
  for (const student of students) {
    let ok = false;
    for (const to of studentContactEmails(student)) {
      const mail = await sendClubEmail({
        clubId: input.clubId,
        to,
        subject,
        text,
        athleteId: student.id,
      });
      if (mail.success) ok = true;
    }
    const sms = await sendSmsToStudent(input.clubId, student, text);
    if (sms.sent.length) ok = true;
    if (ok) sent += 1;
    else skipped += 1;
  }
  return { success: true as const, data: { sent, skipped }, error: null };
}

export async function notifyTomorrowTrainings(clubId: string) {
  const data = getData();
  const tomorrow = addDaysIso(localDateIso(), 1);
  const trainings = (data.trainings ?? []).filter(
    (t) => t.date === tomorrow && t.classId,
  );
  if (trainings.length === 0) {
    return { success: false as const, data: null, error: 'Δεν υπάρχουν προπονήσεις αύριο.' };
  }
  let sent = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const training of trainings) {
    if (!training.classId || seen.has(`${training.classId}|${training.startTime}`)) continue;
    seen.add(`${training.classId}|${training.startTime}`);
    const result = await notifyClassSessionMessage({
      clubId,
      classId: training.classId,
      date: training.date,
      startTime: training.startTime,
      kind: 'tomorrow',
    });
    sent += result.data?.sent ?? 0;
    skipped += result.data?.skipped ?? 0;
  }
  return { success: true as const, data: { sent, skipped, date: tomorrow }, error: null };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
