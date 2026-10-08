import { describe, expect, it } from "vitest";
import { buildStoredZip, readZipEntries, ZipFormatError, ZipLimitError } from "./zip";
import { makeZip } from "./zip-fixtures";

const limits = { maxEntries: 10, maxTotalBytes: 1000 };
const asText = (entries: { name: string; data: Buffer }[]) => entries.map((e) => [e.name, e.data.toString()]);

describe("readZipEntries", () => {
  it("reads stored and deflated entries", () => {
    const zip = makeZip([
      { name: "a.txt", data: "hello", method: "store" },
      { name: "b.xml", data: "<x>world</x>", method: "deflate" },
    ]);
    expect(asText(readZipEntries(zip, limits))).toEqual([
      ["a.txt", "hello"],
      ["b.xml", "<x>world</x>"],
    ]);
  });

  it("allows exactly the byte cap and refuses one byte more", () => {
    expect(() => readZipEntries(makeZip([{ name: "a", data: "x".repeat(1000) }]), limits)).not.toThrow();
    expect(() => readZipEntries(makeZip([{ name: "a", data: "x".repeat(1001) }]), limits)).toThrow(ZipLimitError);
  });

  it("counts every entry together, not each one alone", () => {
    const zip = makeZip([
      { name: "a", data: "x".repeat(600) },
      { name: "b", data: "y".repeat(600) },
    ]);
    expect(() => readZipEntries(zip, limits)).toThrow(ZipLimitError);
  });

  it("refuses more entries than the cap", () => {
    const entries = Array.from({ length: 11 }, (_, i) => ({ name: `f${i}`, data: "x" }));
    expect(() => readZipEntries(makeZip(entries), limits)).toThrow(ZipLimitError);
    expect(() => readZipEntries(makeZip(entries.slice(0, 10)), limits)).not.toThrow();
  });

  it("refuses an entry whose honest header already declares too much", () => {
    const zip = makeZip([{ name: "a", data: Buffer.alloc(5000) }]);
    expect(() => readZipEntries(zip, limits)).toThrow(ZipLimitError);
  });

  it("refuses a lying header: declares 10 bytes, inflates to 50 MB", () => {
    const zip = makeZip([{ name: "word/document.xml", data: Buffer.alloc(50 * 1024 * 1024), declaredSize: 10 }]);
    expect(zip.length).toBeLessThan(200_000); // a small file on the wire
    expect(() => readZipEntries(zip, limits)).toThrow(ZipLimitError);
  });

  it("refuses a lying header on a stored entry too", () => {
    const zip = makeZip([{ name: "a", data: "x".repeat(2000), method: "store", declaredSize: 5 }]);
    expect(() => readZipEntries(zip, limits)).toThrow(ZipLimitError);
  });

  it("refuses an entry count that the file cannot hold, without looping on it", () => {
    const zip = makeZip([{ name: "a", data: "x" }], { declaredEntryCount: 65535 });
    expect(() => readZipEntries(zip, { maxEntries: 100_000, maxTotalBytes: 1000 })).toThrow(ZipFormatError);
  });

  it("refuses encrypted entries and unknown compression methods", () => {
    expect(() => readZipEntries(makeZip([{ name: "a", data: "x", encrypted: true }]), limits)).toThrow(ZipFormatError);
    expect(() => readZipEntries(makeZip([{ name: "a", data: "x", rawMethod: 99 }]), limits)).toThrow(ZipFormatError);
  });

  it("refuses garbage and truncated files", () => {
    expect(() => readZipEntries(Buffer.from("PK\x03\x04 and then nothing useful"), limits)).toThrow(ZipFormatError);
    const zip = makeZip([{ name: "a", data: "hello there" }]);
    expect(() => readZipEntries(zip.subarray(0, zip.length - 10), limits)).toThrow(ZipFormatError);
    expect(() => readZipEntries(new Uint8Array(), limits)).toThrow(ZipFormatError);
  });
});

describe("input-heavy files", () => {
  it("refuses central records that point at the same data, so one small stream can't be inflated a thousand times", () => {
    const zip = makeZip(Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, data: "x".repeat(100) })), { shareFirstOffset: true });
    expect(() => readZipEntries(zip, limits)).toThrow(ZipFormatError);
  });

  it("refuses a record that points into the middle of another entry's data", () => {
    const zip = Buffer.from(makeZip([{ name: "a", data: "x".repeat(300), method: "store" }, { name: "b", data: "y".repeat(300), method: "store" }]));
    // Move b's central record to a point inside a's data.
    const centralStart = zip.readUInt32LE(zip.length - 22 + 16);
    const second = centralStart + 46 + 1; // after the first record (name "a" is 1 byte)
    zip.writeUInt32LE(100, second + 42);
    expect(() => readZipEntries(zip, { maxEntries: 10, maxTotalBytes: 100_000 })).toThrow(ZipFormatError);
  });

  it("handles a stream of a million empty deflate blocks quickly: input is bounded by the file, not repeated", () => {
    const empty = Buffer.from([0x00, 0x00, 0x00, 0xff, 0xff]);
    const packed = Buffer.concat([...Array.from({ length: 400_000 }, () => empty), Buffer.from([0x01, 0x00, 0x00, 0xff, 0xff])]);
    const zip = makeZip([{ name: "a", data: "", packed }]);
    const started = Date.now();
    expect(readZipEntries(zip, { maxEntries: 1000, maxTotalBytes: 20 * 1024 * 1024 })[0].data).toHaveLength(0);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("data descriptors (how Word, Google Docs and many libraries write zips)", () => {
  it("reads entries whose local header has zero sizes, taking sizes from the central directory", () => {
    const zip = makeZip([
      { name: "a.xml", data: "<a>".repeat(100), dataDescriptor: true },
      { name: "b.xml", data: "second entry", dataDescriptor: true, method: "store" },
      { name: "c.xml", data: "third, no descriptor" },
    ]);
    expect(asText(readZipEntries(zip, { maxEntries: 10, maxTotalBytes: 10_000 }))).toEqual([
      ["a.xml", "<a>".repeat(100)],
      ["b.xml", "second entry"],
      ["c.xml", "third, no descriptor"],
    ]);
  });

  it("still enforces the byte cap on an entry with a descriptor and a lying size", () => {
    const zip = makeZip([{ name: "a", data: Buffer.alloc(50_000), dataDescriptor: true, declaredSize: 4 }]);
    expect(() => readZipEntries(zip, limits)).toThrow(ZipLimitError);
  });
});

describe("zip features a normal .docx never needs", () => {
  it("refuses ZIP64 archives, saying so", () => {
    const entry = [{ name: "a", data: "x" }];
    for (const zip of [makeZip(entry, { zip64Locator: true }), makeZip(entry, { zip64Marker: true })]) {
      const error = (() => {
        try {
          readZipEntries(zip, limits);
        } catch (e) {
          return e;
        }
      })();
      expect(error).toBeInstanceOf(ZipFormatError);
      expect((error as ZipFormatError).kind).toBe("unsupported");
    }
  });

  it("refuses multi-disk archives, saying so", () => {
    const error = (() => {
      try {
        readZipEntries(makeZip([{ name: "a", data: "x" }], { disk: 1 }), limits);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ZipFormatError);
    expect((error as ZipFormatError).kind).toBe("unsupported");
  });

  it("calls a damaged file damaged, not unsupported", () => {
    const error = (() => {
      try {
        readZipEntries(Buffer.from("PK\x03\x04 junk"), limits);
      } catch (e) {
        return e;
      }
    })();
    expect((error as ZipFormatError).kind).toBe("damaged");
  });
});

describe("rebuilding keeps every name exactly", () => {
  const roundTrip = (zip: Buffer) => {
    const before = readZipEntries(zip, { maxEntries: 50, maxTotalBytes: 100_000 });
    const after = readZipEntries(buildStoredZip(before), { maxEntries: 50, maxTotalBytes: 100_000 });
    return { before, after };
  };

  it("keeps names, order, directory entries, empty files and duplicate names as they were", () => {
    const { before, after } = roundTrip(
      makeZip([
        { name: "[Content_Types].xml", data: "<Types/>" },
        { name: "_rels/", data: "", method: "store" },
        { name: "_rels/.rels", data: "<Relationships/>" },
        { name: "word/", data: "", method: "store" },
        { name: "word/document.xml", data: "<w:document/>" },
        { name: "word/empty.xml", data: "" },
        { name: "word/document.xml", data: "<w:document>second</w:document>" },
      ]),
    );
    expect(after.map((e) => e.name)).toEqual(before.map((e) => e.name));
    expect(after.map((e) => e.data.toString())).toEqual(before.map((e) => e.data.toString()));
    expect(after).toHaveLength(7);
  });

  it("keeps the name's exact bytes and the UTF-8 flag, for UTF-8 and for legacy-encoded names", () => {
    const { before, after } = roundTrip(
      makeZip([
        { name: "word/வணக்கம்.xml", data: "<a/>", utf8Name: true },
        { name: "word/café.xml", data: "<b/>", nameBytes: Buffer.from([0x77, 0x6f, 0x72, 0x64, 0x2f, 0x63, 0x61, 0x66, 0x82]), utf8Name: false },
      ]),
    );
    expect(after.map((e) => e.nameBytes.toString("hex"))).toEqual(before.map((e) => e.nameBytes.toString("hex")));
    expect(after.map((e) => e.utf8)).toEqual([true, false]);
    expect(before[0].name).toBe("word/வணக்கம்.xml");
  });
});

describe("buildStoredZip", () => {
  it("writes a zip that reads back to the same entries, uncompressed", () => {
    const entries = [
      { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
      { name: "word/document.xml", data: Buffer.from("வணக்கம் <w:t>hi</w:t>") },
    ];
    const zip = buildStoredZip(entries);
    expect([...zip.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(asText(readZipEntries(zip, limits))).toEqual(asText(entries));
  });
});
