// ============================================================
//  Minimal .docx (OOXML) reader — no third-party dependency.
//
//  Companion to lib/docx.ts: that module WRITES a docx (a STORE-only
//  zip of XML parts), this one READS one. A .docx produced by Word
//  DEFLATEs its parts, so the STORE-only writer cannot be reused —
//  entries are inflated with node:zlib instead.
//
//  Only what the bulk-question importer needs is implemented: read
//  the central directory and hand back entry contents by name.
//  mammoth (and any other zip parser) is deliberately not used —
//  it silently drops OMML equations and flattens table structure,
//  both fatal for a table-based question template.
//
//  Layout of a zip:
//    [ local file header | file data ] * n
//    [ central directory entry   ] * n
//    [ end of central directory  ]
//  We jump straight to the EOCD record (found by scanning backwards
//  for its signature) and walk the central directory from there,
//  which is more reliable than trusting local headers.
// ============================================================

import { inflateRawSync } from "node:zlib";

// ------------------------------------------------------------
//  Signatures & record sizes
// ------------------------------------------------------------

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;

const EOCD_MIN_SIZE = 22;
/** EOCD is followed by an optional comment of up to 65535 bytes. */
const EOCD_MAX_SEARCH = EOCD_MIN_SIZE + 0xffff;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

// ------------------------------------------------------------
//  Types
// ------------------------------------------------------------

/** Decompressed contents of one zip entry, keyed by its path. */
export type ZipContents = Record<string, Buffer>;

// ------------------------------------------------------------
//  Primitive reads
// ------------------------------------------------------------

/**
 * Normalises an archive to a Buffer. Callers hand us whatever they
 * have: a Node `Buffer` from an upload, or the `Uint8Array` our own
 * `lib/docx.ts` writer returns. Buffer extends Uint8Array, so this is
 * only a copy for the non-Buffer case.
 */
function asBuffer(input: Uint8Array): Buffer {
  return Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

/** Reads a little-endian uint16/uint32 at `at` (bounds-checked). */
function u16(buf: Buffer, at: number): number {
  if (at < 0 || at + 2 > buf.length) throw new Error(`zip: read past end at ${at}`);
  return buf.readUInt16LE(at);
}

function u32(buf: Buffer, at: number): number {
  if (at < 0 || at + 4 > buf.length) throw new Error(`zip: read past end at ${at}`);
  return buf.readUInt32LE(at);
}

// ------------------------------------------------------------
//  End of central directory
// ------------------------------------------------------------

type Eocd = {
  /** Offset of the first central directory entry. */
  centralOffset: number;
  /** How many entries the central directory holds. */
  entryCount: number;
};

/**
 * Locates the EOCD by scanning backwards for its signature. The record
 * sits at the very end unless the archive carries a comment, so a reverse
 * scan bounded by the max comment size is both correct and cheap.
 */
function findEocd(buf: Buffer): Eocd {
  const lowest = Math.max(0, buf.length - EOCD_MAX_SEARCH);
  for (let at = buf.length - EOCD_MIN_SIZE; at >= lowest; at--) {
    if (u32(buf, at) !== EOCD_SIG) continue;

    const entryCount = u16(buf, at + 10);
    const centralOffset = u32(buf, at + 16);
    return { centralOffset, entryCount };
  }
  throw new Error("Not a zip file — no end-of-central-directory record.");
}

// ------------------------------------------------------------
//  Central directory
// ------------------------------------------------------------

/** One central directory record, already resolved to absolute offsets. */
type CentralEntry = {
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  name: string;
};

/**
 * Walks the central directory. Every field is read from the record
 * itself, so an archive written by any producer (Word, Excel, our own
 * lib/docx.ts) is read the same way.
 */
function readCentralDirectory(buf: Buffer, start: number, count: number): CentralEntry[] {
  const entries: CentralEntry[] = [];
  let at = start;

  for (let i = 0; i < count; i++) {
    if (u32(buf, at) !== CENTRAL_SIG) {
      throw new Error(`Corrupt zip — expected a central directory entry at ${at}.`);
    }

    const method = u16(buf, at + 10);
    const compressedSize = u32(buf, at + 20);
    const uncompressedSize = u32(buf, at + 24);
    const nameLength = u16(buf, at + 28);
    const extraLength = u16(buf, at + 30);
    const commentLength = u16(buf, at + 32);
    const localOffset = u32(buf, at + 42);

    const nameStart = at + 46;
    entries.push({
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
      name: buf.toString("utf8", nameStart, nameStart + nameLength),
    });

    // 46 = fixed record size, then the variable-length name + extra + comment.
    at = nameStart + nameLength + extraLength + commentLength;
  }

  return entries;
}

// ------------------------------------------------------------
//  Entry data
// ------------------------------------------------------------

/**
 * Reads one entry's bytes.
 *
 * The local header repeats the name/extra lengths, and those can
 * DIFFER from the central directory's copy (that is legal and Word
 * does it), so the data offset must be computed from the local
 * header rather than assumed from the central record.
 */
function readEntryData(buf: Buffer, entry: CentralEntry): Buffer {
  const local = entry.localOffset;
  // 0x04034b50 = local file header signature.
  if (u32(buf, local) !== 0x04034b50) {
    throw new Error(`Corrupt zip — bad local header for "${entry.name}".`);
  }

  const nameLength = u16(buf, local + 26);
  const extraLength = u16(buf, local + 28);
  const dataStart = local + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;

  if (dataEnd > buf.length) {
    throw new Error(`Corrupt zip — "${entry.name}" claims data past end of file.`);
  }

  const raw = buf.subarray(dataStart, dataEnd);

  if (entry.method === METHOD_STORE) return Buffer.from(raw);
  if (entry.method === METHOD_DEFLATE) return inflateRawSync(raw);

  throw new Error(`Unsupported compression method ${entry.method} for "${entry.name}".`);
}

// ------------------------------------------------------------
//  Public API
// ------------------------------------------------------------

/**
 * Decompresses every entry of a zip into a name → Buffer map.
 * Directory records (names ending in "/") are skipped.
 *
 * @throws if the buffer is not a zip, is truncated, or uses an
 * unsupported compression method.
 */
export function readZip(input: Uint8Array): ZipContents {
  const buf = asBuffer(input);
  const { centralOffset, entryCount } = findEocd(buf);
  const entries = readCentralDirectory(buf, centralOffset, entryCount);

  const out: ZipContents = {};
  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue; // directory marker
    out[entry.name] = readEntryData(buf, entry);
  }
  return out;
}

/**
 * Reads one named entry, or null when the archive doesn't contain it.
 * `word/document.xml` is the only part the importer strictly needs, so
 * an absent entry is a normal condition rather than an error.
 */
export function readZipEntry(input: Uint8Array, name: string): Buffer | null {
  const contents = readZip(input);
  return contents[name] ?? null;
}

/** Reads a zip entry as UTF-8 text — the common case for OOXML parts. */
export function readZipText(input: Uint8Array, name: string): string | null {
  return readZipEntry(input, name)?.toString("utf8") ?? null;
}