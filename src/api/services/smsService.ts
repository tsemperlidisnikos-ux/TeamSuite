import { apiClient } from '../apiClient';
import { getClubSms, smsHasStoredSecret } from '../../auth/clubs';
import { getData } from '../../data/repository';
import { syncAuthHeaders } from '../syncAuth';

export type SendSmsInput = {
  clubId: string;
  to: string;
  text: string;
  athleteId?: string;
  transactional?: boolean;
};

function hasCommunicationConsent(athleteId?: string): boolean {
  if (!athleteId) return true;
  const student = getData().students.find((s) => s.id === athleteId);
  if (!student) return true;
  return Boolean(student.gdprItems?.communication);
}

/** Ελληνικά κινητά 69xxxxxxxx → E.164. */
export function normalizeSmsPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0030')) return `+${digits.slice(2)}`;
  if (digits.startsWith('30') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('69') && digits.length === 10) return `+30${digits}`;
  if (digits.length === 10) return `+30${digits}`;
  return digits;
}

export function studentContactPhones(student: {
  phone?: string;
  guardianPhone?: string;
  motherPhone?: string;
}): string[] {
  const set = new Set<string>();
  for (const raw of [student.guardianPhone, student.motherPhone, student.phone]) {
    const phone = normalizeSmsPhone(raw ?? '');
    if (phone.length >= 10) set.add(phone);
  }
  return [...set];
}

export function viberChatUrl(phone: string, text?: string): string {
  const n = normalizeSmsPhone(phone).replace(/^\+/, '');
  const encoded = text ? `&text=${encodeURIComponent(text)}` : '';
  return `viber://chat?number=${n}${encoded}`;
}

export async function sendClubSms(input: SendSmsInput) {
  return apiClient(async () => {
    const sms = getClubSms(input.clubId);
    if (!sms.enabled) {
      throw new Error('Το SMS του συλλόγου δεν είναι ενεργό. Ρυθμίστε το στις Ρυθμίσεις → SMS.');
    }
    if (!smsHasStoredSecret(sms) && !sms.apiKey.trim()) {
      throw new Error('Οι ρυθμίσεις SMS είναι ελλιπείς.');
    }
    const to = normalizeSmsPhone(input.to);
    if (to.length < 10) {
      throw new Error('Μη έγκυρο τηλέφωνο παραλήπτη.');
    }
    if (!input.transactional && !hasCommunicationConsent(input.athleteId)) {
      throw new Error('Λείπει συγκατάθεση επικοινωνίας (GDPR) για τον αθλητή.');
    }
    const text = input.text.trim();
    if (!text) throw new Error('Κενό μήνυμα SMS.');

    const response = await fetch('/api/send-sms', {
      method: 'POST',
      headers: syncAuthHeaders(),
      body: JSON.stringify({
        clubId: input.clubId,
        to,
        text,
      }),
    });
    let payload: { ok?: boolean; error?: string } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = {};
    }
    if (!response.ok || !payload.ok) {
      const err =
        payload.error ||
        (response.status === 404
          ? 'Η αποστολή SMS διαθέσιμη μόνο στο production server (Vercel API).'
          : `Αποτυχία SMS (HTTP ${response.status})`);
      throw new Error(err);
    }
    return { to };
  });
}
