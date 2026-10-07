"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { formatError, type FormattedError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { documentMeta, listKbDocuments, type KbDocument } from "./kb-content";

// "Documents", ported from the /dashboard/preview Knowledge base (features/knowledge/pakka-knowledge.tsx):
// title over a 2px ink rule with a ghost Upload, then a grid of file tiles (ink label block, name,
// one line of detail on --color-surface).
//
// Reads the business's kb_documents under RLS: title, source type and date. Two things are not shown
// because nothing stores them: a processing status (kb_documents has no status column, although the
// PROPOSED KnowledgeBase shape lists one) and the prototype's "sent 62 times" counts (those describe
// files sent to customers, not knowledge sources).
//
// Upload is switched off: POST /api/kb/documents (HANDOVER · Dev 1: upload, chunk, embed) isn't built,
// and its request, response, accepted file types and processing states aren't defined. No file is
// picked or sent from here until that contract exists.

type ListState = { status: "loading" } | { status: "error"; error: FormattedError } | { status: "ready"; documents: KbDocument[] };

export function Documents({ tenantId, timeZone }: { tenantId: string; timeZone: string }) {
  const [list, setList] = useState<ListState>({ status: "loading" });

  const load = useCallback(
    () =>
      listKbDocuments(getSupabaseBrowserClient(), tenantId).then(
        (documents) => setList({ status: "ready", documents }),
        (err: unknown) => setList({ status: "error", error: formatError(err) }),
      ),
    [tenantId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function retry() {
    setList({ status: "loading" });
    void load();
  }

  const documents = list.status === "ready" ? list.documents : [];

  return (
    <section aria-labelledby="documents-heading" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px", gap: "12px" }}>
        <h2 id="documents-heading" style={{ margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" }}>
          Documents{list.status === "ready" ? ` · ${documents.length}` : ""}
        </h2>
        <button type="button" className="btn btn-ghost" disabled aria-describedby="documents-upload-note">
          Upload
        </button>
      </div>
      <p id="documents-upload-note" className="app-hint" style={{ margin: 0 }}>
        Uploading documents isn’t switched on yet, so nothing is sent from here.
      </p>

      {list.status === "loading" ? <LoadingState compact title="Loading documents" /> : null}
      {list.status === "error" ? (
        <ErrorState compact title="Couldn't load your documents" description={list.error.message} onRetry={retry} />
      ) : null}
      {list.status === "ready" && documents.length === 0 ? (
        <EmptyState compact title="No documents yet" description="Documents added to your knowledge base appear here." />
      ) : null}

      {documents.length > 0 ? (
        <ul aria-label="Documents" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "12px" }}>
          {documents.map((d) => (
            <li key={d.id} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "14px", background: "var(--color-surface)", minWidth: 0 }}>
              <span aria-hidden="true" style={{ width: "36px", height: "44px", background: "var(--color-text)", color: "var(--color-bg)", fontSize: "10px", fontWeight: "800", display: "grid", placeItems: "center", flex: "none" }}>
                {d.label}
              </span>
              <span style={{ minWidth: "0" }}>
                <span title={d.name} style={{ display: "block", fontWeight: "600", fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {d.name}
                </span>
                <span style={{ fontSize: "12px", color: "var(--color-neutral-700)" }}>{documentMeta(d, timeZone)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
