import { describe, expect, it, vi } from "vitest";
import type { SendOutcome } from "../../notify/send";
import { createSystemNoticePort, staffAlertPort } from "./ports";

// The system notice goes through notify.send's `system_notice` kind; what comes back is small facts only.

const INPUT = { tenantId: "t1", conversationId: "c1", kind: "credits_holding", text: "A person will reply soon." } as const;

function port(outcome: SendOutcome | Error) {
  const send = vi.fn(async () => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return { send, port: createSystemNoticePort(send) };
}

describe("the system notice port", () => {
  it("sends the fixed text as a system_notice into this chat for this business", async () => {
    const p = port({ status: "sent", messageId: "m", providerMsgId: "p", creditsCharged: 0, usedTemplate: false });
    expect(await p.port.send(INPUT)).toEqual({ status: "sent" });
    expect(p.send).toHaveBeenCalledOnce();
    expect(p.send).toHaveBeenCalledWith("t1", "system_notice", { conversationId: "c1", text: "A person will reply soon." });
  });

  it("reports a skipped notice (outside the 24-hour window) as failed, with only the reason", async () => {
    expect(await port({ status: "skipped", reason: "outside_window" }).port.send(INPUT)).toEqual({ status: "failed", reason: "outside_window" });
  });

  it("reports a failed send by its error code, not its message", async () => {
    const outcome: SendOutcome = { status: "failed", error: { code: "rate_limited", message: "to +919876543210", retryable: true, outcomeUnknown: false } };
    expect(await port(outcome).port.send(INPUT)).toEqual({ status: "failed", reason: "rate_limited" });
  });

  it.each(["feature_off", "opted_out", "insufficient_credits"] as const)("reports a skipped notice (%s) as failed with that reason", async (reason) => {
    expect(await port({ status: "skipped", reason }).port.send(INPUT)).toEqual({ status: "failed", reason });
  });

  it("reports a send whose outcome is unknown as failed by its code (never resent here)", async () => {
    const outcome: SendOutcome = { status: "failed", error: { code: "timeout", message: "x", retryable: false, outcomeUnknown: true } };
    expect(await port(outcome).port.send(INPUT)).toEqual({ status: "failed", reason: "timeout" });
  });

  it("lets a thrown error reach the caller, which settles it (reply.ts)", async () => {
    await expect(port(new Error("down")).port.send(INPUT)).rejects.toThrow("down");
  });
});

describe("the staff alert port", () => {
  it("sends nothing itself: the handoff-alert job alerts staff from the handoff.opened event", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(staffAlertPort.send({ tenantId: "t1", conversationId: "c1", kind: "handoff_opened" })).resolves.toEqual({ status: "queued" });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
