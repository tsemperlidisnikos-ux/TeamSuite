import { formatCurrency } from './labels';
import type { RentalBooking } from '../types';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildRentalBookingEmail(input: {
  clubName: string;
  booking: Pick<
    RentalBooking,
    | 'facilityName'
    | 'date'
    | 'startTime'
    | 'endTime'
    | 'courtShare'
    | 'useLockerRoom'
    | 'customerName'
    | 'amount'
    | 'notes'
  >;
}): { subject: string; text: string; html: string } {
  const club = input.clubName.trim() || 'Σύλλογος';
  const b = input.booking;
  const share = b.courtShare === 'half' ? 'Μισό γήπεδο' : 'Ολόκληρο γήπεδο';
  const locker = b.useLockerRoom ? 'Ναι' : 'Όχι';
  const amount = formatCurrency(Number(b.amount) || 0);
  const subject = `Κράτηση γηπέδου ${b.date} ${b.startTime}–${b.endTime} — ${club}`;
  const text = [
    club,
    'Επιβεβαίωση κράτησης γηπέδου',
    `Όνομα: ${b.customerName}`,
    `Γήπεδο: ${b.facilityName}`,
    `Ημερομηνία: ${b.date}`,
    `Ώρα: ${b.startTime}–${b.endTime}`,
    `Τμήμα: ${share}`,
    `Αποδυτήρια: ${locker}`,
    `Τελικό κόστος: ${amount}`,
    b.notes ? `Σημείωση: ${b.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#64748b;width:38%">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`;

  const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
  <p style="font-weight:800;font-size:18px;margin:0 0 8px">${escapeHtml(club)}</p>
  <p style="margin:0 0 16px;color:#475569">Επιβεβαίωση κράτησης γηπέδου</p>
  <table width="100%" cellpadding="0" cellspacing="0">
    ${row('Όνομα', b.customerName)}
    ${row('Γήπεδο', b.facilityName)}
    ${row('Ημερομηνία', b.date)}
    ${row('Ώρα', `${b.startTime}–${b.endTime}`)}
    ${row('Τμήμα', share)}
    ${row('Αποδυτήρια', locker)}
    ${row('Τελικό κόστος', amount)}
    ${b.notes ? row('Σημείωση', b.notes) : ''}
  </table>
</div>`;

  return { subject, text, html };
}
