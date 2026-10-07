"use client";

import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { formatError, type FormattedError } from "@/lib/errors";
import { askedText, type GapItem, type SectionSource } from "./kb-content";

// "Questions the AI couldn't answer", ported from the /dashboard/preview Knowledge base
// (features/knowledge/pakka-knowledge.tsx): accent title over a 2px accent rule, one row per question
// with "Add answer", which opens a textarea with Save answer / Cancel.
//
// No storage exists for unanswered questions yet (docs/dashboard-screen-contracts.md, open question 3;
// PROPOSED GET /api/kb/gaps, Dev 1), so the page passes an "unavailable" source. When the contract
// lands, pass a "ready" source and onAnswer; until then Save answer is never offered as working.

export function GapsList({
  source,
  onAnswer,
}: {
  source: SectionSource<GapItem>;
  /** Saves an answer (gap → FAQ). Absent until that write exists: Save answer stays switched off. */
  onAnswer?: (gap: GapItem, answer: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FormattedError | null>(null);
  const gaps = source.status === "ready" ? source.items : [];

  function open(id: string) {
    setEditing(id);
    setDraft("");
    setError(null);
  }

  async function save(gap: GapItem) {
    if (!onAnswer || saving || !draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onAnswer(gap, draft.trim());
      setEditing(null);
      setDraft("");
    } catch (err) {
      setError(formatError(err));
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
        {source.status === "ready" && onAnswer ? (
          <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>Answer once and the AI uses it from then on</span>
        ) : null}
      </div>

      {source.status === "unavailable" ? (
        <div style={{ paddingTop: "12px" }}>
          <EmptyState compact title="Not available yet" description={source.reason} />
        </div>
      ) : null}
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
      {source.status === "ready" && gaps.length === 0 ? (
        <p style={{ padding: "16px 0", margin: "0", color: "var(--color-neutral-700)" }}>All caught up. Nothing new to answer.</p>
      ) : null}

      {gaps.map((g) => (
        <div key={g.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "12px", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: "600", fontSize: "15px" }}>“{g.question}”</div>
              <div style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>
                Asked {askedText(g.askedCount)} · last by {g.lastAskedBy}
              </div>
            </div>
            {editing !== g.id ? (
              <button type="button" className="btn btn-secondary" onClick={() => open(g.id)}>
                Add answer
              </button>
            ) : null}
          </div>
          {editing === g.id ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <textarea
                className="input"
                aria-label={`Answer to “${g.question}”`}
                placeholder="Type the answer the way you’d say it to a customer"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={{ minHeight: "80px" }}
              />
              {error ? <ErrorState compact title="Couldn't save the answer" description={error.message} /> : null}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => save(g)}
                  disabled={!onAnswer || saving || !draft.trim()}
                  aria-describedby={onAnswer ? undefined : `gap-${g.id}-note`}
                >
                  {saving ? "Saving…" : "Save answer"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)} disabled={saving}>
                  Cancel
                </button>
                {onAnswer ? null : (
                  <span id={`gap-${g.id}-note`} className="app-hint" style={{ margin: 0 }}>
                    Saving answers isn’t switched on yet.
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
