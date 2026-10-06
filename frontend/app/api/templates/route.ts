import { createTemplate } from "@pakka/backend/notify/templates";
import { tenantRoute } from "@/lib/api/route";

// POST /api/templates { name, category, language, body, examples } → CreateTemplateResult. Owner or admin.
export const POST = tenantRoute(({ context, body }) => createTemplate(context, body));
