"use client";

import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import type { FaqItem, SectionSource } from "./kb-content";

// "FAQs · n", ported from the /dashboard/preview Knowledge base (features/knowledge/pakka-knowledge.tsx):
// title over a 2px ink rule with a ghost Add, then an accordion (question row with +/−, the answer
// below; the first one starts open).
//
// No FAQ storage exists yet (PROPOSED POST|PATCH /api/kb/faqs, Dev 1; no table, no read). The page
// passes an "unavailable" source, and Add stays switched off with the reason: nothing here can look
// like a saved FAQ. Opening and closing answers is local only.

export function FaqList({ source, onAdd }: { source: SectionSource<FaqItem>; onAdd?: () => void }) {
  const faqs = source.status === "ready" ? source.items : [];
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string, index: number) => open[id] ?? index === 0;

  return (
    <section aria-labelledby="faqs-heading" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px", gap: "12px" }}>
        <h2 id="faqs-heading" style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
          FAQs{source.status === "ready" ? ` · ${faqs.length}` : ""}
        </h2>
        <button type="button" className="btn btn-ghost" onClick={onAdd} disabled={!onAdd} aria-describedby={onAdd ? undefined : "faqs-add-note"}>
          Add
        </button>
      </div>
      {onAdd ? null : (
        <p id="faqs-add-note" className="app-hint">
          Adding FAQs isn’t switched on yet.
        </p>
      )}

      {source.status === "unavailable" ? (
        <div style={{ paddingTop: "12px" }}>
          <EmptyState compact title="Not available yet" description={source.reason} />
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
        <p style={{ padding: "16px 0", margin: "0", color: "var(--color-neutral-700)" }}>No FAQs yet.</p>
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
              <span>{f.q}</span>
              <span aria-hidden="true" style={{ fontSize: "20px", fontWeight: "400", lineHeight: "1" }}>
                {expanded ? "−" : "+"}
              </span>
            </button>
            {expanded ? (
              <p id={`faq-${f.id}`} style={{ margin: "0 0 14px", fontSize: "14px", color: "var(--color-neutral-800)", maxWidth: "720px" }}>
                {f.a}
              </p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
