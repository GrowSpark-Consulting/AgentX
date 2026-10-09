import type { Metadata } from "next";
import { NoBusinessPage } from "@/components/dashboard/no-business";
import { TeamScreen } from "@/features/team/team-screen";
import { requireDashboardView } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Team · Spark Agent" };

// /dashboard/team. The business and the member come from the session; the browser reads and updates
// only the member's own membership row (their WhatsApp alert number) under row-level security.
export default async function TeamPage() {
  const view = await requireDashboardView();
  if (view.kind === "no_business") {
    return <NoBusinessPage eyebrow="Team" title="Team" detail="there's no team to show" />;
  }
  const { tenant, user } = view.context;
  return <TeamScreen key={`${tenant.id}:${user.id}`} tenantId={tenant.id} userId={user.id} />;
}
