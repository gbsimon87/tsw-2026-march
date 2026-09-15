import { describe, expect, it } from 'vitest';

import { crc32, zipStore } from './zip';

const enc = (text) => new TextEncoder().encode(text);
const dec = (bytes) => new TextDecoder().decode(bytes);

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const EOCD = 0x06054b50;

// Reads the archive back the way a real unzip does: from the end-of-central-
// directory record, through the central directory, to each local header. A test
// that only checked the bytes it wrote would pass for a file no unzip can open.
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = bytes.length - 22;

  expect(view.getUint32(eocdOffset, true)).toBe(EOCD);
  const count = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralStart = view.getUint32(eocdOffset + 16, true);

  // The three have to agree, or unzip reports a truncated archive.
  expect(centralStart + centralSize).toBe(eocdOffset);

  const files = [];
  let offset = centralStart;
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(offset, true)).toBe(CENTRAL_HEADER);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = dec(bytes.subarray(offset + 46, offset + 46 + nameLength));

    expect(view.getUint32(localOffset, true)).toBe(LOCAL_HEADER);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataStart, dataStart + size);

    files.push({ name, data, crc, compressedSize, size });
    offset += 46 + nameLength;
  }

  return files;
}

describe('crc32', () => {
  it('matches the known CRC-32 of a reference string', () => {
    // The standard "check" vector for CRC-32/ISO-HDLC.
    expect(crc32(enc('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('zipStore', () => {
  const entries = [
    {
      name: '01-final-score.png',
      data: Uint8Array.from({ length: 300 }, (_, i) => (i * 37) % 256),
    },
    { name: 'caption-and-alt-text.txt', data: enc('FINAL: TSW Blue 70–61 Falcons\n') },
  ];

  it('round-trips every entry with its name, bytes and checksum intact', () => {
    const files = readZip(zipStore(entries));

    expect(files.map((file) => file.name)).toEqual([
      '01-final-score.png',
      'caption-and-alt-text.txt',
    ]);
    expect(files[0].data).toEqual(entries[0].data);
    expect(dec(files[1].data)).toBe('FINAL: TSW Blue 70–61 Falcons\n');
    for (const [index, file] of files.entries()) {
      expect(file.crc).toBe(crc32(entries[index].data));
    }
  });

  it('stores rather than compresses, so both sizes agree', () => {
    // The method is 0 (store); a reader that trusted a wrong compressed size
    // would read into the next local header.
    for (const file of readZip(zipStore(entries))) {
      expect(file.compressedSize).toBe(file.size);
    }
  });

  it('measures the central directory as written, not as the record advances', () => {
    // Regression: reading `offset` inline while writing the end record reported
    // a directory 12 bytes too long, which unzip "compensated for" with a
    // warning — a corrupt archive that still happened to extract.
    const bytes = zipStore(entries);
    const view = new DataView(bytes.buffer);
    const eocd = bytes.length - 22;
    expect(view.getUint32(eocd + 12, true) + view.getUint32(eocd + 16, true)).toBe(eocd);
  });

  it('keeps a non-ASCII file name readable', () => {
    const files = readZip(zipStore([{ name: 'málaga-unicaja.png', data: enc('x') }]));
    expect(files[0].name).toBe('málaga-unicaja.png');
  });

  it('writes a valid empty archive', () => {
    const bytes = zipStore([]);
    expect(bytes.length).toBe(22);
    expect(readZip(bytes)).toEqual([]);
  });

  it('clamps a pre-1980 timestamp instead of wrapping the DOS date', () => {
    // MS-DOS has no year before 1980; an unclamped 1970 would underflow the
    // five-bit year field and produce a date in the far future.
    const bytes = zipStore(entries, { date: new Date('1970-01-01T00:00:00Z') });
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(12, true) >> 9).toBe(0);
  });
});
