import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase-admin";

// Server-only wrappers over the SQL functions in migration 0005, the only writers of credit_ledger.

export type SpendReason = "ai_reply" | "template_utility" | "template_marketing" | "staff_alert" | "admin";
export type Balance = { plan: number; topup: number; total: number };

// z.guid, not z.uuid: seeded ids such as d0000000-0000-0000-0000-000000000001 are valid Postgres
// uuids but not RFC 9562, and z.uuid would reject them.
const TenantId = z.guid();
const RefId = z.guid().optional();
const Amount = z.number().int().positive();
const BalanceRow = z.object({ plan: z.number().int(), topup: z.number().int(), total: z.number().int() });

/** Spends soonest-expiring credits first. Returns false, and writes nothing, when the balance is too low. */
export async function spendCredits(
  tenantId: string,
  amount: number,
  reason: SpendReason,
  refId?: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("spend_credits", {
    p_tenant_id: TenantId.parse(tenantId),
    p_amount: Amount.parse(amount),
    p_reason: reason,
    p_ref_id: RefId.parse(refId) ?? null,
  });
  if (error) throw new Error(`spend_credits failed: ${error.message}`);
  return z.boolean().parse(data);
}

/** Gives back the credits spent under refId (a message that was not sent), into the same buckets. Returns the amount. */
export async function refundCredits(tenantId: string, refId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("refund_credits", {
    p_tenant_id: TenantId.parse(tenantId),
    p_ref_id: z.guid().parse(refId),
  });
  if (error) throw new Error(`refund_credits failed: ${error.message}`);
  return z.number().int().parse(data);
}

/** Live balance: plan credits (plan, trial and admin grants) and unexpired top-ups. */
export async function getBalance(tenantId: string): Promise<Balance> {
  const { data, error } = await supabaseAdmin().rpc("credit_balance", { p_tenant_id: TenantId.parse(tenantId) });
  if (error) throw new Error(`credit_balance failed: ${error.message}`);
  const [row] = z.array(BalanceRow).length(1).parse(data);
  return row;
}
