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

function parseSharedStrings(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const items = [...doc.getElementsByTagName('si')];
  return items.map((si) => {
    const parts = [...si.getElementsByTagName('t')].map((t) => xmlText(t));
    return parts.join('');
  });
}

function cellValue(cell: Element, shared: string[]): string {
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
  return v;
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

  const doc = new DOMParser().parseFromString(files.get(sheetEntry) ?? '', 'application/xml');
  const cells = [...doc.getElementsByTagName('c')];
  let maxRow = 0;
  let maxCol = 0;
  const sparse = new Map<string, string>();

  for (const cell of cells) {
    const ref = parseCellRef(cell.getAttribute('r') ?? '');
    if (!ref) continue;
    const value = cellValue(cell, shared);
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
