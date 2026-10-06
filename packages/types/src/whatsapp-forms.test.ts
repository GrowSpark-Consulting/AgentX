import { describe, expect, it } from "vitest";
import {
  CreateTemplateInput,
  PhoneInput,
  SendTestMessageInput,
  TEMPLATE_BODY_MAX,
  WHATSAPP_TEXT_MAX,
  templateVariables,
} from "./whatsapp";

// The dashboard's send-test-message and create-template forms validate with these schemas before
// posting, and the API routes validate with them again.

/** First message per top-level field, as the forms show them. */
function fieldErrors(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  const fields: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) fields[String(issue.path[0])] ??= issue.message;
  return fields;
}

describe("PhoneInput", () => {
  it("accepts E.164 and trims what was typed around it", () => {
    expect(PhoneInput.parse("+919840012345")).toBe("+919840012345");
    expect(PhoneInput.parse("  +919840012345 ")).toBe("+919840012345");
  });

  it.each(["", "9840012345", "919840012345", "+91 98400 12345", "+91-98400-12345", "+0919840012345", "+12"])(
    "rejects %j with a message written for people",
    (value) => {
      const result = PhoneInput.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Enter the number with country code, like +919840012345");
    },
  );
});

describe("SendTestMessageInput", () => {
  it("accepts a number and a message", () => {
    expect(SendTestMessageInput.parse({ to: "+919840012345", body: " Hello " })).toEqual({ to: "+919840012345", body: "Hello" });
  });

  it("requires both fields", () => {
    expect(fieldErrors(SendTestMessageInput.safeParse({ to: "", body: "   " }))).toEqual({
      to: "Enter the number with country code, like +919840012345",
      body: "Write a message",
    });
  });

  it("limits the message to WhatsApp's maximum", () => {
    expect(SendTestMessageInput.safeParse({ to: "+919840012345", body: "x".repeat(WHATSAPP_TEXT_MAX) }).success).toBe(true);
    expect(fieldErrors(SendTestMessageInput.safeParse({ to: "+919840012345", body: "x".repeat(WHATSAPP_TEXT_MAX + 1) }))).toEqual({
      body: `Keep it under ${WHATSAPP_TEXT_MAX} characters`,
    });
  });
});

describe("templateVariables", () => {
  it("lists distinct variables in number order", () => {
    expect(templateVariables("Hi {{2}}, {{1}} and {{2}} again")).toEqual([1, 2]);
    expect(templateVariables("No variables, {not one} {{x}}")).toEqual([]);
  });
});

describe("CreateTemplateInput", () => {
  const valid = {
    name: "booking_confirmed_v1",
    category: "utility",
    language: "en",
    body: "Hi {{1}}, your visit is booked for {{2}}.",
    examples: ["Karthik", "Sat 24 Oct, 11 am"],
  };

  it("accepts a versioned template with one sample per variable", () => {
    expect(CreateTemplateInput.parse(valid)).toEqual(valid);
    expect(CreateTemplateInput.parse({ ...valid, body: "Thanks for visiting.", examples: [] }).examples).toEqual([]);
  });

  it.each(["Booking Confirmed", "booking_confirmed", "booking-confirmed_v1", "1booking_v1", "booking_v0"])(
    "rejects the name %j",
    (name) => {
      expect(fieldErrors(CreateTemplateInput.safeParse({ ...valid, name })).name).toMatch(/ending in a version like _v1/);
    },
  );

  it("only takes the categories and languages Meta is set up for", () => {
    expect(CreateTemplateInput.safeParse({ ...valid, category: "authentication" }).success).toBe(false);
    expect(CreateTemplateInput.safeParse({ ...valid, language: "hi" }).success).toBe(false);
  });

  it("requires a message within Meta's limit", () => {
    expect(fieldErrors(CreateTemplateInput.safeParse({ ...valid, body: " ", examples: [] })).body).toBe("Write the message");
    const long = { ...valid, body: "x".repeat(TEMPLATE_BODY_MAX + 1), examples: [] };
    expect(fieldErrors(CreateTemplateInput.safeParse(long)).body).toBe(`Keep it under ${TEMPLATE_BODY_MAX} characters`);
  });

  it("requires variables numbered in order", () => {
    const result = CreateTemplateInput.safeParse({ ...valid, body: "Hi {{2}}", examples: ["Karthik"] });
    expect(fieldErrors(result).body).toBe("Number variables in order: {{1}}, {{2}}, …");
  });

  it("requires a non-empty sample for every variable", () => {
    expect(fieldErrors(CreateTemplateInput.safeParse({ ...valid, examples: ["Karthik"] })).examples).toBe(
      "Add one sample value for each variable",
    );
    expect(fieldErrors(CreateTemplateInput.safeParse({ ...valid, examples: ["Karthik", "  "] })).examples).toBe("Add a sample value");
  });
});
