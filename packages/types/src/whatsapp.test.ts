import { describe, expect, it } from "vitest";
import { InboundMessage, SendResult, StatusUpdate } from "./whatsapp";

const base = {
  tenantId: "3f2b7c1e-8a4d-4e6b-9c1a-5d2e7f8a9b0c",
  channelId: "7a1d4c2e-6b3f-4a8d-8e5c-1f2a3b4c5d6e",
  providerMsgId: "wamid.HBgM",
  from: "+919812345621",
  type: "text" as const,
  text: "hello",
  timestamp: "2026-10-06T09:30:00Z",
};

describe("InboundMessage", () => {
  it("accepts a text message", () => {
    expect(InboundMessage.parse(base)).toEqual(base);
  });

  it("accepts media and a route code", () => {
    const msg = {
      ...base,
      type: "image" as const,
      media: { id: "1234", mime: "image/jpeg" },
      routeCode: "DEMO-SAMPLE",
    };
    expect(InboundMessage.parse(msg).media?.mime).toBe("image/jpeg");
  });

  it.each(["919812345621", "+0123456789", "+91 98123 45621", "+12"])(
    "rejects a non-E.164 number %s",
    (from) => {
      expect(InboundMessage.safeParse({ ...base, from }).success).toBe(false);
    },
  );

  it("accepts the seeded Postgres ids, which are not RFC version 1-8 uuids", () => {
    const seeded = {
      ...base,
      tenantId: "d0000000-0000-0000-0000-000000000001", // demo real-estate tenant
      channelId: "d3000000-0000-0000-0000-0000000000a1", // isolation test A channel
    };
    expect(InboundMessage.parse(seeded).tenantId).toBe(seeded.tenantId);
    const isolation = { ...base, tenantId: "d0000000-0000-0000-0000-0000000000a1" };
    expect(InboundMessage.safeParse(isolation).success).toBe(true);
  });

  it.each([
    ["one hex digit short", "d0000000-0000-0000-0000-00000000000"],
    ["a non-hex character", "d0000000-0000-0000-0000-00000000000g"],
    ["no hyphens", "d00000000000000000000000000000001"],
    ["an empty string", ""],
  ])("rejects a malformed tenantId and channelId: %s", (_why, id) => {
    expect(InboundMessage.safeParse({ ...base, tenantId: id }).success).toBe(false);
    expect(InboundMessage.safeParse({ ...base, channelId: id }).success).toBe(false);
  });

  it("rejects an unknown type, a bad tenant id and a non-ISO timestamp", () => {
    expect(InboundMessage.safeParse({ ...base, type: "sticker" }).success).toBe(false);
    expect(InboundMessage.safeParse({ ...base, tenantId: "t1" }).success).toBe(false);
    expect(InboundMessage.safeParse({ ...base, timestamp: "1759743000" }).success).toBe(false);
  });

  it("rejects an empty provider message id", () => {
    expect(InboundMessage.safeParse({ ...base, providerMsgId: "" }).success).toBe(false);
  });
});

describe("StatusUpdate", () => {
  it("accepts a delivered status and a failed status with an error", () => {
    const ok = { providerMsgId: "wamid.X", status: "delivered", timestamp: "2026-10-06T09:31:00Z" };
    expect(StatusUpdate.parse(ok).status).toBe("delivered");
    const failed = { ...ok, status: "failed", error: { code: 131047, message: "Re-engagement" } };
    expect(StatusUpdate.parse(failed).error?.code).toBe(131047);
  });

  it("rejects an unknown status", () => {
    const bad = { providerMsgId: "wamid.X", status: "queued", timestamp: "2026-10-06T09:31:00Z" };
    expect(StatusUpdate.safeParse(bad).success).toBe(false);
  });
});

describe("SendResult", () => {
  it("requires a provider message id", () => {
    expect(SendResult.parse({ providerMsgId: "wamid.Y" }).providerMsgId).toBe("wamid.Y");
    expect(SendResult.safeParse({}).success).toBe(false);
  });
});
