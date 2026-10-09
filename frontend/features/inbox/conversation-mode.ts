import { STAFF_SELECTABLE_MODES } from "@pakka/types";
import { z } from "zod";
import { postJson } from "@/lib/api/client";

// Takeover and Return to AI, POST /api/conversations/:id/mode (backend/src/conversations/mode.ts). The business
// goes in X-Pakka-Tenant, never the body. The API adds the system note; it reaches the chat through realtime.

export type StaffMode = (typeof STAFF_SELECTABLE_MODES)[number];

const Result = z.object({ mode: z.enum(STAFF_SELECTABLE_MODES), changed: z.boolean() });
export type ModeResult = z.infer<typeof Result>;

export class ModeDataError extends Error {
  constructor() {
    super("The answer to the switch had an unexpected shape.");
    this.name = "ModeDataError";
  }
}

export async function switchMode(tenantId: string, conversationId: string, mode: StaffMode): Promise<ModeResult> {
  const json = await postJson<unknown>(`/api/conversations/${encodeURIComponent(conversationId)}/mode`, { mode }, { tenantId });
  const parsed = Result.safeParse(json);
  if (!parsed.success) throw new ModeDataError();
  return parsed.data;
}

/** The text above the AI / Human switch for a chat in this mode; also what the buttons are described by. */
export function switchNote(mode: "ai" | "human" | "external"): string {
  if (mode === "ai") return "The AI replies until a team member takes over.";
  if (mode === "human") return "Return to AI hands the chat back to the AI.";
  return "This chat is handled from the business’s own WhatsApp number, so it can’t be switched here.";
}
