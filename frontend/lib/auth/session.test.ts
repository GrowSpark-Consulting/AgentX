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

const { redirectIfSignedIn, requireDashboardView, requireTenantContext } = await import("./session");

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
  // The API's answer for the same account (no_membership) is tested in backend/src/server/app.test.ts.
});

describe("redirectIfSignedIn (/login and /signup)", () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user } });
    resolveTenant.mockReset();
  });

  it("lets a signed-out visitor see the page, without looking up any business", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(redirectIfSignedIn()).resolves.toBeUndefined();
    await expect(redirectIfSignedIn("/dashboard/whatsapp")).resolves.toBeUndefined();
    expect(resolveTenant).not.toHaveBeenCalled();
  });

  it("sends a signed-in member to the dashboard (or the page they asked for), never onboarding", async () => {
    resolveTenant.mockResolvedValue({ status: "ok", context, memberships: [] });
    expect(await redirectOf(redirectIfSignedIn())).toBe("/dashboard");
    expect(await redirectOf(redirectIfSignedIn("/dashboard/whatsapp"))).toBe("/dashboard/whatsapp");
    expect(await redirectOf(redirectIfSignedIn("/onboarding"))).toBe("/dashboard");
    resolveTenant.mockResolvedValue({ status: "choose", memberships: [] });
    expect(await redirectOf(redirectIfSignedIn())).toBe("/dashboard");
  });

  it("sends a signed-in account with no business yet to onboarding", async () => {
    resolveTenant.mockResolvedValue({ status: "no_membership" });
    expect(await redirectOf(redirectIfSignedIn())).toBe("/onboarding");
    expect(await redirectOf(redirectIfSignedIn("/dashboard"))).toBe("/onboarding");
  });

  it("sends a signed-in account to the dashboard's error state if its business can't be loaded", async () => {
    resolveTenant.mockRejectedValue(new Error("db down"));
    expect(await redirectOf(redirectIfSignedIn())).toBe("/dashboard");
  });
});
