import { z } from "zod";

// UNVERIFIED INPUT. Everything this file returns comes from a body whose signature has NOT been
// checked. Use it only to find the connection (and so the app secret) to verify the signature with.
// Do not store, trust, log or act on any of it until verifySignature has passed, and then read the
// ids again from the parsed, verified body.
//
// Field names, from Meta's webhook reference: entry[].id is the WhatsApp Business Account id, and
// entry[].changes[].value.metadata.phone_number_id is the receiving number. Echo events
// (smb_message_echoes) may carry the metadata somewhere else: unconfirmed.

const Payload = z.object({
  entry: z
    .array(
      z.object({
        id: z.string().min(1),
        changes: z
          .array(
            z.object({
              value: z
                .object({
                  metadata: z.object({ phone_number_id: z.string().min(1) }).optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .default([]),
});

export type UnverifiedRouting = { wabaId: string; phoneNumberId?: string };

export function extractUnverifiedRouting(rawBody: Uint8Array | string): UnverifiedRouting[] {
  try {
    const text = typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString("utf8");
    const parsed = Payload.safeParse(JSON.parse(text));
    if (!parsed.success) return [];

    const seen = new Set<string>();
    const found: UnverifiedRouting[] = [];
    for (const entry of parsed.data.entry) {
      const numbers = new Set<string | undefined>(
        (entry.changes ?? []).map((c) => c.value?.metadata?.phone_number_id),
      );
      if (numbers.size === 0) numbers.add(undefined);
      for (const phoneNumberId of numbers) {
        const key = `${entry.id}|${phoneNumberId ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(phoneNumberId === undefined ? { wabaId: entry.id } : { wabaId: entry.id, phoneNumberId });
      }
    }
    return found;
  } catch {
    return [];
  }
}
