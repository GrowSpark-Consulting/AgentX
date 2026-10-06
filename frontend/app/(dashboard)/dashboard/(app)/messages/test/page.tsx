import { getWhatsAppConnections, hasActiveConnection } from "@pakka/backend/channels/whatsapp/connections";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { NoBusinessPage } from "@/components/dashboard/no-business";
import { SendTestMessageForm, type ConnectionHint } from "@/components/dashboard/send-test-message-form";
import { getAuth, requireDashboardView } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Send a test message · Pakka" };

export default async function SendTestMessagePage() {
  const view = await requireDashboardView();
  if (view.kind === "no_business") {
    return <NoBusinessPage eyebrow="WhatsApp" title="Send a test message" detail="there's no WhatsApp number to send from" />;
  }
  const { tenant } = view.context;

  let connection: ConnectionHint = "unknown";
  try {
    const { supabase } = await getAuth();
    connection = hasActiveConnection(await getWhatsAppConnections(supabase, tenant.id)) ? "connected" : "not_connected";
  } catch (err) {
    unstable_rethrow(err);
    // The form still works; the API reports the real state on send.
  }

  return (
    <div className="app-page">
      <div>
        <p className="app-eyebrow">WhatsApp</p>
        <h1 className="app-h1">Send a test message</h1>
        <p className="app-lede">
          Send a WhatsApp message from {tenant.name}&apos;s number to any phone, to check the connection works.
        </p>
      </div>
      <SendTestMessageForm connection={connection} businessName={tenant.name} />
    </div>
  );
}
