import type { HandoffTrigger } from "@pakka/types";
import type { AuditEntry } from "../../lib/audit";
import type { HandoffPriority, PipelineStore } from "./store";

const TAG = "[pipeline]";

type HandoffDeps = {
  store: Pick<PipelineStore, "openHandoff">;
  audit: (entry: AuditEntry) => Promise<void>;
  sendEvent: (event: { id: string; name: "handoff.opened"; data: { tenantId: string; handoffId: string; conversationId: string } }) => Promise<unknown>;
};

/**
 * The handoff row for this chat, its audit row (once, by the run that made it) and the `handoff.opened` event. Safe to run
 * again: an open handoff is reused, and the event id `handoff_opened:<handoffId>` makes the same handoff one event however
 * often it is sent, so a retry after a failure between the row and the event still tells staff. Shared by the reply step
 * and the STOP check. Nothing here writes the chat's mode or messages the customer.
 */
export async function recordHandoff(
  scope: { tenantId: string; conversationId: string },
  handoff: { trigger: HandoffTrigger; priority: HandoffPriority },
  deps: HandoffDeps,
): Promise<{ id: string; created: boolean }> {
  const opened = await deps.store.openHandoff(scope.tenantId, scope.conversationId, handoff.trigger, handoff.priority);
  if (opened.created) {
    try {
      await deps.audit({ tenantId: scope.tenantId, actor: "ai", action: "handoff.opened", entity: "handoff", entityId: opened.id, diff: { trigger: handoff.trigger } });
    } catch {
      console.error(`${TAG} could not record the handoff (business ${scope.tenantId})`);
    }
  }
  await deps.sendEvent({ id: `handoff_opened:${opened.id}`, name: "handoff.opened", data: { tenantId: scope.tenantId, handoffId: opened.id, conversationId: scope.conversationId } });
  return opened;
}
