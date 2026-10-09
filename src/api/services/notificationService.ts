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
import * as pushService from './pushService';

function uniqueEmails(emails: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const raw of emails) {
    const email = (raw ?? '').trim().toLowerCase();
    if (email.includes('@')) set.add(email);
  }
  return [...set];
}

/** Ελεύθερη λίστα emails (κόμμα / κενό / ελληνικό ερωτηματικό). */
export function parseEmailList(raw: string): string[] {
  return uniqueEmails(raw.split(/[,;\s]+/));
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

  const hasClassScope = (input.classIds ?? []).length > 0;
  // Επιλογή τμήματος = παραλήπτες τα μέλη του τμήματος (αθλητές + emails γονέων),
  // ακόμα κι αν δεν τσεκαρίστηκαν οι ρόλοι «Αθλητές» / «Γονείς».
  const wholeClub = roles.size === 0 && recipients.length === 0 && !hasClassScope;
  const wantAthletes =
    wholeClub || hasClassScope || roles.has('athletes') || idsOf(recipients, 'athlete').length > 0;
  const wantParents =
    wholeClub || hasClassScope || roles.has('parents') || idsOf(recipients, 'parent').length > 0;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deliverAnnouncementEmail(input: {
  clubId: string;
  to: string;
  title: string;
  message: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await sendClubEmail({
      clubId: input.clubId,
      to: input.to,
      subject: `Ανακοίνωση: ${input.title}`,
      text: `${input.title}\n\n${input.message}`,
      html: `<h2>${escapeHtml(input.title)}</h2><p>${escapeHtml(input.message).replace(/\n/g, '<br/>')}</p>`,
    });
    if (result.success) return { ok: true };
    return { ok: false, error: result.error ?? 'Αποτυχία' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Αποτυχία' };
  }
}

export async function sendAnnouncementEmails(input: {
  clubId: string;
  announcementId: string;
  title: string;
  message: string;
  emails: string[];
  /** Extra automatic retries for failures (default 1 = άμεση επαναπροσπάθεια). */
  retryFailedPasses?: number;
}) {
  const sent: string[] = [];
  let failed: Array<{ email: string; error: string }> = [];
  const sentAt = new Date().toISOString();
  const retryPasses = Math.max(0, input.retryFailedPasses ?? 1);

  for (const to of input.emails) {
    const result = await deliverAnnouncementEmail({
      clubId: input.clubId,
      to,
      title: input.title,
      message: input.message,
    });
    if (result.ok) sent.push(to);
    else failed.push({ email: to, error: result.error });
  }

  for (let pass = 0; pass < retryPasses && failed.length > 0; pass += 1) {
    await sleep(1500);
    const retryList = [...failed];
    failed = [];
    for (const row of retryList) {
      const result = await deliverAnnouncementEmail({
        clubId: input.clubId,
        to: row.email,
        title: input.title,
        message: input.message,
      });
      if (result.ok) sent.push(row.email);
      else failed.push({ email: row.email, error: result.error });
    }
  }

  try {
    const { syncAuthHeaders } = await import('../syncAuth');
    await fetch('/api/email-track', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify({
        clubId: input.clubId,
        announcementId: input.announcementId,
        sent,
        failed,
      }),
    });
  } catch {
    /* local stats still saved by caller */
  }

  const recipients = [
    ...sent.map((email) => ({
      email,
      status: 'sent' as const,
      sentAt,
      openedAt: null as string | null,
    })),
    ...failed.map((row) => ({
      email: row.email,
      status: 'failed' as const,
      sentAt,
      openedAt: null as string | null,
      error: row.error,
    })),
  ];

  return {
    success: true as const,
    data: {
      sent,
      failed,
      emailStats: {
        sentCount: sent.length,
        failedCount: failed.length,
        openedCount: 0,
        recipients,
        updatedAt: sentAt,
      },
    },
    error: null,
  };
}

/** Επαναποστολή μόνο στα emails που απέτυχαν στην τελευταία αποστολή. */
export async function resendFailedAnnouncementEmails(input: {
  clubId: string;
  announcementId: string;
  title: string;
  message: string;
  previousStats: NonNullable<import('../../types').Announcement['emailStats']>;
}) {
  const failedEmails = [
    ...new Set(
      (input.previousStats.recipients ?? [])
        .filter((r) => r.status === 'failed')
        .map((r) => r.email.trim().toLowerCase())
        .filter((e) => e.includes('@')),
    ),
  ];
  if (failedEmails.length === 0) {
    return {
      success: true as const,
      data: {
        sent: [] as string[],
        failed: [] as Array<{ email: string; error: string }>,
        emailStats: input.previousStats,
        resentCount: 0,
      },
      error: null,
    };
  }

  const round = await sendAnnouncementEmails({
    clubId: input.clubId,
    announcementId: input.announcementId,
    title: input.title,
    message: input.message,
    emails: failedEmails,
    retryFailedPasses: 1,
  });

  const byEmail = new Map(
    (input.previousStats.recipients ?? []).map((r) => [r.email.trim().toLowerCase(), { ...r }]),
  );
  for (const row of round.data?.emailStats.recipients ?? []) {
    byEmail.set(row.email.trim().toLowerCase(), row);
  }
  const recipients = [...byEmail.values()];
  const sentCount = recipients.filter((r) => r.status === 'sent').length;
  const failedCount = recipients.filter((r) => r.status === 'failed').length;
  const emailStats = {
    sentCount,
    failedCount,
    openedCount: recipients.filter((r) => r.openedAt).length,
    recipients,
    updatedAt: new Date().toISOString(),
  };

  return {
    success: true as const,
    data: {
      sent: round.data?.sent ?? [],
      failed: round.data?.failed ?? [],
      emailStats,
      resentCount: failedEmails.length,
    },
    error: null,
  };
}

type RemoteEmailTrackStats = {
  sentCount?: number;
  failedCount?: number;
  openedCount?: number;
  opens?: Record<string, string>;
  sent?: string[];
  failed?: Array<{ email: string; error?: string }>;
  updatedAt?: string;
};

function mergeEmailTrackRecipients(
  prev: import('../../types').AnnouncementEmailRecipientStat[] | undefined,
  remote: RemoteEmailTrackStats,
) {
  const opens = remote.opens ?? {};
  const byEmail = new Map<string, import('../../types').AnnouncementEmailRecipientStat>();

  for (const r of prev ?? []) {
    const key = r.email.trim().toLowerCase();
    if (!key) continue;
    byEmail.set(key, {
      ...r,
      openedAt: opens[key] ?? r.openedAt ?? null,
    });
  }

  for (const email of remote.sent ?? []) {
    const key = email.trim().toLowerCase();
    if (!key.includes('@')) continue;
    const existing = byEmail.get(key);
    byEmail.set(key, {
      email: existing?.email ?? email,
      status: 'sent',
      sentAt: existing?.sentAt,
      openedAt: opens[key] ?? existing?.openedAt ?? null,
    });
  }

  const sentKeys = new Set(
    [...byEmail.values()].filter((r) => r.status === 'sent').map((r) => r.email.trim().toLowerCase()),
  );
  for (const row of remote.failed ?? []) {
    const key = String(row.email ?? '')
      .trim()
      .toLowerCase();
    if (!key.includes('@') || sentKeys.has(key)) continue;
    const existing = byEmail.get(key);
    if (existing?.status === 'sent') continue;
    byEmail.set(key, {
      email: existing?.email ?? row.email,
      status: 'failed',
      sentAt: existing?.sentAt,
      openedAt: null,
      error: row.error ?? existing?.error,
    });
  }

  return [...byEmail.values()];
}

function emailStatsFingerprint(
  stats: NonNullable<import('../../types').Announcement['emailStats']> | undefined,
) {
  if (!stats) return '';
  const failed = (stats.recipients ?? [])
    .filter((r) => r.status === 'failed')
    .map((r) => r.email.toLowerCase())
    .sort()
    .join('|');
  return `${stats.sentCount}:${stats.failedCount}:${stats.openedCount}:${failed}:${(stats.recipients ?? []).length}`;
}

/** Συγχρονίζει opens / sent / failed από το cloud στο τοπικό announcement.emailStats. */
export async function refreshAnnouncementEmailOpens(clubId: string) {
  const { syncAuthHeaders } = await import('../syncAuth');
  const { mutateData } = await import('../../data/repository');
  const response = await fetch(
    `/api/email-track?clubId=${encodeURIComponent(clubId)}&stats=1`,
    { headers: syncAuthHeaders(false) },
  );
  if (!response.ok) return { success: false as const, updated: 0 };
  const json = (await response.json()) as {
    ok?: boolean;
    stats?: Record<string, RemoteEmailTrackStats>;
  };
  if (!json.ok || !json.stats) return { success: false as const, updated: 0 };

  let updated = 0;
  mutateData((data) => {
    for (const ann of data.announcements) {
      const remote = json.stats![ann.id];
      if (!remote) continue;
      const prev = ann.emailStats;
      const recipients = mergeEmailTrackRecipients(prev?.recipients, remote);
      const next = {
        sentCount: recipients.filter((r) => r.status === 'sent').length,
        failedCount: recipients.filter((r) => r.status === 'failed').length,
        openedCount: recipients.filter((r) => r.openedAt).length,
        recipients,
        updatedAt: remote.updatedAt ?? new Date().toISOString(),
      };
      if (emailStatsFingerprint(prev) !== emailStatsFingerprint(next)) {
        ann.emailStats = next;
        ann.updatedAt = Date.now();
        updated += 1;
      }
    }
  });
  return { success: true as const, updated };
}

/** Φέρνει sent/failed για μία ανακοίνωση από το cloud (για αναφορά αποτυχιών). */
export async function hydrateAnnouncementEmailStats(input: {
  clubId: string;
  announcementId: string;
}) {
  const { syncAuthHeaders } = await import('../syncAuth');
  const { getData, mutateData } = await import('../../data/repository');
  const response = await fetch(
    `/api/email-track?clubId=${encodeURIComponent(input.clubId)}&stats=1&announcementId=${encodeURIComponent(input.announcementId)}`,
    { headers: syncAuthHeaders(false) },
  );
  if (!response.ok) return { success: false as const, emailStats: null };
  const json = (await response.json()) as {
    ok?: boolean;
    stats?: Record<string, RemoteEmailTrackStats>;
  };
  const remote = json.stats?.[input.announcementId];
  if (!json.ok || !remote) return { success: false as const, emailStats: null };

  const prev = getData().announcements.find((a) => a.id === input.announcementId)?.emailStats;
  const recipients = mergeEmailTrackRecipients(prev?.recipients, remote);
  const emailStats = {
    sentCount: recipients.filter((r) => r.status === 'sent').length,
    failedCount: recipients.filter((r) => r.status === 'failed').length,
    openedCount: recipients.filter((r) => r.openedAt).length,
    recipients,
    updatedAt: remote.updatedAt ?? new Date().toISOString(),
  };

  mutateData((data) => {
    const ann = data.announcements.find((a) => a.id === input.announcementId);
    if (!ann) return;
    ann.emailStats = emailStats;
    ann.updatedAt = Date.now();
  });

  return { success: true as const, emailStats };
}

export async function sendAnnouncementParentPush(input: {
  clubId: string;
  title: string;
  message: string;
  audienceRoles?: AnnouncementInput['audienceRoles'];
  classIds?: AnnouncementInput['classIds'];
  recipientIds?: AnnouncementInput['recipientIds'];
  sportCategories?: string;
  teamsLabel?: string;
}) {
  const audience = {
    audienceRoles: input.audienceRoles,
    classIds: input.classIds,
    recipientIds: input.recipientIds,
    sportCategories: input.sportCategories,
    teamsLabel: input.teamsLabel,
    status: 'published' as const,
  };
  const parentIds = pushService.announcementParentUserIds(audience);
  const coachIds = pushService.announcementCoachUserIds(audience);
  let sent = 0;
  if (parentIds.length > 0) {
    sent += (
      await pushService.sendParentPush({
        clubId: input.clubId,
        userIds: parentIds,
        title: input.title,
        body: input.message,
        url: '/app/parent',
      })
    ).sent;
  }
  if (coachIds.length > 0) {
    sent += (
      await pushService.sendParentPush({
        clubId: input.clubId,
        userIds: coachIds,
        title: input.title,
        body: input.message,
        url: '/app/coach',
      })
    ).sent;
  }
  return { sent };
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
  const parentIds = pushService.classParentUserIds(input.classId);
  if (parentIds.length > 0) {
    await pushService.sendParentPush({
      clubId: input.clubId,
      userIds: parentIds,
      title: subject,
      body: text,
      url: '/app/parent?tab=schedule',
    });
  }
  const coachIds = pushService.classCoachUserIds(input.classId);
  if (coachIds.length > 0) {
    await pushService.sendParentPush({
      clubId: input.clubId,
      userIds: coachIds,
      title: subject,
      body: text,
      url: '/app/coach',
    });
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
