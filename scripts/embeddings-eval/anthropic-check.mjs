/**
 * Spark Agent - Dev 1 Day 0: check an Anthropic API key.
 *
 * Sends one tiny request to each model we use (Haiku 4.5 for extraction, Sonnet 5.5 for replies)
 * and prints: whether the call worked, the reply, tokens used, and your rate limits
 * (read from the anthropic-ratelimit-* response headers). The key is never printed in full.
 *
 * Run from the repo root:  node scripts/embeddings-eval/anthropic-check.mjs
 * The key comes from ANTHROPIC_API_KEY in scripts/embeddings-eval/.env.local (never commit it).
 * To test another key (for example staging), change the line in .env.local and run it again.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(join(here, ".env.local"));

const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
const baseUrl = (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").trim();

if (apiKey === "") {
  console.error("ANTHROPIC_API_KEY is not set. Add this line to scripts/embeddings-eval/.env.local:\nANTHROPIC_API_KEY=your-key-here");
  process.exit(1);
}

const models = [
  { role: "extraction", id: "claude-haiku-4-5-20251001" },
  { role: "replies", id: "claude-sonnet-5-5" },
];

const limitHeaders = [
  ["requests per minute", "anthropic-ratelimit-requests-limit"],
  ["input tokens per minute", "anthropic-ratelimit-input-tokens-limit"],
  ["output tokens per minute", "anthropic-ratelimit-output-tokens-limit"],
];

console.log(`Testing key ending ...${apiKey.slice(-4)} against ${baseUrl}\n`);

let failures = 0;

for (const model of models) {
  console.log(`--- ${model.role}: ${model.id} ---`);
  let res;
  try {
    res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model.id,
        max_tokens: 60,
        messages: [{ role: "user", content: "Reply with one short friendly greeting in Tamil, then the same in English." }],
      }),
    });
  } catch (err) {
    failures++;
    console.log(`FAILED: could not reach the API (${err instanceof Error ? err.message : String(err)})\n`);
    continue;
  }

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    failures++;
    const message = json?.error?.message ?? text.slice(0, 300);
    const code = json?.error?.details?.error_code ? ` (${json.error.details.error_code})` : "";
    console.log(`FAILED: HTTP ${res.status}${code}: ${message}\n`);
    continue;
  }

  const reply = (json?.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  console.log("OK");
  console.log(`Reply: ${reply}`);
  console.log(`Tokens used: ${json?.usage?.input_tokens ?? "?"} in, ${json?.usage?.output_tokens ?? "?"} out`);
  for (const [label, header] of limitHeaders) {
    console.log(`Limit - ${label}: ${res.headers.get(header) ?? "not shown"}`);
  }
  console.log("");
}

if (failures > 0) {
  console.log(`${failures} of ${models.length} checks failed. See the messages above.`);
  process.exit(1);
}
console.log("Both models answered. Copy the limits above into your Day 0 status update.");
