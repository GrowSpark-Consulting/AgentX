import { describe, expect, it } from "vitest";
import { mapMetaError } from "./meta-errors";

describe("mapMetaError", () => {
  it.each([
    // [meta code, http status, our code, retryable]
    [131047, 400, "outside_window", false],
    [4, 400, "rate_limited", true],
    [80007, 400, "rate_limited", true],
    [130429, 429, "rate_limited", true],
    [131048, 400, "rate_limited", true],
    [131056, 400, "rate_limited", true],
    [0, 401, "whatsapp_not_connected", false],
    [3, 400, "whatsapp_not_connected", false],
    [10, 403, "whatsapp_not_connected", false],
    [190, 401, "whatsapp_not_connected", false],
    [200, 403, "whatsapp_not_connected", false],
    [250, 403, "whatsapp_not_connected", false],
    [299, 403, "whatsapp_not_connected", false],
    [131005, 403, "whatsapp_not_connected", false],
    [133010, 400, "whatsapp_not_connected", false],
    [131026, 400, "validation_failed", false],
    [131021, 400, "validation_failed", false],
    [131009, 400, "validation_failed", false],
    [131008, 400, "validation_failed", false],
    [100, 400, "validation_failed", false],
    [132000, 400, "validation_failed", false],
    [132012, 400, "validation_failed", false],
    [1, 500, "upstream_failed", true],
    [2, 503, "upstream_failed", true],
    [131000, 500, "upstream_failed", true],
    [131016, 503, "upstream_failed", true],
    [135000, 400, "upstream_failed", true],
    [131042, 400, "upstream_failed", false],
    [131045, 400, "upstream_failed", false],
    [368, 403, "upstream_failed", false],
    [131050, 400, "upstream_failed", false],
    [131051, 400, "upstream_failed", false],
    [132001, 404, "upstream_failed", false],
    [132015, 400, "upstream_failed", false],
    [132016, 400, "upstream_failed", false],
  ] as const)("maps Meta code %i (HTTP %i) to %s, retryable %s", (metaCode, httpStatus, code, retryable) => {
    expect(mapMetaError(metaCode, httpStatus)).toEqual({ code, retryable });
  });

  it("lets the Meta code win over the HTTP status", () => {
    expect(mapMetaError(131047, 500)).toEqual({ code: "outside_window", retryable: false });
    expect(mapMetaError(190, 500)).toEqual({ code: "whatsapp_not_connected", retryable: false });
  });

  it.each([
    [undefined, 429, "rate_limited", true],
    [undefined, 401, "whatsapp_not_connected", false],
    [undefined, 500, "upstream_failed", true],
    [undefined, 502, "upstream_failed", true],
    [undefined, 503, "upstream_failed", true],
    [undefined, 400, "upstream_failed", false],
    [undefined, 404, "upstream_failed", false],
    [undefined, undefined, "upstream_failed", false],
    [999999, 400, "upstream_failed", false],
    [999999, 500, "upstream_failed", true],
    [199, 400, "upstream_failed", false],
    [300, 400, "upstream_failed", false],
  ] as const)("falls back to the HTTP status for Meta code %s (HTTP %s)", (metaCode, httpStatus, code, retryable) => {
    expect(mapMetaError(metaCode, httpStatus)).toEqual({ code, retryable });
  });

  it("only ever returns codes that exist in the shared list", async () => {
    const { ERROR_CODES } = await import("@pakka/types");
    for (let meta = 0; meta < 300; meta += 7) {
      expect(ERROR_CODES).toContain(mapMetaError(meta, 400).code);
    }
  });
});
