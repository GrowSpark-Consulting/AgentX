import { beforeEach, describe, expect, it, vi } from "vitest";

const pdfText = vi.fn();
const docxText = vi.fn();
vi.mock("unpdf", () => ({ extractText: pdfText, getDocumentProxy: async (bytes: Uint8Array) => bytes }));
vi.mock("mammoth", () => ({ default: { extractRawText: docxText }, extractRawText: docxText }));

const { extractText, fileKind, ALLOWED_EXTENSIONS } = await import("./extract");

const bytes = (text: string) => new TextEncoder().encode(text);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]); // PK\x03\x04

const fileError = { code: "validation_failed", fields: { file: expect.any(String) } };

beforeEach(() => {
  pdfText.mockReset();
  docxText.mockReset();
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

  it("rejects a text file with no text in it", async () => {
    await expect(extractText({ name: "a.txt", bytes: bytes("  \n ") })).rejects.toMatchObject(fileError);
  });

  it("checks the file's own bytes, not just its name", async () => {
    await expect(extractText({ name: "a.pdf", bytes: bytes("not a pdf") })).rejects.toMatchObject(fileError);
    await expect(extractText({ name: "a.docx", bytes: bytes("not a zip") })).rejects.toMatchObject(fileError);
    expect(pdfText).not.toHaveBeenCalled();
    expect(docxText).not.toHaveBeenCalled();
  });

  it("reads a pdf through unpdf, merging pages", async () => {
    pdfText.mockResolvedValue({ totalPages: 2, text: "Page one\n\nPage two" });
    await expect(extractText({ name: "a.pdf", bytes: PDF })).resolves.toBe("Page one\n\nPage two");
    expect(pdfText).toHaveBeenCalledWith(expect.anything(), { mergePages: true });
  });

  it("reads a docx through mammoth's raw text", async () => {
    docxText.mockResolvedValue({ value: "Heading\n\nBody", messages: [] });
    await expect(extractText({ name: "a.docx", bytes: ZIP })).resolves.toBe("Heading\n\nBody");
  });

  it("says so when a pdf or docx has no readable text (a scan, for example)", async () => {
    pdfText.mockResolvedValue({ totalPages: 1, text: "  \n" });
    await expect(extractText({ name: "scan.pdf", bytes: PDF })).rejects.toMatchObject(fileError);
    docxText.mockResolvedValue({ value: "", messages: [] });
    await expect(extractText({ name: "empty.docx", bytes: ZIP })).rejects.toMatchObject(fileError);
  });

  it("turns a parser crash into fields.file without leaking the parser's message", async () => {
    pdfText.mockRejectedValue(new Error("Invalid PDF structure at /srv/app/secret/path"));
    const error = await extractText({ name: "bad.pdf", bytes: PDF }).catch((e: unknown) => e);
    expect(error).toMatchObject(fileError);
    expect(JSON.stringify(error)).not.toContain("/srv/app");
    expect((error as Error).message).not.toContain("/srv/app");
  });
});
