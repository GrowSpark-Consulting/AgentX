import { describe, expect, it, vi } from "vitest";

// Synthetic values: the route reads its token through the real serverEnv().
vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "synthetic-route-token");

const { createApp } = await import("./app");
const app = createApp();

const call = (query: string, init?: RequestInit) =>
  app(new Request(`http://localhost:4000/api/webhooks/whatsapp${query}`, init));

describe("/api/webhooks/whatsapp", () => {
  it("answers GET and POST only; POST is covered by webhook-post.test.ts", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const res = await call("", { method, body: "{}" });
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("GET, POST");
    }
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

  it("sends no CORS headers: Meta calls it server to server", async () => {
    const res = await call("?hub.mode=subscribe&hub.verify_token=synthetic-route-token&hub.challenge=1", {
      headers: { origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
