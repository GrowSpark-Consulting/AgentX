import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { defaultHoursDraft, type HoursDraft } from "./hours";
import {
  createResource,
  deleteResource,
  describeSetupWriteError,
  listResources,
  readBusinessHours,
  saveBusinessHours,
  SetupError,
  updateResource,
  usesBusinessHours,
  validateResourceDraft,
  type Resource,
  type ResourceDraft,
} from "./resources-data";

const TENANT = "c0000000-0000-0000-0000-00000000000a";
const id = (n: number) => `e0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const closedWeek = (): HoursDraft => ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });

const row = (over: Record<string, unknown> = {}) => ({
  id: id(1),
  tenant_id: TENANT,
  type: "staff",
  name: "Asha",
  working_hours: {},
  service_area: null,
  active: true,
  ...over,
});

const resource = (over: Partial<Resource> = {}): Resource => ({ id: id(1), name: "Asha", type: "staff", active: true, hours: {}, pincodes: null, ...over });

const draft = (over: Partial<ResourceDraft> = {}): ResourceDraft => ({
  name: "Asha",
  type: "staff",
  active: true,
  hoursMode: "business",
  hours: defaultHoursDraft(),
  pincodes: "",
  ...over,
});

/** A chainable stand-in for the PostgREST query builder that records every call. */
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "insert", "update", "delete", "eq", "order"]) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return builder;
    };
  }
  builder.maybeSingle = () => {
    calls.push(["maybeSingle", []]);
    return Promise.resolve(result);
  };
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  const client = {
    from: (table: string) => {
      calls.push(["from", [table]]);
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("the resource form", () => {
  it("saves 'business hours' as no days of its own, the slot engine's fallback", () => {
    const result = validateResourceDraft(draft({ name: "  Asha ", type: " staff " }), [], null);
    expect(result).toEqual({ ok: true, input: { name: "Asha", type: "staff", active: true, working_hours: {}, service_area: null } });
  });

  it("saves its own hours for every day", () => {
    const result = validateResourceDraft(draft({ hoursMode: "own", hours: { ...closedWeek(), mon: [{ start: "10:00", end: "18:00" }] } }), [], null);
    expect(result.ok && result.input.working_hours).toEqual({ ...closedWeek(), mon: [{ start: "10:00", end: "18:00" }] });
  });

  it("refuses own hours with no open day (they would mean 'never bookable')", () => {
    const result = validateResourceDraft(draft({ hoursMode: "own", hours: closedWeek() }), [], null);
    expect(!result.ok && result.fields.hours).toBe("Add hours for at least one day, or use the business's hours");
  });

  it("passes hour errors through to the boxes", () => {
    const result = validateResourceDraft(draft({ hoursMode: "own", hours: { ...closedWeek(), fri: [{ start: "19:00", end: "09:00" }] } }), [], null);
    expect(!result.ok && result.fields.hoursFields).toEqual({ "fri.0.end": "Closing time must be after opening time" });
  });

  it("ignores the hours boxes while it uses the business's hours", () => {
    const result = validateResourceDraft(draft({ hoursMode: "business", hours: { ...closedWeek(), fri: [{ start: "x", end: "y" }] } }), [], null);
    expect(result.ok).toBe(true);
  });

  it("saves pincodes as the service area", () => {
    const result = validateResourceDraft(draft({ pincodes: "600041,600096" }), [], null);
    expect(result.ok && result.input.service_area).toEqual({ pincodes: ["600041", "600096"] });
    const bad = validateResourceDraft(draft({ pincodes: "6000" }), [], null);
    expect(!bad.ok && bad.fields.pincodes).toBe("6000 isn't a 6-digit pincode");
  });

  it("requires a name and a kind, and refuses another resource's name", () => {
    const empty = validateResourceDraft(draft({ name: " ", type: "" }), [], null);
    expect(!empty.ok && Object.keys(empty.fields).sort()).toEqual(["name", "type"]);
    const existing = [resource({ id: id(1), name: "Asha" })];
    expect(validateResourceDraft(draft({ name: "asha" }), existing, null).ok).toBe(false);
    expect(validateResourceDraft(draft({ name: "Asha" }), existing, id(1)).ok).toBe(true);
  });
});

describe("resources under row-level security", () => {
  it("lists the session's business's resources, by name", async () => {
    const { client, calls } = fakeClient({ data: [row({ name: "Ravi" }), row({ id: id(2), name: "asha", working_hours: { mon: [{ start: "10:00", end: "18:00" }] }, service_area: { pincodes: ["600041"] } })], error: null });
    const list = await listResources(client, TENANT);
    expect(calls).toContainEqual(["eq", ["tenant_id", TENANT]]);
    expect(list.map((r) => r.name)).toEqual(["asha", "Ravi"]);
    expect(list[0]).toMatchObject({ pincodes: ["600041"], hours: { mon: [{ start: "10:00", end: "18:00" }] } });
    expect(usesBusinessHours(list[1])).toBe(true);
    expect(usesBusinessHours(list[0])).toBe(false);
  });

  it("marks hours it can't read instead of guessing", async () => {
    const [r] = await listResources(fakeClient({ data: [row({ working_hours: { mon: "all day" } })], error: null }).client, TENANT);
    expect(r.hours).toBeNull();
    expect(usesBusinessHours(r)).toBe(false);
  });

  it("creates for the session's business and updates only within it", async () => {
    const input = { name: "Asha", type: "staff", active: true, working_hours: {}, service_area: null };
    const created = fakeClient({ data: [row()], error: null });
    await createResource(created.client, TENANT, input);
    expect(created.calls).toContainEqual(["insert", [{ ...input, tenant_id: TENANT }]]);
    const updated = fakeClient({ data: [row()], error: null });
    await updateResource(updated.client, TENANT, id(1), input);
    expect(updated.calls).toContainEqual(["eq", ["tenant_id", TENANT]]);
    await expect(updateResource(fakeClient({ data: [], error: null }).client, TENANT, id(9), input)).rejects.toMatchObject({ reason: "not_found" });
  });

  it("explains that a resource with bookings can't be deleted, and never ignores a delete that removed nothing", async () => {
    const fk = { code: "23503", message: "violates foreign key constraint", details: "", hint: null };
    const err = await deleteResource(fakeClient({ data: null, error: fk }).client, TENANT, id(1)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SetupError);
    expect(describeSetupWriteError(err, "Couldn't delete").message).toMatch(/switch it off/);
    await expect(deleteResource(fakeClient({ data: [], error: null }).client, TENANT, id(1))).rejects.toMatchObject({ reason: "not_found" });
  });

  it("rejects rows of the wrong shape", async () => {
    await expect(listResources(fakeClient({ data: [{ id: "x" }], error: null }).client, TENANT)).rejects.toMatchObject({ reason: "invalid_response" });
  });
});

describe("business hours", () => {
  it("reads the session's business's hours and time zone", async () => {
    const hours = { mon: [{ start: "09:30", end: "19:00" }] };
    const { client, calls } = fakeClient({ data: { id: TENANT, timezone: "Asia/Kolkata", business_hours: hours }, error: null });
    expect(await readBusinessHours(client, TENANT)).toEqual({ timezone: "Asia/Kolkata", hours });
    expect(calls).toContainEqual(["eq", ["id", TENANT]]);
  });

  it("saves, and reports a save RLS turned into nothing", async () => {
    const hours = { mon: [{ start: "10:00", end: "18:00" }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    const ok = fakeClient({ data: [{ id: TENANT, timezone: "Asia/Kolkata", business_hours: hours }], error: null });
    expect((await saveBusinessHours(ok.client, TENANT, hours)).hours).toEqual(hours);
    expect(ok.calls).toContainEqual(["update", [{ business_hours: hours }]]);
    expect(ok.calls).toContainEqual(["eq", ["id", TENANT]]);
    await expect(saveBusinessHours(fakeClient({ data: [], error: null }).client, TENANT, hours)).rejects.toMatchObject({ reason: "not_found" });
  });
});
