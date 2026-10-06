import type { ErrorCode } from "@pakka/types";

// Maps a Meta Graph API error onto the shared error codes (packages/types errors.ts). Meta codes are
// from Meta's WhatsApp error-codes page; which HTTP status goes with which code is unconfirmed, so the
// Meta code wins and the HTTP status is only the fallback. Only codes that already exist are used.

export type MappedError = { code: ErrorCode; retryable: boolean };

const OUTSIDE_WINDOW = new Set([131047]);
const RATE_LIMITED = new Set([4, 80007, 130429, 131048, 131056]);
// Token invalid, expired or missing permissions, or the number is not registered: reconnect.
const NOT_CONNECTED = new Set([0, 3, 10, 190, 131005, 133010]);
const VALIDATION = new Set([131026, 131021, 131009, 131008, 100, 132000, 132012]);
// Meta-side trouble worth trying again later.
const UPSTREAM_RETRYABLE = new Set([1, 2, 131000, 131016, 135000]);
// Payment, account, opt-out and template problems: no existing code fits better, and a retry will not help.
const UPSTREAM_FINAL = new Set([131042, 131045, 368, 131050, 131051, 132001, 132015, 132016]);

export function mapMetaError(metaCode: number | undefined, httpStatus: number | undefined): MappedError {
  if (metaCode !== undefined) {
    if (OUTSIDE_WINDOW.has(metaCode)) return { code: "outside_window", retryable: false };
    if (RATE_LIMITED.has(metaCode)) return { code: "rate_limited", retryable: true };
    if (NOT_CONNECTED.has(metaCode) || (metaCode >= 200 && metaCode <= 299)) {
      return { code: "whatsapp_not_connected", retryable: false };
    }
    if (VALIDATION.has(metaCode)) return { code: "validation_failed", retryable: false };
    if (UPSTREAM_RETRYABLE.has(metaCode)) return { code: "upstream_failed", retryable: true };
    if (UPSTREAM_FINAL.has(metaCode)) return { code: "upstream_failed", retryable: false };
  }
  if (httpStatus === 429) return { code: "rate_limited", retryable: true };
  if (httpStatus === 401) return { code: "whatsapp_not_connected", retryable: false };
  if (httpStatus !== undefined && httpStatus >= 500) return { code: "upstream_failed", retryable: true };
  return { code: "upstream_failed", retryable: false };
}
