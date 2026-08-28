import { apiClient } from '../apiClient';
import {
  appendClubSmtpSendLog,
  getClubSmtp,
} from '../../auth/clubs';
import { getData, mutateData } from '../../data/repository';
import { localDateTimeIso } from '../../utils/dates';
import { sanitizeOutboundEmail } from '../../utils/amkaAccess';
import { syncAuthHeaders } from '../syncAuth';

export type SendEmailInput = {
  clubId: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Skip communication-consent / unsubscribe checks (e.g. password reset). */
  transactional?: boolean;
  /** Optional athlete id to enforce gdprItems.communication */
  athleteId?: string;
};

function isUnsubscribed(email: string): boolean {
  const want = email.trim().toLowerCase();
  return (getData().emailUnsubscribes ?? []).some((e) => e.trim().toLowerCase() === want);
}

function hasCommunicationConsent(athleteId?: string): boolean {
  if (!athleteId) return true;
  const student = getData().students.find((s) => s.id === athleteId);
  if (!student) return true;
  return Boolean(student.gdprItems?.communication);
}

export async function unsubscribeEmail(email: string) {
  return apiClient(() => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes('@')) throw new Error('Μη έγκυρο email.');
    mutateData((data) => {
      if (!data.emailUnsubscribes) data.emailUnsubscribes = [];
      if (!data.emailUnsubscribes.some((e) => e.toLowerCase() === normalized)) {
        data.emailUnsubscribes.push(normalized);
      }
    });
    return { email: normalized };
  });
}

export async function sendClubEmail(input: SendEmailInput) {
  return apiClient(async () => {
    const smtp = getClubSmtp(input.clubId);
    if (!smtp.enabled) {
      throw new Error('Το SMTP του συλλόγου δεν είναι ενεργό. Ρυθμίστε το στις Ρυθμίσεις → Email.');
    }
    if (
      !smtp.host ||
      !smtp.port ||
      !smtp.username ||
      (!smtp.password && !smtp.passwordSet)
    ) {
      throw new Error('Οι ρυθμίσεις SMTP είναι ελλιπείς.');
    }
    const to = input.to.trim();
    if (!to.includes('@')) {
      throw new Error('Μη έγκυρο email παραλήπτη.');
    }

    if (!input.transactional) {
      if (isUnsubscribed(to)) {
        throw new Error('Ο παραλήπτης έχει κάνει unsubscribe από emails συλλόγου.');
      }
      if (!hasCommunicationConsent(input.athleteId)) {
        throw new Error('Λείπει συγκατάθεση επικοινωνίας (GDPR) για τον αθλητή.');
      }
    }

    const unsubUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/legal/privacy#unsubscribe`;
    const unsubFooter = `\n\n---\nΓια διαγραφή από ενημερώσεις επικοινωνήστε με τον σύλλογο. ${unsubUrl}`;
    const sanitized = sanitizeOutboundEmail({
      subject: input.subject,
      text: `${input.text}${input.transactional ? '' : unsubFooter}`,
      html: input.html
        ? `${input.html}${
            input.transactional
              ? ''
              : `<p style="font-size:12px;color:#64748b">Για διαγραφή από ενημερώσεις επικοινωνήστε με τον σύλλογο. <a href="${unsubUrl}">Πολιτική απορρήτου</a></p>`
          }`
        : undefined,
    });

    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify({
        clubId: input.clubId,
        to,
        subject: sanitized.subject,
        text: sanitized.text,
        html: sanitized.html,
        listUnsubscribe: input.transactional
          ? undefined
          : `<mailto:${smtp.username}?subject=unsubscribe>, <${unsubUrl}>`,
      }),
    });

    let payload: { ok?: boolean; error?: string; messageId?: string } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = {};
    }

    if (!response.ok || !payload.ok) {
      const err =
        payload.error ||
        (response.status === 404
          ? 'Η αποστολή email διαθέσιμη μόνο στο production server (Vercel API).'
          : `Αποτυχία αποστολής (HTTP ${response.status})`);
      appendClubSmtpSendLog(input.clubId, {
        to,
        status: 'error',
        message: err,
        at: localDateTimeIso(),
      });
      throw new Error(err);
    }

    appendClubSmtpSendLog(input.clubId, {
      to,
      status: 'ok',
      message: `Στάλθηκε: ${sanitized.subject}${payload.messageId ? ` (${payload.messageId})` : ''}`,
      at: localDateTimeIso(),
    });

    return { to, messageId: payload.messageId ?? null };
  });
}
