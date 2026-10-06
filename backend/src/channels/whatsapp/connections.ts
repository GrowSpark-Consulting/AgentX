import type { WhatsAppConnectionPublic } from "@pakka/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/errors";

// Only the non-secret columns of the public view (docs/handover.md, migration 0003). Tokens and app
// secrets live in whatsapp_connections, which the browser and this read never touch.
const PUBLIC_COLUMNS =
  "id, tenant_id, method, waba_id, phone_number_id, display_phone, verified_name, coexistence, status, last_check, quality_rating, messaging_limit, created_at";

export type ConnectionsResult =
  | { state: "ok"; connections: WhatsAppConnectionPublic[] }
  /** The view doesn't exist yet (migration 0003 not applied). */
  | { state: "unavailable" };

/** PostgREST: relation not found in the schema cache. */
const MISSING_RELATION = "PGRST205";

/** The signed-in member's WhatsApp connections, read from `whatsapp_connections_public`. */
export async function getWhatsAppConnections(
  client: SupabaseClient,
  tenantId: string,
): Promise<ConnectionsResult> {
  const { data, error } = await client
    .from("whatsapp_connections_public")
    .select(PUBLIC_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .returns<WhatsAppConnectionPublic[]>();

  if (error) {
    if (error.code === MISSING_RELATION) return { state: "unavailable" };
    throw new AppError("upstream_failed", "We couldn't load your WhatsApp connection. Try again in a moment.");
  }
  return { state: "ok", connections: data ?? [] };
}

/** True if any connection can send messages. */
export function hasActiveConnection(result: ConnectionsResult): boolean {
  return result.state === "ok" && result.connections.some((c) => c.status === "active");
}
