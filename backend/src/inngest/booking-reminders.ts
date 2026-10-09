import { z } from "zod";
import { loadReminderBooking, reminderMessage, reminderOffsets, REMINDERS, type ReminderBooking, type ReminderKind } from "../booking/reminders";
import { supabaseAdmin } from "../lib/supabase-admin";
import { send, type NotifyPayload, type SendOutcome } from "../notify/send";
import { inngest } from "./client";

// booking.confirmed → the 24 h and 2 h reminders (docs/handover.md, jobs: booking-reminders). The run plans both times
// from the booking's start and the business's offsets, sleeps until each, and sends if the booking is still confirmed
// at the same time. Any booking.changed for the booking (rescheduled, cancelled, completed, no-show) cancels the run; a
// reschedule confirms a new booking, which gets its own run. A reminder whose time has already passed is not sent.
// Each send carries an idempotency key, so a retried step never sends the same reminder twice.

const BookingConfirmed = z.object({ tenantId: z.guid(), bookingId: z.guid() });

type ReminderResult = { status: "sent"; creditsCharged: number; usedTemplate: boolean } | { status: "skipped"; reason: string } | { status: "failed"; code: string };

export interface BookingRemindersDeps {
  load: (tenantId: string, bookingId: string) => Promise<ReminderBooking | null>;
  offsets: (tenantId: string) => Promise<Record<ReminderKind, number>>;
  send: (tenantId: string, kind: ReminderKind, payload: NotifyPayload) => Promise<SendOutcome>;
  now: () => Date;
}

const defaults = (): BookingRemindersDeps => ({
  load: (tenantId, bookingId) => loadReminderBooking(tenantId, bookingId, supabaseAdmin()),
  offsets: (tenantId) => reminderOffsets(tenantId, supabaseAdmin()),
  send: (tenantId, kind, payload) => send(tenantId, kind, payload),
  now: () => new Date(),
});

interface Step {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
  sleepUntil(id: string, until: string): Promise<unknown>;
}

export async function handleBookingConfirmed(
  { event, step }: { event: { data: unknown }; step: Step },
  deps: BookingRemindersDeps = defaults(),
) {
  const { tenantId, bookingId } = BookingConfirmed.parse(event.data);

  const plan = await step.run("plan", async () => {
    const booking = await deps.load(tenantId, bookingId);
    if (!booking || booking.status !== "confirmed") return null;
    const offsets = await deps.offsets(tenantId);
    const start = Date.parse(booking.start);
    const now = deps.now().getTime();
    const reminders = REMINDERS.map((r) => ({ kind: r.kind as ReminderKind, at: new Date(start - offsets[r.kind] * 60_000).toISOString() }))
      .filter((r) => Date.parse(r.at) > now)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return { start: booking.start, reminders };
  });
  if (!plan) return { skipped: "not_confirmed" as const };

  const results: ({ kind: ReminderKind } & ReminderResult)[] = [];
  for (const reminder of plan.reminders) {
    await step.sleepUntil(`wait-${reminder.kind}`, reminder.at);
    const result = await step.run(`send-${reminder.kind}`, async (): Promise<ReminderResult> => {
      // Checked again at send time, in case a booking.changed event comes late.
      const booking = await deps.load(tenantId, bookingId);
      if (!booking || booking.status !== "confirmed" || Date.parse(booking.start) !== Date.parse(plan.start)) {
        return { status: "skipped", reason: "booking_changed" };
      }
      if (!booking.conversationId) return { status: "skipped", reason: "no_conversation" };
      const outcome = await deps.send(tenantId, reminder.kind, {
        conversationId: booking.conversationId,
        ...reminderMessage(booking),
        idempotencyKey: `${reminder.kind}:${bookingId}:${plan.start}`,
      });
      if (outcome.status === "sent") return { status: "sent", creditsCharged: outcome.creditsCharged, usedTemplate: outcome.usedTemplate };
      if (outcome.status === "skipped") return { status: "skipped", reason: outcome.reason };
      // Throwing makes Inngest retry this step; never when WhatsApp may already have delivered it.
      if (outcome.error.retryable && !outcome.error.outcomeUnknown) throw new Error(`reminder not sent (${outcome.error.code}), will retry`);
      return { status: "failed", code: outcome.error.code };
    });
    results.push({ kind: reminder.kind, ...result });
  }
  return { results };
}

// Every step value above is plain JSON, so Inngest's serialised step results are the same values.
export const bookingReminders = inngest.createFunction(
  {
    id: "booking-reminders",
    triggers: [{ event: "booking.confirmed" }],
    cancelOn: [{ event: "booking.changed", match: "data.bookingId" }],
  },
  (ctx) =>
    handleBookingConfirmed({
      event: ctx.event,
      step: {
        run: <T>(id: string, fn: () => Promise<T>) => ctx.step.run(id, fn) as unknown as Promise<T>,
        sleepUntil: (id: string, until: string) => ctx.step.sleepUntil(id, until),
      },
    }),
);
