import { beforeEach, describe, expect, it, vi } from "vitest";

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getUser: vi.fn(),
};
const resolveTenant = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ origin: "http://localhost:3000" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth }) }));
vi.mock("@pakka/backend/lib/tenant", () => ({ resolveTenant: (...args: unknown[]) => resolveTenant(...args) }));
vi.mock("@/lib/dev-mode", () => ({ dashboardWithoutTenant: () => false }));

const { login, requestPasswordReset, signInWithGoogle, signup, updatePassword } = await import("./actions");

const user = { id: "u-1", email: "owner@example.com" };
const PASSWORD = "e2e-password-1";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const redirectOf = async (p: Promise<unknown>) => {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(RedirectError);
  return (err as RedirectError).to;
};

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  resolveTenant.mockReset();
});

describe("login (existing accounts)", () => {
  beforeEach(() => {
    auth.signInWithPassword.mockResolvedValue({ data: { user, session: {} }, error: null });
  });

  it("sends an account that owns a business to the dashboard, never onboarding", async () => {
    resolveTenant.mockResolvedValue({ status: "ok" });
    expect(await redirectOf(login({}, form({ email: user.email, password: PASSWORD })))).toBe("/dashboard");
    expect(await redirectOf(login({}, form({ email: user.email, password: PASSWORD, next: "/dashboard/whatsapp" })))).toBe("/dashboard/whatsapp");
    expect(await redirectOf(login({}, form({ email: user.email, password: PASSWORD, next: "/onboarding" })))).toBe("/dashboard");
  });

  it("sends an existing account that has no business yet to onboarding", async () => {
    resolveTenant.mockResolvedValue({ status: "no_membership" });
    expect(await redirectOf(login({}, form({ email: user.email, password: PASSWORD, next: "/dashboard" })))).toBe("/onboarding");
  });

  it("checks the business with the client that holds the new session", async () => {
    resolveTenant.mockResolvedValue({ status: "ok" });
    await redirectOf(login({}, form({ email: user.email, password: PASSWORD })));
    expect(resolveTenant).toHaveBeenCalledWith(expect.objectContaining({ auth }), user);
  });

  it("stays on the form with a safe message for wrong credentials", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { name: "AuthApiError", code: "invalid_credentials", message: "Invalid login credentials", status: 400 },
    });
    expect(await login({}, form({ email: user.email, password: "wrong" }))).toEqual({ error: "Email or password is incorrect.", email: user.email });
    expect(resolveTenant).not.toHaveBeenCalled();
  });

  it("validates before calling Supabase", async () => {
    expect(await login({}, form({ email: "nope", password: "" }))).toEqual({
      fields: { email: "Enter a valid email address", password: "Enter your password" },
      email: "nope",
    });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("signup (new accounts)", () => {
  const input = { email: "new@example.com", password: PASSWORD, confirmPassword: PASSWORD };

  it("sends a new account with a session straight to onboarding, without creating a business", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: "u-2" }, session: {} }, error: null });
    expect(await redirectOf(signup({}, form(input)))).toBe("/onboarding");
    expect(resolveTenant).not.toHaveBeenCalled();
  });

  it("asks for email confirmation when Supabase returns no session; the link finishes in /auth/callback", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: "u-2" }, session: null }, error: null });
    expect(await signup({}, form(input))).toEqual({ sent: true, email: input.email });
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe("http://localhost:3000/auth/callback?next=%2Fonboarding");
  });

  it("validates matching passwords before calling Supabase", async () => {
    expect((await signup({}, form({ ...input, confirmPassword: "different-1" }))).fields).toEqual({ confirmPassword: "Passwords don't match" });
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe("signInWithGoogle", () => {
  it("starts PKCE OAuth back to /auth/callback with a safe next", async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://supabase.example/authorize" }, error: null });
    expect(await redirectOf(signInWithGoogle({}, form({ next: "/onboarding" })))).toBe("https://supabase.example/authorize");
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/auth/callback?next=%2Fonboarding" },
    });
    await redirectOf(signInWithGoogle({}, form({ next: "https://evil.example.com" })));
    expect(auth.signInWithOAuth.mock.calls[1][0].options.redirectTo).toBe("http://localhost:3000/auth/callback?next=%2Fdashboard");
  });
});

describe("forgot password", () => {
  it("emails a reset link back through /auth/callback and shows the same screen for any address", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    expect(await requestPasswordReset({}, form({ email: " someone@example.com " }))).toEqual({ sent: true, email: "someone@example.com" });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("someone@example.com", {
      redirectTo: "http://localhost:3000/auth/callback?next=%2Freset-password",
    });
  });

  it("validates the address and reports a rate limit safely", async () => {
    expect(await requestPasswordReset({}, form({ email: "nope" }))).toEqual({ fields: { email: "Enter a valid email address" }, email: "nope" });
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { name: "AuthApiError", code: "over_email_send_rate_limit", message: "raw", status: 429 },
    });
    expect(await requestPasswordReset({}, form({ email: "a@example.com" }))).toEqual({
      error: "Too many attempts. Wait a minute and try again.",
      email: "a@example.com",
    });
  });

  it("sets the new password for the signed-in account, then routes by its real state", async () => {
    auth.getUser.mockResolvedValue({ data: { user } });
    auth.updateUser.mockResolvedValue({ data: { user }, error: null });
    resolveTenant.mockResolvedValue({ status: "ok" });
    const input = { password: "new-password-1", confirmPassword: "new-password-1" };
    expect(await redirectOf(updatePassword({}, form(input)))).toBe("/dashboard");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
    resolveTenant.mockResolvedValue({ status: "no_membership" });
    expect(await redirectOf(updatePassword({}, form(input)))).toBe("/onboarding");
  });

  it("needs the session from the reset link", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    const input = { password: "new-password-1", confirmPassword: "new-password-1" };
    expect(await redirectOf(updatePassword({}, form(input)))).toBe("/forgot-password?error=link_expired");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("validates the new password and reports Supabase's refusal safely", async () => {
    expect((await updatePassword({}, form({ password: "short", confirmPassword: "short" }))).fields).toEqual({ password: "Use at least 8 characters" });
    auth.getUser.mockResolvedValue({ data: { user } });
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", code: "same_password", message: "raw", status: 422 } });
    expect(await updatePassword({}, form({ password: "old-password-1", confirmPassword: "old-password-1" }))).toEqual({
      error: "Choose a password you haven't used for this account before.",
    });
  });
});
