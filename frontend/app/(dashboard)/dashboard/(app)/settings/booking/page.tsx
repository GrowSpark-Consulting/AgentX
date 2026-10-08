import type { Metadata } from "next";
import { NoBusinessPage } from "@/components/dashboard/no-business";
import { BookingSetupScreen } from "@/features/settings/booking-setup-screen";
import { requireDashboardView } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Booking setup · Spark Agent" };

// /dashboard/settings/booking. The tenant and role come from the session; the browser reads and writes
// business hours, resources and services as the signed-in member under row-level security.
export default async function BookingSetupPage() {
  const view = await requireDashboardView();
  if (view.kind === "no_business") {
    return <NoBusinessPage eyebrow="Booking setup" title="Booking setup" detail="there are no hours, staff or services to show" />;
  }
  const { tenant, role } = view.context;
  return <BookingSetupScreen key={tenant.id} tenantId={tenant.id} role={role} />;
}
