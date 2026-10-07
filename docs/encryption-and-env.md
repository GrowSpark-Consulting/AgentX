# Encryption and env files

Owner: Dev 1 wrote the helper; the rules below apply to all three developers.
Related: [environments.md](environments.md) (where secrets live per environment) ·
[handover.md](handover.md) (module 10, WhatsApp connection) · [shared-types.md](shared-types.md)

## 1. What this is and why

WhatsApp tokens and app secrets are the most sensitive data we hold. The rules say they live only in
`whatsapp_connections`, encrypted, and are never logged, returned or sent to the browser.
`backend/src/lib/crypto.ts` is how we encrypt them: AES-256-GCM, with the key from
`serverEnv().ENCRYPTION_KEY`. The key itself is checked once, in `backend/src/lib/env.ts` (it must be 32
random bytes, base64); the helper does not repeat that check.

Encrypted columns today: `whatsapp_connections.token_enc` and `whatsapp_connections.app_secret_enc`.

## 2. Using it

```ts
encryptSecret(plaintext: string, context: SecretContext, env?: { ENCRYPTION_KEY?: string }): string
decryptSecret(stored: string, context: SecretContext, env?: { ENCRYPTION_KEY?: string }): string
connectionSecretContext({ column, tenantId, connectionId }): SecretContext
```

- `env` defaults to `serverEnv()`. Only tests pass it (so they never read `process.env`).
- **Stored format:** one string, `v1:<iv>:<tag>:<ciphertext>`. Each part is base64url. The IV is 12 random bytes
  (new on every call), the tag is 16 bytes, and the ciphertext is empty for an empty secret.
- **Context is required.** It is GCM additional authenticated data and is not stored. A value encrypted with
  one context cannot be decrypted with another, so copying a token into a different tenant, row or column fails.
  `SecretContext` is a branded string type: only `connectionSecretContext` can make one, so a hand-written
  string does not compile. (JavaScript callers get `context is required` at runtime.)
- **Each part must be canonical base64url.** A stored value is accepted only if every part re-encodes to exactly
  the same string, so a rewritten spelling of the same bytes (unused trailing bits) is rejected like any other
  tampering.
- Values written by the first version of the helper, without a context, can no longer be decrypted. No caller
  existed, so none should be stored; any such value is unsupported.
- `connectionSecretContext` returns `whatsapp_connections:<column>:<tenant_id>:<connection_id>`. `column` is
  `"token_enc"` or `"app_secret_enc"`. It rejects other columns and empty ids or ids containing `:`.

**The row id must exist before you encrypt**, because it is part of the context. Either generate it first with
`crypto.randomUUID()` and insert with that id, or insert the row, then encrypt, then update.

```ts
const connectionId = randomUUID();
const context = connectionSecretContext({ column: "token_enc", tenantId, connectionId });
const token_enc = encryptSecret(accessToken, context);
// insert { id: connectionId, tenant_id: tenantId, token_enc, ... }

const token = decryptSecret(row.token_enc, context); // same context, built the same way
```

Failures throw `CryptoError` with a fixed message, never containing the secret, the key or the context:

| Message | Meaning |
|---|---|
| `ENCRYPTION_KEY is not set` | No key in the environment |
| `context is required` | No context was passed (only possible by bypassing the types) |
| `context must not be empty` | `""` was passed (empty context would silently turn the binding off) |
| `stored secret is malformed` | Wrong prefix or part count, a part that is not canonical base64url (padding, whitespace, other characters, a rewritten spelling), or an IV or tag of the wrong length |
| `could not decrypt stored secret` | Tampered value, wrong key or wrong context (deliberately the same message) |
| `could not encrypt secret` | Encryption failed, for example a key of the wrong size |

Tests: `pnpm --filter @pakka/backend test` (`backend/src/lib/crypto.test.ts`).

## 3. `ENCRYPTION_KEY` rules

| Environment | Key | Where it lives |
|---|---|---|
| Local | Each developer generates their own | `frontend/.env.local` |
| Staging | One shared key for the whole team | Password manager (`staging` folder) and Vercel Preview env |
| Production | A different key from staging | Password manager (`production` folder: Raja and Dev 2) and Vercel Production env |

Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

(`openssl rand -base64 32`, from [environments.md](environments.md), gives the same kind of value.)

- Never reuse a local key for staging or production.
- Never commit a key, and never paste one in chat or logs.
- **If the key changes, everything encrypted with the old key becomes unreadable.** Those connections must be
  created again. Local keys differ between developers, so a local database cannot be copied to another machine.

## 4. The env files

| File | Holds | In git? |
|---|---|---|
| `backend/.env.example`, `frontend/.env.example` | Variable names, comments and safe defaults only | Yes |
| `backend/.env.local` | Your real local server values, including secrets | No. The `.env*` rule in `.gitignore` ignores it (only `.env.example` is allowed) |
| `frontend/.env.local` | Your real local public values (`NEXT_PUBLIC_*`) | No, same rule |

| Reader | Env source |
|---|---|
| Frontend (Next.js) | `frontend/.env.local` locally, Vercel's variables when deployed. Next does not read the repo root. Public values only. |
| API (backend/) | `serverEnv()` reads `process.env`: `backend/.env.local` loaded by `pnpm dev`, Railway's variables when deployed |
| Vitest | Loads no env file; tests pass values in explicitly |
| CLI scripts | Nothing loads a file by default. Node 22.18+ can run `node --env-file=backend/.env.local <script>`. The embeddings-eval scripts read their own `scripts/embeddings-eval/.env.local`. |

New server variables go in the `serverEnv()` schema and in `backend/.env.example` in the same PR;
browser-safe ones in `frontend/lib/env.ts` and `frontend/.env.example`.

**`META_GRAPH_API_VERSION=v26.0`.** The handover pins the Graph API version in one env variable and says to
upgrade deliberately, because Meta changes these flows often. `backend/.env.example` sets `v26.0`; the schema requires
the form `v<number>.<number>` and **defaults to `v26.0` when the variable is unset or empty**, so code never
builds a `/undefined/` URL. Changing the version is a deliberate PR, not a drive-by edit.

## 5. What each developer must do

| | Do | Never |
|---|---|---|
| Everyone | Build contexts only with `connectionSecretContext` (the types enforce it). Use `decryptSecret` right before the call that needs the token, and keep the result in a local variable. | Log, return or send a secret to the browser. Cast a string to `SecretContext` outside tests. Change the context format, column list or stored format without re-encrypting every stored value. |
| Dev 1 | Encrypt the connection token and app secret in the seed script, the manual-connect route and the Embedded Signup exchange, with a row id created first. Decrypt per call in the adapter. | Cache a decrypted token beyond one call. Put it in an error message or log line. |
| Dev 2 | Keep staging and production keys in the password manager and Railway (server secrets live only there; Vercel gets public values). Any new code that stores an external credential uses this helper. | Write secrets into migrations, seed SQL or an `.env.example`. |
| Dev 3 | Read connections only through `whatsapp_connections_public`. Post `ManualConnectInput` once. | Keep a token or app secret in client state, `localStorage` or UI after submit. |

## 6. Known limits

| Limit | Meaning |
|---|---|
| Rollback | Restoring an older value into the same row still decrypts, because the context matches |
| Key holders | Anyone with `ENCRYPTION_KEY` can read and forge values for any context |
| Availability | This gives integrity and secrecy, not availability: a deleted or blanked token cannot be recovered |
| No key id | The stored string does not say which key made it, so there is one key per environment |

## 7. Open questions

| Question | Notes |
|---|---|
| How do we rotate `ENCRYPTION_KEY`? | Not built. It needs a way to decrypt with the old key and re-encrypt with the new one (a key id or a new version prefix, plus a migration script). The `v1:` prefix leaves room for this. |

## 8. Status

**Day 1, task 2: done in this branch.** `META_GRAPH_API_VERSION=v26.0` in `.env.example` and the schema message
in `env.ts`; `backend/src/lib/crypto.ts` and its tests. Hardened after Dev 2's review of PR #14: canonical
base64url only, `context` required (branded `SecretContext`), and the Graph API version defaults to `v26.0`.
The helper is **not wired into any caller yet**.

**Next (Dev 1, Day 1):** synthetic webhook fixtures; the parser and HMAC signature check; the webhook route; the
test-number connection seed script (the first caller of `encryptSecret`); adapter `sendText` and `markRead`; the
pack loader.
