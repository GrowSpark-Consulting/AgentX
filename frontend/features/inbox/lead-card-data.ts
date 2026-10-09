import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_COLUMNS, bookingTitle, effectiveStatus, parseBookings, STATUS_LABEL, type Booking, type ShownStatus } from "@/features/calendar/bookings";
import { formatWhen } from "@/features/calendar/time";
import { answerRows, fetchPackFields, LEAD_COLUMNS, parseLeads, stageLabel, type AnswerRow, type Lead, type PackFieldInfo } from "@/features/leads/data";

// The lead card pinned beside an Inbox chat (docs/handover.md module 6, Day 4): the chat's customer's
// lead as stored, read under RLS like the lead detail (leads, bookings, tenants and vertical_packs are
// readable by every member). The chat's contact_id is the lead's contact_id (both reference contacts).
// Only what the database holds is shown: score and temperature as the engine stored them, answers
// labelled by the business's pack. The AI-written parts of the lead card (need, summary, next step,
// sentiment: buildLeadCard, Dev 1) don't exist yet and aren't made up here.

/** A contact rarely has more than one or two leads; this is a safety limit, not paging. */
export const CONTACT_LEAD_LIMIT = 50;

const CLOSED_STAGES = new Set(["won", "lost"]);

/**
 * The lead the AI works with for this contact, chosen as the pipeline does (backend
 * agent/pipeline/store.ts, findOrCreateOpenLead): the oldest lead that isn't won or lost. A contact
 * whose leads are all closed shows the newest of them. null when the contact has none.
 */
export function chooseLead(leads: readonly Lead[]): Lead | null {
  const byCreated = [...leads].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return byCreated.find((l) => !CLOSED_STAGES.has(l.stage)) ?? byCreated[byCreated.length - 1] ?? null;
}

/** A booking still to happen: held (until its hold lapses) or confirmed. */
const UPCOMING = new Set<ShownStatus>(["held", "confirmed"]);

export interface LeadCardBooking {
  id: string;
  title: string;
  when: string;
  status: ShownStatus;
  statusLabel: string;
}

/**
 * The booking worth showing on the card: the next upcoming one (held or confirmed, not yet over), else the
 * most recent of the rest, with what it is now (a lapsed hold reads "Hold expired"). null without bookings.
 */
export function relevantBooking(bookings: readonly Booking[], now: Date, timeZone: string): LeadCardBooking | null {
  const byStart = [...bookings].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  const next = byStart.find((b) => UPCOMING.has(effectiveStatus(b, now)) && Date.parse(b.end) >= now.getTime());
  const chosen = next ?? byStart[byStart.length - 1];
  if (!chosen) return null;
  const status = effectiveStatus(chosen, now);
  return { id: chosen.id, title: bookingTitle(chosen), when: formatWhen(chosen.start, timeZone), status, statusLabel: STATUS_LABEL[status] };
}

export interface LeadCard {
  lead: Lead;
  stage: string;
  answers: AnswerRow[];
  booking: LeadCardBooking | null;
}

export function toLeadCard(lead: Lead, packFields: PackFieldInfo[], bookings: readonly Booking[], now: Date, timeZone: string): LeadCard {
  return {
    lead,
    stage: stageLabel(lead.stage),
    answers: answerRows(lead.answers, packFields),
    booking: relevantBooking(bookings.filter((b) => b.leadId === lead.id), now, timeZone),
  };
}

/**
 * The contact's lead card, or null when the contact has no lead. Every read names the session's business;
 * rows of another business or contact are dropped even if they arrive. Pack labels are a nicety: without
 * the pack, answers show with their keys (as on the lead detail).
 */
export async function fetchLeadCard(client: SupabaseClient, tenantId: string, contactId: string, now: Date, timeZone: string): Promise<LeadCard | null> {
  const [leadResult, packFields] = await Promise.all([
    client.from("leads").select(LEAD_COLUMNS).eq("tenant_id", tenantId).eq("contact_id", contactId).order("created_at", { ascending: true }).limit(CONTACT_LEAD_LIMIT),
    fetchPackFields(client, tenantId).catch((): PackFieldInfo[] => []),
  ]);
  if (leadResult.error) throw leadResult.error;
  const lead = chooseLead(parseLeads(leadResult.data, tenantId).filter((l) => l.contactId === contactId));
  if (!lead) return null;

  const bookingResult = await client.from("bookings").select(BOOKING_COLUMNS).eq("tenant_id", tenantId).eq("lead_id", lead.id).order("start_at", { ascending: true });
  if (bookingResult.error) throw bookingResult.error;
  return toLeadCard(lead, packFields, parseBookings(bookingResult.data, tenantId), now, timeZone);
}
