async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

/** Reads stored or deflated entries from a ZIP (xlsx). */
export async function unzipToTextMap(buffer: ArrayBuffer): Promise<Map<string, string>> {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8');
  const files = new Map<string, string>();
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = readU32(bytes, offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) break;

    const flags = readU16(bytes, offset + 6);
    const method = readU16(bytes, offset + 8);
    const compressedSize = readU32(bytes, offset + 18);
    const nameLen = readU16(bytes, offset + 26);
    const extraLen = readU16(bytes, offset + 28);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;

    if (flags & 0x8) {
      throw new Error('Το αρχείο Excel χρησιμοποιεί μορφή που δεν υποστηρίζεται. Αποθηκεύστε το ως CSV UTF-8 και δοκιμάστε ξανά.');
    }

    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let raw: Uint8Array;
    if (method === 0) {
      raw = compressed;
    } else if (method === 8) {
      raw = await inflateRaw(compressed);
    } else {
      throw new Error('Μη υποστηριζόμενη συμπίεση στο αρχείο Excel.');
    }

    files.set(name.replace(/\\/g, '/'), decoder.decode(raw));
    offset = dataStart + compressedSize;
  }

  return files;
}
