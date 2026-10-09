import { z } from "zod";

/** The two modes staff can switch a conversation between. `external` (the owner replying from their own number) is set elsewhere and is never chosen here. */
export const STAFF_SELECTABLE_MODES = ["ai", "human"] as const;
export type StaffSelectableMode = (typeof STAFF_SELECTABLE_MODES)[number];

/** Body of POST /api/conversations/:id/mode. Strict: anything else is refused, not dropped. */
export const SetConversationModeInput = z.object({ mode: z.enum(STAFF_SELECTABLE_MODES) }).strict();
export type SetConversationModeInput = z.infer<typeof SetConversationModeInput>;

/**
 * Result of POST /api/conversations/:id/mode. `changed` is false when the chat was already in that mode
 * (a second click, or two people at once): nothing was written and no note was added.
 */
export interface SetConversationModeResult {
  mode: StaffSelectableMode;
  changed: boolean;
}
