import { describe, expect, it } from "vitest";
import { extractUnverifiedRouting } from "./routing";

// Synthetic payloads: field names follow Meta's webhook reference, the values are made up.
const message = (wabaId: string, phoneNumberId: string) => ({
  id: wabaId,
  changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId } } }],
});

describe("extractUnverifiedRouting", () => {
  it("returns the WABA id and phone number id of a normal payload", () => {
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [message("200", "300")] });
    expect(extractUnverifiedRouting(body)).toEqual([{ wabaId: "200", phoneNumberId: "300" }]);
  });

  it("reads bytes as well as strings", () => {
    const body = JSON.stringify({ entry: [message("200", "300")], note: "வணக்கம்" });
    expect(extractUnverifiedRouting(Buffer.from(body))).toEqual([{ wabaId: "200", phoneNumberId: "300" }]);
  });

  it("returns every distinct pair when a payload has several entries", () => {
    const body = JSON.stringify({
      entry: [message("200", "300"), message("200", "300"), message("201", "301")],
    });
    expect(extractUnverifiedRouting(body)).toEqual([
      { wabaId: "200", phoneNumberId: "300" },
      { wabaId: "201", phoneNumberId: "301" },
    ]);
  });

  it("returns the WABA id alone when there is no metadata", () => {
    const body = JSON.stringify({ entry: [{ id: "200", changes: [{ field: "account_update", value: {} }] }] });
    expect(extractUnverifiedRouting(body)).toEqual([{ wabaId: "200" }]);
    expect(extractUnverifiedRouting(JSON.stringify({ entry: [{ id: "200" }] }))).toEqual([{ wabaId: "200" }]);
  });

  it("ignores unknown fields", () => {
    const body = JSON.stringify({ extra: 1, entry: [{ ...message("200", "300"), time: 1, other: {} }] });
    expect(extractUnverifiedRouting(body)).toEqual([{ wabaId: "200", phoneNumberId: "300" }]);
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["an empty string", ""],
    ["null", "null"],
    ["a number", "42"],
    ["an array", "[]"],
    ["an empty object", "{}"],
    ["an empty entry list", JSON.stringify({ entry: [] })],
    ["entry that is not a list", JSON.stringify({ entry: "x" })],
    ["an entry without an id", JSON.stringify({ entry: [{ changes: [] }] })],
    ["a numeric id", JSON.stringify({ entry: [{ id: 200 }] })],
  ])("returns an empty list for %s", (_why, body) => {
    expect(extractUnverifiedRouting(body)).toEqual([]);
  });

  it("never throws on bad input types", () => {
    for (const value of [undefined, null, 42, {}, Symbol("x")]) {
      expect(() => extractUnverifiedRouting(value as never)).not.toThrow();
      expect(extractUnverifiedRouting(value as never)).toEqual([]);
    }
  });
});
