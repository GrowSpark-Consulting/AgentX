import { z } from "zod";
import { nameForPrompt } from "../prompts/shared";

// What the reply step reads from `tenants.agent_settings` (jsonb the dashboard writes; members may update it under
// RLS). The keys are the ones the Agent settings screen saves (docs/dashboard-screen-contracts.md, "Agent settings":
// `persona`, `tone`, `handoffTriggers`, and `privacyNotice` for the consent notice), validated here, because a business can type anything into it. Anything that
// is missing or not the expected shape is ignored (the default persona and tone are used), never an error: a broken
// setting must not stop a customer's reply.

const TRIGGER_KEYS = { kb_gap: ["kb_gap", "gap"] } as const;

const Settings = z.object({
  persona: z.string().optional().catch(undefined),
  tone: z.enum(["friendly", "formal"]).optional().catch(undefined),
  privacyNotice: z.boolean().optional().catch(undefined),
  handoffTriggers: z
    .array(z.object({ key: z.string(), enabled: z.boolean().optional().catch(undefined) }).catch({ key: "", enabled: undefined }))
    .optional()
    .catch(undefined),
});

export interface ReplySettings {
  /** The assistant's name, if the business chose one (a name, not a sentence). */
  persona: string | null;
  tone: "friendly" | "formal";
  /** The business switched the "doesn't know the answer twice" handover off. */
  kbGapHandoffEnabled: boolean;
  /** The first AI reply to a contact carries the privacy notice. Off unless the business turns it on (Raja, 9 Oct: switchable if legal review requires it). */
  privacyNotice: boolean;
}

export function parseReplySettings(raw: unknown): ReplySettings {
  const parsed = Settings.safeParse(raw);
  const settings = parsed.success ? parsed.data : {};
  const persona = nameForPrompt(settings.persona ?? "", 30);
  const kbGap = settings.handoffTriggers?.find((t) => (TRIGGER_KEYS.kb_gap as readonly string[]).includes(t.key));
  return { persona: persona || null, tone: settings.tone ?? "friendly", kbGapHandoffEnabled: kbGap?.enabled !== false, privacyNotice: settings.privacyNotice === true };
}
