import type { Metadata } from "next";
import { NoBusinessPage } from "@/components/dashboard/no-business";
import { KnowledgeScreen } from "@/features/knowledge/knowledge-screen";
import { requireDashboardView } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Knowledge base · Pakka" };

// /dashboard/knowledge. The tenant comes from the session; the browser reads and writes services, and
// reads kb_documents, as the signed-in member under row-level security.
export default async function KnowledgePage() {
  const view = await requireDashboardView();
  if (view.kind === "no_business") {
    return <NoBusinessPage eyebrow="Knowledge base" title="Knowledge base" detail="there are no services or documents to show" />;
  }
  const { tenant } = view.context;
  return <KnowledgeScreen key={tenant.id} tenantId={tenant.id} timeZone={tenant.timezone} />;
}
