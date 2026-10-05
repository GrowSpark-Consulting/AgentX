import { describe, expect, it } from "vitest";
import { API_HOST_PATTERN } from "../next.config";

// Next.js anchors `has.value` as ^...$ and lowercases the host without its port.
const matches = (host: string) =>
  new RegExp(`^${API_HOST_PATTERN}$`).test(host);

describe("api host rewrite", () => {
  it.each(["api.pakkaagent.in", "api-staging.pakkaagent.in", "api.localhost"])(
    "rewrites %s",
    (host) => expect(matches(host)).toBe(true),
  );

  it.each([
    "app.pakkaagent.in",
    "pakkaagent.in",
    "staging.pakkaagent.in",
    "xapi.pakkaagent.in",
    "api.pakkaagent.in.evil.com",
    "apixpakkaagentxin",
  ])("leaves %s alone", (host) => expect(matches(host)).toBe(false));
});
