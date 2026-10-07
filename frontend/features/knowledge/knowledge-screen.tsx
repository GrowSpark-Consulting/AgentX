"use client";

import { Documents } from "./documents";
import { FaqList } from "./faq-list";
import { GapsList } from "./gaps-list";
import type { FaqItem, GapItem, SectionSource } from "./kb-content";
import { ServicesEditor } from "./services-editor";

// The real Knowledge base page: the /dashboard/preview screen's header and sections, in the
// prototype's order (features/knowledge/pakka-knowledge.tsx: 42px title, 36px between sections, 960px
// of content). Services and documents read real data. FAQs and unanswered questions have no backend
// contract yet (see kb-content.ts), so they show as not available, with no data and no saves.
// Website sync (POST /api/onboarding/import-site, Dev 1) is not built and has no button here.

const GAPS: SectionSource<GapItem> = {
  status: "unavailable",
  reason: "The AI doesn’t keep a list of questions it couldn’t answer yet. They’ll show here once it does.",
};
const FAQS: SectionSource<FaqItem> = {
  status: "unavailable",
  reason: "FAQs can’t be saved yet. Once they can, the ones you add appear here.",
};

export function KnowledgeScreen({ tenantId, timeZone }: { tenantId: string; timeZone: string }) {
  return (
    // 960px: the prototype's 1040px included its own 40px side padding, which .app-main gives here.
    <div style={{ display: "flex", flexDirection: "column", gap: "36px", maxWidth: "960px", color: "var(--color-text)" }}>
      <div>
        <h1 className="app-h1">Knowledge base</h1>
        <p style={{ margin: "4px 0 0", color: "var(--color-neutral-700)" }}>What customers can book, how long it takes and what it costs.</p>
      </div>
      <GapsList source={GAPS} />
      <ServicesEditor tenantId={tenantId} />
      <FaqList source={FAQS} />
      <Documents tenantId={tenantId} timeZone={timeZone} />
    </div>
  );
}
