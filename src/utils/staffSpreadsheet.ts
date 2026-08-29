import { staffNameParts, type StaffInput } from '../api/services/staffService';
import type { StaffMember } from '../types';
import {
  findByIdEmailOrName,
  looksLikeEmail,
  normHeader,
  parseActiveStatus,
  type DirectoryImportPlan,
} from './spreadsheetCells';

const roleLabels: Record<StaffMember['role'], string> = {
  admin: 'Διαχειριστής',
  coach: 'Προπονητής',
  secretariat: 'Γραμματεία',
  employee: 'Υπάλληλος',
};

type ColumnKey = 'id' | 'lastName' | 'firstName' | 'email' | 'phone' | 'role' | 'active' | 'teamLabel' | 'hireDate';

const COLUMNS: Array<{ key: ColumnKey; header: string; aliases?: string[] }> = [
  { key: 'id', header: 'Κωδικός' },
  { key: 'lastName', header: 'Επώνυμο' },
  { key: 'firstName', header: 'Όνομα' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Τηλέφωνο' },
  { key: 'role', header: 'Ρόλος' },
  { key: 'active', header: 'Κατάσταση' },
  { key: 'teamLabel', header: 'Ομάδα / τομέας' },
  { key: 'hireDate', header: 'Ημ. πρόσληψης' },
];

const HEADER_TO_KEY = new Map<string, ColumnKey>();
for (const col of COLUMNS) {
  HEADER_TO_KEY.set(normHeader(col.header), col.key);
  for (const alias of col.aliases ?? []) HEADER_TO_KEY.set(normHeader(alias), col.key);
}

function parseRole(raw: string): StaffMember['role'] | undefined {
  const v = raw.trim().toLocaleLowerCase('el');
  if (!v) return undefined;
  if (['διαχειριστής', 'διαχειριστης', 'admin'].includes(v)) return 'admin';
  if (['προπονητής', 'προπονητης', 'coach'].includes(v)) return 'coach';
  if (['γραμματεία', 'γραμματεια', 'secretariat'].includes(v)) return 'secretariat';
  if (['υπάλληλος', 'υπαλληλος', 'employee'].includes(v)) return 'employee';
  return undefined;
}

export function staffSheetHeaders(): string[] {
  return COLUMNS.map((c) => c.header);
}

export function staffMemberToInput(member: StaffMember): StaffInput {
  const names = staffNameParts(member);
  return {
    lastName: names.lastName,
    firstName: names.firstName,
    email: member.email,
    phone: member.phone,
    role: member.role,
    active: member.active,
    teamLabel: member.teamLabel ?? '',
    photoUrl: member.photoUrl ?? null,
  };
}

export function staffToSheetRow(member: StaffMember): string[] {
  const names = staffNameParts(member);
  const rec: Record<ColumnKey, string> = {
    id: member.id,
    lastName: names.lastName,
    firstName: names.firstName,
    email: member.email ?? '',
    phone: member.phone ?? '',
    role: roleLabels[member.role],
    active: member.active ? 'Ενεργός' : 'Ανενεργός',
    teamLabel: member.teamLabel ?? '',
    hireDate: member.hireDate ?? '',
  };
  return COLUMNS.map((c) => rec[c.key]);
}

function emptyStaffInput(): StaffInput {
  return {
    lastName: '',
    firstName: '',
    email: '',
    phone: '',
    role: 'employee',
    active: true,
    teamLabel: '',
    photoUrl: null,
  };
}

export function planStaffImport(
  grid: string[][],
  staff: StaffMember[],
): DirectoryImportPlan<StaffInput> {
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

  const actions: DirectoryImportPlan<StaffInput>['actions'] = [];
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
      staff,
      cells.get('id') ?? '',
      cells.get('email') ?? '',
      firstName,
      lastName,
      (m) => staffNameParts(m),
    );
    const draft = existing ? staffMemberToInput(existing) : emptyStaffInput();

    for (const [key, raw] of cells) {
      const value = raw.trim();
      switch (key) {
        case 'id':
        case 'hireDate':
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
        case 'role': {
          const role = parseRole(value);
          if (value && !role) errors.push(`Γραμμή ${rowNumber}: άγνωστος ρόλος «${raw}».`);
          if (role) draft.role = role;
          break;
        }
        case 'active': {
          const active = parseActiveStatus(value);
          if (value && active === undefined) errors.push(`Γραμμή ${rowNumber}: άγνωστη κατάσταση «${raw}».`);
          if (active !== undefined) draft.active = active;
          break;
        }
        case 'teamLabel':
          draft.teamLabel = value;
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
    if (draft.role === 'coach' && !existing) {
      errors.push(
        `Γραμμή ${rowNumber}: νέο μέλος δεν μπορεί να έχει ρόλο Προπονητής. Χρησιμοποιήστε τη σελίδα Προπονητές.`,
      );
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
