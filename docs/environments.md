# Environments, deploys and secrets

Owner: Dev 2. Covers the Day 0 setup: GitHub, Supabase, Inngest, Vercel, DNS and the password manager.

## The three environments

| | Local | Staging | Production |
|---|---|---|---|
| App | http://localhost:3000 | https://staging.pakkaagent.in | https://app.pakkaagent.in |
| API host | http://api.localhost:3000 | https://api-staging.pakkaagent.in | https://api.pakkaagent.in |
| WhatsApp webhook | Meta test number via a tunnel | https://api-staging.pakkaagent.in/webhooks/whatsapp | https://api.pakkaagent.in/webhooks/whatsapp |
| Deploys from | your machine | every push to `main` | a tagged release (M6) |
| Supabase | Docker via `pnpm db:start` | project `pakka-agent-staging`, Mumbai, Free | project `pakka-agent-prod`, Mumbai, Pro |
| Inngest | `pnpm inngest:dev` | Inngest branch environment for `main` | Inngest Production |
| Razorpay | test keys | test keys | live keys |
| Secrets | `.env.local` (never committed) | Vercel *Preview* env, branch `main` | Vercel *Production* env |

Nobody points local code at staging or production data.

### How the `api.*` host works

Meta and Razorpay call short URLs such as `https://api.pakkaagent.in/webhooks/whatsapp`. A host
rewrite in `next.config.ts` maps every path on an `api.*` host to `/api/<path>`, so that request is
served by `src/app/api/webhooks/whatsapp/route.ts`. The rewrite matches `api.pakkaagent.in`,
`api-staging.pakkaagent.in` and `api.localhost`; `tests/api-host-rewrite.test.ts` pins that list.

## GitHub

Repo: https://github.com/GrowSpark-Consulting/AgentX (package name `pakka-agent`).

`main` protection:

- Pull request required, 1 approving review, stale approvals dismissed on new commits
- Required status checks `check` and `migrations` (jobs in `.github/workflows/ci.yml`), branch up to date
- Linear history, no force pushes, no deletion; applies to admins too
- Repo merges: squash only, head branches deleted after merge

CI runs on every pull request and every push to `main`:

| Job | Steps |
|---|---|
| `check` | `pnpm install --frozen-lockfile` → lint → typecheck → test → build |
| `migrations` | starts Postgres with the Supabase CLI, applies every migration from scratch, `supabase db lint` |

If you rename a job, update the required checks in branch protection in the same PR.

## Supabase

### Local

`pnpm db:start` runs the full stack in Docker (Postgres 17 + pgvector, Auth, Realtime, Storage,
Studio on :54323, Mailpit on :54324). `pnpm db:reset` rebuilds from `supabase/migrations`.
The CLI version is pinned in `package.json`, so everyone and CI run the same one.

### Staging project (one-time)

1. supabase.com → the team organisation → **New project**
   - Name `pakka-agent-staging`, region **South Asia (Mumbai) `ap-south-1`**, plan Free
   - Generate the database password and save it straight into the password manager (`staging`)
2. Project Settings → API: copy the URL, the anon/publishable key and the service_role/secret key
   into the password manager and into Vercel (Preview, branch `main`).
3. Authentication → URL Configuration: Site URL `https://staging.pakkaagent.in`; add redirect URLs
   `https://staging.pakkaagent.in/**` and `http://localhost:3000/**`.
4. Link and push migrations from your machine:
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <staging-ref>
   pnpm exec supabase db push
   ```

Free projects pause after a week with no traffic; resume from the dashboard. Production
gets its own project on the Pro plan (daily backups, no pausing) before beta.

## Inngest

- Local: `pnpm inngest:dev` serves the UI at http://localhost:8288 and syncs `/api/inngest`.
  `INNGEST_DEV=1` in `.env.local` tells the SDK to use it.
- Staging and production: install the **Inngest** integration from the Vercel Marketplace on
  the project. It sets `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` and re-syncs the app on each
  deploy. Deploys of `main` land in an Inngest branch environment; production deploys land in
  Inngest Production.
- Smoke test after any new environment: send `system/ping` from the Inngest UI; a
  `system-ping` run should show status Completed.

## Vercel

One project, `pakka-agent`, in the team's Vercel account (Pro: Hobby is for non-commercial use).

1. **Add New → Project** → import `GrowSpark-Consulting/AgentX` (install the Vercel GitHub app
   on the org if asked). Framework preset Next.js; root directory `/`; build and install commands
   default.
2. Settings → Environment Variables: add `ENABLE_EXPERIMENTAL_COREPACK=1` to all environments so
   Vercel uses the pnpm version pinned in `packageManager`.
3. Settings → Git → **Production Branch: `production`**. Pushes to `main` then build as Preview
   deployments, which is our staging. A release fast-forwards `production` to the tagged commit.
4. Settings → Domains:
   - `staging.pakkaagent.in` and `api-staging.pakkaagent.in` → **Git branch `main`**
   - `app.pakkaagent.in` and `api.pakkaagent.in` → Production
5. Environment variables, using the names in `.env.example`:
   - **Preview**, scoped to branch `main`: staging values
   - **Production**: production values
   - Do not set `INNGEST_DEV` on Vercel.
6. Functions run in `bom1` (Mumbai, set in `vercel.json`) next to the Supabase database.

Check a deploy: `https://api-staging.pakkaagent.in/health` returns
`{"ok":true,"env":"preview","commit":"<sha>"}`.

## DNS for pakkaagent.in

Add at the domain's DNS provider. Vercel shows the exact CNAME target for each domain when you add
it in step 4 above; use that value.

| Name | Type | Value | Serves |
|---|---|---|---|
| `staging` | CNAME | Vercel target | Staging app |
| `api-staging` | CNAME | Vercel target | Staging webhooks and API |
| `app` | CNAME | Vercel target | Production app |
| `api` | CNAME | Vercel target | Production webhooks and API |
| `@`, `www` | A / CNAME | Vercel values | Landing page (Dev 3) |
| Resend records | MX, TXT (SPF, DKIM), `_dmarc` TXT | From the Resend dashboard | System email |

Day 0 exit test, "Meta's webhook check passes against the staging URL": the Meta app's callback
URL is `https://api-staging.pakkaagent.in/webhooks/whatsapp` with `META_WEBHOOK_VERIFY_TOKEN`.
It needs Dev 1's `GET /api/webhooks/whatsapp` verification handler deployed to `main`. Move the
callback to `api.pakkaagent.in` when production goes live, or give staging its own Meta test app.

## Password manager

One shared vault, **Pakka Agent**, in a team password manager (Bitwarden Teams or 1Password
Business). Every credential lives there; nothing is pasted into chat.

| Folder | Who | Holds |
|---|---|---|
| `accounts` | Raja + all devs | Logins: Meta Business, Meta developer app, Razorpay, Google Cloud, Supabase, Vercel, Inngest, Sentry, Langfuse, Resend, domain registrar, GitHub org |
| `local` | All devs | Shared test-only values: Meta test number, Anthropic dev key, embeddings key, Razorpay test keys |
| `staging` | All devs | Every staging env var, Supabase DB password |
| `production` | Raja + Dev 2 | Every production env var, Supabase DB password, `ENCRYPTION_KEY` |

Name each item after its env var (`ANTHROPIC_API_KEY`) so copying into Vercel is mechanical. Use a
different `ENCRYPTION_KEY` per environment (`openssl rand -base64 32`). If a production key leaks,
rotating it is a deploy, not a code change.
