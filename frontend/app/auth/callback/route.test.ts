import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const resolveTenant = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession } }),
}));
vi.mock("@pakka/backend/lib/tenant", () => ({ resolveTenant: (...args: unknown[]) => resolveTenant(...args) }));

const { GET } = await import("./route");

const call = async (query: string) => {
  const res = await GET(new NextRequest(`http://localhost:3000/auth/callback${query}`));
  expect(res.status).toBe(307);
  const location = new URL(res.headers.get("location")!);
  expect(location.origin).toBe("http://localhost:3000");
  return location.pathname + location.search;
};

const user = { id: "u1", email: "new@example.com" };

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    resolveTenant.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("exchanges the code and sends a new account to onboarding", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user, session: {} }, error: null });
    resolveTenant.mockResolvedValue({ status: "no_membership" });
    expect(await call("?code=abc&next=%2Fdashboard")).toBe("/onboarding");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc", undefined);
  });

  it("sends an existing member to the dashboard page they asked for, never onboarding", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user, session: {} }, error: null });
    resolveTenant.mockResolvedValue({ status: "ok" });
    expect(await call("?code=abc&next=%2Fdashboard%2Fwhatsapp")).toBe("/dashboard/whatsapp");
    expect(await call("?code=abc&next=%2Fonboarding")).toBe("/dashboard");
    resolveTenant.mockResolvedValue({ status: "choose" });
    expect(await call("?code=abc")).toBe("/dashboard");
  });

  it("sends an existing member to the dashboard even when Google sign-in started on /signup", async () => {
    // GoogleButton on /signup asks for /onboarding; the account's real state decides.
    exchangeCodeForSession.mockResolvedValue({ data: { user, session: {} }, error: null });
    resolveTenant.mockResolvedValue({ status: "ok" });
    expect(await call("?code=abc&next=%2Fonboarding")).toBe("/dashboard");
    resolveTenant.mockResolvedValue({ status: "no_membership" });
    expect(await call("?code=abc&next=%2Fonboarding")).toBe("/onboarding");
    expect(await call("?code=abc")).toBe("/onboarding");
  });

  it("opens the new-password form for a reset link, whatever the account's state or next", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user, session: {}, redirectType: "recovery" }, error: null });
    resolveTenant.mockResolvedValue({ status: "ok" });
    expect(await call("?code=abc&next=%2Freset-password")).toBe("/reset-password");
    expect(await call("?code=abc&next=%2Fdashboard")).toBe("/reset-password");
    expect(resolveTenant).not.toHaveBeenCalled();
  });

  it("never treats a normal sign-in as a reset just because next says so", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user, session: {}, redirectType: null }, error: null });
    resolveTenant.mockResolvedValue({ status: "ok" });
    expect(await call("?code=abc&next=%2Freset-password")).toBe("/dashboard");
  });

  it("sends an expired reset link back to 'forgot password'", async () => {
    expect(await call("?error=access_denied&error_code=otp_expired&next=%2Freset-password")).toBe("/forgot-password?error=link_expired");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("passes Supabase's flow id through to the exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user, session: {} }, error: null });
    resolveTenant.mockResolvedValue({ status: "ok" });
    await call("?code=abc&sb_flow_id=flow-1");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc", { flowId: "flow-1" });
  });

  it("ignores an off-site next", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user, session: {} }, error: null });
    resolveTenant.mockResolvedValue({ status: "ok" });
    expect(await call("?code=abc&next=https%3A%2F%2Fevil.example.com")).toBe("/dashboard");
    expect(await call("?code=abc&next=%2F%2Fevil.example.com")).toBe("/dashboard");
  });

  it("falls back to the dashboard (and its error state) if the business can't be loaded", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user, session: {} }, error: null });
    resolveTenant.mockRejectedValue(new Error("db down"));
    expect(await call("?code=abc")).toBe("/dashboard");
  });

  it("gives a safe error when the exchange fails, without leaking the provider message", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: null, session: null }, error: { code: "bad_code_verifier", message: "raw detail" } });
    expect(await call("?code=abc&next=%2Fdashboard")).toBe("/login?error=signin_failed");
    expect(await call("?code=abc&next=%2Fonboarding")).toBe("/signup?error=signin_failed");
    expect(resolveTenant).not.toHaveBeenCalled();
  });

  it("reports a cancelled sign-in, an expired link and a missing code without exchanging", async () => {
    expect(await call("?error=access_denied&error_description=raw&next=%2Fonboarding")).toBe("/signup?error=signin_cancelled");
    expect(await call("?error=access_denied&error_code=otp_expired")).toBe("/login?error=link_expired");
    expect(await call("")).toBe("/login?error=signin_failed");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
