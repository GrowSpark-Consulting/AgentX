import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { formatError, type FormattedError } from "@/lib/errors";

// Services for the Knowledge base screen (docs/dashboard-screen-contracts.md, Knowledge base). Members
// read and write their own business's services directly under row-level security (migration 0002:
// tenant_read / tenant_insert / tenant_update / tenant_delete, all is_member(tenant_id)); every query
// also names the session's tenant. Rows are parsed with Zod and mapped to the view model below.
//
// Only real columns are edited: name, duration_min, price_min, price_max (integer rupees),
// resource_type and active. The prototype's other columns (area, category, details, free-text
// status) have no storage and are not shown.

const SERVICE_COLUMNS = "id, tenant_id, name, duration_min, price_min, price_max, resource_type, active";

/** int4, the column type of duration_min and the prices. */
const INT_MAX = 2_147_483_647;
export const NAME_MAX = 120;
export const RESOURCE_TYPE_MAX = 40;
/** A week; longer bookings are date ranges, not a single block on the calendar. */
export const DURATION_MAX = 7 * 24 * 60;

export const ServiceRow = z.object({
  id: z.guid(),
  tenant_id: z.guid(),
  name: z.string(),
  duration_min: z.number().int(),
  price_min: z.number().int().nullable(),
  price_max: z.number().int().nullable(),
  resource_type: z.string(),
  active: z.boolean(),
});
export type ServiceRow = z.input<typeof ServiceRow>;

export interface Service {
  id: string;
  name: string;
  durationMin: number;
  priceMin: number | null;
  priceMax: number | null;
  resourceType: string;
  active: boolean;
}

export function toService(row: z.output<typeof ServiceRow>): Service {
  return {
    id: row.id,
    name: row.name,
    durationMin: row.duration_min,
    priceMin: row.price_min,
    priceMax: row.price_max,
    resourceType: row.resource_type,
    active: row.active,
  };
}

// Form input ----------------------------------------------------------------------------------------

/** What the form holds: strings as typed, so a half-typed number is never lost. */
export interface ServiceDraft {
  name: string;
  durationMin: string;
  priceMin: string;
  priceMax: string;
  resourceType: string;
  active: boolean;
}

export const EMPTY_DRAFT: ServiceDraft = { name: "", durationMin: "", priceMin: "", priceMax: "", resourceType: "", active: true };

export function toDraft(s: Service): ServiceDraft {
  return {
    name: s.name,
    durationMin: String(s.durationMin),
    priceMin: s.priceMin === null ? "" : String(s.priceMin),
    priceMax: s.priceMax === null ? "" : String(s.priceMax),
    resourceType: s.resourceType,
    active: s.active,
  };
}

/** Whole rupees; "1,500" and "₹1500" are accepted, blank means no price. */
const Rupees = z.string().transform((value, ctx): number | null => {
  const digits = value.replace(/[₹,\s]/g, "");
  if (digits === "") return null;
  if (!/^\d+$/.test(digits)) {
    ctx.addIssue({ code: "custom", message: "Enter whole rupees, like 1500" });
    return z.NEVER;
  }
  const n = Number(digits);
  if (n > INT_MAX) {
    ctx.addIssue({ code: "custom", message: "That price is too large" });
    return z.NEVER;
  }
  return n;
});

/** The validated values written to the database (column names). */
export const ServiceInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give the service a name")
      .max(NAME_MAX, `Keep the name under ${NAME_MAX} characters`),
    durationMin: z
      .string()
      .trim()
      .min(1, "Enter how many minutes a booking takes")
      .regex(/^\d+$/, "Enter whole minutes, like 30")
      .transform(Number)
      .pipe(z.number().min(1, "A booking takes at least 1 minute").max(DURATION_MAX, "Keep the length to 7 days (10,080 minutes) or less")),
    priceMin: Rupees,
    priceMax: Rupees,
    resourceType: z
      .string()
      .trim()
      .min(1, "Say who or what is booked, like staff")
      .max(RESOURCE_TYPE_MAX, `Keep this under ${RESOURCE_TYPE_MAX} characters`),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.priceMin !== null && v.priceMax !== null && v.priceMin > v.priceMax) {
      ctx.addIssue({ code: "custom", path: ["priceMax"], message: "The highest price can't be below the lowest" });
    }
  })
  .transform((v) => ({
    name: v.name,
    duration_min: v.durationMin,
    price_min: v.priceMin,
    price_max: v.priceMax,
    resource_type: v.resourceType,
    active: v.active,
  }));
export type ServiceInput = z.output<typeof ServiceInput>;

export type FieldErrors = Partial<Record<keyof ServiceDraft, string>>;

/**
 * Validates the form before anything is sent. Besides the schema, a name already used by another of
 * the business's services is refused: customers and the assistant tell services apart by name.
 */
export function validateDraft(
  draft: ServiceDraft,
  existing: Service[],
  editingId: string | null,
): { ok: true; input: ServiceInput } | { ok: false; fields: FieldErrors } {
  const parsed = ServiceInput.safeParse(draft);
  const fields: FieldErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof ServiceDraft;
      fields[key] ??= issue.message;
    }
  }
  const name = draft.name.trim().toLowerCase();
  if (name && !fields.name && existing.some((s) => s.id !== editingId && s.name.trim().toLowerCase() === name)) {
    fields.name = "You already have a service with this name";
  }
  if (!parsed.success || Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input: parsed.data };
}

// Errors ---------------------------------------------------------------------------------------------

/** A write the UI must explain specifically; everything else goes through formatError. */
export class ServiceError extends Error {
  constructor(
    readonly reason: "not_found" | "in_use" | "invalid_response",
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/**
 * What a failed save or delete shows. ServiceError messages are written for the user. formatError words
 * database failures for reads ("We couldn't load this data"), which is wrong for a write, so those get
 * a write message; offline and unknown errors keep formatError's wording.
 */
export function describeWriteError(err: unknown, title: string): FormattedError {
  if (err instanceof ServiceError) {
    return { code: err.reason === "in_use" ? "conflict" : "not_found", title, message: err.message, retryable: false };
  }
  const e = formatError(err);
  if (e.code === "upstream_failed") return { ...e, title, message: "Nothing was changed. Try again in a moment." };
  return { ...e, title };
}

/** Postgres foreign_key_violation: bookings.service_id still points at the service. */
const FOREIGN_KEY_VIOLATION = "23503";

function parseRows(data: unknown): Service[] {
  const parsed = z.array(ServiceRow).safeParse(data ?? []);
  if (!parsed.success) throw new ServiceError("invalid_response", "The services data had an unexpected shape.");
  return parsed.data.map(toService);
}

// Reads and writes -----------------------------------------------------------------------------------

export async function listServices(client: SupabaseClient, tenantId: string): Promise<Service[]> {
  const { data, error } = await client
    .from("services")
    .select(SERVICE_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });
  if (error) throw error;
  return parseRows(data).sort(byName);
}

export async function createService(client: SupabaseClient, tenantId: string, input: ServiceInput): Promise<Service> {
  const { data, error } = await client
    .from("services")
    .insert({ ...input, tenant_id: tenantId })
    .select(SERVICE_COLUMNS);
  if (error) throw error;
  const [created] = parseRows(data);
  if (!created) throw new ServiceError("invalid_response", "The service was not returned after saving.");
  return created;
}

/** RLS turns an update of a row the member can't see into "0 rows": that is reported, never ignored. */
export async function updateService(client: SupabaseClient, tenantId: string, id: string, input: ServiceInput): Promise<Service> {
  const { data, error } = await client
    .from("services")
    .update(input)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select(SERVICE_COLUMNS);
  if (error) throw error;
  const [updated] = parseRows(data);
  if (!updated) throw new ServiceError("not_found", "This service no longer exists. Refresh to see the current list.");
  return updated;
}

/** Same as update: a delete that removed nothing is an error, not a success. */
export async function deleteService(client: SupabaseClient, tenantId: string, id: string): Promise<void> {
  const { data, error } = await client.from("services").delete().eq("id", id).eq("tenant_id", tenantId).select("id");
  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throw new ServiceError("in_use", "This service has bookings, so it can't be deleted. Edit it and switch it off instead.");
    }
    throw error;
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new ServiceError("not_found", "This service no longer exists. Refresh to see the current list.");
  }
}

/** The business's resource types (staff, stylist, room …), offered as suggestions in the form. */
export async function listResourceTypes(client: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data, error } = await client.from("resources").select("type").eq("tenant_id", tenantId).eq("active", true);
  if (error) return [];
  const parsed = z.array(z.object({ type: z.string() })).safeParse(data ?? []);
  if (!parsed.success) return [];
  return [...new Set(parsed.data.map((r) => r.type.trim()).filter(Boolean))].sort();
}

// List helpers and display -------------------------------------------------------------------------

export function byName(a: Service, b: Service): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

/** Replaces (or adds) one service and keeps the list in name order. */
export function upsertService(list: Service[], service: Service): Service[] {
  return [...list.filter((s) => s.id !== service.id), service].sort(byName);
}

export function removeService(list: Service[], id: string): Service[] {
  return list.filter((s) => s.id !== id);
}

/** Rupees the way the prototype writes them: "₹1,500", "₹88 L", "₹1.02 Cr". */
export function formatRupees(n: number): string {
  const short = (v: number) => String(Number(v.toFixed(2)));
  if (n >= 10_000_000) return `₹${short(n / 10_000_000)} Cr`;
  if (n >= 100_000) return `₹${short(n / 100_000)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

/** "₹300 – ₹600", "₹500", "From ₹300", "Up to ₹600", "Free", or "—" when no price is set. */
export function formatPriceRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return "—";
  if (min === 0 && (max === null || max === 0)) return "Free";
  if (min !== null && max !== null) return min === max ? formatRupees(min) : `${formatRupees(min)} – ${formatRupees(max)}`;
  if (min !== null) return `From ${formatRupees(min)}`;
  return `Up to ${formatRupees(max as number)}`;
}

/** "45 min", "90 min", "2 hours", "1 day". */
export function formatDuration(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return minutes === 1440 ? "1 day" : `${minutes / 1440} days`;
  if (minutes >= 120 && minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} min`;
}
