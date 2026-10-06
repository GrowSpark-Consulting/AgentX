import { SendTestMessageInput, type SendTestMessageResult, type TenantContext } from "@pakka/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/errors";
import { requireRole } from "../../lib/tenant";
import { getWhatsAppConnections, hasActiveConnection } from "./connections";

/**
 * Sends a test WhatsApp message from the business's connected number (Meta App Review flow).
 *
 * The WhatsApp adapter (module 1, Dev 1) and `whatsapp_connections` (migration 0003) don't exist
 * yet, so this never reports a send it didn't make: it validates the request, checks the role and
 * the connection, and answers `whatsapp_not_connected`. When the adapter lands, the send replaces
 * the final throw: look up the active connection, call the adapter's sendText (outside the
 * 24-hour window only a template may go out), and log the message.
 */
export async function sendTestMessage(
  client: SupabaseClient,
  context: TenantContext,
  rawInput: unknown,
): Promise<SendTestMessageResult> {
  // Validated now; the adapter will send `to` and `body` once it exists.
  SendTestMessageInput.parse(rawInput);
  requireRole(context, ["owner", "admin"], "send a test message");

  const connections = await getWhatsAppConnections(client, context.tenant.id);
  if (!hasActiveConnection(connections)) {
    throw new AppError(
      "whatsapp_not_connected",
      "This business has no connected WhatsApp number yet, so the message was not sent. Connect a number, then try again.",
    );
  }

  // An active connection exists but there is no adapter to send through yet.
  throw new AppError(
    "not_available",
    "Sending from the dashboard isn't switched on yet, so the message was not sent.",
  );
}
