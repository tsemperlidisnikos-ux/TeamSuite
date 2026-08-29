import type { CoachInput } from '../schemas';
import type { Coach } from '../types';
import { resolveCatalogSportName } from '../shared/sportsCatalog';
import {
  findByIdEmailOrName,
  looksLikeEmail,
  normHeader,
  parseActiveStatus,
  parseDate,
  type DirectoryImportPlan,
} from './spreadsheetCells';

type ColumnKey =
  | 'id'
  | 'lastName'
  | 'firstName'
  | 'email'
  | 'phone'
  | 'sport'
  | 'active'
  | 'ggaCode'
  | 'hireDate'
  | 'licenseLevel'
  | 'licenseDocumentName'
  | 'licenseValidFrom'
  | 'licenseValidUntil'
  | 'firstAidDocumentName'
  | 'firstAidValidFrom'
  | 'firstAidValidUntil';

const COLUMNS: Array<{ key: ColumnKey; header: string; aliases?: string[] }> = [
  { key: 'id', header: 'Κωδικός' },
  { key: 'lastName', header: 'Επώνυμο' },
  { key: 'firstName', header: 'Όνομα' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Τηλέφωνο' },
  { key: 'sport', header: 'Άθλημα' },
  { key: 'active', header: 'Κατάσταση' },
  { key: 'ggaCode', header: 'Κωδικός Γ.Γ.Α', aliases: ['Κωδικός ΓΓΑ'] },
  { key: 'hireDate', header: 'Ημ. πρόσληψης' },
  { key: 'licenseLevel', header: 'Επίπεδο άδειας' },
  { key: 'licenseDocumentName', header: 'Αρχείο άδειας' },
  { key: 'licenseValidFrom', header: 'Άδεια από' },
  { key: 'licenseValidUntil', header: 'Άδεια έως' },
  { key: 'firstAidDocumentName', header: 'Αρχείο πρώτων βοηθειών' },
  { key: 'firstAidValidFrom', header: 'Πρώτες βοήθειες από' },
  { key: 'firstAidValidUntil', header: 'Πρώτες βοήθειες έως' },
];

const HEADER_TO_KEY = new Map<string, ColumnKey>();
for (const col of COLUMNS) {
  HEADER_TO_KEY.set(normHeader(col.header), col.key);
  for (const alias of col.aliases ?? []) HEADER_TO_KEY.set(normHeader(alias), col.key);
}

const DATE_KEYS = new Set<ColumnKey>([
  'hireDate',
  'licenseValidFrom',
  'licenseValidUntil',
  'firstAidValidFrom',
  'firstAidValidUntil',
]);

function parseLicenseLevel(raw: string): CoachInput['licenseLevel'] | undefined {
  const v = raw.trim().toLocaleUpperCase('el');
  if (!v) return '';
  if (['A', 'Α'].includes(v)) return 'A';
  if (['B', 'Β'].includes(v)) return 'B';
  if (['Γ', 'G', 'C'].includes(v)) return 'Γ';
  return undefined;
}

export function coachSheetHeaders(): string[] {
  return COLUMNS.map((c) => c.header);
}

export function coachToInput(coach: Coach): CoachInput {
  return {
    firstName: coach.firstName,
    lastName: coach.lastName,
    email: coach.email,
    phone: coach.phone,
    sport: coach.sport ?? '',
    active: coach.active,
    photoUrl: coach.photoUrl ?? null,
    ggaCode: coach.ggaCode ?? '',
    hireDate: coach.hireDate ?? '',
    licenseLevel: coach.licenseLevel ?? '',
    licenseDocumentUrl: coach.licenseDocumentUrl ?? null,
    licenseDocumentName: coach.licenseDocumentName ?? null,
    licenseValidFrom: coach.licenseValidFrom ?? '',
    licenseValidUntil: coach.licenseValidUntil ?? '',
    firstAidDocumentUrl: coach.firstAidDocumentUrl ?? null,
    firstAidDocumentName: coach.firstAidDocumentName ?? null,
    firstAidValidFrom: coach.firstAidValidFrom ?? '',
    firstAidValidUntil: coach.firstAidValidUntil ?? '',
  };
}

export function coachToSheetRow(coach: Coach): string[] {
  const rec: Record<ColumnKey, string> = {
    id: coach.id,
    lastName: coach.lastName ?? '',
    firstName: coach.firstName ?? '',
    email: coach.email ?? '',
    phone: coach.phone ?? '',
    sport: coach.sport ?? '',
    active: coach.active ? 'Ενεργός' : 'Ανενεργός',
    ggaCode: coach.ggaCode ?? '',
    hireDate: coach.hireDate ?? '',
    licenseLevel: coach.licenseLevel ?? '',
    licenseDocumentName: coach.licenseDocumentName ?? '',
    licenseValidFrom: coach.licenseValidFrom ?? '',
    licenseValidUntil: coach.licenseValidUntil ?? '',
    firstAidDocumentName: coach.firstAidDocumentName ?? '',
    firstAidValidFrom: coach.firstAidValidFrom ?? '',
    firstAidValidUntil: coach.firstAidValidUntil ?? '',
  };
  return COLUMNS.map((c) => rec[c.key]);
}

function emptyCoachInput(): CoachInput {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    sport: '',
    active: true,
    photoUrl: null,
    ggaCode: '',
    hireDate: '',
    licenseLevel: '',
    licenseDocumentUrl: null,
    licenseDocumentName: null,
    licenseValidFrom: '',
    licenseValidUntil: '',
    firstAidDocumentUrl: null,
    firstAidDocumentName: null,
    firstAidValidFrom: '',
    firstAidValidUntil: '',
  };
}

export function planCoachImport(grid: string[][], coaches: Coach[]): DirectoryImportPlan<CoachInput> {
  const errors: string[] = [];
  if (grid.length < 2) return { actions: [], errors: ['Το αρχείο δεν έχει γραμμές δεδομένων.'] };

  const header = grid[0] ?? [];
  const keyByCol: Array<ColumnKey | null> = header.map((h) => HEADER_TO_KEY.get(normHeader(h)) ?? null);
  if (!keyByCol.some((k) => k === 'lastName') || !keyByCol.some((k) => k === 'firstName')) {
    return {
      actions: [],
      errors: ['Λείπουν οι στήλες Επώνυμο και Όνομα. Χρησιμοποιήστε το αρχείο εξαγωγής της εφαρμογής.'],
    };
  }

  const actions: DirectoryImportPlan<CoachInput>['actions'] = [];
  for (let i = 1; i < grid.length; i += 1) {
    const row = grid[i] ?? [];
    const rowNumber = i + 1;
    const beforeErr = errors.length;
    const cells = new Map<ColumnKey, string>();
    keyByCol.forEach((key, col) => {
      if (!key) return;
      cells.set(key, (row[col] ?? '').trim());
    });

    const lastName = cells.get('lastName') ?? '';
    const firstName = cells.get('firstName') ?? '';
    if (!lastName && !firstName) continue;

    const existing = findByIdEmailOrName(
      coaches,
      cells.get('id') ?? '',
      cells.get('email') ?? '',
      firstName,
      lastName,
      (c) => ({ firstName: c.firstName, lastName: c.lastName }),
    );
    const draft = existing ? coachToInput(existing) : emptyCoachInput();

    for (const [key, raw] of cells) {
      const value = DATE_KEYS.has(key) ? parseDate(raw) : raw.trim();
      switch (key) {
        case 'id':
          break;
        case 'lastName':
          draft.lastName = value;
          break;
        case 'firstName':
          draft.firstName = value;
          break;
        case 'email':
          draft.email = value;
          break;
        case 'phone':
          draft.phone = value;
          break;
        case 'sport':
          draft.sport = resolveCatalogSportName(value) ?? value;
          break;
        case 'active': {
          const active = parseActiveStatus(value);
          if (value && active === undefined) errors.push(`Γραμμή ${rowNumber}: άγνωστη κατάσταση «${raw}».`);
          if (active !== undefined) draft.active = active;
          break;
        }
        case 'ggaCode':
          draft.ggaCode = value;
          break;
        case 'hireDate':
          draft.hireDate = value;
          break;
        case 'licenseLevel': {
          const level = parseLicenseLevel(value);
          if (value && level === undefined) errors.push(`Γραμμή ${rowNumber}: άγνωστο επίπεδο άδειας «${raw}».`);
          if (level !== undefined) draft.licenseLevel = level;
          break;
        }
        case 'licenseDocumentName':
          draft.licenseDocumentName = value || null;
          break;
        case 'licenseValidFrom':
          draft.licenseValidFrom = value;
          break;
        case 'licenseValidUntil':
          draft.licenseValidUntil = value;
          break;
        case 'firstAidDocumentName':
          draft.firstAidDocumentName = value || null;
          break;
        case 'firstAidValidFrom':
          draft.firstAidValidFrom = value;
          break;
        case 'firstAidValidUntil':
          draft.firstAidValidUntil = value;
          break;
        default:
          break;
      }
    }

    if (draft.firstName.trim().length < 2 || draft.lastName.trim().length < 2) {
      errors.push(`Γραμμή ${rowNumber}: όνομα και επώνυμο πρέπει να έχουν τουλάχιστον 2 χαρακτήρες.`);
    }
    if (!looksLikeEmail(draft.email)) {
      errors.push(`Γραμμή ${rowNumber}: απαιτείται έγκυρο email.`);
    }
    if ((draft.phone ?? '').replace(/\D/g, '').length < 10) {
      errors.push(`Γραμμή ${rowNumber}: το τηλέφωνο πρέπει να έχει τουλάχιστον 10 ψηφία.`);
    }
    if (!draft.sport.trim()) {
      errors.push(`Γραμμή ${rowNumber}: το άθλημα είναι υποχρεωτικό.`);
    }

    if (errors.length > beforeErr) continue;
    actions.push({
      rowNumber,
      mode: existing ? 'update' : 'create',
      existingId: existing?.id,
      input: draft,
      label: `${draft.lastName} ${draft.firstName}`.trim(),
    });
  }

  return { actions, errors };
}
