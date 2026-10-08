import type { Metadata } from "next";
import { NoBusinessPage } from "@/components/dashboard/no-business";
import { LeadsBoard } from "@/features/leads/leads-board";
import { requireDashboardView } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Leads · Spark Agent" };

// /dashboard/leads. The tenant comes from the session; the browser reads leads as the signed-in member
// under row-level security.
export default async function LeadsPage() {
  const view = await requireDashboardView();
  if (view.kind === "no_business") {
    return <NoBusinessPage eyebrow="Leads" title="Leads" detail="there are no leads to show" />;
  }
  const { tenant } = view.context;
  return <LeadsBoard key={tenant.id} tenantId={tenant.id} timeZone={tenant.timezone} />;
}
