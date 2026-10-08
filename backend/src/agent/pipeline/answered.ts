import type { AuditEntry } from "../../lib/audit";
import { ANSWERED_ACTION } from "./events";

const TAG = "[pipeline]";
const AUDIT_TRIES = 3;

/**
 * `message.answered` for every message of the turn (the marker process-message reads to skip a message, docs/contracts.md
 * section 5). A few tries each; a failure is logged and never thrown, because the callers write these right after a send
 * (or an opt-out) and throwing would retry the step and do it again.
 */
export async function recordAnswered(turn: { tenantId: string; messageIds: readonly string[] }, deps: { audit: (entry: AuditEntry) => Promise<void> }): Promise<void> {
  for (const messageId of turn.messageIds) {
    let written = false;
    for (let attempt = 1; attempt <= AUDIT_TRIES && !written; attempt++) {
      try {
        await deps.audit({ tenantId: turn.tenantId, actor: "ai", action: ANSWERED_ACTION, entity: "message", entityId: messageId });
        written = true;
      } catch {
        // tried again
      }
    }
    if (!written) console.error(`${TAG} could not record that message ${messageId} was answered (business ${turn.tenantId})`);
  }
}
