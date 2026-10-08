import { describe, expect, it } from "vitest";
import { maskPersonalData } from "./mask";

// What may be sent to the tracing service: personal data is masked on the way out. A customer's own text can
// carry a phone number or an email address (they type them into a chat), and neither belongs in a trace.

describe("maskPersonalData", () => {
  it("masks a phone number in any of the shapes a customer types it", () => {
    for (const phone of ["+919812345621", "919812345621", "9812345621", "+91 98123 45621", "+91-98123-45621", "098123 45621"]) {
      const masked = maskPersonalData(`call me on ${phone} please`);
      expect(masked, phone).not.toMatch(/9812345621|98123 ?45621|98123-45621/);
      expect(masked).toMatch(/^call me on .*x.* please$/);
    }
  });

  it("keeps the country code and the last two digits, like the logs do", () => {
    expect(maskPersonalData("+919812345621")).toBe("+9198xxxxxx21");
  });

  it("masks every number in a text", () => {
    const masked = maskPersonalData("mine is 9812345621, hers is +14155552671");
    expect(masked).not.toMatch(/9812345621|4155552671/);
  });

  it("masks an email address", () => {
    expect(maskPersonalData("write to Asha.K+home@example.co.in today")).toBe("write to ***@*** today");
  });

  it("leaves ordinary numbers alone: prices, areas, dates, years", () => {
    const text = "2BHK of 950 sq ft for 78 lakh, possession March 2027, floor 12";
    expect(maskPersonalData(text)).toBe(text);
  });

  it("leaves the text alone when there is nothing to mask, including Tamil", () => {
    const text = "எனக்கு 2BHK வேணும், rate enna?";
    expect(maskPersonalData(text)).toBe(text);
  });
});

describe("very long text", () => {
  it("is cut before it is masked, so a huge message cannot take long to process", () => {
    const started = Date.now();
    const masked = maskPersonalData(`${"a".repeat(2_000_000)}@`);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(masked.length).toBeLessThanOrEqual(20_000);
  });
});
