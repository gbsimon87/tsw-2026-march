// A minimal ZIP writer, stored (uncompressed) only.
//
// Social backlog rank 6 needs one file the operator can hand to a phone, and
// the alternative was a ~100KB dependency. Every entry a social kit contains is
// a PNG or a few hundred bytes of text: PNG is already DEFLATE-compressed
// internally, so a second pass buys close to nothing, and the store method is
// what every unzip implementation has supported since 1989.
//
// Deliberately NOT implemented: compression, encryption, ZIP64, directory
// entries, and archives over 4GB. A social kit is a handful of megabytes; if
// that ever stops being true, take the dependency rather than growing this.

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
// Version 2.0 — the minimum that understands the fields written below.
const VERSION = 20;
// Bit 11 declares the file name is UTF-8, so a player's name keeps its accents.
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP timestamps are MS-DOS FAT values: two-second resolution, and no year
// before 1980 exists at all. Anything earlier is clamped rather than wrapping
// into a nonsense date.
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function encodeName(name) {
  return new TextEncoder().encode(name);
}

/**
 * Builds a ZIP archive from `[{ name, data }]`, where `data` is a Uint8Array.
 *
 * Returns a Uint8Array. Wrapping it in a Blob is the caller's job, which keeps
 * this module pure and testable without a DOM.
 */
export function zipStore(entries, { date = new Date() } = {}) {
  const stamp = dosDateTime(date);
  const files = entries.map((entry) => {
    const name = encodeName(entry.name);
    return { name, data: entry.data, crc: crc32(entry.data) };
  });

  const localSize = files.reduce(
    (total, file) => total + 30 + file.name.length + file.data.length,
    0
  );
  const centralSize = files.reduce((total, file) => total + 46 + file.name.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let offset = 0;

  // Little-endian throughout — the format predates any ambiguity about it.
  const u16 = (value) => {
    view.setUint16(offset, value, true);
    offset += 2;
  };
  const u32 = (value) => {
    view.setUint32(offset, value, true);
    offset += 4;
  };
  const bytes = (value) => {
    output.set(value, offset);
    offset += value.length;
  };

  for (const file of files) {
    file.offset = offset;
    u32(LOCAL_HEADER);
    u16(VERSION);
    u16(FLAG_UTF8);
    u16(METHOD_STORE);
    u16(stamp.time);
    u16(stamp.date);
    u32(file.crc);
    // Stored, so the compressed and uncompressed sizes are the same number.
    u32(file.data.length);
    u32(file.data.length);
    u16(file.name.length);
    u16(0); // no extra field
    bytes(file.name);
    bytes(file.data);
  }

  const centralStart = offset;

  for (const file of files) {
    u32(CENTRAL_HEADER);
    u16(VERSION); // version made by
    u16(VERSION); // version needed to extract
    u16(FLAG_UTF8);
    u16(METHOD_STORE);
    u16(stamp.time);
    u16(stamp.date);
    u32(file.crc);
    u32(file.data.length);
    u32(file.data.length);
    u16(file.name.length);
    u16(0); // extra field length
    u16(0); // file comment length
    u16(0); // disk number start
    u16(0); // internal file attributes
    u32(0); // external file attributes
    u32(file.offset);
    bytes(file.name);
  }

  // Measured BEFORE the record is written: `offset` advances as the record's
  // own fields go in, and reading it inline reports a directory 12 bytes longer
  // than it is — which unzip repairs with a warning rather than failing.
  const writtenCentralSize = offset - centralStart;

  u32(END_OF_CENTRAL_DIRECTORY);
  u16(0); // this disk
  u16(0); // disk holding the central directory
  u16(files.length);
  u16(files.length);
  u32(writtenCentralSize);
  u32(centralStart);
  u16(0); // archive comment length

  return output;
}
