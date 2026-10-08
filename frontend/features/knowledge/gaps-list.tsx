"use client";

import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import type { FormattedError } from "@/lib/errors";
import { askedText, describeKbWriteError, GAP_ANSWER_MAX, KB_UNAVAILABLE_TITLE, validateGapAnswer, type GapItem, type SectionSource } from "./kb-content";

// "Questions the AI couldn't answer", ported from the /dashboard/preview Knowledge base
// (features/knowledge/pakka-knowledge.tsx): accent title over a 2px accent rule, one row per question
// with "Add answer", which opens a textarea with Save answer / Cancel, and Dismiss. Saving an answer
// turns the question into an FAQ (POST /api/kb/gaps/:id/answer); the row leaves the list only once
// the API confirms. Every member can answer; owners and admins can also dismiss (contracts.md
// section 9). While GET /api/kb/gaps isn't deployed, the section says so instead of an error.

export function GapsList({
  source,
  canAnswer,
  canDismiss,
  onAnswer,
  onDismiss,
}: {
  source: SectionSource<GapItem>;
  canAnswer: boolean;
  canDismiss: boolean;
  onAnswer: (gap: GapItem, answer: string) => Promise<void>;
  onDismiss: (gap: GapItem) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [error, setError] = useState<FormattedError | null>(null);
  const gaps = source.status === "ready" ? source.items : [];

  function open(id: string) {
    setEditing(id);
    setDraft("");
    setInvalid(null);
    setError(null);
  }

  async function save(gap: GapItem) {
    if (saving) return;
    const problem = validateGapAnswer(draft);
    if (problem) {
      setInvalid(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAnswer(gap, draft.trim());
      setEditing(null);
      setDraft("");
    } catch (err) {
      const described = describeKbWriteError(err, "Couldn't save the answer", "question");
      if (described.fields?.a) setInvalid(described.fields.a);
      else setError(described);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="gaps-heading" style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-accent)", paddingBottom: "8px", gap: "12px", flexWrap: "wrap" }}>
        <h2 id="gaps-heading" style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
          Questions the AI couldn’t answer{source.status === "ready" ? ` · ${gaps.length}` : ""}
        </h2>
        {source.status === "ready" && gaps.length > 0 ? (
          <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
            {canAnswer ? "Answer once and the AI uses it from then on" : "Only team members can answer these"}
          </span>
        ) : null}
      </div>

      {source.status === "loading" ? (
        <div style={{ paddingTop: "12px" }}>
          <LoadingState compact title="Loading questions" />
        </div>
      ) : null}
      {source.status === "error" ? (
        <div style={{ paddingTop: "12px" }}>
          <ErrorState compact title="Couldn't load the questions" description={source.message} onRetry={source.retry} />
        </div>
      ) : null}
      {source.status === "unavailable" ? (
        <div style={{ paddingTop: "12px" }}>
          <EmptyState
            compact
            title={KB_UNAVAILABLE_TITLE}
            description="The knowledge-base service is still being connected. Questions the AI couldn’t answer will appear here once it is."
          />
        </div>
      ) : null}
      {source.status === "ready" && gaps.length === 0 ? (
        <p style={{ padding: "16px 0", margin: "0", color: "var(--color-neutral-700)" }}>All caught up. Nothing new to answer.</p>
      ) : null}

      {gaps.map((g) => (
        <div key={g.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px 12px", alignItems: "center" }}>
            <div style={{ minWidth: 0, flex: "1 1 240px" }}>
              <div style={{ fontWeight: "600", fontSize: "15px", overflowWrap: "anywhere" }}>“{g.question}”</div>
              <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                Asked {askedText(g.askedCount)}
                {g.lastAskedBy ? ` · last by ${g.lastAskedBy}` : ""}
              </div>
            </div>
            {canAnswer && editing !== g.id ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-secondary" aria-label={`Add answer: ${g.question}`} onClick={() => open(g.id)}>
                  Add answer
                </button>
                {canDismiss ? (
                  <button type="button" className="btn btn-ghost" aria-label={`Dismiss: ${g.question}`} onClick={() => onDismiss(g)}>
                    Dismiss
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {canAnswer && editing === g.id ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <textarea
                className="input"
                aria-label={`Answer to “${g.question}”`}
                aria-invalid={invalid ? true : undefined}
                aria-describedby={invalid ? `gap-${g.id}-error` : undefined}
                placeholder="Type the answer the way you’d say it to a customer"
                value={draft}
                maxLength={GAP_ANSWER_MAX + 50}
                disabled={saving}
                autoFocus
                onChange={(e) => {
                  setDraft(e.target.value);
                  setInvalid(null);
                }}
                style={{ minHeight: "80px", resize: "vertical" }}
              />
              {invalid ? (
                <p id={`gap-${g.id}-error`} className="app-field-error" style={{ margin: 0 }}>
                  {invalid}
                </p>
              ) : null}
              {error ? <ErrorState compact title={error.title} description={error.message} /> : null}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <button type="button" className="btn btn-primary" onClick={() => save(g)} disabled={saving}>
                  {saving ? "Saving…" : "Save answer"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
