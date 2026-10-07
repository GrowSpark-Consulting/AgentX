import type { Metadata } from "next";
import { z } from "zod";
import { NoBusinessPage } from "@/components/dashboard/no-business";
import { InboxScreen } from "@/features/inbox/inbox-screen";
import { requireDashboardView } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Inbox · Spark Agent" };

// /dashboard/inbox[?chat=<conversation id>]. The tenant comes from the session (never the URL); the
// chat id only picks which of the member's own conversations opens first.
export default async function InboxPage({ searchParams }: PageProps<"/dashboard/inbox">) {
  const view = await requireDashboardView();
  if (view.kind === "no_business") {
    return <NoBusinessPage eyebrow="Inbox" title="Inbox" detail="there are no chats to show" />;
  }
  const chat = (await searchParams).chat;
  const initialChatId = z.guid().safeParse(Array.isArray(chat) ? chat[0] : chat);
  const { tenant } = view.context;
  return (
    <InboxScreen
      key={tenant.id}
      tenantId={tenant.id}
      timeZone={tenant.timezone}
      initialChatId={initialChatId.success ? initialChatId.data : null}
    />
  );
}
