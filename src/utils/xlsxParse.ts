import { unzipToTextMap } from './zipRead';

function colIndexFromLetters(letters: string): number {
  let n = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i += 1) {
    n = n * 26 + (upper.charCodeAt(i) - 64);
  }
  return n - 1;
}

function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!match) return null;
  return { col: colIndexFromLetters(match[1]!), row: Number(match[2]) };
}

function xmlText(node: Element | null): string {
  if (!node) return '';
  return (node.textContent ?? '').replace(/\u00a0/g, ' ');
}

function zeroPadWidthFromFormat(formatCode: string): number {
  const section = (formatCode.split(';')[0] ?? '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/"[^"]*"/g, '');
  if (!section || section.includes('@') || section.includes('/') || section.includes('.')) {
    return 0;
  }
  const zeros = section.match(/0+/g);
  if (!zeros) return 0;
  const width = zeros.reduce((max, run) => Math.max(max, run.length), 0);
  return width >= 2 ? width : 0;
}

function parseExcelZeroPadWidths(stylesXml: string): number[] {
  const doc = new DOMParser().parseFromString(stylesXml, 'application/xml');
  const custom = new Map<number, string>();
  for (const node of [...doc.getElementsByTagName('numFmt')]) {
    const id = Number(node.getAttribute('numFmtId'));
    const code = node.getAttribute('formatCode') ?? '';
    if (Number.isFinite(id) && code) custom.set(id, code);
  }
  const cellXfs = doc.getElementsByTagName('cellXfs')[0];
  const xfs = cellXfs ? [...cellXfs.getElementsByTagName('xf')] : [];
  return xfs.map((xf) => {
    const id = Number(xf.getAttribute('numFmtId') ?? '0');
    const code = custom.get(id) ?? (id === 1 ? '0' : '');
    return zeroPadWidthFromFormat(code);
  });
}

function numericCellAsText(raw: string, padWidth: number): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return trimmed;
    const digits = String(Math.trunc(Math.abs(n)));
    return padWidth > 0 ? digits.padStart(padWidth, '0') : digits;
  }
  const intPart = (trimmed.split('.')[0] ?? trimmed).replace(/^-/, '');
  if (padWidth > 0 && /^\d+$/.test(intPart)) return intPart.padStart(padWidth, '0');
  return trimmed;
}

function parseSharedStrings(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const items = [...doc.getElementsByTagName('si')];
  return items.map((si) => {
    const parts = [...si.getElementsByTagName('t')].map((t) => xmlText(t));
    return parts.join('');
  });
}

function cellValue(cell: Element, shared: string[], padWidth: number): string {
  const type = cell.getAttribute('t') ?? '';
  if (type === 'inlineStr') {
    const t = cell.getElementsByTagName('t')[0];
    return xmlText(t);
  }
  const v = xmlText(cell.getElementsByTagName('v')[0] ?? null);
  if (type === 's') {
    const index = Number(v);
    return Number.isFinite(index) ? (shared[index] ?? '') : '';
  }
  if (type === 'b') return v === '1' || v === 'true' ? 'Ναι' : 'Όχι';
  if (type === 'str') return v;
  return numericCellAsText(v, padWidth);
}

/** First worksheet as a dense grid of strings (row-major). */
export async function parseXlsxSheetGrid(buffer: ArrayBuffer): Promise<string[][]> {
  const files = await unzipToTextMap(buffer);
  const sheetEntry =
    [...files.keys()].find((name) => /^xl\/worksheets\/sheet1\.xml$/i.test(name)) ??
    [...files.keys()].find((name) => /xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  if (!sheetEntry) throw new Error('Δεν βρέθηκε φύλλο εργασίας στο Excel.');

  const sharedName = [...files.keys()].find((name) => /xl\/sharedStrings\.xml$/i.test(name));
  const shared = sharedName ? parseSharedStrings(files.get(sharedName) ?? '') : [];
  const stylesName = [...files.keys()].find((name) => /xl\/styles\.xml$/i.test(name));
  const padWidths = stylesName ? parseExcelZeroPadWidths(files.get(stylesName) ?? '') : [];

  const doc = new DOMParser().parseFromString(files.get(sheetEntry) ?? '', 'application/xml');
  const cells = [...doc.getElementsByTagName('c')];
  let maxRow = 0;
  let maxCol = 0;
  const sparse = new Map<string, string>();

  for (const cell of cells) {
    const ref = parseCellRef(cell.getAttribute('r') ?? '');
    if (!ref) continue;
    const styleIndex = Number(cell.getAttribute('s') ?? '');
    const padWidth = Number.isFinite(styleIndex) ? (padWidths[styleIndex] ?? 0) : 0;
    const value = cellValue(cell, shared, padWidth);
    sparse.set(`${ref.row}:${ref.col}`, value);
    maxRow = Math.max(maxRow, ref.row);
    maxCol = Math.max(maxCol, ref.col);
  }

  const grid: string[][] = [];
  for (let row = 1; row <= maxRow; row += 1) {
    const line: string[] = [];
    for (let col = 0; col <= maxCol; col += 1) {
      line.push(sparse.get(`${row}:${col}`) ?? '');
    }
    grid.push(line);
  }
  return grid;
}

export function parseCsvGrid(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',' || ch === ';') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (ch === '\r') continue;
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.length > 0) || rows.length === 0) rows.push(row);
  return rows;
}

export async function parseSpreadsheetGrid(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    return parseCsvGrid(await file.text());
  }
  return parseXlsxSheetGrid(await file.arrayBuffer());
}
