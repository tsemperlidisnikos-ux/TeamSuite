import { apiClient } from '../apiClient';
import { getUsers } from '../../auth/auth';
import { getClubById, getClubSmtp } from '../../auth/clubs';
import { getData } from '../../data/repository';
import { localDateIso } from '../../utils/dates';
import { listLowStockProducts } from '../../utils/warehouseStock';
import { sendClubEmail } from './emailService';

const MAIL_KEY = 'teamsuite-lowstock-mail-v1';

function alreadyMailedToday(clubId: string, day: string): boolean {
  try {
    const raw = localStorage.getItem(MAIL_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return map[clubId] === day;
  } catch {
    return false;
  }
}

function markMailedToday(clubId: string, day: string): void {
  try {
    const raw = localStorage.getItem(MAIL_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[clubId] = day;
    localStorage.setItem(MAIL_KEY, JSON.stringify(map));
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

/** Μία φορά την ημέρα: email στη γραμματεία για προϊόντα κάτω από το ελάχιστο. */
export async function runLowStockSecretariatNotice(clubId: string) {
  return apiClient(async () => {
    if (!clubId) return { sent: 0, skipped: 0, reason: 'no-club' as const };
    const low = listLowStockProducts(getData().products);
    if (low.length === 0) return { sent: 0, skipped: 0, reason: 'none' as const };

    const smtp = getClubSmtp(clubId);
    if (!smtp.enabled) return { sent: 0, skipped: 0, reason: 'smtp-disabled' as const };

    const today = localDateIso();
    if (alreadyMailedToday(clubId, today)) {
      return { sent: 0, skipped: 0, reason: 'already' as const };
    }

    const recipients = secretariatEmails(clubId);
    if (recipients.length === 0) return { sent: 0, skipped: 0, reason: 'no-recipients' as const };

    const club = getClubById(clubId);
    const clubName = club?.name?.trim() || 'Σύλλογος';
    const lines = low
      .slice(0, 40)
      .map((p) => `• ${p.name}: ${p.stockQty ?? 0} (ελάχ. ${p.minStock ?? 5})`);
    const extra = low.length > 40 ? `\n… και ${low.length - 40} ακόμη` : '';
    const subject = `Χαμηλό απόθεμα αποθήκης (${low.length}) — ${clubName}`;
    const text = [
      `${clubName}`,
      `Προϊόντα κάτω από το ελάχιστο απόθεμα: ${low.length}`,
      '',
      ...lines,
      extra,
      '',
      'Ανοίξτε Αποθήκη στο TeamSuite για αναπλήρωση.',
    ]
      .filter((row) => row !== '')
      .join('\n');

    let sent = 0;
    for (const to of recipients) {
      const mail = await sendClubEmail({
        clubId,
        to,
        subject,
        text,
        transactional: true,
      });
      if (mail.success) sent += 1;
    }
    if (sent > 0) markMailedToday(clubId, today);
    return { sent, skipped: recipients.length - sent, reason: 'ok' as const };
  });
}
