import { describe, expect, it } from "vitest";
import { isMetaOrigin, newSignupSession, parseSignupMessage, reduceSignup, type SignupEvent, type SignupInput } from "./embedded-signup";

const META = "https://www.facebook.com";
const message = (event: string, data: Record<string, unknown> = {}) => JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event, data });

describe("isMetaOrigin", () => {
  it.each(["https://www.facebook.com", "https://web.facebook.com", "https://facebook.com", "https://business.facebook.com"])("trusts %s", (o) => {
    expect(isMetaOrigin(o)).toBe(true);
  });

  it.each([
    "http://www.facebook.com", // not https
    "https://evilfacebook.com", // suffix without a dot
    "https://facebook.com.evil.test",
    "https://www.facebook.com:8443",
    "https://www.facebook.com/path",
    "null",
    "",
    "http://localhost:3000",
  ])("refuses %j", (o) => {
    expect(isMetaOrigin(o)).toBe(false);
  });
});

describe("parseSignupMessage", () => {
  it("reads a finish event (string or object data, numeric ids as strings)", () => {
    const expected: SignupEvent = { kind: "finish", wabaId: "234567890123456", phoneNumberId: "109876543210987", coexistence: false };
    expect(parseSignupMessage(META, message("FINISH", { waba_id: "234567890123456", phone_number_id: "109876543210987", business_id: "1" }))).toEqual(expected);
    expect(
      parseSignupMessage(META, { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: 234567890123456, phone_number_id: 109876543210987 } }),
    ).toEqual(expected);
  });

  it("marks the coexistence finish, which may carry no number", () => {
    expect(parseSignupMessage(META, message("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", { waba_id: "42" }))).toEqual({
      kind: "finish",
      wabaId: "42",
      phoneNumberId: null,
      coexistence: true,
    });
  });

  it("reads cancel with the step, and error with its code only", () => {
    expect(parseSignupMessage(META, message("CANCEL", { current_step: "PHONE_NUMBER_SETUP" }))).toEqual({ kind: "cancel", step: "PHONE_NUMBER_SETUP" });
    expect(parseSignupMessage(META, message("CANCEL"))).toEqual({ kind: "cancel", step: null });
    const error = parseSignupMessage(META, message("ERROR", { error_message: "Something <b>bad</b>", error_code: 524126, session_id: "s" }));
    expect(error).toEqual({ kind: "error", errorCode: "524126" });
    expect(JSON.stringify(error)).not.toContain("Something");
  });

  it("ignores messages from any other origin, even when well formed", () => {
    const data = message("FINISH", { waba_id: "1", phone_number_id: "2" });
    expect(parseSignupMessage("https://evilfacebook.com", data)).toBeNull();
    expect(parseSignupMessage("http://localhost:3100", data)).toBeNull();
  });

  it.each([
    ["not JSON", "{oops"],
    ["another message type", JSON.stringify({ type: "SOMETHING_ELSE", event: "FINISH", data: { waba_id: "1", phone_number_id: "2" } })],
    ["an unknown event", message("STARTED")],
    ["a finish without a number", message("FINISH", { waba_id: "1" })],
    ["a non-numeric WABA id", message("FINISH", { waba_id: "1; drop", phone_number_id: "2" })],
    ["a non-numeric phone number id", message("FINISH", { waba_id: "1", phone_number_id: "abc" })],
    ["null", null],
    ["a number", 42],
  ])("ignores %s", (_, data) => {
    expect(parseSignupMessage(META, data)).toBeNull();
  });
});

const finish: SignupInput = { type: "message", event: { kind: "finish", wabaId: "11", phoneNumberId: "22", coexistence: false } };
const login = (code: string | null): SignupInput => ({ type: "login", response: { authResponse: code ? { code } : null, status: "connected" } });
const run = (...inputs: SignupInput[]) => inputs.reduce(reduceSignup, newSignupSession());

describe("reduceSignup", () => {
  it("finishes with the payload once both the code and the finish message arrive, in either order", () => {
    const payload = { code: "AQB-code", wabaId: "11", phoneNumberId: "22", coexistence: false };
    expect(run(login("AQB-code"), finish).outcome).toEqual({ status: "finished", payload });
    expect(run(finish, login("AQB-code")).outcome).toEqual({ status: "finished", payload });
  });

  it("waits while only one half has arrived", () => {
    expect(run(login("AQB-code")).outcome).toBeNull();
    expect(run(finish).outcome).toBeNull();
  });

  it("cancels with the step Meta reported, or without one when the window closes first", () => {
    expect(run({ type: "message", event: { kind: "cancel", step: "WABA_SETUP" } }, login(null)).outcome).toEqual({ status: "cancelled", step: "WABA_SETUP" });
    expect(run(login(null)).outcome).toEqual({ status: "cancelled", step: null });
    expect(run({ type: "login", response: "garbage" }).outcome).toEqual({ status: "cancelled", step: null });
  });

  it("fails on Meta's error, or when the other half never comes", () => {
    expect(run({ type: "message", event: { kind: "error", errorCode: "7" } }).outcome).toEqual({ status: "failed", reason: "error", errorCode: "7" });
    expect(run(login("AQB-code"), { type: "timeout" }).outcome).toEqual({ status: "failed", reason: "incomplete", errorCode: null });
  });

  it("ignores everything after the outcome", () => {
    const cancelled = run(login(null));
    expect(reduceSignup(cancelled, finish)).toBe(cancelled);
  });
});
