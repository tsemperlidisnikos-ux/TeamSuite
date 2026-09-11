import { formatCurrency } from './labels.js';
import type { RentalBooking } from '../types/index.js';

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
    | 'customerName'
    | 'amount'
    | 'notes'
  > & { useLockerRoom?: boolean };
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

export function buildRentalReceiptEmail(input: {
  clubName: string;
  booking: Pick<
    RentalBooking,
    | 'facilityName'
    | 'date'
    | 'startTime'
    | 'endTime'
    | 'courtShare'
    | 'customerName'
    | 'amount'
    | 'notes'
    | 'paidOn'
  > & { useLockerRoom?: boolean };
  paymentLabel: string;
}): { subject: string; text: string; html: string } {
  const club = input.clubName.trim() || 'Σύλλογος';
  const b = input.booking;
  const share = b.courtShare === 'half' ? 'Μισό γήπεδο' : 'Ολόκληρο γήπεδο';
  const locker = b.useLockerRoom ? 'Ναι' : 'Όχι';
  const amount = formatCurrency(Number(b.amount) || 0);
  const paidOn = (b.paidOn || '').slice(0, 10) || b.date;
  const subject = `Απόδειξη είσπραξης ενοικίασης ${b.date} ${b.startTime}–${b.endTime} — ${club}`;
  const text = [
    club,
    'Απόδειξη είσπραξης ενοικίασης γηπέδου',
    `Έλαβα από: ${b.customerName}`,
    `Ημ/νία είσπραξης: ${paidOn}`,
    `Τρόπος: ${input.paymentLabel}`,
    `Γήπεδο: ${b.facilityName}`,
    `Ημερομηνία χρήσης: ${b.date}`,
    `Ώρα: ${b.startTime}–${b.endTime}`,
    `Τμήμα: ${share}`,
    `Αποδυτήρια: ${locker}`,
    `Ποσό: ${amount}`,
    b.notes ? `Σημείωση: ${b.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#64748b;width:38%">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`;

  const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
  <p style="font-weight:800;font-size:18px;margin:0 0 8px">${escapeHtml(club)}</p>
  <div style="background:#0e8a8a;color:#fff;font-weight:800;letter-spacing:.04em;text-align:center;padding:8px 12px;border-radius:8px">ΑΠΟΔΕΙΞΗ ΕΙΣΠΡΑΞΗΣ ΕΝΟΙΚΙΑΣΗΣ</div>
  <p style="font-size:26px;margin:12px 0 16px;text-align:right">${escapeHtml(amount)}</p>
  <table width="100%" cellpadding="0" cellspacing="0">
    ${row('Έλαβα από', b.customerName)}
    ${row('Ημ/νία είσπραξης', paidOn)}
    ${row('Τρόπος', input.paymentLabel)}
    ${row('Γήπεδο', b.facilityName)}
    ${row('Ημερομηνία χρήσης', b.date)}
    ${row('Ώρα', `${b.startTime}–${b.endTime}`)}
    ${row('Τμήμα', share)}
    ${row('Αποδυτήρια', locker)}
    ${b.notes ? row('Σημείωση', b.notes) : ''}
  </table>
</div>`;

  return { subject, text, html };
}

export function openRentalReceiptPrint(input: {
  clubName: string;
  booking: Parameters<typeof buildRentalReceiptEmail>[0]['booking'];
  paymentLabel: string;
}): void {
  const mail = buildRentalReceiptEmail(input);
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');
  if (!popup) return;
  popup.document.write(`<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>${mail.subject}</title>
<style>body{margin:24px;background:#fff}@media print{body{margin:0}}</style></head><body>${mail.html}
<script>window.onload=function(){window.print();}</script></body></html>`);
  popup.document.close();
}
