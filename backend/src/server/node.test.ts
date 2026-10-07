import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { errorOf } from "../test-support/http";
import { closeGracefully, createHttpServer, type FetchHandler } from "./node";

const servers: Server[] = [];

async function start(handle: FetchHandler, options: Parameters<typeof createHttpServer>[1] = {}) {
  const server = createHttpServer(handle, { log: () => {}, ...options });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => (s.listening ? closeGracefully(s, 100) : undefined)));
});

describe("createHttpServer", () => {
  it("passes the request through as a Web Request and writes the Response back", async () => {
    const { url } = await start(async (req) =>
      Response.json({ method: req.method, path: new URL(req.url).pathname, body: await req.text(), type: req.headers.get("content-type") }, { status: 201, headers: { "x-test": "1" } }),
    );
    const res = await fetch(`${url}/api/echo?x=1`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"a":1}' });
    expect(res.status).toBe(201);
    expect(res.headers.get("x-test")).toBe("1");
    expect(await res.json()).toEqual({ method: "POST", path: "/api/echo", body: '{"a":1}', type: "application/json" });
  });

  it("uses x-forwarded-proto from Railway's proxy for the request URL", async () => {
    const { url } = await start(async (req) => new Response(new URL(req.url).protocol));
    const res = await fetch(url, { headers: { "x-forwarded-proto": "https" } });
    expect(await res.text()).toBe("https:");
  });

  it("refuses a body over the limit with 413 before the handler runs", async () => {
    let ran = false;
    const { url } = await start(
      async () => {
        ran = true;
        return new Response("ok");
      },
      { maxBodyBytes: 16 },
    );
    const res = await fetch(url, { method: "POST", body: "x".repeat(64) });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: { code: "validation_failed", message: "That request is too large." } });
    expect(ran).toBe(false);
  });

  it("answers 500 in the envelope if the handler throws, and logs no credentials", async () => {
    const lines: string[] = [];
    const { url } = await start(
      async () => {
        throw new Error("boom with Bearer abc.def.ghi");
      },
      { log: (l) => lines.push(l) },
    );
    const res = await fetch(url);
    expect(res.status).toBe(500);
    expect((await errorOf(res)).code).toBe("internal");
    expect(lines.join("\n")).not.toContain("abc.def.ghi");
  });

  it("logs the path but never the query string (Meta's verify token travels there)", async () => {
    const lines: string[] = [];
    const { url } = await start(async () => new Response("ok"), { log: (l) => lines.push(l) });
    await fetch(`${url}/api/webhooks/whatsapp?hub.verify_token=secret-token&hub.challenge=1`);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^GET \/api\/webhooks\/whatsapp 200 \d+ms$/);
    expect(lines[0]).not.toContain("secret-token");
  });
});

describe("closeGracefully", () => {
  it("lets a request in flight finish, then stops listening", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { server, url } = await start(async () => {
      await gate;
      return new Response("done");
    });

    const inFlight = fetch(url);
    await new Promise((r) => setTimeout(r, 50));
    const closed = closeGracefully(server, 5_000);
    release();

    const res = await inFlight;
    expect(await res.text()).toBe("done");
    await closed;
    expect(server.listening).toBe(false);
  });

  it("closes connections still open after the timeout", async () => {
    const { server, url } = await start(() => new Promise<Response>(() => {}));
    fetch(url).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    await closeGracefully(server, 100);
    expect(server.listening).toBe(false);
  });
});
