import { describe, expect, expectTypeOf, it } from "vitest";
import { ApiErrorBody, ERROR_CODES } from "./errors";
import {
  CreateTemplateInput,
  PhoneInput,
  SendTestMessageInput,
  TEMPLATE_BODY_MAX,
  TEMPLATE_BUTTONS_MAX,
  TemplateButton,
  WHATSAPP_TEXT_MAX,
  templateVariables,
  type CreateTemplateResult,
  type SendTestMessageResult,
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

describe("SendTestMessageResult", () => {
  it("is { providerMsgId, status: 'accepted' }, like SendResult", () => {
    expectTypeOf<SendTestMessageResult>().toEqualTypeOf<{ providerMsgId: string; status: "accepted" }>();
  });
});

describe("CreateTemplateResult", () => {
  it("is { id, name, language, status: 'pending' | 'draft' }", () => {
    expectTypeOf<CreateTemplateResult>().toEqualTypeOf<{
      id: string;
      name: string;
      language: "en" | "ta";
      status: "pending" | "draft";
    }>();
  });
});

describe("CreateTemplateInput: variable position", () => {
  const valid = { name: "booking_confirmed_v1", category: "utility", language: "en", examples: ["Karthik"] };
  const message = "Start and end the message with words, not a variable";

  it.each(["{{1}} Hello", "  {{1}}, your visit is booked."])("rejects a body that starts with a variable: %j", (body) => {
    expect(fieldErrors(CreateTemplateInput.safeParse({ ...valid, body })).body).toBe(message);
  });

  it.each(["Hello {{1}}", "Your visit is booked, {{1}}  "])("rejects a body that ends with a variable: %j", (body) => {
    expect(fieldErrors(CreateTemplateInput.safeParse({ ...valid, body })).body).toBe(message);
  });

  it("accepts a variable with words around it", () => {
    expect(CreateTemplateInput.safeParse({ ...valid, body: "Hi {{1}}, see you soon." }).success).toBe(true);
  });
});

describe("CreateTemplateInput: header, footer, buttons and connection", () => {
  const valid = {
    name: "booking_confirmed_v1",
    category: "utility",
    language: "en",
    body: "Hi {{1}}, your visit is booked.",
    examples: ["Karthik"],
  };
  const quickReply = { type: "quick_reply", text: "Reschedule" };
  const url = { type: "url", text: "See booking", url: "https://pakkaagent.in/b/1" };
  const phone = { type: "phone_number", text: "Call us", phoneNumber: "+919840012345" };

  it("needs none of them", () => {
    const parsed = CreateTemplateInput.parse(valid);
    expect(parsed.header).toBeUndefined();
    expect(parsed.footer).toBeUndefined();
    expect(parsed.buttons).toBeUndefined();
    expect(parsed.connectionId).toBeUndefined();
  });

  it("accepts a header and a footer", () => {
    const parsed = CreateTemplateInput.parse({ ...valid, header: "Booking confirmed", footer: "Reply STOP to opt out" });
    expect(parsed).toMatchObject({ header: "Booking confirmed", footer: "Reply STOP to opt out" });
  });

  it.each([0, 1, 2, 3])("accepts %i buttons", (count) => {
    const buttons = [quickReply, url, phone].slice(0, count);
    expect(CreateTemplateInput.parse({ ...valid, buttons }).buttons).toEqual(buttons);
  });

  it(`rejects more than ${TEMPLATE_BUTTONS_MAX} buttons`, () => {
    const result = CreateTemplateInput.safeParse({ ...valid, buttons: [quickReply, url, phone, quickReply] });
    expect(fieldErrors(result).buttons).toBe("Add up to 3 buttons");
  });

  it("takes exactly the three agreed button shapes", () => {
    expect(TemplateButton.parse(quickReply)).toEqual(quickReply);
    expect(TemplateButton.parse(url)).toEqual(url);
    expect(TemplateButton.parse(phone)).toEqual(phone);
    expect(TemplateButton.safeParse({ type: "copy_code", text: "Copy" }).success).toBe(false);
    expect(TemplateButton.safeParse({ type: "url", text: "See booking" }).success).toBe(false);
    expect(TemplateButton.safeParse({ type: "phone_number", text: "Call", phone_number: "+919840012345" }).success).toBe(false);
  });

  it("checks each button's text, web address and phone number", () => {
    expect(TemplateButton.safeParse({ ...quickReply, text: " " }).error?.issues[0]?.message).toBe("Add the button text");
    expect(TemplateButton.safeParse({ ...url, url: "pakkaagent.in" }).error?.issues[0]?.message).toBe(
      "Enter a web address starting with https://",
    );
    expect(TemplateButton.safeParse({ ...url, url: "javascript:alert(1)" }).success).toBe(false);
    expect(TemplateButton.safeParse({ ...phone, phoneNumber: "98400 12345" }).error?.issues[0]?.message).toBe(
      "Enter the number with country code, like +919840012345",
    );
  });

  it("applies Meta's limits: header 60, footer 60, button text 25", () => {
    expect(CreateTemplateInput.safeParse({ ...valid, header: "h".repeat(60), footer: "f".repeat(60) }).success).toBe(true);
    expect(fieldErrors(CreateTemplateInput.safeParse({ ...valid, header: "h".repeat(61) })).header).toBe("Keep it under 60 characters");
    expect(fieldErrors(CreateTemplateInput.safeParse({ ...valid, footer: "f".repeat(61) })).footer).toBe("Keep it under 60 characters");
    expect(TemplateButton.safeParse({ ...quickReply, text: "b".repeat(25) }).success).toBe(true);
    expect(TemplateButton.safeParse({ ...url, text: "b".repeat(26) }).error?.issues[0]?.message).toBe("Keep it under 25 characters");
  });

  it("takes an optional connection id", () => {
    const connectionId = "30000000-0000-0000-0000-000000000001";
    expect(CreateTemplateInput.parse({ ...valid, connectionId }).connectionId).toBe(connectionId);
    expect(CreateTemplateInput.safeParse({ ...valid, connectionId: "c1" }).success).toBe(false);
  });
});

describe("error codes", () => {
  it.each(["outside_window", "conflict", "rate_limited", "insufficient_credits", "slot_taken", "plan_required", "seat_limit"])(
    "includes the agreed code %s in the error envelope",
    (code) => {
      expect(ERROR_CODES).toContain(code);
      const body = { error: { code, message: "Try again later.", fields: { slot: "Pick another time" } } };
      expect(ApiErrorBody.parse(body)).toEqual(body);
    },
  );
});
