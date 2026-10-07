"use client";

import { ServicesEditor } from "./services-editor";

// The real Knowledge base page: the /dashboard/preview screen's header and section layout
// (features/knowledge/pakka-knowledge.tsx: 42px title, 36px between sections, 960px of content), with the
// sections whose data exists. FAQs, documents, "questions the AI couldn't answer" and website sync
// arrive with their backend contracts; nothing stands in for them here.

export function KnowledgeScreen({ tenantId }: { tenantId: string }) {
  return (
    // 960px: the prototype's 1040px included its own 40px side padding, which .app-main gives here.
    <div style={{ display: "flex", flexDirection: "column", gap: "36px", maxWidth: "960px", color: "var(--color-text)" }}>
      <div>
        <h1 className="app-h1">Knowledge base</h1>
        <p style={{ margin: "4px 0 0", color: "var(--color-neutral-700)" }}>What customers can book, how long it takes and what it costs.</p>
      </div>
      <ServicesEditor tenantId={tenantId} />
    </div>
  );
}
