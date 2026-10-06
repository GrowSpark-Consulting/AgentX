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
encryptSecret(plaintext: string, context?: string, env?: { ENCRYPTION_KEY?: string }): string
decryptSecret(stored: string, context?: string, env?: { ENCRYPTION_KEY?: string }): string
connectionSecretContext({ column, tenantId, connectionId }): string
```

- `env` defaults to `serverEnv()`. Only tests pass it (so they never read `process.env`).
- **Stored format:** one string, `v1:<iv>:<tag>:<ciphertext>`. Each part is base64url. The IV is 12 random bytes
  (new on every call), the tag is 16 bytes, and the ciphertext is empty for an empty secret.
- **Context** is GCM additional authenticated data. It is not stored. A value encrypted with one context
  cannot be decrypted with another, so copying a token into a different row or column fails.
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
| `context must not be empty` | `""` was passed (empty context would silently turn the binding off) |
| `stored secret is malformed` | Wrong prefix, part count, characters, or IV or tag length |
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
| `.env.example` (repo root) | Variable names, comments and safe defaults only | Yes |
| `frontend/.env.local` | Your real local values | No. The `.env*` rule in `.gitignore` ignores it (only `.env.example` is allowed) |

| Reader | Env source |
|---|---|
| Frontend (Next.js) | `frontend/.env.local`. Next does not read the repo root. |
| Backend modules | No file of their own: `serverEnv()` reads `process.env` |
| Vitest | Loads no env file; tests pass values in explicitly |
| CLI scripts | Nothing loads a file by default. Node 22.18+ can run `node --env-file=frontend/.env.local <script>`. The embeddings-eval scripts read their own `scripts/embeddings-eval/.env.local`. |

New variables go in the `serverEnv()` schema and in `.env.example` in the same PR.

**`META_GRAPH_API_VERSION=v26.0`.** The handover pins the Graph API version in one env variable and says to
upgrade deliberately, because Meta changes these flows often. `.env.example` sets `v26.0`; the schema requires
the form `v<number>.<number>`. Changing the version is a deliberate PR, not a drive-by edit.

## 5. What each developer must do

| | Do | Never |
|---|---|---|
| Everyone | Build contexts only with `connectionSecretContext`. Use `decryptSecret` right before the call that needs the token, and keep the result in a local variable. | Log, return or send a secret to the browser. Build a context string by hand. Change the context format, column list or stored format without re-encrypting every stored value. |
| Dev 1 | Encrypt the connection token and app secret in the seed script, the manual-connect route and the Embedded Signup exchange, with a row id created first. Decrypt per call in the adapter. | Cache a decrypted token beyond one call. Put it in an error message or log line. |
| Dev 2 | Keep staging and production keys in the password manager and Vercel. Any new code that stores an external credential uses this helper. | Write secrets into migrations, seed SQL or `.env.example`. |
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
| Should callers be forced to pass a context for database values? | Today `context` is optional so tests and non-row secrets work. A lint rule or a wrapper for `whatsapp_connections` could make it mandatory. |

## 8. Status

**Day 1, task 2: done in this branch.** `META_GRAPH_API_VERSION=v26.0` in `.env.example` and the schema message
in `env.ts`; `backend/src/lib/crypto.ts` with 34 tests in `crypto.test.ts`. The helper is **not wired into any
caller yet**.

**Next (Dev 1, Day 1):** synthetic webhook fixtures; the parser and HMAC signature check; the webhook route; the
test-number connection seed script (the first caller of `encryptSecret`); adapter `sendText` and `markRead`; the
pack loader.
