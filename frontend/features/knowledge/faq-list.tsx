"use client";

import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { KB_UNAVAILABLE_TITLE, type FaqItem, type SectionSource } from "./kb-content";

// "FAQs · n", ported from the /dashboard/preview Knowledge base (features/knowledge/pakka-knowledge.tsx):
// title over a 2px ink rule with a ghost Add, then an accordion (question row with +/−, the answer
// below; the first one starts open). An open FAQ has Edit and Delete for owners and admins; staff
// read only. A FAQ that isn't ready (its save failed to reach the AI) says so, and who can retry it
// (saving it again, even unchanged). Once a write finds the FAQ routes aren't deployed yet, the section
// says so and its write buttons are switched off.

const notReadyText = (status: Exclude<FaqItem["status"], "ready">, canWrite: boolean) =>
  status === "processing" ? "Processing" : canWrite ? "Not in use: edit to try again" : "Not in use: an owner or admin can save it again";

export function FaqList({
  source,
  canWrite,
  writesUnavailable = false,
  onAdd,
  onEdit,
  onDelete,
}: {
  source: SectionSource<FaqItem>;
  canWrite: boolean;
  /** The FAQ routes aren't deployed yet: the list is shown, nothing can be changed. */
  writesUnavailable?: boolean;
  onAdd: () => void;
  onEdit: (faq: FaqItem) => void;
  onDelete: (faq: FaqItem) => void;
}) {
  const faqs = source.status === "ready" ? source.items : [];
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string, index: number) => open[id] ?? index === 0;

  return (
    <section aria-labelledby="faqs-heading" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px", gap: "12px" }}>
        <h2 id="faqs-heading" style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
          FAQs{source.status === "ready" ? ` · ${faqs.length}` : ""}
        </h2>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onAdd}
          disabled={!canWrite || writesUnavailable || source.status !== "ready"}
          aria-describedby={!canWrite ? "faqs-add-note" : writesUnavailable ? "faqs-unavailable" : undefined}
        >
          Add
        </button>
      </div>
      {canWrite ? null : (
        <p id="faqs-add-note" className="app-hint">
          Only an owner or admin can change FAQs.
        </p>
      )}

      {canWrite && writesUnavailable ? (
        <div id="faqs-unavailable" style={{ paddingTop: "12px" }}>
          <EmptyState compact title={KB_UNAVAILABLE_TITLE} description="The knowledge-base service is still being connected, so FAQs can’t be added or changed yet." />
        </div>
      ) : null}

      {source.status === "loading" ? (
        <div style={{ paddingTop: "12px" }}>
          <LoadingState compact title="Loading FAQs" />
        </div>
      ) : null}
      {source.status === "error" ? (
        <div style={{ paddingTop: "12px" }}>
          <ErrorState compact title="Couldn't load the FAQs" description={source.message} onRetry={source.retry} />
        </div>
      ) : null}
      {source.status === "ready" && faqs.length === 0 ? (
        <div style={{ paddingTop: "12px" }}>
          <EmptyState compact title="No FAQs yet" description="Add the questions customers often ask. The AI answers them the way you write them here." />
        </div>
      ) : null}

      {faqs.map((f, i) => {
        const expanded = isOpen(f.id, i);
        return (
          <div key={f.id} style={{ borderBottom: "1px solid var(--color-divider)" }}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`faq-${f.id}`}
              onClick={() => setOpen((o) => ({ ...o, [f.id]: !expanded }))}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", padding: "14px 0", border: "0", background: "transparent", color: "var(--color-text)", font: "inherit", fontSize: "15px", fontWeight: "600", textAlign: "left", cursor: "pointer" }}
            >
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{f.q}</span>
              <span aria-hidden="true" style={{ fontSize: "20px", fontWeight: "400", lineHeight: "1" }}>
                {expanded ? "−" : "+"}
              </span>
            </button>
            {f.status !== "ready" ? (
              <p style={{ margin: "-6px 0 10px" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", padding: "3px 8px", border: "1px solid var(--color-accent)", color: "var(--color-accent-700)" }}>{notReadyText(f.status, canWrite)}</span>
              </p>
            ) : null}
            {expanded ? (
              <div id={`faq-${f.id}`} style={{ margin: "0 0 14px" }}>
                <p style={{ margin: 0, fontSize: "14px", color: "var(--color-neutral-800)", maxWidth: "720px", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{f.a}</p>
                {canWrite ? (
                  <div style={{ display: "flex", gap: "4px", marginTop: "8px", marginLeft: "-6px" }}>
                    <button type="button" className="btn btn-ghost" style={{ padding: "2px 6px" }} aria-label={`Edit FAQ: ${f.q}`} disabled={writesUnavailable} onClick={() => onEdit(f)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ padding: "2px 6px" }} aria-label={`Delete FAQ: ${f.q}`} disabled={writesUnavailable} onClick={() => onDelete(f)}>
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
