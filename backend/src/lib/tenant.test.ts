import { describe, expect, it } from "vitest";
import { fakeSupabase } from "../test-support/fake-supabase";
import { AppError } from "./errors";
import { requireRole, resolveTenant } from "./tenant";

const user = { id: "00000000-0000-0000-0000-00000000000a", email: "owner@test.local" };
const tenantA = {
  id: "10000000-0000-0000-0000-00000000000a",
  name: "Skyline Homes",
  vertical: "real-estate",
  timezone: "Asia/Kolkata",
  status: "trial",
  plan_key: "trial",
  trial_ends_at: "2026-10-12T00:00:00Z",
};
const tenantB = { ...tenantA, id: "10000000-0000-0000-0000-00000000000b", name: "Glow Studio", vertical: "salon" };

const memberships = (rows: unknown[]) =>
  fakeSupabase({ memberships: { data: rows, error: null } });

describe("resolveTenant", () => {
  it("resolves a single membership to its tenant", async () => {
    const { client, calls } = memberships([{ tenant_id: tenantA.id, role: "owner", tenants: tenantA }]);
    const res = await resolveTenant(client, user);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.context).toEqual({
      user: { id: user.id, email: user.email },
      role: "owner",
      tenant: {
        id: tenantA.id,
        name: "Skyline Homes",
        vertical: "real-estate",
        timezone: "Asia/Kolkata",
        status: "trial",
        planKey: "trial",
        trialEndsAt: "2026-10-12T00:00:00Z",
      },
    });
    // Reads through the user's own client, filtered to the user.
    expect(calls).toContainEqual({ table: "memberships", method: "eq", args: ["user_id", user.id] });
  });

  it("reports no membership", async () => {
    const { client } = memberships([]);
    expect(await resolveTenant(client, user)).toEqual({ status: "no_membership" });
  });

  it("ignores memberships whose tenant row-level security hides", async () => {
    const { client } = memberships([{ tenant_id: tenantA.id, role: "owner", tenants: null }]);
    expect(await resolveTenant(client, user)).toEqual({ status: "no_membership" });
  });

  it("asks the user to choose between several businesses instead of picking one", async () => {
    const { client } = memberships([
      { tenant_id: tenantA.id, role: "owner", tenants: tenantA },
      { tenant_id: tenantB.id, role: "staff", tenants: tenantB },
    ]);
    const res = await resolveTenant(client, user);
    expect(res).toEqual({
      status: "choose",
      memberships: [
        { tenantId: tenantB.id, name: "Glow Studio", role: "staff" },
        { tenantId: tenantA.id, name: "Skyline Homes", role: "owner" },
      ],
    });
  });

  it("uses a preferred tenant only when the user is a member of it", async () => {
    const rows = [
      { tenant_id: tenantA.id, role: "owner", tenants: tenantA },
      { tenant_id: tenantB.id, role: "staff", tenants: tenantB },
    ];
    const chosen = await resolveTenant(memberships(rows).client, user, tenantB.id);
    expect(chosen.status === "ok" && chosen.context.tenant.name).toBe("Glow Studio");
    expect(chosen.status === "ok" && chosen.context.role).toBe("staff");

    const foreign = await resolveTenant(memberships(rows).client, user, "10000000-0000-0000-0000-0000000000ff");
    expect(foreign.status).toBe("choose");
  });

  it("does not let a preference override a single membership", async () => {
    const { client } = memberships([{ tenant_id: tenantA.id, role: "admin", tenants: tenantA }]);
    const res = await resolveTenant(client, user, tenantB.id);
    expect(res.status === "ok" && res.context.tenant.id).toBe(tenantA.id);
  });

  it("throws a safe error when the query fails", async () => {
    const { client } = fakeSupabase({ memberships: { data: null, error: { message: "connection refused" } } });
    await expect(resolveTenant(client, user)).rejects.toMatchObject({
      code: "upstream_failed",
      message: "We couldn't load your business. Try again in a moment.",
    });
  });
});

describe("requireRole", () => {
  const ctx = (role: "owner" | "admin" | "staff") => ({
    user: { id: user.id, email: null },
    role,
    tenant: { id: tenantA.id, name: "x", vertical: "x", timezone: "x", status: "trial" as const, planKey: "trial", trialEndsAt: null },
  });

  it("allows listed roles and rejects others", () => {
    expect(() => requireRole(ctx("owner"), ["owner", "admin"], "do it")).not.toThrow();
    expect(() => requireRole(ctx("staff"), ["owner", "admin"], "do it")).toThrow(AppError);
  });
});
