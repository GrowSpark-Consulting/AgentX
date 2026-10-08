import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readZipEntries } from "./zip";
import { makeZip } from "./zip-fixtures";

const pdfText = vi.fn();
const docxText = vi.fn();
const destroy = vi.fn();
const getDocumentProxy = vi.fn();
vi.mock("unpdf", () => ({ extractText: pdfText, getDocumentProxy }));
vi.mock("mammoth", () => ({ default: { extractRawText: docxText }, extractRawText: docxText }));

const { extractText, fileKind, ALLOWED_EXTENSIONS, MAX_PDF_PAGES, MAX_DOCX_ENTRIES, MAX_DOCX_UNZIPPED_BYTES, MAX_TEXT_CHARS, EXTRACT_TIMEOUT_MS } = await import("./extract");

const bytes = (text: string) => new TextEncoder().encode(text);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const DOCX = makeZip([{ name: "word/document.xml", data: "<w:document/>" }]);

const fileError = { code: "validation_failed", fields: { file: expect.any(String) } };

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  pdfText.mockReset();
  docxText.mockReset();
  destroy.mockReset();
  getDocumentProxy.mockReset();
  getDocumentProxy.mockImplementation(async () => ({ numPages: 2, loadingTask: { destroy } }));
});

describe("fileKind", () => {
  it("allows exactly pdf, docx, txt and md, by extension in any case", () => {
    expect([...ALLOWED_EXTENSIONS].sort()).toEqual(["docx", "md", "pdf", "txt"]);
    expect(fileKind("Price List.PDF")).toBe("pdf");
    expect(fileKind("notes.md")).toBe("md");
  });

  it("rejects other types and names with no extension", () => {
    for (const name of ["a.doc", "a.exe", "a.png", "a.pdf.exe", "README", ".pdf", ""]) expect(fileKind(name)).toBeNull();
  });
});

describe("extractText", () => {
  it("reads txt and md as UTF-8, Tamil included, and drops a BOM", async () => {
    const text = await extractText({ name: "faq.txt", bytes: new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("வணக்கம்\nOpen at 9")]) });
    expect(text).toBe("வணக்கம்\nOpen at 9");
    await expect(extractText({ name: "faq.md", bytes: bytes("# Hours\nOpen at 9") })).resolves.toBe("# Hours\nOpen at 9");
  });

  it("normalises line endings and trims", async () => {
    await expect(extractText({ name: "a.txt", bytes: bytes("\r\n one\r\ntwo \r\n\r\n") })).resolves.toBe("one\ntwo");
  });

  it("rejects an unsupported type with fields.file", async () => {
    await expect(extractText({ name: "photo.png", bytes: bytes("x") })).rejects.toMatchObject(fileError);
  });

  it("rejects a text file that is really binary", async () => {
    await expect(extractText({ name: "a.txt", bytes: new Uint8Array([0x61, 0x00, 0x62, 0x00]) })).rejects.toMatchObject(fileError);
  });

  it("rejects text that isn't valid UTF-8 instead of decoding it to garbage", async () => {
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in Latin-1
    await expect(extractText({ name: "menu.txt", bytes: latin1 })).rejects.toMatchObject(fileError);
    await expect(extractText({ name: "menu.md", bytes: new Uint8Array([0xff, 0xfe, 0x41]) })).rejects.toMatchObject(fileError);
  });

  it("rejects a text file with no text in it", async () => {
    await expect(extractText({ name: "a.txt", bytes: bytes("  \n ") })).rejects.toMatchObject(fileError);
  });

  it("checks the file's own bytes, not just its name", async () => {
    await expect(extractText({ name: "a.pdf", bytes: bytes("not a pdf") })).rejects.toMatchObject(fileError);
    await expect(extractText({ name: "a.docx", bytes: bytes("not a zip") })).rejects.toMatchObject(fileError);
    expect(pdfText).not.toHaveBeenCalled();
    expect(docxText).not.toHaveBeenCalled();
    expect(getDocumentProxy).not.toHaveBeenCalled();
  });

  it("refuses a file over 5 MB before any parser or decoder runs", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PDF);
    await expect(extractText({ name: "big.pdf", bytes: big })).rejects.toMatchObject(fileError);
    await expect(extractText({ name: "big.txt", bytes: big })).rejects.toMatchObject(fileError);
    expect(getDocumentProxy).not.toHaveBeenCalled();
    const fine = new Uint8Array(1_000_000).fill(0x61);
    await expect(extractText({ name: "ok.txt", bytes: fine })).resolves.toHaveLength(1_000_000);
  });

  describe("work limits", () => {
    it("gives a parser 30 seconds, then refuses the file instead of hanging the request", async () => {
      expect(EXTRACT_TIMEOUT_MS).toBe(30_000);
      vi.useFakeTimers();
      pdfText.mockReturnValue(new Promise(() => {}));
      const caught = extractText({ name: "stuck.pdf", bytes: PDF }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(EXTRACT_TIMEOUT_MS);
      const error = await caught;
      expect(error).toMatchObject(fileError);
      expect((error as { fields: { file: string } }).fields.file).toMatch(/too long/i);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("times out a docx parser the same way", async () => {
      vi.useFakeTimers();
      docxText.mockReturnValue(new Promise(() => {}));
      const caught = extractText({ name: "stuck.docx", bytes: DOCX }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(EXTRACT_TIMEOUT_MS);
      expect(await caught).toMatchObject(fileError);
    });

    it("caps the text a file may yield at 1,000,000 characters, before cleaning it", async () => {
      expect(MAX_TEXT_CHARS).toBe(1_000_000);
      pdfText.mockResolvedValue({ totalPages: 1, text: "a".repeat(MAX_TEXT_CHARS + 1) });
      const error = await extractText({ name: "huge.pdf", bytes: PDF }).catch((e: unknown) => e);
      expect(error).toMatchObject(fileError);
      expect((error as { fields: { file: string } }).fields.file).toMatch(/too (long|much)/i);
      pdfText.mockResolvedValue({ totalPages: 1, text: "a".repeat(MAX_TEXT_CHARS) });
      await expect(extractText({ name: "ok.pdf", bytes: PDF })).resolves.toHaveLength(MAX_TEXT_CHARS);
    });
  });

  describe("cleaning", () => {
    it("removes NUL and other control characters but keeps newlines and tabs", async () => {
      pdfText.mockResolvedValue({ totalPages: 1, text: "a\u0000b\u0001c\td\ne\u007ff\u0085g\u009fh\u001bi" });
      await expect(extractText({ name: "a.pdf", bytes: PDF })).resolves.toBe("abc\td\nefghi");
    });

    it("turns form feeds and vertical tabs into line breaks, so words don't glue together", async () => {
      pdfText.mockResolvedValue({ totalPages: 2, text: "end of page one\fstart of page two\u000bnext" });
      await expect(extractText({ name: "a.pdf", bytes: PDF })).resolves.toBe("end of page one\nstart of page two\nnext");
    });

    it("removes lone surrogates (invalid UTF-8) but keeps real emoji", async () => {
      docxText.mockResolvedValue({ value: "a\uD83Db\uDE00c 😀", messages: [] });
      await expect(extractText({ name: "a.docx", bytes: DOCX })).resolves.toBe("abc 😀");
    });

    it("cleans text files too", async () => {
      await expect(extractText({ name: "a.txt", bytes: bytes("one\u0001two\u007f\nthree") })).resolves.toBe("onetwo\nthree");
    });

    it("says there is no text when only control characters were there", async () => {
      pdfText.mockResolvedValue({ totalPages: 1, text: "\u0000\u0001 \u0002\n" });
      await expect(extractText({ name: "a.pdf", bytes: PDF })).rejects.toMatchObject(fileError);
    });
  });

  describe("pdf", () => {
    it("hands unpdf the bytes themselves, not an open document, and merges pages", async () => {
      pdfText.mockResolvedValue({ totalPages: 2, text: "Page one\n\nPage two" });
      await expect(extractText({ name: "a.pdf", bytes: PDF })).resolves.toBe("Page one\n\nPage two");
      expect(pdfText).toHaveBeenCalledWith(expect.any(Uint8Array), { mergePages: true });
      expect(pdfText.mock.calls[0][0]).not.toHaveProperty("numPages");
    });

    it("gives each parser call its own copy, because pdf.js detaches the buffer it is given", async () => {
      pdfText.mockResolvedValue({ totalPages: 1, text: "x" });
      await extractText({ name: "a.pdf", bytes: PDF });
      const forCounting = getDocumentProxy.mock.calls[0][0];
      const forText = pdfText.mock.calls[0][0];
      expect(forCounting).not.toBe(PDF);
      expect(forText).not.toBe(PDF);
      expect(forText).not.toBe(forCounting);
    });

    it("destroys the document it opened to count pages, before the text is read", async () => {
      pdfText.mockImplementation(async () => {
        expect(destroy).toHaveBeenCalledTimes(1);
        return { totalPages: 2, text: "Page one" };
      });
      await extractText({ name: "a.pdf", bytes: PDF });
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("destroys the document when reading the text fails", async () => {
      pdfText.mockRejectedValue(new Error("boom"));
      await expect(extractText({ name: "a.pdf", bytes: PDF })).rejects.toMatchObject(fileError);
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("accepts exactly the page limit", async () => {
      getDocumentProxy.mockImplementation(async () => ({ numPages: MAX_PDF_PAGES, loadingTask: { destroy } }));
      pdfText.mockResolvedValue({ totalPages: MAX_PDF_PAGES, text: "ok" });
      await expect(extractText({ name: "a.pdf", bytes: PDF })).resolves.toBe("ok");
    });

    it("refuses a pdf over the page limit before extracting any text, and still destroys the document", async () => {
      getDocumentProxy.mockImplementation(async () => ({ numPages: MAX_PDF_PAGES + 1, loadingTask: { destroy } }));
      const error = await extractText({ name: "big.pdf", bytes: PDF }).catch((e: unknown) => e);
      expect(error).toMatchObject(fileError);
      expect((error as { fields: { file: string } }).fields.file).toContain(String(MAX_PDF_PAGES));
      expect(pdfText).not.toHaveBeenCalled();
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("turns a parser crash into fields.file without leaking the parser's message", async () => {
      pdfText.mockRejectedValue(new Error("Invalid PDF structure at /srv/app/secret/path"));
      const error = await extractText({ name: "bad.pdf", bytes: PDF }).catch((e: unknown) => e);
      expect(error).toMatchObject(fileError);
      expect(JSON.stringify(error)).not.toContain("/srv/app");
      expect((error as Error).message).not.toContain("/srv/app");
    });

    it("turns a failure to open the document into fields.file", async () => {
      getDocumentProxy.mockRejectedValue(new Error("Invalid PDF structure at /srv/app/secret/path"));
      const error = await extractText({ name: "bad.pdf", bytes: PDF }).catch((e: unknown) => e);
      expect(error).toMatchObject(fileError);
      expect(JSON.stringify(error)).not.toContain("/srv/app");
      expect(pdfText).not.toHaveBeenCalled();
    });
  });

  describe("docx", () => {
    it("reads a docx through mammoth's raw text", async () => {
      docxText.mockResolvedValue({ value: "Heading\n\nBody", messages: [] });
      await expect(extractText({ name: "a.docx", bytes: DOCX })).resolves.toBe("Heading\n\nBody");
    });

    it("gives mammoth only a re-built, size-checked copy, with the same entries", async () => {
      docxText.mockResolvedValue({ value: "x", messages: [] });
      await extractText({ name: "a.docx", bytes: DOCX });
      const { buffer } = docxText.mock.calls[0][0] as { buffer: Buffer };
      expect(buffer.equals(Buffer.from(DOCX))).toBe(false);
      const entries = readZipEntries(buffer, { maxEntries: 10, maxTotalBytes: 1000 });
      expect(entries.map((e) => [e.name, e.data.toString()])).toEqual([["word/document.xml", "<w:document/>"]]);
    });

    it("pins the approved limits: 20 MB unzipped, 1000 entries, 200 pdf pages", () => {
      expect(MAX_DOCX_UNZIPPED_BYTES).toBe(20 * 1024 * 1024);
      expect(MAX_DOCX_ENTRIES).toBe(1000);
      expect(MAX_PDF_PAGES).toBe(200);
    });

    it("refuses a zip bomb whose header tells the truth, without calling mammoth", async () => {
      const bomb = makeZip([{ name: "word/document.xml", data: Buffer.alloc(MAX_DOCX_UNZIPPED_BYTES + 1) }]);
      expect(bomb.length).toBeLessThan(100_000);
      const error = await extractText({ name: "bomb.docx", bytes: bomb }).catch((e: unknown) => e);
      expect(error).toMatchObject(fileError);
      expect((error as { fields: { file: string } }).fields.file).toMatch(/too large/i);
      expect(docxText).not.toHaveBeenCalled();
    });

    it("refuses a zip bomb whose header lies about the size, without calling mammoth", async () => {
      const bomb = makeZip([{ name: "word/document.xml", data: Buffer.alloc(MAX_DOCX_UNZIPPED_BYTES + 1), declaredSize: 100 }]);
      await expect(extractText({ name: "bomb.docx", bytes: bomb })).rejects.toMatchObject(fileError);
      expect(docxText).not.toHaveBeenCalled();
    });

    it("refuses a zip with too many entries, without calling mammoth", async () => {
      const many = makeZip(Array.from({ length: MAX_DOCX_ENTRIES + 1 }, (_, i) => ({ name: `f${i}.xml`, data: "x" })));
      await expect(extractText({ name: "many.docx", bytes: many })).rejects.toMatchObject(fileError);
      expect(docxText).not.toHaveBeenCalled();
    });

    it("opens a docx written with data descriptors", async () => {
      docxText.mockResolvedValue({ value: "From Word", messages: [] });
      const zip = makeZip([
        { name: "[Content_Types].xml", data: "<Types/>", dataDescriptor: true },
        { name: "word/document.xml", data: "<w:document/>", dataDescriptor: true },
      ]);
      await expect(extractText({ name: "word.docx", bytes: zip })).resolves.toBe("From Word");
      const { buffer } = docxText.mock.calls[0][0] as { buffer: Buffer };
      expect(readZipEntries(buffer, { maxEntries: 10, maxTotalBytes: 1000 }).map((e) => e.name)).toEqual(["[Content_Types].xml", "word/document.xml"]);
    });

    it("refuses ZIP64 and multi-disk files with a clear fields.file, without calling mammoth", async () => {
      for (const zip of [makeZip([{ name: "a", data: "x" }], { zip64Locator: true }), makeZip([{ name: "a", data: "x" }], { disk: 1 })]) {
        const error = await extractText({ name: "a.docx", bytes: zip }).catch((e: unknown) => e);
        expect(error).toMatchObject(fileError);
        expect((error as { fields: { file: string } }).fields.file).toMatch(/save it again|re-save|Word/i);
      }
      expect(docxText).not.toHaveBeenCalled();
    });

    it("refuses a password-protected docx with a clear fields.file", async () => {
      const zip = makeZip([{ name: "a", data: "x", encrypted: true }]);
      await expect(extractText({ name: "a.docx", bytes: zip })).rejects.toMatchObject(fileError);
      expect(docxText).not.toHaveBeenCalled();
    });

    it("refuses a file that starts like a zip but isn't one, without calling mammoth", async () => {
      await expect(extractText({ name: "a.docx", bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]) })).rejects.toMatchObject(fileError);
      expect(docxText).not.toHaveBeenCalled();
    });

    it("turns a parser crash into fields.file without leaking the parser's message", async () => {
      docxText.mockRejectedValue(new Error("bad xml at /srv/app/secret/path"));
      const error = await extractText({ name: "a.docx", bytes: DOCX }).catch((e: unknown) => e);
      expect(error).toMatchObject(fileError);
      expect(JSON.stringify(error)).not.toContain("/srv/app");
    });
  });

  it("says so when a pdf or docx has no readable text (a scan, for example)", async () => {
    pdfText.mockResolvedValue({ totalPages: 1, text: "  \n" });
    await expect(extractText({ name: "scan.pdf", bytes: PDF })).rejects.toMatchObject(fileError);
    docxText.mockResolvedValue({ value: "", messages: [] });
    await expect(extractText({ name: "empty.docx", bytes: DOCX })).rejects.toMatchObject(fileError);
  });
});
