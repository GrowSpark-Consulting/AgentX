"use client";

import { useState, type FormEvent } from "react";
import { ErrorState } from "@/components/shared/states";
import type { FormattedError } from "@/lib/errors";
import { DialogFrame } from "./dialog-frame";
import { describeKbWriteError, UPLOAD_ACCEPT, validateUploadFile, validateUploadTitle } from "./kb-content";

// Upload a knowledge document: a file (pdf, docx, txt or md, at most 5 MB) and an optional title (at
// most 200 characters). Checked here first so a wrong file or title is never sent; the API checks again
// and answers validation_failed with fields.file or fields.title, shown on that field. The API only
// accepts the file for processing, so the dialog never says "uploaded": the list shows it as Processing.

export function UploadDialog({ onUpload, onClose }: { onUpload: (file: File, title: string) => Promise<void>; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<FormattedError | null>(null);

  function pick(next: File | null) {
    setFile(next);
    setError(null);
    setFileError(next ? validateUploadFile(next) : null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (uploading) return;
    const invalid = validateUploadFile(file);
    const invalidTitle = validateUploadTitle(title);
    if (invalid || invalidTitle || !file) {
      setFileError(invalid);
      setTitleError(invalidTitle);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await onUpload(file, title);
    } catch (err) {
      const described = describeKbWriteError(err, "Couldn't upload the document", "document");
      if (described.fields?.file || described.fields?.title) {
        setFileError(described.fields?.file ?? null);
        setTitleError(described.fields?.title ?? null);
      } else setError(described);
      setUploading(false);
    }
  }

  return (
    <DialogFrame title="Upload a document" onClose={onClose} busy={uploading}>
      <form className="app-form" onSubmit={submit} noValidate style={{ gap: "14px" }}>
        <div className="field">
          <label htmlFor="upload-file">File</label>
          <input
            id="upload-file"
            type="file"
            className="input"
            accept={UPLOAD_ACCEPT}
            disabled={uploading}
            aria-invalid={fileError ? true : undefined}
            aria-describedby={fileError ? "upload-file-error" : "upload-file-hint"}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            style={{ maxWidth: "100%", minWidth: 0 }}
          />
          {fileError ? (
            <p id="upload-file-error" className="app-field-error">
              {fileError}
            </p>
          ) : (
            <p id="upload-file-hint" className="app-hint">
              PDF, Word (.docx), text (.txt) or Markdown (.md), up to 5 MB.
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="upload-title">Title (optional)</label>
          <input
            id="upload-title"
            className="input"
            value={title}
            disabled={uploading}
            placeholder={file?.name ?? "Price list"}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? "upload-title-error" : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
          />
          {titleError ? (
            <p id="upload-title-error" className="app-field-error">
              {titleError}
            </p>
          ) : null}
        </div>

        {error ? <ErrorState compact title={error.title} description={error.message} /> : null}

        <div className="dialog-actions" style={{ justifyContent: "flex-start", marginTop: 0, flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-primary" disabled={uploading}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
