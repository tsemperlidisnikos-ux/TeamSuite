/** Μετατροπή ποσού σε ελληνικά ολογράφως (ευρώ / λεπτά). */

const ONES = [
  '',
  'ένα',
  'δύο',
  'τρία',
  'τέσσερα',
  'πέντε',
  'έξι',
  'επτά',
  'οκτώ',
  'εννέα',
];
const ONES_FEM = [
  '',
  'μία',
  'δύο',
  'τρεις',
  'τέσσερις',
  'πέντε',
  'έξι',
  'επτά',
  'οκτώ',
  'εννέα',
];
const TEENS = [
  'δέκα',
  'έντεκα',
  'δώδεκα',
  'δεκατρία',
  'δεκατέσσερα',
  'δεκαπέντε',
  'δεκαέξι',
  'δεκαεπτά',
  'δεκαοκτώ',
  'δεκαεννέα',
];
const TENS = [
  '',
  '',
  'είκοσι',
  'τριάντα',
  'σαράντα',
  'πενήντα',
  'εξήντα',
  'εβδομήντα',
  'ογδόντα',
  'ενενήντα',
];
const HUNDREDS = [
  '',
  'εκατό',
  'διακόσια',
  'τριακόσια',
  'τετρακόσια',
  'πεντακόσια',
  'εξακόσια',
  'επτακόσια',
  'οκτακόσια',
  'εννιακόσια',
];

function underThousand(n: number, feminine = false): string {
  if (n <= 0) return '';
  if (n < 10) return feminine ? ONES_FEM[n] : ONES[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    if (!o) return TENS[t];
    const one = feminine ? ONES_FEM[o] : ONES[o];
    return `${TENS[t]} ${one}`;
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let head = HUNDREDS[h];
  if (h === 1 && rest > 0) head = 'εκατόν';
  if (!rest) return head;
  return `${head} ${underThousand(rest, feminine)}`;
}

function integerToGreek(n: number): string {
  if (n === 0) return 'μηδέν';
  if (n < 1000) return underThousand(n);

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];

  if (millions === 1) parts.push('ένα εκατομμύριο');
  else if (millions > 1) parts.push(`${underThousand(millions)} εκατομμύρια`);

  if (thousands === 1) parts.push('χίλια');
  else if (thousands > 1) parts.push(`${underThousand(thousands, true)} χιλιάδες`);

  if (rest > 0) parts.push(underThousand(rest));
  return parts.join(' ');
}

function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toLocaleUpperCase('el') + trimmed.slice(1);
}

/** Δέχεται "100,00" / "100.00" / "100" και επιστρέφει ελληνικά ολογράφως. */
export function amountToGreekWords(raw: string | number): string {
  const normalized =
    typeof raw === 'number'
      ? String(raw)
      : String(raw ?? '')
          .trim()
          .replace(/\s+/g, '')
          .replace(/€/g, '')
          .replace(/\./g, '')
          .replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return '';

  const euros = Math.floor(value + 1e-9);
  const cents = Math.round((value - euros) * 100);

  const euroPart =
    euros === 0
      ? ''
      : euros === 1
        ? 'Ένα ευρώ'
        : `${capitalizeFirst(integerToGreek(euros))} ευρώ`;

  let centPart = '';
  if (cents > 0) {
    centPart =
      cents === 1
        ? 'ένα λεπτό'
        : `${underThousand(cents)} λεπτά`;
  }

  if (!euroPart && !centPart) return 'Μηδέν ευρώ';
  if (!euroPart) return capitalizeFirst(centPart);
  if (!centPart) return euroPart;
  return `${euroPart} και ${centPart}`;
}
