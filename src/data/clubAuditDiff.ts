import type { AppData } from '../types';

type NamedRow = { id?: string; name?: string; lastName?: string; firstName?: string; description?: string };

function rowLabel(row: NamedRow, fallback: string): string {
  const last = String(row.lastName ?? '').trim();
  const first = String(row.firstName ?? '').trim();
  if (last || first) return `${last} ${first}`.trim();
  const name = String(row.name ?? '').trim();
  if (name) return name;
  const desc = String(row.description ?? '').trim();
  if (desc) return desc.slice(0, 80);
  return fallback;
}

function asRows(value: unknown): NamedRow[] {
  return Array.isArray(value) ? (value as NamedRow[]) : [];
}

function listNames(rows: NamedRow[], kind: string, limit = 4): string {
  if (!rows.length) return '';
  const labels = rows.map((row, i) => rowLabel(row, `${kind} ${i + 1}`));
  if (labels.length <= limit) return labels.join(', ');
  return `${labels.slice(0, limit).join(', ')} και άλλες ${labels.length - limit}`;
}

function diffRows(
  before: NamedRow[],
  after: NamedRow[],
): { added: NamedRow[]; removed: NamedRow[]; updated: number } {
  const beforeMap = new Map(before.filter((r) => r.id).map((r) => [String(r.id), r]));
  const afterMap = new Map(after.filter((r) => r.id).map((r) => [String(r.id), r]));
  const added: NamedRow[] = [];
  const removed: NamedRow[] = [];
  let updated = 0;
  for (const [id, row] of afterMap) {
    const prev = beforeMap.get(id);
    if (!prev) {
      added.push(row);
      continue;
    }
    if (JSON.stringify(prev) !== JSON.stringify(row)) updated += 1;
  }
  for (const [id, row] of beforeMap) {
    if (!afterMap.has(id)) removed.push(row);
  }
  return { added, removed, updated };
}

const TRACKED: Array<{ key: keyof AppData; label: string }> = [
  { key: 'students', label: 'αθλητές' },
  { key: 'classes', label: 'τμήματα' },
  { key: 'coaches', label: 'προπονητές' },
  { key: 'staff', label: 'προσωπικό' },
  { key: 'transactions', label: 'συναλλαγές' },
  { key: 'revenues', label: 'έσοδα' },
  { key: 'expenses', label: 'έξοδα' },
  { key: 'attendance', label: 'παρουσίες' },
  { key: 'trainings', label: 'προπονήσεις' },
  { key: 'schedule', label: 'πρόγραμμα' },
  { key: 'announcements', label: 'ανακοινώσεις' },
  { key: 'matches', label: 'αγώνες' },
  { key: 'products', label: 'αποθήκη' },
  { key: 'rentalBookings', label: 'κρατήσεις' },
  { key: 'registrationApplications', label: 'αιτήσεις εγγραφής' },
  { key: 'photos', label: 'φωτογραφίες' },
  { key: 'feeChargeTemplates', label: 'πρότυπα χρεώσεων' },
  { key: 'documentProtocolEntries', label: 'πρωτόκολλο' },
  { key: 'parentLinks', label: 'συνδέσεις γονέων' },
];

/** Short Greek summary of what changed in club AppData, or null if nothing material. */
export function summarizeAppDataChange(before: AppData, after: AppData): string | null {
  const parts: string[] = [];
  for (const { key, label } of TRACKED) {
    const diff = diffRows(asRows(before[key]), asRows(after[key]));
    if (diff.added.length) {
      parts.push(`Νέο (${label}): ${listNames(diff.added, label)}`);
    }
    if (diff.removed.length) {
      parts.push(`Διαγραφή (${label}): ${listNames(diff.removed, label)}`);
    }
    if (diff.updated) {
      parts.push(`Ενημέρωση ${diff.updated} ${label}`);
    }
  }
  if (!parts.length) return null;
  return parts.join(' · ').slice(0, 500);
}
