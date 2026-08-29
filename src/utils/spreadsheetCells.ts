export function normHeader(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('el');
}

export function yesNo(value: boolean | undefined): string {
  if (value == null) return '';
  return value ? 'Ναι' : 'Όχι';
}

export function parseBool(raw: string): boolean | undefined {
  const v = raw.trim().toLocaleLowerCase('el');
  if (!v) return undefined;
  if (['ναι', 'yes', 'true', '1', 'ν', 'y'].includes(v)) return true;
  if (['όχι', 'οχι', 'no', 'false', '0', 'n'].includes(v)) return false;
  return undefined;
}

export function parseActiveStatus(raw: string): boolean | undefined {
  const v = raw.trim().toLocaleLowerCase('el');
  if (!v) return undefined;
  if (['ενεργός', 'ενεργος', 'active', 'ναι', 'yes', 'true', '1'].includes(v)) return true;
  if (['ανενεργός', 'ανενεργος', 'inactive', 'όχι', 'οχι', 'no', 'false', '0'].includes(v)) {
    return false;
  }
  return parseBool(raw);
}

function excelSerialToIso(serial: number): string {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

export function parseDate(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v);
  if (dmy) {
    const day = dmy[1]!.padStart(2, '0');
    const month = dmy[2]!.padStart(2, '0');
    return `${dmy[3]}-${month}-${day}`;
  }
  const asNum = Number(v.replace(',', '.'));
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 80000) {
    return excelSerialToIso(asNum);
  }
  return v;
}

export type DirectoryImportAction<T> = {
  rowNumber: number;
  mode: 'create' | 'update';
  existingId?: string;
  input: T;
  label: string;
};

export type DirectoryImportPlan<T> = {
  actions: DirectoryImportAction<T>[];
  errors: string[];
};

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function findByIdEmailOrName<T extends { id: string; email?: string }>(
  rows: T[],
  id: string,
  email: string,
  firstName: string,
  lastName: string,
  namesOf: (row: T) => { firstName: string; lastName: string },
): T | undefined {
  if (id) {
    const byId = rows.find((row) => row.id === id);
    if (byId) return byId;
  }
  const mail = email.trim().toLowerCase();
  if (mail) {
    const matches = rows.filter((row) => (row.email || '').trim().toLowerCase() === mail);
    if (matches.length === 1) return matches[0];
  }
  const fn = firstName.trim().toLocaleLowerCase('el');
  const ln = lastName.trim().toLocaleLowerCase('el');
  if (fn && ln) {
    const matches = rows.filter((row) => {
      const names = namesOf(row);
      return (
        names.firstName.trim().toLocaleLowerCase('el') === fn &&
        names.lastName.trim().toLocaleLowerCase('el') === ln
      );
    });
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}
