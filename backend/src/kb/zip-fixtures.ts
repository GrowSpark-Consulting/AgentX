import { crc32, deflateRawSync } from "node:zlib";

// Test helper: builds zip files by hand, including dishonest ones (a header that lies about the
// unzipped size, a wrong entry count) and ones written the way Word and Google Docs write them
// (data descriptors, UTF-8 name flag). Not imported by production code.

export type FixtureEntry = {
  name: string;
  data: Buffer | string;
  method?: "store" | "deflate";
  /** What the headers claim the unzipped size is; the real size is data.length. */
  declaredSize?: number;
  encrypted?: boolean;
  /** Overrides the compression method number in the headers (for example 99). */
  rawMethod?: number;
  /** General purpose bit 3: the local header has zero sizes and a descriptor follows the data. */
  dataDescriptor?: boolean;
  /** General purpose bit 11: the name is UTF-8. */
  utf8Name?: boolean;
  /** The name's exact bytes, when they should differ from name encoded as UTF-8. */
  nameBytes?: Buffer;
  /** A ready-made raw deflate stream to store as is (data is then only what the headers claim). */
  packed?: Buffer;
};

export type FixtureOptions = {
  declaredEntryCount?: number;
  /** Adds a ZIP64 end-of-central-directory locator before the end record. */
  zip64Locator?: boolean;
  /** Sets the disk number in the end record (a multi-disk archive). */
  disk?: number;
  /** Sets the entry counts in the end record to the ZIP64 marker 0xFFFF. */
  zip64Marker?: boolean;
  /** Every central record points at the first entry's data (one stream, listed many times). */
  shareFirstOffset?: boolean;
};

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

export function makeZip(entries: FixtureEntry[], options: FixtureOptions = {}): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const raw = Buffer.from(entry.data);
    const method = entry.method ?? "deflate";
    const stored = entry.packed ?? (method === "deflate" ? deflateRawSync(raw) : raw);
    const methodNumber = entry.rawMethod ?? (method === "deflate" ? 8 : 0);
    const flags = (entry.encrypted ? 1 : 0) | (entry.dataDescriptor ? 8 : 0) | (entry.utf8Name ? 0x800 : 0);
    const name = entry.nameBytes ?? Buffer.from(entry.name);
    const crc = crc32(raw);
    const usize = entry.declaredSize ?? raw.length;
    const localSizes = entry.dataDescriptor ? [u32(0), u32(0), u32(0)] : [u32(crc), u32(stored.length), u32(usize)];
    const header = Buffer.concat([u32(0x04034b50), u16(20), u16(flags), u16(methodNumber), u16(0), u16(0), ...localSizes, u16(name.length), u16(0), name]);
    const descriptor = entry.dataDescriptor ? Buffer.concat([u32(0x08074b50), u32(crc), u32(stored.length), u32(usize)]) : Buffer.alloc(0);
    local.push(header, stored, descriptor);
    central.push(
      Buffer.concat([
        u32(0x02014b50), u16(20), u16(20), u16(flags), u16(methodNumber), u16(0), u16(0),
        u32(crc), u32(stored.length), u32(usize),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(options.shareFirstOffset ? 0 : offset), name,
      ]),
    );
    offset += header.length + stored.length + descriptor.length;
  }
  const centralBytes = Buffer.concat(central);
  const count = options.zip64Marker ? 0xffff : (options.declaredEntryCount ?? entries.length);
  const locator = options.zip64Locator ? Buffer.concat([u32(0x07064b50), u32(0), u32(0), u32(0), u32(1)]) : Buffer.alloc(0);
  const disk = options.disk ?? 0;
  const end = Buffer.concat([u32(0x06054b50), u16(disk), u16(disk), u16(count), u16(count), u32(centralBytes.length), u32(offset), u16(0)]);
  return Buffer.concat([...local, centralBytes, locator, end]);
}
