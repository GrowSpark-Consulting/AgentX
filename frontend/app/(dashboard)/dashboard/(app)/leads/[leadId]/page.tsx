import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { NoBusinessPage } from "@/components/dashboard/no-business";
import { EmptyState } from "@/components/shared/states";
import { LeadDetail } from "@/features/leads/lead-detail";
import { requireDashboardView } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Lead · Spark Agent" };

// /dashboard/leads/<lead id>. The id only picks one of the member's own leads: reads filter by the
// session's tenant and RLS, so another business's id shows "not available".
export default async function LeadPage({ params }: PageProps<"/dashboard/leads/[leadId]">) {
  const view = await requireDashboardView();
  if (view.kind === "no_business") {
    return <NoBusinessPage eyebrow="Leads" title="Lead" detail="there are no leads to show" />;
  }
  const { leadId } = await params;
  const id = z.guid().safeParse(leadId);
  if (!id.success) {
    return (
      <EmptyState
        title="This lead isn't available"
        description="The link doesn't point to a lead."
        action={
          <Link className="btn btn-secondary" href="/dashboard/leads">
            All leads
          </Link>
        }
      />
    );
  }
  const { tenant, user } = view.context;
  return <LeadDetail key={`${tenant.id}:${id.data}`} tenantId={tenant.id} timeZone={tenant.timezone} leadId={id.data} userId={user.id} />;
}
