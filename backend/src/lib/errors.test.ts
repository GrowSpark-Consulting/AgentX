import { redactSecrets } from "@pakka/types";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, toErrorResponse } from "./errors";

describe("toErrorResponse", () => {
  it("passes an AppError's code, safe message and status through", () => {
    const res = toErrorResponse(new AppError("forbidden", "Only an owner or admin can do that."));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "forbidden", message: "Only an owner or admin can do that." } });
  });

  it.each([
    ["outside_window", 409],
    ["conflict", 409],
    ["rate_limited", 429],
    ["insufficient_credits", 402],
    ["slot_taken", 409],
    ["plan_required", 403],
    ["seat_limit", 409],
  ] as const)("answers %s with HTTP %i", (code, status) => {
    const res = toErrorResponse(new AppError(code, "Safe message."));
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: { code, message: "Safe message." } });
  });

  it("turns a Zod error into validation_failed with one message per field", () => {
    const err = z.object({ to: z.string().min(3, "too short"), body: z.string() }).safeParse({ to: "1" }).error;
    const res = toErrorResponse(err);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("validation_failed");
    expect(res.body.error.fields).toMatchObject({ to: "too short" });
    expect(res.body.error.fields?.body).toBeTruthy();
  });

  it("hides unknown errors from the user and logs them without credentials", () => {
    const logs: string[] = [];
    const secret = "connect to postgresql://postgres:hunter2@db.example.supabase.co:5432/postgres failed";
    const res = toErrorResponse(new Error(secret), (l) => logs.push(l));
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "internal", message: "Something went wrong on our side. Try again in a moment." });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(logs[0]).toContain("[redacted]@db.example.supabase.co");
    expect(logs[0]).not.toContain("hunter2");
  });

  it("handles thrown non-errors", () => {
    const res = toErrorResponse("boom", () => {});
    expect(res.body.error.code).toBe("internal");
  });
});

// Fake credential-shaped strings, assembled at runtime so secret scanners don't flag this file.
const fake = (...parts: string[]) => parts.join("");

describe("redactSecrets", () => {
  it.each([
    ["postgresql://postgres:p%40ss@db.x.supabase.co:5432/postgres", "p%40ss"],
    [fake("key sb_", "secret_abcDEF123456"), fake("sb_", "secret_abcDEF123456")],
    [fake("anon sb_", "publishable_abc123"), fake("sb_", "publishable_abc123")],
    [fake("token ey", "JhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc"), fake("ey", "JhbGciOiJIUzI1NiJ9")],
    [fake("meta EA", "AGm0PX4ZCpsBAKZCZBZBabcdefghij"), fake("EA", "AGm0PX4ZCpsBAKZCZBZBabcdefghij")],
    ["Authorization: Bearer abc.def.ghi", "abc.def.ghi"],
  ])("removes %s", (text, secret) => {
    expect(redactSecrets(text)).not.toContain(secret);
  });

  it("leaves ordinary text alone", () => {
    expect(redactSecrets("Template reminder_24h_v1 sent to +919840012345")).toBe(
      "Template reminder_24h_v1 sent to +919840012345",
    );
  });
});
