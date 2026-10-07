import { describe, expect, it } from "vitest";
import { allowedOrigins, originAllowed } from "./cors";

describe("allowedOrigins", () => {
  it("is the frontend's origin plus CORS_ALLOWED_ORIGINS, exactly", () => {
    const allowed = allowedOrigins({
      NEXT_PUBLIC_APP_URL: "https://app.pakkaagent.in/dashboard",
      CORS_ALLOWED_ORIGINS: ["https://staging.pakkaagent.in", "http://localhost:3000"],
    });
    expect([...allowed]).toEqual(["https://app.pakkaagent.in", "https://staging.pakkaagent.in", "http://localhost:3000"]);
  });

  it("is only the frontend's origin when no extra origins are set", () => {
    expect([...allowedOrigins({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })]).toEqual(["http://localhost:3000"]);
  });
});

describe("originAllowed", () => {
  const allowed = new Set(["https://app.pakkaagent.in"]);
  const from = (origin?: string) => new Request("http://api.test/api/templates", { headers: origin ? { origin } : {} });

  it("matches whole origins only", () => {
    expect(originAllowed(from("https://app.pakkaagent.in"), allowed)).toBe(true);
    expect(originAllowed(from("https://app.pakkaagent.in.evil.example"), allowed)).toBe(false);
    expect(originAllowed(from("http://app.pakkaagent.in"), allowed)).toBe(false);
    expect(originAllowed(from("https://app.pakkaagent.in:8443"), allowed)).toBe(false);
  });

  it("lets requests without an Origin header through (they still need a token)", () => {
    expect(originAllowed(from(), allowed)).toBe(true);
  });
});
