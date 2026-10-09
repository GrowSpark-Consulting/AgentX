import { SetConversationModeInput, type SetConversationModeResult, type StaffSelectableMode, type TenantContext } from "@pakka/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { supabaseAdmin } from "../lib/supabase-admin";
import { requireRole } from "../lib/tenant";

// POST /api/conversations/:id/mode: staff take a chat over from the AI ("human") or hand it back ("ai").
// One responder per chat: the AI answers only in `ai` (pipeline/gate.ts, and again right before it sends), and
// staff replies are refused in `ai` (staff-reply.ts). docs/handover.md, module 6: takeover sets the mode and
// assigns the staff member; Return to AI sets it back and adds a system note.
//
// The note is a `messages` row with sender 'system' (the inbox shows it as a centred note, keeps it out of the
// list preview, and the agent's history ignores it). It has no provider_msg_id and is never sent to the customer.
// Everything here runs with the service role, so every query filters by the caller's business.

const NOTES: Record<StaffSelectableMode, string> = {
  human: "A team member took over this chat. The AI won’t reply.",
  ai: "Returned to the AI. It will reply to new messages.",
};
const EVENTS: Record<StaffSelectableMode, string> = { human: "takeover", ai: "return_to_ai" };

const ConversationId = z.guid();
const Row = z.object({ id: z.string(), mode: z.enum(["ai", "human", "external"]) });

const notFound = () => new AppError("not_found", "That conversation was not found.");

async function readMode(db: SupabaseClient, tenantId: string, id: string) {
  const { data, error } = await db.from("conversations").select("id, mode").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`read conversation mode failed: ${error.message}`);
  return data ? Row.parse(data).mode : null;
}

export async function setConversationMode(
  context: TenantContext,
  conversationId: string,
  rawInput: unknown,
  db: SupabaseClient = supabaseAdmin(),
): Promise<SetConversationModeResult> {
  requireRole(context, ["owner", "admin", "staff"], "change who replies");
  if (!ConversationId.safeParse(conversationId).success) throw notFound();
  const { mode: target } = SetConversationModeInput.parse(rawInput);
  const tenantId = context.tenant.id;

  const current = await readMode(db, tenantId, conversationId);
  if (current === null) throw notFound();
  if (current === target) return { mode: target, changed: false };
  if (current === "external") {
    throw new AppError("conflict", "This chat is being handled from the business’s own WhatsApp number, so it can’t be switched here.");
  }

  // Compare-and-set on the mode we just read: if the AI (a handoff) or another person changed it meanwhile,
  // nothing is written and the caller is told, instead of overwriting a newer decision.
  const { data: updated, error } = await db
    .from("conversations")
    .update({ mode: target, assigned_user_id: target === "human" ? context.user.id : null })
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .eq("mode", current)
    .select("id");
  if (error) throw new Error(`switch conversation mode failed: ${error.message}`);
  if (!Array.isArray(updated) || updated.length === 0) {
    const now = await readMode(db, tenantId, conversationId);
    if (now === target) return { mode: target, changed: false };
    throw new AppError("conflict", "This chat was just changed by someone else. Check who is replying, then try again.");
  }

  // The switch is what matters; the note and the audit entry are best effort and never undo it.
  const note = await db.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    direction: "out",
    sender: "system",
    body: NOTES[target],
    meta: { event: EVENTS[target] },
  });
  if (note.error) console.error(`[conversations] the ${EVENTS[target]} note was not saved: ${note.error.message}`);
  const audit = await db.from("audit_logs").insert({
    tenant_id: tenantId,
    actor: context.user.id,
    action: "conversation.mode_changed",
    entity: "conversation",
    entity_id: conversationId,
    diff: { from: current, to: target },
  });
  if (audit.error) console.error(`[conversations] the mode change was not audited: ${audit.error.message}`);

  return { mode: target, changed: true };
}
