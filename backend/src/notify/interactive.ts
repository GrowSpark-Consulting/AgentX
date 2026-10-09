import { z } from "zod";

// Reply buttons and list messages (Meta Cloud API "interactive" messages). They are free-form, so WhatsApp takes them
// only inside the 24-hour window; outside it notify.send sends the kind's approved template instead. Meta's limits are
// checked here, before any credit is spent: a list or buttons that would not fit never reach WhatsApp. A tap comes back
// as an inbound message whose buttonId is the button's or row's `id` (channels/whatsapp/parse.ts).

const nonBlank = (s: string) => s.trim() !== "";
/** One line of at most `max` characters: titles, ids, headers and footers. */
const oneLine = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => nonBlank(s) && !/[\r\n]/.test(s), { message: "must be one line of text" });
/** Body text: line breaks allowed. */
const body = (max: number) => z.string().max(max).refine(nonBlank, { message: "must not be empty" });

const ReplyButton = z.object({ id: oneLine(256), title: oneLine(20) });
const ListRow = z.object({ id: oneLine(200), title: oneLine(24), description: oneLine(72).optional() });
const ListSection = z.object({ title: oneLine(24).optional(), rows: z.array(ListRow).min(1) });

export const LIST_ROWS_MAX = 10;

const duplicates = (values: string[]) => values.length !== new Set(values).size;

export const Interactive = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("buttons"),
      header: oneLine(60).optional(),
      body: body(1024),
      footer: oneLine(60).optional(),
      /** One to three reply buttons. */
      buttons: z.array(ReplyButton).min(1).max(3),
    })
    .superRefine((message, ctx) => {
      if (duplicates(message.buttons.map((b) => b.id))) ctx.addIssue({ code: "custom", path: ["buttons"], message: "button ids must be unique" });
      if (duplicates(message.buttons.map((b) => b.title))) ctx.addIssue({ code: "custom", path: ["buttons"], message: "button titles must be unique" });
    }),
  z
    .object({
      type: z.literal("list"),
      header: oneLine(60).optional(),
      body: body(4096),
      footer: oneLine(60).optional(),
      /** The label of the button that opens the list. */
      button: oneLine(20),
      sections: z.array(ListSection).min(1).max(10),
    })
    .superRefine((message, ctx) => {
      const rows = message.sections.flatMap((s) => s.rows);
      if (rows.length > LIST_ROWS_MAX) ctx.addIssue({ code: "custom", path: ["sections"], message: `at most ${LIST_ROWS_MAX} rows in all` });
      if (duplicates(rows.map((r) => r.id))) ctx.addIssue({ code: "custom", path: ["sections"], message: "row ids must be unique" });
      if (message.sections.length > 1 && message.sections.some((s) => s.title === undefined)) {
        ctx.addIssue({ code: "custom", path: ["sections"], message: "every section needs a title when there are several" });
      }
    }),
]);
export type Interactive = z.infer<typeof Interactive>;

/** The message as staff read it in the inbox: what the customer saw, then the choices it offered. */
export function interactiveSummary(message: Interactive): string {
  const choices =
    message.type === "buttons"
      ? message.buttons.map((b) => `[${b.title}]`).join(" ")
      : message.sections
          .flatMap((s) => s.rows)
          .map((r) => `• ${r.title}${r.description ? ` (${r.description})` : ""}`)
          .join("\n");
  return [message.header, message.body, message.footer, choices].filter((part) => part !== undefined).join("\n\n");
}
