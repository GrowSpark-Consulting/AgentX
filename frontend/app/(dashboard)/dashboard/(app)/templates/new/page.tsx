import type { Metadata } from "next";
import { CreateTemplateForm } from "@/components/dashboard/create-template-form";
import { NoBusinessPage } from "@/components/dashboard/no-business";
import { requireDashboardView } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create a template · Spark Agent" };

export default async function CreateTemplatePage() {
  const view = await requireDashboardView();
  // The form reads the member's role from TenantProvider, which isn't there without a business.
  if (view.kind === "no_business") {
    return <NoBusinessPage eyebrow="WhatsApp" title="Create a message template" detail="there's no business to create templates for" />;
  }
  const { tenant } = view.context;
  return (
    <div className="app-page">
      <div>
        <p className="app-eyebrow">WhatsApp</p>
        <h1 className="app-h1">Create a message template</h1>
        <p className="app-lede">
          Templates are how {tenant.name} messages customers outside the 24-hour reply window. Meta reviews each one
          before it can be sent.
        </p>
      </div>
      <CreateTemplateForm />
    </div>
  );
}
