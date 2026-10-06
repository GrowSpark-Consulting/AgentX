import { sendTestMessage } from "@pakka/backend/channels/whatsapp/test-message";
import { tenantRoute } from "@/lib/api/route";

// POST /api/messages/test { to, body } → SendTestMessageResult. Owner or admin.
export const POST = tenantRoute(({ supabase, context, body }) => sendTestMessage(supabase, context, body));
