import type { Metadata } from "next";
import { Suspense } from "react";
import { NoBusinessPage } from "@/components/dashboard/no-business";
import { WhatsAppConnectionPanel } from "@/components/dashboard/whatsapp-connection-panel";
import { LoadingState } from "@/components/shared/states";
import { requireDashboardView } from "@/lib/auth/session";

export const metadata: Metadata = { title: "WhatsApp · Spark Agent" };

export default async function WhatsAppPage() {
  const view = await requireDashboardView();
  if (view.kind === "no_business") {
    return <NoBusinessPage eyebrow="WhatsApp" title="WhatsApp connection" detail="there's no WhatsApp connection to show" />;
  }
  const { tenant } = view.context;
  return (
    <div className="app-page">
      <div>
        <p className="app-eyebrow">WhatsApp</p>
        <h1 className="app-h1">WhatsApp connection</h1>
        <p className="app-lede">The number your assistant replies from, and how Meta rates it.</p>
      </div>
      <Suspense fallback={<LoadingState title="Checking your WhatsApp connection" />}>
        <WhatsAppConnectionPanel tenantId={tenant.id} />
      </Suspense>
    </div>
  );
}
