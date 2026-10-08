# Task notes: the language-model foundation (Anthropic client, tracing, prompts)

Branch `feat/agent-llm-foundation`. For Dev 2 (Shaaz) and Dev 3 (Dhatri).

## 1. What I built and why

The assistant needs a safe, single way to talk to the language models. This PR adds it, and nothing that uses
it yet. It adds the code that calls Anthropic (the fast model for reading a customer's message, the strong model
for writing the reply), with timeouts, careful retries and no customer text in any error or log; the tracing that
lets us watch every model call in Langfuse (which business, which model, how many tokens, what it cost, how
long it took) without ever sending a customer's words unless we choose to; and the two prompts, written as
versioned files. The pipeline that uses them arrives in the next PRs.

Technical details:

- **`backend/src/agent/llm/anthropic.ts`**: `createAnthropicClient(key, tracer)` gives `complete(request)`.
  Models: Haiku 4.5 for `extraction`, Sonnet 5.5 for `reply` (`models.ts`). Each try has a timeout (8 s
  extraction, 15 s reply) and each call a deadline (20 s, 25 s) on top of the caller's own (`signal`, for the
  turn's deadline in PR 6). Retries: only 429, 5xx (incl. 529 overloaded), 408, a dropped connection or a try that
  timed out; at most 3 tries, waiting 0.5 s then 1.5 s (or the provider's Retry-After, capped at 2 s). Any other 4xx
  (a wrong key, a bad request) fails at once with the status kept. A model refusal, an answer cut off by the token
  limit and an empty answer are each their own error (`LlmError.code`), never text to send. Errors carry a code,
  the HTTP status and fixed words; logs carry the same; no prompt text, key or provider message.
- **Prompt caching** on the parts of the system prompt the caller marks as fixed (rules, the pack's fields, the
  business's persona), at most four, in order, with the changing part last.
- **`tracing.ts`**: Langfuse through OpenTelemetry (the current SDK). Off with no keys. One generation per
  call (not per try) with the business id as metadata and tag, the conversation id as the session, model, prompt
  name and version, tokens (incl. cache reads and writes), an estimated cost, time, tries and the error code.
  **No message text by default**; `LANGFUSE_CAPTURE_TEXT=true` adds the customer's words and the reply with phone
  numbers and emails masked and each cut to 2,000 characters. Recording never waits for the network and never
  throws.
- **`json.ts`**: `parseJsonObject(text)` takes the one JSON object out of the model's text (the fast model wraps it in
  a code fence even when told not to). For PR 5, which validates it with Zod.
- **`backend/src/agent/prompts/`**: `extraction_v1.ts` and `reply_v1.ts`, plus `shared.ts` (escaping). The
  extraction prompt lists the pack's fields and the exact values the `Extraction` schema accepts; the reply prompt
  carries the handover's fixed rules (never claim to be human, only this business, facts only, at most two
  questions, the customer's language and script, under 600 characters). Customer text only ever appears inside tags,
  escaped, and the rules say it is data and never instructions. No industry is named in either.
- **Environment**: `ANTHROPIC_API_KEY` is now **required** (the server will not start without it);
  `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` must be set together; new optional `LANGFUSE_BASE_URL` and
  `LANGFUSE_CAPTURE_TEXT`.

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `backend/src/agent/llm/models.ts` | The two model ids, per-role settings (timeouts, tokens, effort) and the cost estimate |
| `backend/src/agent/llm/anthropic.ts` | The client: request checks, caching, deadlines, retries, error classes, one trace record per call |
| `backend/src/agent/llm/tracing.ts` | Langfuse tracer (off without keys), flush and shutdown with time limits |
| `backend/src/agent/llm/mask.ts` | Masks phone numbers and emails in text that leaves for tracing |
| `backend/src/agent/llm/json.ts` | Gets the JSON object out of the model's text |
| `backend/src/agent/llm/index.ts` | `llm()` (one client per process, from the environment) and `shutdownLlm()` |
| `backend/src/agent/prompts/extraction_v1.ts`, `reply_v1.ts`, `shared.ts` | The versioned prompts and the escaping helpers |
| `backend/src/lib/env.ts` | `ANTHROPIC_API_KEY` required; Langfuse pair rule; two new optional variables |
| `backend/.env.example`, `docs/environments.md` | The new variables |
| `backend/package.json`, `pnpm-lock.yaml` | Pinned `@anthropic-ai/sdk`, `@langfuse/tracing`, `@langfuse/otel`, `@opentelemetry/api`, `@opentelemetry/sdk-trace-base` |
| tests | one `*.test.ts` beside each file above; `server/webhook*.test.ts` stub the new required key |

## 3. How to run / test it locally

```
pnpm --filter @pakka/backend exec vitest run src/agent/llm src/agent/prompts src/lib/env.test.ts   # this PR's tests
pnpm typecheck && pnpm lint && pnpm test                                                           # everything
```

Everything is tested with the Anthropic SDK and Langfuse's network calls replaced or pointed at a local HTTP
server (the tracing test uses the real exporter into a local server, so it checks what actually leaves the
process). A live smoke test needs a real `ANTHROPIC_API_KEY` in `backend/.env.local` (never commit it); each call
costs about a fifth of a cent.

## 4. Decisions made

Need review by Dev 2 (Shaaz):

- **Langfuse SDK:** the `langfuse` package on npm is the deprecated v3 client (its own README says not to use it for
  new work). I used the current OpenTelemetry-based `@langfuse/tracing` and `@langfuse/otel`. The tracer has its
  own provider and is not registered for the process, so nothing else's spans (Inngest's) can reach Langfuse. The
  trace-level fields are set on the span directly, because passing them through the OpenTelemetry context needs a
  process-wide context manager.
- **Pins:** `@anthropic-ai/sdk` is pinned at 0.131.0, not the newest 0.132.1: that was published hours earlier and the
  repo's `minimumReleaseAge` rule refuses it; I did not add an exclusion. `@opentelemetry/api` is pinned at 1.9.1 to
  match the lockfile's existing copy: a second copy (1.9.0) made two incompatible `SupabaseClient` types and broke
  the frontend type check.
- **No message text in traces by default.** The handover says inputs and outputs go to Langfuse; but a customer's
  words carry names, numbers and addresses (DPDP). `LANGFUSE_CAPTURE_TEXT=true` turns it on with masking and a
  2,000-character cut (masking first, so a cut never leaves half a number). I did not use the exporter's own mask
  hook: it would also have masked the business id on the trace (a long run of digits looks like a phone number).
- **Cost is an estimate** from list prices in `models.ts` (cache reads a tenth, writes a quarter more); the invoice is
  the truth. A model with no price gives `null`, never a made-up number.
- **Sonnet 5.5 settings:** effort `low` (set explicitly: the default is higher), no `temperature` (it refuses
  non-default values), thinking left at its default (it cannot be switched off). `max_tokens` 2,000 for the reply:
  Tamil script takes many more tokens than English and thinking counts against the limit. Haiku 4.5: temperature 0,
  no effort setting (it refuses one).
- **Refusals are errors, and the server-side refusal fallback is not switched on.** Anthropic offers a
  `fallbacks` option that re-runs a refused request on another model inside the same call; it would route to a
  pricier model and bill at its rates. The pipeline's own safe fallback ("Let me confirm that with the team") covers a
  refusal instead. Say if you want it enabled.
- **Model ids** are the exact strings from the brief: `claude-haiku-4-5-20251001` and `claude-sonnet-5-5`.
- **Prompts:** pack `extraGuardrails` are not used in v1 (there is no registry saying what each id means); a
  guardrail is added when one is defined. The pack's field labels and a business's name and persona are escaped like
  customer text, since a business types them.
- **Prompt injection.** Each message goes into a prompt as its own element (`<message from="customer">…</message>`),
  with `<`, `>` and `&` escaped, so a message cannot close a tag, add one, or fake another speaker's turn with a
  line that starts "Assistant:". A business's name and the assistant's name are cut to letters, digits, spaces and a
  few marks (30 and 80 characters) before they go into the system prompt, so a name cannot carry a sentence of
  instructions; the rules say what is inside `<conversation>` and `<facts>` is data. A test fingerprints each
  prompt's fixed text, so editing a prompt in place fails it: a change is `_v2`.
- **Refusal handling and stop reasons:** only `end_turn` and `stop_sequence` count as a finished answer; every other
  stop reason (max tokens, a paused turn, a context limit, one not seen yet) is an error, never text to send.
- **Retry arithmetic:** a wait that would use up what is left of the call's deadline is not slept: the call fails at
  once with the real cause. A Retry-After above 2 s fails at once as `rate_limited`, since the limit will still be in
  force. The Anthropic address is fixed in code and SDK logging is off (at debug level it prints request bodies).
- **Required key:** `ANTHROPIC_API_KEY` is required in this PR although nothing calls the models until PR 4 to 6, as
  your brief says; the server (and any script that reads the server environment, such as `pnpm packs:sync`) now stops
  without it. It must be set on every Railway environment before this is deployed.
- **Left for the pipeline PRs:** `Extraction.fields` accepts any key, so the pipeline must keep only the pack's keys
  (PR 5); the phone mask covers 10 to 15 digit numbers (spaces and dashes), not 16-digit card numbers or numbers in
  other scripts, which only matters when text capture is on.
- **Not wired into the server's shutdown:** `shutdownLlm()` exists, but `server/main.ts` is yours. Traces are exported
  one at a time as they happen, so a restart loses at most the one in flight; wiring it into the SIGTERM handler is
  a small optional follow-up.

Need review by Dev 3 (Dhatri): nothing; there are no routes or screens in this PR.

## 5. For Dev 2 (Shaaz)

- **Set `ANTHROPIC_API_KEY` on Railway (staging and production) before this deploys.** The server now refuses to
  start without it, like `EMBEDDINGS_API_KEY`. One key per environment, with a monthly spend limit on the Anthropic
  account.
- **Optional, to see traces:** `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` (both or neither),
  `LANGFUSE_BASE_URL` if the project is not on the EU cloud (default `https://cloud.langfuse.com`; US is
  `https://us.cloud.langfuse.com`). Leave `LANGFUSE_CAPTURE_TEXT` unset unless you want masked message text in
  traces. Use a separate Langfuse project (or at least the environment label, which comes from
  `RAILWAY_ENVIRONMENT_NAME`) for staging.
- **No migration, no Inngest change.** Nothing calls the models yet, so no spend until PR 4 to 6 land.
- Cost per message in my test (extraction on Haiku plus a reply on Sonnet): about half a cent, 5 to 7 seconds in
  all.

## 6. For Dev 3 (Dhatri)

Nothing to use yet. Later PRs will read the persona and tone from `tenants.agent_settings`; that shape is still open
(contracts.md section 3), so please keep persona (a name) and tone (`friendly` or `formal`) as they are in your agent
settings screen.

## 7. Follow-ups / not done in this PR

- The pipeline that calls these (PRs 4 to 6) and the post-check on the reply.
- `extraction_v1` has not been tuned on real Tanglish and Tamil chats yet (Raja's test chats, PR 9 and Day 3).
- Haiku 4.5 does not cache the extraction prompt (about 1,300 tokens, below its minimum cacheable size); it costs
  about $0.002 a call, so it is left as is.
- Wiring `shutdownLlm()` into the server's shutdown.
