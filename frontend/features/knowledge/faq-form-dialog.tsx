"use client";

import { useState, type FormEvent } from "react";
import { ErrorState } from "@/components/shared/states";
import type { FormattedError } from "@/lib/errors";
import { DialogFrame } from "./dialog-frame";
import { describeKbWriteError, FAQ_A_MAX, FAQ_Q_MAX, validateFaq, type FaqFieldErrors, type FaqInput, type FaqItem } from "./kb-content";

// Add or edit one FAQ, in the service form's dialog (.field / .input controls). Validated before the
// API is called; a failed save keeps the dialog and what was typed, and marks the field the API
// named (a duplicate question is `conflict`, a too-long one `validation_failed` with fields.q).

export function FaqFormDialog({
  faq,
  existing,
  onSave,
  onClose,
}: {
  /** null = a new FAQ. */
  faq: FaqItem | null;
  existing: readonly FaqItem[];
  onSave: (input: FaqInput) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ q: faq?.q ?? "", a: faq?.a ?? "" });
  const [fields, setFields] = useState<FaqFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FormattedError | null>(null);

  const set = (key: keyof FaqInput, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFields((f) => ({ ...f, [key]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const result = validateFaq(draft, existing, faq?.id ?? null);
    if (!result.ok) {
      setFields(result.fields);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(result.input);
    } catch (err) {
      const described = describeKbWriteError(err, "Couldn't save the FAQ", "FAQ");
      const fromApi = described.fields ?? {};
      setFields({ q: fromApi.q, a: fromApi.a });
      // Shown next to the field when the API named one of ours; otherwise above the buttons.
      setError(fromApi.q || fromApi.a ? null : described);
      setSaving(false);
    }
  }

  const field = (key: keyof FaqInput) => ({
    id: `faq-${key}`,
    "aria-invalid": fields[key] ? true : undefined,
    "aria-describedby": fields[key] ? `faq-${key}-error` : `faq-${key}-hint`,
  });
  const fieldError = (key: keyof FaqInput) =>
    fields[key] ? (
      <p id={`faq-${key}-error`} className="app-field-error">
        {fields[key]}
      </p>
    ) : null;

  return (
    <DialogFrame title={faq ? "Edit FAQ" : "Add an FAQ"} onClose={onClose} busy={saving}>
      <form className="app-form" onSubmit={submit} noValidate style={{ gap: "14px" }}>
        <div className="field">
          <label htmlFor="faq-q">Question</label>
          <input {...field("q")} className="input" value={draft.q} maxLength={FAQ_Q_MAX + 20} autoFocus onChange={(e) => set("q", e.target.value)} />
          {fieldError("q") ?? (
            <p id="faq-q-hint" className="app-hint">
              The way customers ask it. Up to {FAQ_Q_MAX} characters.
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="faq-a">Answer</label>
          <textarea {...field("a")} className="input" value={draft.a} maxLength={FAQ_A_MAX + 50} onChange={(e) => set("a", e.target.value)} style={{ minHeight: "120px", resize: "vertical" }} />
          {fieldError("a") ?? (
            <p id="faq-a-hint" className="app-hint">
              The AI uses it from then on. {draft.a.trim().length.toLocaleString("en-IN")} / {FAQ_A_MAX.toLocaleString("en-IN")} characters.
            </p>
          )}
        </div>

        {error ? <ErrorState compact title={error.title} description={error.message} /> : null}

        <div className="dialog-actions" style={{ justifyContent: "flex-start", marginTop: 0, flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : faq ? "Save changes" : "Add FAQ"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
