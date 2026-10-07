import { extractText as pdfExtractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { AppError } from "../lib/errors";

// Plain text out of an uploaded file. The file itself is not kept (docs/kb-contract-checklist.md);
// only this text is, in kb_documents.body.

export const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "md"] as const;
export type FileKind = (typeof ALLOWED_EXTENSIONS)[number];

const fileError = (message: string) => new AppError("validation_failed", message, { file: message });

/** The kind of file a name says it is, or null when it isn't one we accept. */
export function fileKind(name: string): FileKind | null {
  const match = /^.+\.([A-Za-z0-9]+)$/.exec(name.trim());
  const extension = match?.[1].toLowerCase();
  return ALLOWED_EXTENSIONS.find((k) => k === extension) ?? null;
}

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);

/** Whitespace tidied: LF line endings, no leading or trailing blanks. */
const tidy = (text: string) => text.replace(/\r\n?/g, "\n").trim();

export async function extractText(file: { name: string; bytes: Uint8Array }): Promise<string> {
  const kind = fileKind(file.name);
  if (!kind) throw fileError("Upload a PDF, Word (.docx), text or Markdown file.");

  let text: string;
  try {
    if (kind === "pdf") {
      if (!startsWith(file.bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) throw fileError("This doesn't look like a PDF.");
      const pdf = await getDocumentProxy(new Uint8Array(file.bytes));
      text = (await pdfExtractText(pdf, { mergePages: true })).text;
    } else if (kind === "docx") {
      if (!startsWith(file.bytes, [0x50, 0x4b, 0x03, 0x04])) throw fileError("This doesn't look like a Word (.docx) file.");
      text = (await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) })).value;
    } else {
      if (file.bytes.includes(0)) throw fileError("This doesn't look like a text file.");
      text = new TextDecoder("utf-8").decode(file.bytes); // drops a leading BOM
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    // The parser's message can carry paths and internals; the user gets a fixed one.
    throw fileError("We couldn't read this file. Check that it opens, then try again.");
  }

  const tidied = tidy(text);
  if (!tidied) throw fileError("We couldn't find any text in this file. Scanned pages need to be typed or converted first.");
  return tidied;
}
