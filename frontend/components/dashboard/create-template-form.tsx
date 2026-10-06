"use client";

import {
  CreateTemplateInput,
  TEMPLATE_BODY_MAX,
  templateVariables,
  type CreateTemplateResult,
} from "@pakka/types";
import { useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { formatError, postJson, type FormattedError } from "@/lib/errors";
import { useTenant } from "./tenant-context";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "submitted"; result: CreateTemplateResult }
  | { kind: "failed"; error: FormattedError };

type Category = CreateTemplateInput["category"];
type Language = CreateTemplateInput["language"];

// Labels for the values CreateTemplateInput accepts (TEMPLATE_CATEGORIES, TEMPLATE_LANGUAGES).
const CATEGORIES = [
  { value: "utility", label: "Utility", hint: "Booking confirmations, reminders, updates the customer asked for." },
  { value: "marketing", label: "Marketing", hint: "Offers, follow-ups and anything promotional." },
] as const satisfies readonly { value: Category; label: string; hint: string }[];
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ta", label: "Tamil" },
] as const satisfies readonly { value: Language; label: string }[];

export function CreateTemplateForm() {
  const { role } = useTenant();
  const canCreate = role === "owner" || role === "admin";
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("utility");
  const [language, setLanguage] = useState<Language>("en");
  const [body, setBody] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const vars = templateVariables(body);
  const exampleFor = (i: number) => examples[i] ?? "";

  function addVariable() {
    const next = (vars.at(-1) ?? 0) + 1;
    setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}{{${next}}}`);
  }

  /** Moves keyboard focus to the first field with an error, in form order. */
  function focusFirstInvalid(invalid: Record<string, string>) {
    const missingSample = vars.find((_, i) => !exampleFor(i).trim());
    const id = invalid.name
      ? "name"
      : invalid.body
        ? "body"
        : invalid.examples
          ? `example-${missingSample ?? vars[0]}`
          : null;
    if (id) document.getElementById(id)?.focus();
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const input = { name, category, language, body, examples: vars.map((_, i) => exampleFor(i)) };
    const parsed = CreateTemplateInput.safeParse(input);
    if (!parsed.success) {
      const invalid = formatError(parsed.error).fields ?? {};
      setFields(invalid);
      setStatus({ kind: "idle" });
      focusFirstInvalid(invalid);
      return;
    }
    setFields({});
    setStatus({ kind: "submitting" });
    try {
      const result = await postJson<CreateTemplateResult>("/api/templates", parsed.data);
      setStatus({ kind: "submitted", result });
    } catch (err) {
      const error = formatError(err);
      setFields(error.fields ?? {});
      setStatus({ kind: "failed", error });
      focusFirstInvalid(error.fields ?? {});
    }
  }

  // Preview with sample values filled in.
  const preview = body.replace(/\{\{(\d+)\}\}/g, (m, n: string) => examples[Number(n) - 1]?.trim() || m);
  const submitting = status.kind === "submitting";

  return (
    <form className="app-form" onSubmit={submit} noValidate>
      {!canCreate ? (
        <p className="app-notice" role="note">
          Only an owner or admin can create templates.
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="name">Template name</label>
        <input
          id="name"
          className="input"
          placeholder="booking_confirmed_v1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={fields.name ? true : undefined}
          aria-describedby={fields.name ? "name-error" : "name-hint"}
          autoComplete="off"
          spellCheck={false}
        />
        {fields.name ? (
          <p id="name-error" className="app-field-error">{fields.name}</p>
        ) : (
          <p id="name-hint" className="app-hint">
            Lowercase with underscores, ending in a version. To change an approved template, create the next version.
          </p>
        )}
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Category</legend>
        <div className="app-seg">
          {CATEGORIES.map((c) => (
            <label key={c.value}>
              <input type="radio" name="category" value={c.value} checked={category === c.value} onChange={() => setCategory(c.value)} />
              {c.label}
            </label>
          ))}
        </div>
        <p className="app-hint">{CATEGORIES.find((c) => c.value === category)?.hint}</p>
      </fieldset>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Language</legend>
        <div className="app-seg">
          {LANGUAGES.map((l) => (
            <label key={l.value}>
              <input type="radio" name="language" value={l.value} checked={language === l.value} onChange={() => setLanguage(l.value)} />
              {l.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="body">Message</label>
        <textarea
          id="body"
          className="input"
          rows={5}
          placeholder="Hi {{1}}, your visit is booked for {{2}}."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={fields.body ? true : undefined}
          aria-describedby={fields.body ? "tbody-error" : "tbody-count"}
        />
        <div className="app-row">
          <button type="button" className="btn btn-ghost" onClick={addVariable}>
            + Add variable
          </button>
          {fields.body ? <p id="tbody-error" className="app-field-error">{fields.body}</p> : null}
          <span id="tbody-count" className="app-counter">
            {body.length} / {TEMPLATE_BODY_MAX}
          </span>
        </div>
      </div>

      <section className="field" aria-labelledby="samples-heading">
        <h2 id="samples-heading" style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>
          Sample values
        </h2>
        {vars.length === 0 ? (
          <EmptyState
            compact
            title="No variables yet"
            description="Add {{1}}, {{2}} … for details that change per message, like a name or a date. Meta reviews the template with your sample values."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {vars.map((n, i) => {
              const invalid = Boolean(fields.examples) && !exampleFor(i).trim();
              return (
                <div key={n} className="field">
                  <label htmlFor={`example-${n}`}>Sample for {`{{${n}}}`}</label>
                  <input
                    id={`example-${n}`}
                    className="input"
                    aria-invalid={invalid ? true : undefined}
                    aria-describedby={invalid ? "examples-error" : undefined}
                    value={exampleFor(i)}
                    onChange={(e) =>
                      setExamples((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
        {fields.examples ? <p id="examples-error" className="app-field-error">{fields.examples}</p> : null}
      </section>

      <section aria-labelledby="preview-heading">
        <h2 id="preview-heading" style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>
          Preview
        </h2>
        <div className="app-preview">
          <div className="app-bubble" data-testid="template-preview">
            {preview || "Your message appears here."}
            <span className="app-bubble-meta">
              {CATEGORIES.find((c) => c.value === category)?.label} · {LANGUAGES.find((l) => l.value === language)?.label}
            </span>
          </div>
        </div>
      </section>

      <div className="app-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting || !canCreate}>
          {submitting ? "Submitting…" : "Submit for review"}
        </button>
      </div>

      <div>
        {status.kind === "submitting" ? <LoadingState compact title="Submitting your template" description="Sending it to Meta for review." /> : null}
        {status.kind === "submitted" ? (
          <div className="app-success" role="status">
            <strong>{status.result.name}</strong> ({status.result.language}){" "}
            {status.result.status === "submitted" ? "was submitted to Meta for review." : "was saved as a draft."}
          </div>
        ) : null}
        {status.kind === "failed" ? (
          <ErrorState
            compact
            title={status.error.title}
            description={status.error.message}
            onRetry={status.error.retryable ? () => void submit() : undefined}
          />
        ) : null}
      </div>
    </form>
  );
}
