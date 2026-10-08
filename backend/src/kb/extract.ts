import { extractText as pdfExtractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { AppError } from "../lib/errors";
import { stripUnsafeCharacters } from "../lib/text";
import { TimeoutError, withTimeout } from "../lib/timeout";
import { CHUNK_SIZE, MAX_CHUNKS } from "./chunk";
import { buildStoredZip, readZipEntries, ZipFormatError, ZipLimitError } from "./zip";

// Plain text out of an uploaded file. The file itself is not kept (docs/kb-contract-checklist.md);
// only this text is, in kb_documents.body.

export const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "md"] as const;
export type FileKind = (typeof ALLOWED_EXTENSIONS)[number];

// Checked before any parser runs (zip-bomb and page-bomb protection). A business's price list or
// brochure is far below these; a Word file with 20 MB of text is not a document anyone wrote by hand.
// The upload route enforces the 5 MB file limit itself (docs/kb-contract-checklist.md) so its answer
// has fields.file; this repeats it so no caller can hand a parser more than that.
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_DOCX_UNZIPPED_BYTES = 20 * 1024 * 1024;
export const MAX_DOCX_ENTRIES = 1000;
export const MAX_PDF_PAGES = 200;
/** What a file may yield, checked before the text is cleaned. Above what MAX_CHUNKS can hold, so the chunker still gives its own message for a long but plausible file. */
export const MAX_TEXT_CHARS = 2 * MAX_CHUNKS * CHUNK_SIZE;
/** A parser that hasn't answered by then is not going to (pdf.js can stall on a damaged file). */
export const EXTRACT_TIMEOUT_MS = 30_000;

const fileError = (message: string) => new AppError("validation_failed", message, { file: message });

/** The kind of file a name says it is, or null when it isn't one we accept. */
export function fileKind(name: string): FileKind | null {
  const match = /^.+\.([A-Za-z0-9]+)$/.exec(name.trim());
  const extension = match?.[1].toLowerCase();
  return ALLOWED_EXTENSIONS.find((k) => k === extension) ?? null;
}

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);

/**
 * Text that is safe to store and to send on: LF line endings, form feeds and vertical tabs as line
 * breaks, no NUL or other control characters (Postgres rejects NUL), no lone surrogates (they are not
 * valid UTF-8), no blanks around it.
 */
export function cleanText(text: string): string {
  return stripUnsafeCharacters(text.replace(/\r\n?/g, "\n").replace(/[\f\v]/g, "\n")).trim();
}

/** The page count, from a document that is destroyed again whatever happens. */
async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const document = await getDocumentProxy(new Uint8Array(bytes)); // pdf.js detaches the buffer it is given
  try {
    return document.numPages;
  } finally {
    try {
      await document.loadingTask.destroy();
    } catch {
      // nothing left to release
    }
  }
}

/** A zip that was measured while it was read, rebuilt clean for mammoth; or a fields.file error. */
function checkedDocx(bytes: Uint8Array): Buffer {
  try {
    return buildStoredZip(readZipEntries(bytes, { maxEntries: MAX_DOCX_ENTRIES, maxTotalBytes: MAX_DOCX_UNZIPPED_BYTES }));
  } catch (err) {
    if (err instanceof ZipLimitError) {
      throw fileError("This Word file is too large or too complex to open safely. Remove large images or split it into smaller files.");
    }
    if (err instanceof ZipFormatError && err.kind === "unsupported") {
      throw fileError("This Word file is password-protected or uses a format we can't open. Open it in Word, save a copy as a normal .docx, and upload that.");
    }
    throw fileError("This doesn't look like a Word (.docx) file, or it is damaged.");
  }
}

/** The raw text of a file whose kind and size have been checked. */
async function parse(kind: FileKind, bytes: Uint8Array): Promise<string> {
  if (kind === "pdf") {
    if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) throw fileError("This doesn't look like a PDF.");
    if ((await pdfPageCount(bytes)) > MAX_PDF_PAGES) {
      throw fileError(`This PDF has more than ${MAX_PDF_PAGES} pages. Split it into smaller files.`);
    }
    // Bytes, not an open document: unpdf then owns the document and destroys it when done.
    return (await pdfExtractText(new Uint8Array(bytes), { mergePages: true })).text;
  }
  if (kind === "docx") {
    if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) throw fileError("This doesn't look like a Word (.docx) file.");
    return (await mammoth.extractRawText({ buffer: checkedDocx(bytes) })).value;
  }
  if (bytes.includes(0)) throw fileError("This doesn't look like a text file.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes); // drops a leading BOM
  } catch {
    throw fileError("This text file isn't UTF-8. Save it as UTF-8 (in Notepad: Save As, Encoding: UTF-8) and upload it again.");
  }
}

export async function extractText(file: { name: string; bytes: Uint8Array }): Promise<string> {
  const kind = fileKind(file.name);
  if (!kind) throw fileError("Upload a PDF, Word (.docx), text or Markdown file.");
  if (file.bytes.length > MAX_FILE_BYTES) throw fileError("This file is larger than 5 MB. Split it into smaller files.");

  let text: string;
  try {
    text = await withTimeout(() => parse(kind, file.bytes), EXTRACT_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof TimeoutError) throw fileError("Reading this file took too long. Try a smaller or simpler file.");
    // The parser's message can carry paths and internals; the user gets a fixed one.
    throw fileError("We couldn't read this file. Check that it opens, then try again.");
  }
  if (text.length > MAX_TEXT_CHARS) throw fileError("This file has too much text. Split it into smaller files.");

  const cleaned = cleanText(text);
  if (!cleaned) throw fileError("We couldn't find any text in this file. Scanned pages need to be typed or converted first.");
  return cleaned;
}
