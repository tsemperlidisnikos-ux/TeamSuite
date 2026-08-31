function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type PaymentReceiptDraft = {
  date: string;
  series: string;
  number: string;
  amount: string;
  receivedFrom: string;
  address: string;
  amountWords: string;
  reason: string;
};

export function parentReceiptEmails(input: {
  fatherEmail?: string | null;
  motherEmail?: string | null;
}): string[] {
  const unique = new Set<string>();
  for (const raw of [input.fatherEmail, input.motherEmail]) {
    const email = String(raw ?? '').trim().toLowerCase();
    if (email.includes('@')) unique.add(email);
  }
  return [...unique];
}

export function buildPaymentReceiptEmail(input: {
  clubName: string;
  logoUrl?: string | null;
  draft: PaymentReceiptDraft;
}): { subject: string; text: string; html: string } {
  const club = input.clubName.trim() || 'Σύλλογος';
  const d = input.draft;
  const numberPart = [d.series, d.number].filter((p) => p.trim()).join(' ');
  const subject = numberPart
    ? `Απόδειξη είσπραξης ${numberPart} — ${club}`
    : `Απόδειξη είσπραξης — ${club}`;

  const text = [
    `${club}`,
    'Απόδειξη είσπραξης',
    d.date ? `Ημερομηνία: ${d.date}` : '',
    numberPart ? `Σειρά / Αρ.: ${numberPart}` : '',
    d.amount ? `Ποσό: ${d.amount} €` : '',
    d.amountWords ? `Ολογράφως: ${d.amountWords}` : '',
    d.receivedFrom ? `Έλαβα από: ${d.receivedFrom}` : '',
    d.address ? `Διεύθυνση: ${d.address}` : '',
    d.reason ? `Αιτιολογία: ${d.reason}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const logo = input.logoUrl?.trim();
  const logoHtml = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(club)}" style="max-height:64px;max-width:180px" />`
    : `<strong>${escapeHtml(club)}</strong>`;

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#64748b;width:38%;vertical-align:top">${escapeHtml(
      label,
    )}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value) || '—'}</td></tr>`;

  const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
    <tr>
      <td>${logoHtml}</td>
      <td style="text-align:right;font-size:13px;color:#475569">
        ${d.date ? `Ημ/νία: ${escapeHtml(d.date)}<br/>` : ''}
        ${numberPart ? `Σειρά / Αρ.: ${escapeHtml(numberPart)}` : ''}
      </td>
    </tr>
  </table>
  <div style="background:#eab308;color:#111;font-weight:800;letter-spacing:.06em;text-align:center;padding:8px 12px">ΑΠΟΔΕΙΞΗ ΕΙΣΠΡΑΞΗΣ</div>
  <p style="font-size:28px;margin:12px 0 18px;text-align:right"><span style="font-size:16px">€</span> ${escapeHtml(
    d.amount || '0,00',
  )}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
    ${row('Έλαβα από τον', d.receivedFrom)}
    ${row('Διεύθυνση', d.address)}
    ${row('Το ποσό', d.amountWords)}
    ${row('Αιτιολογία είσπραξης', d.reason)}
  </table>
  <p style="margin-top:24px;font-size:12px;color:#64748b">Αυτό το μήνυμα στάλθηκε αυτόματα από τον σύλλογο ${escapeHtml(
    club,
  )}.</p>
</div>`.trim();

  return { subject, text, html };
}
