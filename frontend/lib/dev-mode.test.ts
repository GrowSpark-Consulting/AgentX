import { describe, expect, it } from "vitest";
import { dashboardWithoutTenantAllowed } from "./dev-mode";

describe("dashboardWithoutTenantAllowed", () => {
  it("is on under next dev", () => {
    expect(dashboardWithoutTenantAllowed({ nodeEnv: "development", vercelEnv: undefined, flag: undefined })).toBe(true);
  });

  it("is off for a production build unless the flag is set", () => {
    expect(dashboardWithoutTenantAllowed({ nodeEnv: "production", vercelEnv: undefined, flag: undefined })).toBe(false);
    expect(dashboardWithoutTenantAllowed({ nodeEnv: "production", vercelEnv: undefined, flag: "false" })).toBe(false);
    expect(dashboardWithoutTenantAllowed({ nodeEnv: "production", vercelEnv: "preview", flag: "true" })).toBe(true);
  });

  it("is never on for a Vercel production deployment", () => {
    expect(dashboardWithoutTenantAllowed({ nodeEnv: "production", vercelEnv: "production", flag: "true" })).toBe(false);
    expect(dashboardWithoutTenantAllowed({ nodeEnv: "development", vercelEnv: "production", flag: "true" })).toBe(false);
  });
});
