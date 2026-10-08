import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { apiFetch } from "@/lib/api/client";
import { apiErrorFrom } from "@/lib/errors";

// Google Calendar per staff member or resource (docs/contracts.md section 6; Dev 2's
// backend/src/booking/google-calendar.ts, migration 0017). The dashboard only:
//   * reads google_calendar_connections under RLS (google_email, status, last_error; never the token),
//   * asks GET /api/calendar/google/connect?resourceId=… for Google's consent link and sends the browser
//     there (owner or admin; not_available until Google is configured on the API),
//   * reads the outcome Google's callback sends back: /dashboard?google_calendar=…&resource=<id>.
// Syncing bookings to the calendar is Day 4 and happens on the server.

export type CalendarStatus = "connected" | "needs_reconnect";

export interface CalendarConnection {
  resourceId: string;
  email: string | null;
  status: CalendarStatus;
}

const ConnectionRow = z.object({
  resource_id: z.guid(),
  google_email: z.string().nullable(),
  status: z.enum(["connected", "needs_reconnect"]),
});

/** Members may read these columns only (0017 grants); the refresh token is never selected. */
const CONNECTION_COLUMNS = "resource_id, google_email, status";

/** The business's calendar connections, by resource id. */
export async function listCalendarConnections(client: SupabaseClient, tenantId: string): Promise<Map<string, CalendarConnection>> {
  const { data, error } = await client.from("google_calendar_connections").select(CONNECTION_COLUMNS).eq("tenant_id", tenantId);
  if (error) throw error;
  const parsed = z.array(ConnectionRow).safeParse(data ?? []);
  if (!parsed.success) throw new Error("The Google Calendar data had an unexpected shape.");
  return new Map(parsed.data.map((r) => [r.resource_id, { resourceId: r.resource_id, email: r.google_email, status: r.status }]));
}

/** Google's consent screen is the only place the connect link may send the browser. */
const GOOGLE_CONSENT = /^https:\/\/accounts\.google\.com\//;
const ConnectResult = z.object({ url: z.string().regex(GOOGLE_CONSENT) });

/** The consent link for one resource; throws ApiError (forbidden, not_found, not_available, …) on refusal. */
export async function googleConnectUrl(tenantId: string, resourceId: string): Promise<string> {
  const res = await apiFetch(`/api/calendar/google/connect?resourceId=${encodeURIComponent(resourceId)}`, { method: "GET", tenantId });
  if (!res.ok) throw await apiErrorFrom(res);
  const parsed = ConnectResult.safeParse(await res.json());
  if (!parsed.success) throw new Error("The Google Calendar link had an unexpected shape.");
  return parsed.data.url;
}

// Coming back from Google ---------------------------------------------------------------------------

export const CALENDAR_OUTCOMES = ["connected", "denied", "failed", "not_available"] as const;
export type CalendarOutcome = (typeof CALENDAR_OUTCOMES)[number];

/** ?google_calendar=…&resource=… as Dev 2's callback writes it; anything else is ignored. */
export function calendarReturn(params: { google_calendar?: string | string[]; resource?: string | string[] }): { outcome: CalendarOutcome; resourceId: string | null } | null {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const outcome = first(params.google_calendar);
  if (!outcome || !(CALENDAR_OUTCOMES as readonly string[]).includes(outcome)) return null;
  const resource = z.guid().safeParse(first(params.resource));
  return { outcome: outcome as CalendarOutcome, resourceId: resource.success ? resource.data : null };
}

/** The notice after Google, naming the resource when it's known. */
export function calendarOutcomeText(outcome: CalendarOutcome, resourceName: string | null): { ok: boolean; text: string } {
  const who = resourceName ? ` for ${resourceName}` : "";
  switch (outcome) {
    case "connected":
      return { ok: true, text: `Google Calendar connected${who}.` };
    case "denied":
      return { ok: false, text: `Google Calendar wasn't connected${who}: access was declined on Google's screen.` };
    case "failed":
      return { ok: false, text: `Google Calendar couldn't be connected${who}. Try again.` };
    case "not_available":
      return { ok: false, text: "Google Calendar isn't switched on yet." };
  }
}
