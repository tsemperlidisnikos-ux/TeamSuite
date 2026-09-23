import { getUsers } from '../../auth/auth';
import { getClubById, getClubSms, getClubSmtp } from '../../auth/clubs';
import { getData } from '../../data/repository';
import { localDateIso } from '../../utils/dates';
import { sendClubEmail } from './emailService';
import { sendClubSms, studentContactPhones } from './smsService';
import {
  listDocumentExpiries,
  type DocumentExpiryRow,
} from './documentExpiryService';
import * as pushService from './pushService';

const PARENT_KEY = 'teamsuite-healthcard-parent-v1';
const STAFF_KEY = 'teamsuite-healthcard-staff-v1';

function uniqueEmails(emails: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const raw of emails) {
    const email = (raw ?? '').trim().toLowerCase();
    if (email.includes('@')) set.add(email);
  }
  return [...set];
}

function alreadySent(storageKey: string, clubId: string, id: string, day: string): boolean {
  try {
    const raw = localStorage.getItem(storageKey);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return map[`${clubId}:${id}`] === day;
  } catch {
    return false;
  }
}

function markSent(storageKey: string, clubId: string, id: string, day: string): void {
  try {
    const raw = localStorage.getItem(storageKey);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[`${clubId}:${id}`] = day;
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function secretariatEmails(clubId: string): string[] {
  const unique = new Set<string>();
  for (const user of getUsers()) {
    if (!user.active) continue;
    if (user.clubId !== clubId) continue;
    if (user.role !== 'admin' && user.role !== 'secretariat') continue;
    const email = user.email.trim().toLowerCase();
    if (email.includes('@')) unique.add(email);
  }
  return [...unique];
}

export function listHealthCardNoticeRows(): DocumentExpiryRow[] {
  return listDocumentExpiries({ withinDays: 30 }).filter((row) => row.kind === 'healthCard');
}

export function healthCardNoticeText(clubName: string, row: DocumentExpiryRow): string {
  const when =
    row.status === 'expired'
      ? `έληξε στις ${row.expiresAt}`
      : `λήγει στις ${row.expiresAt} (σε ${row.daysLeft} ημέρες)`;
  return `${clubName}: η κάρτα υγείας του/της ${row.athleteName} ${when}. Ανανεώστε την και ενημερώστε τον σύλλογο.`;
}

/** Υπενθύμιση γονέων + σύνοψη στη γραμματεία. Το πολύ 1 φορά / αθλητή / ημέρα. */
export async function notifyHealthCardExpiries(clubId: string) {
  if (!clubId) return { sent: 0, skipped: 0, staff: 0, reason: 'no-club' as const };
  const rows = listHealthCardNoticeRows();
  if (rows.length === 0) return { sent: 0, skipped: 0, staff: 0, reason: 'none' as const };

  const club = getClubById(clubId);
  const clubName = club?.name?.trim() || 'TeamSuite';
  const smtp = getClubSmtp(clubId);
  const sms = getClubSms(clubId);
  const today = localDateIso();
  const data = getData();

  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    if (alreadySent(PARENT_KEY, clubId, row.athleteId, today)) {
      skipped += 1;
      continue;
    }
    const student = data.students.find((s) => s.id === row.athleteId);
    if (!student) {
      skipped += 1;
      continue;
    }

    const text = healthCardNoticeText(clubName, row);
    const subject = `Κάρτα υγείας — ${row.athleteName}`;
    let ok = false;

    if (smtp.enabled) {
      for (const to of uniqueEmails([student.motherEmail, student.fatherEmail, student.email])) {
        const mail = await sendClubEmail({
          clubId,
          to,
          subject,
          text,
          athleteId: student.id,
        });
        if (mail.success) ok = true;
      }
    }
    if (sms.enabled) {
      for (const to of studentContactPhones(student)) {
        const result = await sendClubSms({
          clubId,
          to,
          text,
          athleteId: student.id,
        });
        if (result.success) ok = true;
      }
    }
    const parentIds = pushService.athleteParentUserIds([row.athleteId]);
    if (parentIds.length > 0) {
      await pushService.sendParentPush({
        clubId,
        userIds: parentIds,
        title: subject,
        body: text,
        url: '/app/parent?tab=documents',
      });
      ok = true;
    }

    if (ok) {
      markSent(PARENT_KEY, clubId, row.athleteId, today);
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  let staff = 0;
  if (smtp.enabled && !alreadySent(STAFF_KEY, clubId, 'staff', today)) {
    const recipients = secretariatEmails(clubId);
    if (recipients.length > 0) {
      const lines = rows.map((row) => {
        const label = row.status === 'expired' ? 'ληγμένη' : `λήγει σε ${row.daysLeft} ημ.`;
        return `• ${row.athleteName}: ${label} (${row.expiresAt})`;
      });
      const text = [
        clubName,
        `Κάρτες υγείας που λήγουν ή έληξαν: ${rows.length}`,
        '',
        ...lines,
        '',
        'Ανοίξτε Αθλητές στο TeamSuite.',
      ].join('\n');
      for (const to of recipients) {
        const mail = await sendClubEmail({
          clubId,
          to,
          subject: `Κάρτες υγείας (${rows.length}) — ${clubName}`,
          text,
        });
        if (mail.success) staff += 1;
      }
      if (staff > 0) markSent(STAFF_KEY, clubId, 'staff', today);
    }
  }

  return { sent, skipped, staff, reason: 'ok' as const };
}
