import { crc32, inflateRawSync } from "node:zlib";

// A small zip reader for .docx uploads, written so that the size limit holds for the bytes that are
// really there, not for what a header claims.
//
// - Sizes and offsets come from the central directory, never from a local header (entries written
//   with a data descriptor have zeros there). Local headers are used only for their name and extra
//   lengths, to find where an entry's data starts.
// - Each entry is inflated with a hard output cap equal to what is left of the total budget, so a
//   header that lies about the unzipped size cannot make us allocate more than the cap.
// - ZIP64, multi-disk and encrypted archives are refused: an ordinary .docx never needs them.
// - buildStoredZip writes the checked entries back as a clean, uncompressed zip. Mammoth is given
//   that, never the upload, so it cannot inflate anything we did not measure.

export class ZipLimitError extends Error {
  constructor() {
    super("zip over the size or entry limit");
    this.name = "ZipLimitError";
  }
}

/** "unsupported": a valid zip feature we refuse (ZIP64, multi-disk, encrypted). "damaged": not a readable zip. */
export class ZipFormatError extends Error {
  constructor(readonly kind: "damaged" | "unsupported") {
    super(kind === "unsupported" ? "zip uses an unsupported feature" : "not a readable zip");
    this.name = "ZipFormatError";
  }
}

export type ZipLimits = { maxEntries: number; maxTotalBytes: number };
export type ZipEntry = {
  /** The name for display and tests; nameBytes is what is written back. */
  name: string;
  nameBytes: Buffer;
  /** General purpose bit 11: the name is UTF-8. */
  utf8: boolean;
  data: Buffer;
};
export type ZipEntryInput = { name: string; data: Buffer; nameBytes?: Buffer; utf8?: boolean };

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_SIZE = 22;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const CENTRAL_SIZE = 46;
const LOCAL_SIGNATURE = 0x04034b50;
const LOCAL_SIZE = 30;
const MAX_COMMENT = 0xffff;

const damaged = () => new ZipFormatError("damaged");
const unsupported = () => new ZipFormatError("unsupported");

function findEndRecord(zip: Buffer): number {
  const lowest = Math.max(0, zip.length - EOCD_SIZE - MAX_COMMENT);
  for (let at = zip.length - EOCD_SIZE; at >= lowest; at--) {
    if (zip.readUInt32LE(at) === EOCD_SIGNATURE && at + EOCD_SIZE + zip.readUInt16LE(at + 20) === zip.length) return at;
  }
  throw damaged();
}

/** The entries of a zip, inflated, or a ZipLimitError / ZipFormatError. Nothing is parsed by anyone else first. */
export function readZipEntries(input: Uint8Array, limits: ZipLimits): ZipEntry[] {
  const zip = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (zip.length < EOCD_SIZE) throw damaged();

  const end = findEndRecord(zip);
  const disk = zip.readUInt16LE(end + 4);
  const centralDisk = zip.readUInt16LE(end + 6);
  const countOnDisk = zip.readUInt16LE(end + 8);
  const count = zip.readUInt16LE(end + 10);
  const centralSize = zip.readUInt32LE(end + 12);
  const centralOffset = zip.readUInt32LE(end + 16);

  const hasZip64Locator = end >= 20 && zip.readUInt32LE(end - 20) === ZIP64_LOCATOR_SIGNATURE;
  if (disk !== 0 || centralDisk !== 0 || countOnDisk !== count) throw unsupported();
  if (hasZip64Locator || count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw unsupported();

  if (count > limits.maxEntries) throw new ZipLimitError();
  if (centralOffset + centralSize > end || count * CENTRAL_SIZE > centralSize) throw damaged();

  const entries: ZipEntry[] = [];
  let remaining = limits.maxTotalBytes;
  const ranges: [number, number][] = [];
  let at = centralOffset;
  for (let i = 0; i < count; i++) {
    if (at + CENTRAL_SIZE > end || zip.readUInt32LE(at) !== CENTRAL_SIGNATURE) throw damaged();
    const flags = zip.readUInt16LE(at + 8);
    const method = zip.readUInt16LE(at + 10);
    const compressedSize = zip.readUInt32LE(at + 20);
    const declaredSize = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const localOffset = zip.readUInt32LE(at + 42);
    const next = at + CENTRAL_SIZE + nameLength + extraLength + commentLength;
    if (next > end) throw damaged();
    const nameBytes = Buffer.from(zip.subarray(at + CENTRAL_SIZE, at + CENTRAL_SIZE + nameLength));
    at = next;

    if (flags & 0x41) throw unsupported(); // bit 0 encrypted, bit 6 strong encryption
    if (method !== 0 && method !== 8) throw unsupported();
    if (compressedSize === 0xffffffff || declaredSize === 0xffffffff || localOffset === 0xffffffff) throw unsupported();

    // The header's claim is checked first, so an honest oversize file never gets inflated at all...
    if (declaredSize > remaining) throw new ZipLimitError();

    if (localOffset + LOCAL_SIZE > centralOffset || zip.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw damaged();
    const start = localOffset + LOCAL_SIZE + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    if (start + compressedSize > centralOffset) throw damaged();
    const dataEnd = start + compressedSize;
    // No two entries may share bytes: otherwise one small stream listed a thousand times is inflated a
    // thousand times (the output budget never shrinks for an entry that inflates to nothing), and the
    // work is no longer bounded by the size of the file.
    if (ranges.some(([from, to]) => start < to && from < dataEnd)) throw damaged();
    ranges.push([start, dataEnd]);
    const packed = zip.subarray(start, dataEnd);

    // ...and then the real bytes are capped, because the claim may be a lie.
    let data: Buffer;
    if (method === 0) {
      if (packed.length > remaining) throw new ZipLimitError();
      data = Buffer.from(packed);
    } else {
      try {
        data = inflateRawSync(packed, { maxOutputLength: Math.max(remaining, 1) });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") throw new ZipLimitError();
        throw damaged();
      }
      if (data.length > remaining) throw new ZipLimitError();
    }
    remaining -= data.length;

    const utf8 = (flags & 0x800) !== 0;
    entries.push({ name: utf8 ? nameBytes.toString("utf8") : nameBytes.toString("latin1"), nameBytes, utf8, data });
  }
  return entries;
}

const u16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};

/** A clean zip with every entry stored uncompressed: same names (exact bytes), order and data. */
export function buildStoredZip(entries: ZipEntryInput[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = entry.nameBytes ?? Buffer.from(entry.name, "utf8");
    const flags = (entry.utf8 ?? entry.nameBytes === undefined) ? 0x800 : 0;
    const crc = crc32(entry.data);
    const fields = [u16(flags), u16(0), u16(0), u16(0), u32(crc), u32(entry.data.length), u32(entry.data.length)];
    const header = Buffer.concat([u32(LOCAL_SIGNATURE), u16(20), ...fields, u16(nameBytes.length), u16(0), nameBytes]);
    local.push(header, entry.data);
    central.push(
      Buffer.concat([u32(CENTRAL_SIGNATURE), u16(20), u16(20), ...fields, u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]),
    );
    offset += header.length + entry.data.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.concat([u32(EOCD_SIGNATURE), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBytes.length), u32(offset), u16(0)]);
  return Buffer.concat([...local, centralBytes, end]);
}
