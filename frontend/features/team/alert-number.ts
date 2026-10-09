import { PhoneInput } from "@pakka/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SetupError } from "@/features/settings/resources-data";

// The signed-in member's WhatsApp alert number: memberships.whatsapp_phone (0001), the number staff
// alerts go to. Each member updates only their own row's whatsapp_phone and takeover_pref (0002,
// own_preferences; docs/contracts.md "Member writes from the browser"), so this reads and writes that
// one row directly under RLS, always filtered by business and user. Stored as E.164, the format the
// staff alert checks (PhoneInput in @pakka/types). Takeover preference and alert choices aren't here:
// the own-number option needs a plan entitlement the browser can't read yet, and alert choices have
// no column.

const OwnRow = z.object({ tenant_id: z.guid(), user_id: z.guid(), whatsapp_phone: z.string().nullable() });
const COLUMNS = "tenant_id, user_id, whatsapp_phone";

function ownNumber(data: unknown, tenantId: string, userId: string, what: string): string | null | undefined {
  const parsed = z.array(OwnRow).safeParse(data ?? []);
  if (!parsed.success) throw new SetupError("invalid_response", `Your ${what} had an unexpected shape.`);
  const row = parsed.data.find((r) => r.tenant_id === tenantId && r.user_id === userId);
  return row === undefined ? undefined : row.whatsapp_phone?.trim() || null;
}

/** The member's alert number, or null when they haven't set one. */
export async function fetchAlertNumber(client: SupabaseClient, tenantId: string, userId: string): Promise<string | null> {
  const { data, error } = await client.from("memberships").select(COLUMNS).eq("tenant_id", tenantId).eq("user_id", userId).limit(1);
  if (error) throw error;
  const phone = ownNumber(data, tenantId, userId, "membership");
  // Every member has their own row; not seeing it means the session no longer matches this business.
  if (phone === undefined) throw new SetupError("not_found", "Your membership of this business couldn't be found. Refresh and try again.");
  return phone;
}

/**
 * Sets (or, with null, removes) the member's alert number. Row-level security refuses a row that isn't
 * the member's own by updating nothing, so no row back means nothing was saved.
 */
export async function saveAlertNumber(client: SupabaseClient, tenantId: string, userId: string, phone: string | null): Promise<string | null> {
  const { data, error } = await client.from("memberships").update({ whatsapp_phone: phone }).eq("tenant_id", tenantId).eq("user_id", userId).select(COLUMNS);
  if (error) throw error;
  const saved = ownNumber(data, tenantId, userId, "alert number");
  if (saved === undefined) throw new SetupError("not_found", "Your number wasn't saved. Refresh and try again.");
  return saved;
}

/**
 * Validates a typed number. Spaces, dashes, dots and brackets people type between digits are dropped;
 * what's left must be E.164 (a +, the country code, then the number).
 */
export function validateAlertNumber(raw: string): { ok: true; phone: string } | { ok: false; message: string } {
  const compact = raw.trim().replace(/[\s().-]/g, "");
  if (!compact) return { ok: false, message: "Enter your WhatsApp number" };
  const parsed = PhoneInput.safeParse(compact);
  return parsed.success ? { ok: true, phone: parsed.data } : { ok: false, message: parsed.error.issues[0]?.message ?? "Enter the number with country code" };
}
