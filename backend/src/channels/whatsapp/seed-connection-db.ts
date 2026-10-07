import { supabaseAdmin } from "../../lib/supabase-admin";
import { SeedError, type SeedConnectionRow, type SeedDb } from "./seed-connection";

// The seed script's real database (service role, local use). It reads no secret column and says only the
// Postgres error code when something fails: the message can contain values.

const failed = (what: string, code: string | undefined) => new SeedError(`Could not ${what} (database error ${code ?? "unknown"}).`);

export function createSeedDb(): SeedDb {
  const db = supabaseAdmin();
  return {
    async findTenant(tenantId) {
      const { data, error } = await db.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
      if (error) throw failed("read the business", error.code);
      return data ? { id: String(data.id), name: String(data.name) } : null;
    },

    async findTenantIdByRouteCode(code) {
      const { data, error } = await db.from("route_codes").select("tenant_id").eq("code", code).maybeSingle();
      if (error) throw failed("read the route code", error.code);
      return data ? String(data.tenant_id) : null;
    },

    async findConnectionByPhoneNumberId(phoneNumberId) {
      const { data, error } = await db
        .from("whatsapp_connections")
        .select("id, tenant_id, channel_id, method, display_phone, verified_name")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (error) throw failed("read the connection", error.code);
      return data
        ? {
            id: String(data.id),
            tenantId: String(data.tenant_id),
            channelId: String(data.channel_id),
            method: String(data.method),
            displayPhone: data.display_phone === null ? null : String(data.display_phone),
            verifiedName: data.verified_name === null ? null : String(data.verified_name),
          }
        : null;
    },

    async findWhatsappChannelId(tenantId) {
      const { data, error } = await db
        .from("channels")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("type", "whatsapp")
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw failed("read the channel", error.code);
      return data && data.length > 0 ? String(data[0].id) : null;
    },

    async insertWhatsappChannel(tenantId) {
      const { data, error } = await db.from("channels").insert({ tenant_id: tenantId, type: "whatsapp", status: "active" }).select("id").single();
      if (error) throw failed("create the channel", error.code);
      return String(data.id);
    },

    async upsertConnection(row: SeedConnectionRow) {
      const columns = {
        channel_id: row.channelId,
        method: row.method,
        waba_id: row.wabaId,
        phone_number_id: row.phoneNumberId,
        display_phone: row.displayPhone,
        verified_name: row.verifiedName,
        token_enc: row.tokenEnc,
        token_type: row.tokenType,
        token_expires_at: row.tokenExpiresAt,
        status: row.status,
        connected_by: row.connectedBy,
      };
      // Update first, filtered by the business, so a re-run can never touch another business's row.
      const updated = await db.from("whatsapp_connections").update(columns).eq("id", row.id).eq("tenant_id", row.tenantId).select("id");
      if (updated.error) throw failed("update the connection", updated.error.code);
      if (updated.data && updated.data.length > 0) return;
      const inserted = await db.from("whatsapp_connections").insert({ id: row.id, tenant_id: row.tenantId, ...columns });
      if (inserted.error) throw failed("create the connection", inserted.error.code);
    },
  };
}
