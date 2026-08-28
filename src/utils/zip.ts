/** Minimal ZIP (store / no compression) — create & extract text files in the browser. */

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  out[2] = (value >>> 16) & 0xff;
  out[3] = (value >>> 24) & 0xff;
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export type ZipEntry = { name: string; data: Uint8Array };

export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const checksum = crc32(data);
    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, data);

    const centralHeader = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDir = concat(centralParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  const bytes = concat([...localParts, centralDir, end]);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: 'application/zip' });
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

async function inflateRaw(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Ο browser δεν υποστηρίζει αποσυμπίεση ZIP.');
  }
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Extract ZIP entries (store + deflate). Supports data descriptors (bit 3)
 * used by some OS compress tools.
 */
export async function extractZipAsync(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = readU32(view, offset);
    if (signature !== 0x04034b50) break;

    const flags = readU16(view, offset + 6);
    const compression = readU16(view, offset + 8);
    let compressedSize = readU32(view, offset + 18);
    const nameLen = readU16(view, offset + 26);
    const extraLen = readU16(view, offset + 28);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const hasDataDescriptor = (flags & 0x8) !== 0;

    let raw: Uint8Array;
    let dataEnd: number;

    if (hasDataDescriptor && compressedSize === 0) {
      // Scan for data descriptor signature after compressed payload.
      let scan = dataStart;
      let found = -1;
      while (scan + 16 <= bytes.length) {
        const sig = readU32(view, scan);
        if (sig === 0x08074b50) {
          found = scan;
          break;
        }
        // Heuristic: next local/central header without descriptor sig (some writers omit it)
        if (sig === 0x04034b50 || sig === 0x02014b50) {
          found = scan;
          break;
        }
        scan += 1;
      }
      if (found < 0) {
        throw new Error('Αδυναμία ανάγνωσης ZIP (data descriptor).');
      }
      raw = bytes.subarray(dataStart, found);
      dataEnd = found;
      if (readU32(view, found) === 0x08074b50) {
        dataEnd = found + 16; // sig + crc + sizes
      }
    } else {
      dataEnd = dataStart + compressedSize;
      if (dataEnd > bytes.length) {
        throw new Error('Το ZIP φαίνεται κατεστραμμένο ή ημιτελές.');
      }
      raw = bytes.subarray(dataStart, dataEnd);
      if (hasDataDescriptor) {
        // Optional descriptor after data
        if (dataEnd + 16 <= bytes.length && readU32(view, dataEnd) === 0x08074b50) {
          dataEnd += 16;
        } else if (dataEnd + 12 <= bytes.length) {
          dataEnd += 12;
        }
      }
    }

    if (compression === 0) {
      entries.push({ name, data: raw });
    } else if (compression === 8) {
      entries.push({ name, data: await inflateRaw(raw) });
    } else {
      throw new Error('Το ZIP χρησιμοποιεί μη υποστηριζόμενη συμπίεση.');
    }

    offset = dataEnd;
  }

  if (entries.length === 0) {
    throw new Error('Το ZIP δεν περιέχει αρχεία ή δεν αναγνωρίζεται.');
  }

  return entries;
}

/** @deprecated Prefer extractZipAsync — sync path only supports store method. */
export function extractZip(buffer: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = readU32(view, offset);
    if (signature !== 0x04034b50) break;

    const compression = readU16(view, offset + 8);
    const compressedSize = readU32(view, offset + 18);
    const nameLen = readU16(view, offset + 26);
    const extraLen = readU16(view, offset + 28);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) break;

    if (compression === 0) {
      entries.push({ name, data: bytes.subarray(dataStart, dataEnd) });
    } else {
      throw new Error('Χρησιμοποιήστε extractZipAsync για συμπιεσμένα ZIP.');
    }

    offset = dataEnd;
  }

  if (entries.length === 0) {
    throw new Error('Το ZIP δεν περιέχει αρχεία.');
  }

  return entries;
}
