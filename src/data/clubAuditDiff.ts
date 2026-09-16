import type { AppData } from '../types';

type NamedRow = { id?: string; name?: string; lastName?: string; firstName?: string; description?: string };
export type UndoableAuditCollection =
  | 'attendance'
  | 'trainings'
  | 'schedule'
  | 'announcements'
  | 'matches'
  | 'products'
  | 'stockMovements'
  | 'feeChargeTemplates';

export type ClubAuditChange = {
  collection: UndoableAuditCollection;
  entityId: string;
  before: NamedRow | null;
  after: NamedRow | null;
};

export type AppDataAudit = {
  summary: string;
  undoable: boolean;
  undoReason: string | null;
  changes: ClubAuditChange[];
};

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
): {
  added: NamedRow[];
  removed: NamedRow[];
  updated: Array<{ before: NamedRow; after: NamedRow }>;
} {
  const beforeMap = new Map(before.filter((r) => r.id).map((r) => [String(r.id), r]));
  const afterMap = new Map(after.filter((r) => r.id).map((r) => [String(r.id), r]));
  const added: NamedRow[] = [];
  const removed: NamedRow[] = [];
  const updated: Array<{ before: NamedRow; after: NamedRow }> = [];
  for (const [id, row] of afterMap) {
    const prev = beforeMap.get(id);
    if (!prev) {
      added.push(row);
      continue;
    }
    if (JSON.stringify(prev) !== JSON.stringify(row)) updated.push({ before: prev, after: row });
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
  { key: 'cashAccounts', label: 'ταμεία' },
  { key: 'attendance', label: 'παρουσίες' },
  { key: 'trainings', label: 'προπονήσεις' },
  { key: 'schedule', label: 'πρόγραμμα' },
  { key: 'announcements', label: 'ανακοινώσεις' },
  { key: 'matches', label: 'αγώνες' },
  { key: 'products', label: 'αποθήκη' },
  { key: 'stockMovements', label: 'κινήσεις αποθήκης' },
  { key: 'rentalBookings', label: 'κρατήσεις' },
  { key: 'registrationApplications', label: 'αιτήσεις εγγραφής' },
  { key: 'photos', label: 'φωτογραφίες' },
  { key: 'feeChargeTemplates', label: 'πρότυπα χρεώσεων' },
  { key: 'documentProtocolEntries', label: 'πρωτόκολλο' },
  { key: 'parentLinks', label: 'συνδέσεις γονέων' },
  { key: 'associations', label: 'σωματεία' },
  { key: 'facilities', label: 'εγκαταστάσεις' },
  { key: 'sports', label: 'αθλήματα' },
  { key: 'clubSeasons', label: 'σεζόν' },
  { key: 'budgets', label: 'προϋπολογισμός' },
  { key: 'partnerBusinesses', label: 'συνεργαζόμενες επιχειρήσεις' },
  { key: 'partnerOffers', label: 'προσφορές συνεργατών' },
  { key: 'progressReports', label: 'αναφορές προόδου' },
  { key: 'receiptNumberRanges', label: 'μπλοκ αποδείξεων' },
  { key: 'receiptIssues', label: 'αποδείξεις' },
  { key: 'onlineCheckouts', label: 'online πληρωμές' },
];

const UNDOABLE = new Set<keyof AppData>([
  'attendance',
  'trainings',
  'schedule',
  'announcements',
  'matches',
  'products',
  'stockMovements',
  'feeChargeTemplates',
]);

const OTHER_TRACKED: Array<{ key: keyof AppData; label: string }> = [
  { key: 'sizeChart', label: 'μεγεθολόγιο' },
  { key: 'clothingPackages', label: 'πακέτα ρουχισμού' },
  { key: 'discountReasons', label: 'λόγοι έκπτωσης' },
  { key: 'feeReminderLogs', label: 'υπενθυμίσεις οφειλών' },
  { key: 'athleteChangeLogs', label: 'ιστορικό αθλητών' },
  { key: 'amkaAccessLogs', label: 'ιστορικό πρόσβασης ΑΜΚΑ' },
  { key: 'gdprAuditLogs', label: 'ιστορικό GDPR' },
  { key: 'emailUnsubscribes', label: 'διαγραφές από επικοινωνίες' },
  { key: 'termsOfUseHtml', label: 'όροι χρήσης' },
  { key: 'dpaHtml', label: 'σύμβαση DPA' },
  { key: 'retentionPolicyHtml', label: 'πολιτική διατήρησης' },
  { key: 'dataRetentionMonths', label: 'χρόνος διατήρησης δεδομένων' },
  { key: 'receiptNextBySeries', label: 'μετρητής αποδείξεων' },
  { key: 'closedFinanceMonths', label: 'κλείσιμο οικονομικού μήνα' },
  { key: 'rentalSettings', label: 'ρυθμίσεις ενοικιάσεων' },
];

/** Detailed audit event for a club mutation. Undo data is retained only for safe collections. */
export function buildAppDataAudit(before: AppData, after: AppData): AppDataAudit | null {
  const parts: string[] = [];
  const changes: ClubAuditChange[] = [];
  let containsUnsafeChange = false;
  for (const { key, label } of TRACKED) {
    const diff = diffRows(asRows(before[key]), asRows(after[key]));
    const changed = diff.added.length > 0 || diff.removed.length > 0 || diff.updated.length > 0;
    if (changed && !UNDOABLE.has(key)) containsUnsafeChange = true;
    if (diff.added.length) {
      parts.push(`Νέο (${label}): ${listNames(diff.added, label)}`);
    }
    if (diff.removed.length) {
      parts.push(`Διαγραφή (${label}): ${listNames(diff.removed, label)}`);
    }
    if (diff.updated.length) {
      parts.push(`Ενημέρωση ${diff.updated.length} ${label}`);
    }
    if (changed && UNDOABLE.has(key)) {
      const collection = key as UndoableAuditCollection;
      for (const row of diff.added) {
        if (row.id) changes.push({ collection, entityId: String(row.id), before: null, after: row });
      }
      for (const row of diff.removed) {
        if (row.id) changes.push({ collection, entityId: String(row.id), before: row, after: null });
      }
      for (const row of diff.updated) {
        if (row.before.id) {
          changes.push({
            collection,
            entityId: String(row.before.id),
            before: row.before,
            after: row.after,
          });
        }
      }
    }
  }
  for (const { key, label } of OTHER_TRACKED) {
    if (JSON.stringify(before[key] ?? null) === JSON.stringify(after[key] ?? null)) continue;
    parts.push(`Αλλαγή (${label})`);
    containsUnsafeChange = true;
  }
  if (!parts.length) return null;
  const tooLarge = changes.length > 50 || JSON.stringify(changes).length > 120_000;
  const undoable = !containsUnsafeChange && changes.length > 0 && !tooLarge;
  return {
    summary: parts.join(' · ').slice(0, 500),
    undoable,
    undoReason: undoable
      ? null
      : containsUnsafeChange
        ? 'Η κίνηση περιλαμβάνει δεδομένα που απαιτούν ειδική ακύρωση ή έλεγχο.'
        : tooLarge
          ? 'Η μαζική αλλαγή είναι πολύ μεγάλη για ασφαλή αυτόματη αναίρεση.'
          : 'Δεν υπάρχουν ασφαλή δεδομένα αναίρεσης.',
    changes: undoable ? changes : [],
  };
}

/** Short Greek summary kept for callers that only need display text. */
export function summarizeAppDataChange(before: AppData, after: AppData): string | null {
  return buildAppDataAudit(before, after)?.summary ?? null;
}
