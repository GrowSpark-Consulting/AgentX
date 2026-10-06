import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("../lib/supabase-admin", () => ({ supabaseAdmin: () => ({ rpc }) }));

const { getBalance, spendCredits } = await import("./credits");

const TENANT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const SEEDED_DEMO_TENANT = "d0000000-0000-0000-0000-000000000001";

beforeEach(() => rpc.mockReset());

describe("spendCredits", () => {
  it("calls spend_credits with named arguments and returns its answer", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(spendCredits(TENANT, 1, "ai_reply")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("spend_credits", {
      p_tenant_id: TENANT,
      p_amount: 1,
      p_reason: "ai_reply",
      p_ref_id: null,
    });
  });

  it("returns false when the balance is too low", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(spendCredits(TENANT, 5, "template_utility")).resolves.toBe(false);
  });

  it("accepts the seeded demo tenant ids", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(spendCredits(SEEDED_DEMO_TENANT, 1, "ai_reply")).resolves.toBe(true);
  });

  it("rejects a zero or fractional amount before touching the database", async () => {
    await expect(spendCredits(TENANT, 0, "ai_reply")).rejects.toThrow();
    await expect(spendCredits(TENANT, 1.5, "ai_reply")).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces database errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(spendCredits(TENANT, 1, "ai_reply")).rejects.toThrow("spend_credits failed");
  });
});

describe("getBalance", () => {
  it("returns the plan, top-up and total balance", async () => {
    rpc.mockResolvedValue({ data: [{ plan: 1200, topup: 300, total: 1500 }], error: null });
    await expect(getBalance(TENANT)).resolves.toEqual({ plan: 1200, topup: 300, total: 1500 });
    expect(rpc).toHaveBeenCalledWith("credit_balance", { p_tenant_id: TENANT });
  });
});
