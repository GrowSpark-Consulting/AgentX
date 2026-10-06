import { describe, expect, it } from "vitest";
import { authErrorPath, authLinkErrorFrom, authLinkErrorMessage, destinationAfterAuth, safeNext } from "./redirect";

describe("safeNext", () => {
  it("keeps paths inside the dashboard and onboarding", () => {
    for (const path of ["/dashboard", "/dashboard/whatsapp", "/dashboard?industry=salon", "/onboarding"]) {
      expect(safeNext(path)).toBe(path);
    }
  });

  it("falls back for anything that could leave the app", () => {
    for (const bad of ["//evil.example.com", "https://evil.example.com", "/\\evil.example.com", "/dashboardx", "/login", "", null, 42]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
    expect(safeNext("https://evil.example.com", "/onboarding")).toBe("/onboarding");
  });
});

describe("destinationAfterAuth", () => {
  it("sends an account with no business to onboarding, whatever it asked for", () => {
    expect(destinationAfterAuth(false, "/dashboard/whatsapp")).toBe("/onboarding");
    expect(destinationAfterAuth(false, undefined)).toBe("/onboarding");
  });

  it("sends a member to the dashboard page they asked for", () => {
    expect(destinationAfterAuth(true, "/dashboard/templates/new")).toBe("/dashboard/templates/new");
    expect(destinationAfterAuth(true, null)).toBe("/dashboard");
  });

  it("never sends a member back into onboarding or off-site", () => {
    expect(destinationAfterAuth(true, "/onboarding")).toBe("/dashboard");
    expect(destinationAfterAuth(true, "//evil.example.com")).toBe("/dashboard");
  });
});

describe("auth link errors", () => {
  it("maps Supabase redirect errors to our own codes", () => {
    expect(authLinkErrorFrom("access_denied", "otp_expired")).toBe("link_expired");
    expect(authLinkErrorFrom("access_denied", null)).toBe("signin_cancelled");
    expect(authLinkErrorFrom("server_error", "unexpected_failure")).toBe("signin_failed");
  });

  it("only shows copy for codes we send", () => {
    expect(authLinkErrorMessage("signin_failed")).toMatch(/couldn't finish signing you in/);
    expect(authLinkErrorMessage("<script>alert(1)</script>")).toBeNull();
    expect(authLinkErrorMessage("toString")).toBeNull();
    expect(authLinkErrorMessage(["signin_failed"])).toBeNull();
  });

  it("returns to signup for onboarding-bound flows and to login otherwise", () => {
    expect(authErrorPath("signin_cancelled", "/onboarding")).toBe("/signup?error=signin_cancelled");
    expect(authErrorPath("signin_failed", "/dashboard")).toBe("/login?error=signin_failed");
    expect(authErrorPath("signin_failed", "https://evil.example.com")).toBe("/login?error=signin_failed");
  });
});
