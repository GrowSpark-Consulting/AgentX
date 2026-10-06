import { beforeEach, describe, expect, it, vi } from "vitest";

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

const getUser = vi.fn();
const resolveTenant = vi.fn();
const devShell = vi.fn();

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser } }) }));
vi.mock("@pakka/backend/lib/tenant", () => ({ resolveTenant: (...args: unknown[]) => resolveTenant(...args) }));
vi.mock("@/lib/dev-mode", () => ({ dashboardWithoutTenant: () => devShell() }));

const { requireApiTenant, requireDashboardView, requireTenantContext } = await import("./session");

const user = { id: "u-1", email: "new@example.com" };
const context = {
  user: { id: "u-1", email: "new@example.com" },
  role: "owner",
  tenant: { id: "t-1", name: "Test Realty", vertical: "real-estate", timezone: "Asia/Kolkata", status: "trial", planKey: "trial", trialEndsAt: null },
};
const redirectOf = async (p: Promise<unknown>) => {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(RedirectError);
  return (err as RedirectError).to;
};

describe("requireDashboardView", () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user } });
    resolveTenant.mockReset();
    devShell.mockReset().mockReturnValue(false);
  });

  it("gives a member their own business", async () => {
    resolveTenant.mockResolvedValue({ status: "ok", context, memberships: [] });
    expect(await requireDashboardView()).toEqual({ kind: "tenant", context });
  });

  it("in development, gives an account with no business the user only, with no tenant of any kind", async () => {
    resolveTenant.mockResolvedValue({ status: "no_membership" });
    devShell.mockReturnValue(true);
    const view = await requireDashboardView();
    expect(view).toEqual({ kind: "no_business", user: { id: "u-1", email: "new@example.com" } });
    expect(JSON.stringify(view)).not.toMatch(/tenant(Id|_id)?"?:/);
  });

  it("outside development, sends an account with no business back to the gate", async () => {
    resolveTenant.mockResolvedValue({ status: "no_membership" });
    expect(await redirectOf(requireDashboardView())).toBe("/dashboard");
  });

  it("sends a signed-out visitor to sign in, whatever the flag", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    devShell.mockReturnValue(true);
    expect(await redirectOf(requireDashboardView())).toBe("/login");
    expect(resolveTenant).not.toHaveBeenCalled();
  });

  it("never picks a business for someone who must choose", async () => {
    resolveTenant.mockResolvedValue({ status: "choose", memberships: [] });
    devShell.mockReturnValue(true);
    expect(await redirectOf(requireDashboardView())).toBe("/dashboard");
  });
});

describe("tenant-scoped access is unchanged by the development view", () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user } });
    resolveTenant.mockReset().mockResolvedValue({ status: "no_membership" });
    devShell.mockReset().mockReturnValue(true);
  });

  it("requireTenantContext still refuses an account with no business", async () => {
    expect(await redirectOf(requireTenantContext())).toBe("/dashboard");
  });

  it("API routes still answer no_membership", async () => {
    await expect(requireApiTenant()).rejects.toMatchObject({ code: "no_membership" });
  });
});
