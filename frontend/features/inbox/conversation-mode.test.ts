import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModeDataError, switchMode, switchNote } from "./conversation-mode";

const postJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ postJson }));

const TENANT = "10000000-0000-0000-0000-000000000004";
const CHAT = "40000000-0000-0000-0000-000000000001";

describe("switchMode", () => {
  beforeEach(() => {
    postJson.mockReset();
  });

  it("posts only the mode, with the business in the tenant header, and parses the answer", async () => {
    postJson.mockResolvedValue({ mode: "human", changed: true });
    await expect(switchMode(TENANT, CHAT, "human")).resolves.toEqual({ mode: "human", changed: true });
    expect(postJson).toHaveBeenCalledWith(`/api/conversations/${CHAT}/mode`, { mode: "human" }, { tenantId: TENANT });
  });

  it.each([[{ mode: "external", changed: true }], [{ mode: "ai" }], [null], ["ok"]])("rejects an answer of the wrong shape (%j)", async (answer) => {
    postJson.mockResolvedValue(answer);
    await expect(switchMode(TENANT, CHAT, "ai")).rejects.toBeInstanceOf(ModeDataError);
  });

  it("lets the API's errors through", async () => {
    const failure = new Error("conflict");
    postJson.mockImplementation(() => Promise.reject(failure));
    await expect(switchMode(TENANT, CHAT, "ai")).rejects.toBe(failure);
  });
});

describe("switchNote", () => {
  it("says what the switch does in each mode", () => {
    expect(switchNote("ai")).toMatch(/until a team member takes over/);
    expect(switchNote("human")).toMatch(/hands the chat back/);
    expect(switchNote("external")).toMatch(/own WhatsApp number/);
  });
});
