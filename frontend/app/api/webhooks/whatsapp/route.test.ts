import { describe, expect, it, vi } from "vitest";

// Synthetic values: the route reads its token through the real serverEnv().
vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "synthetic-route-token");

const route = await import("./route");

const call = (query: string) =>
  route.GET(new Request(`http://localhost:3000/api/webhooks/whatsapp${query}`));

describe("/api/webhooks/whatsapp", () => {
  it("exports GET only: message handling is not part of this route yet", () => {
    expect(typeof route.GET).toBe("function");
    expect("POST" in route).toBe(false);
  });

  it("answers Meta's verification with the challenge as plain text", async () => {
    const res = await call("?hub.mode=subscribe&hub.verify_token=synthetic-route-token&hub.challenge=424242");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("424242");
    expect(res.headers.get("content-type")).toContain("text/plain");
  });

  it("answers 403 with an empty body for a wrong token", async () => {
    const res = await call("?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=424242");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("");
  });
});
