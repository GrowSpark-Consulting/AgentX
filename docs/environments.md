# Environments, deploys and secrets

Owner: Dev 2. Covers GitHub, Supabase, Inngest, Vercel (frontend), Railway (API), DNS and the password
manager.

## Two deployables

```
Browser ──> Vercel: frontend/ (Next.js pages, sign-in, /auth/callback, server-rendered reads as the user)
   │  HTTPS, Authorization: Bearer <Supabase access token>, X-Pakka-Tenant
   v
Railway: backend/ (one Node service): /api/health, /api/templates, /api/messages/test,
         /api/onboarding/trial, /api/webhooks/whatsapp (Meta), /api/inngest (Inngest)
   └──> Supabase (Auth, Postgres + RLS)
```

The frontend holds public values only (`NEXT_PUBLIC_*`, the anon key). The service-role key, the
Meta secrets, `ENCRYPTION_KEY` and the Inngest keys exist only on Railway. The API checks every
browser call three times: CORS origin (`backend/src/server/cors.ts`), the bearer token with Supabase
Auth, and membership of the business named in `X-Pakka-Tenant` (`backend/src/server/auth.ts`).

## The three environments

| | Local | Staging | Production |
|---|---|---|---|
| App (Vercel) | http://localhost:3000 | https://staging.pakkaagent.in | https://app.pakkaagent.in |
| API (Railway) | http://localhost:4000 | https://api-staging.pakkaagent.in (or the Railway domain) | https://api.pakkaagent.in (or the Railway domain) |
| WhatsApp webhook | Meta test number via a tunnel | `<staging API>/api/webhooks/whatsapp` | `<production API>/api/webhooks/whatsapp` |
| Deploys from | your machine | every push to `main` | a tagged release (M6) |
| Supabase | Docker via `pnpm db:start` | project `pakka-agent-staging`, Mumbai, Free | project `pakka-agent-prod`, Mumbai, Pro |
| Inngest | `pnpm inngest:dev` | Inngest environment for staging | Inngest Production |
| Razorpay | test keys | test keys | live keys |
| Secrets | `frontend/.env.local`, `backend/.env.local` (never committed) | Vercel *Preview* (branch `main`) + Railway `staging` | Vercel *Production* + Railway `production` |

Nobody points local code at staging or production data.

### API paths

Every API path starts with `/api/`, on every host: `https://api.pakkaagent.in/api/webhooks/whatsapp`.
There is no short-path rewrite any more; the routes are listed in `backend/src/server/routes.ts`.

## GitHub

Repo: https://github.com/GrowSpark-Consulting/AgentX (package name `pakka-agent`).

`main` protection:

- Pull request required; no approval needed, CI is the gate (team decision, Oct 2026)
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
   into the password manager. The URL and anon key go into Vercel (Preview, branch `main`) and
   Railway (staging); the service_role key goes into Railway only.
3. Authentication → URL Configuration: Site URL `https://staging.pakkaagent.in`; add redirect URLs
   `https://staging.pakkaagent.in/**` and `http://localhost:3000/**`.
4. Link and push migrations from your machine:
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <staging-ref>
   pnpm exec supabase db push
   ```
5. Load the seed (plans, features, demo and isolation-test businesses; safe to re-run):
   `pnpm exec supabase db push --include-seed`. Seed files and their order are in
   `supabase/config.toml` → `[db.seed].sql_paths`. The seed creates no logins; to give a signed-up
   user access to an isolation-test business, use the snippet at the top of
   `supabase/seed/demo_tenants.sql`. Never run `supabase db reset --linked`: it wipes the project.

Free projects pause after a week with no traffic; resume from the dashboard. Production
gets its own project on the Pro plan (daily backups, no pausing) before beta.

## Inngest

There is exactly one Inngest endpoint: the API's `/api/inngest` on Railway (`inngest/edge` adapter,
`backend/src/inngest/serve.ts`). The frontend serves none, so **do not install the Inngest Vercel
Marketplace integration** (remove it if it is installed): it would try to sync the Vercel deploys.

- Local: `pnpm inngest:dev` serves the UI at http://localhost:8288 and syncs
  `http://localhost:4000/api/inngest`. `INNGEST_DEV=1` in `backend/.env.local` tells the SDK to use it.
- Staging and production, once per environment:
  1. Inngest dashboard → the environment → **Manage → Event keys**: create one; copy it to Railway as
     `INNGEST_EVENT_KEY`. **Manage → Signing key**: copy it to Railway as `INNGEST_SIGNING_KEY`.
  2. Set `INNGEST_SERVE_ORIGIN` on Railway to the API's public origin (e.g. `https://api.pakkaagent.in`),
     so the synced URL never comes from a request's Host header. Never set `INNGEST_DEV` on Railway.
  3. After the API is deployed: **Apps → Sync new app** → `https://<API host>/api/inngest`.
  4. Re-sync after a deploy that adds, removes or renames a function (Apps → the app → Resync, or
     `curl -X PUT https://<API host>/api/inngest`).
- In production mode the endpoint answers 401 to anything Inngest didn't sign, including GET.
- Smoke test after any new environment: send `system/ping` from the Inngest UI; a
  `system-ping` run should show status Completed.

## Vercel (frontend)

One project, `pakka-agent`, in the team's Vercel account (Pro: Hobby is for non-commercial use).

1. **Add New → Project** → import `GrowSpark-Consulting/AgentX` (install the Vercel GitHub app
   on the org if asked). Framework preset Next.js; **root directory `frontend`** (the Next.js app in the pnpm
   monorepo; keep "Include files outside the root directory" on so `packages/` and the two
   `backend/` read helpers are available). Build, install and output settings default.
2. Settings → Environment Variables: add `ENABLE_EXPERIMENTAL_COREPACK=1` to all environments so
   Vercel uses the pnpm version pinned in `packageManager`.
3. Settings → Git → **Production Branch: `production`**. Pushes to `main` then build as Preview
   deployments, which is our staging. A release fast-forwards `production` to the tagged commit.
4. Settings → Domains: `staging.pakkaagent.in` → **Git branch `main`**; `app.pakkaagent.in` → Production.
   (The `api.*` domains belong to Railway now.)
5. Environment variables, using the names in `frontend/.env.example` (public values only):
   `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and later
   `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_ES_CONFIG_ID`.
   - **Preview**, scoped to branch `main`: staging values (`NEXT_PUBLIC_API_URL` = the staging API)
   - **Production**: production values
   - Never set server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `META_*`, `INNGEST_*`, `ENCRYPTION_KEY`) or
     `DEV_DASHBOARD_WITHOUT_TENANT` on Vercel. `NEXT_PUBLIC_*` values are compiled in at build time:
     redeploy after changing one.
6. Server rendering runs in `bom1` (Mumbai, set in `frontend/vercel.json`) next to the Supabase database.

Per-PR preview URLs are not on the API's CORS list, so their API calls are refused. Test API changes
on staging, or add one exact preview origin to `CORS_ALLOWED_ORIGINS` for a while.

## Railway (API)

One service (`spark_agent` today) in one Railway project, with an environment each for staging and
production. Build and deploy settings are in `railway.json` at the repo root and override the dashboard.

| Setting | Value |
|---|---|
| Root Directory | repo root (blank): pnpm needs the workspace file and the lockfile |
| Build Command | `pnpm --filter @pakka/backend typecheck` (railway.json) |
| Start Command | `pnpm --filter @pakka/backend start` → `tsx src/server/main.ts` (railway.json) |
| Healthcheck Path | `/api/health` (railway.json) |
| Watch Paths | `backend/**`, `packages/**`, `packs/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `railway.json` |
| Branch | staging environment: `main`; production: `production` |
| Region | the one closest to Mumbai (the Supabase region) |
| Networking | Generate a public domain, or add `api-staging.pakkaagent.in` / `api.pakkaagent.in` as a custom domain |

The server listens on Railway's `PORT` on `0.0.0.0`, checks its environment before listening (a
missing or invalid variable fails the deploy and the log names it, never its value), and on SIGTERM
finishes requests in flight before exiting. It also validates `packs/*.json` and stores new pack versions
in `vertical_packs` before listening: an invalid pack, a changed published version or an unreachable
database fails the deploy the same way (`pnpm packs:sync [--check]` runs the same step by hand).

Variables per environment (names in `backend/.env.example`): `NEXT_PUBLIC_APP_URL` (the frontend's
origin for this environment; always allowed by CORS), `CORS_ALLOWED_ORIGINS` (other exact origins,
comma-separated, never `*`), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `ENCRYPTION_KEY`,
`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_SERVE_ORIGIN`, and the rest of the file as
modules land. Optional: `RAILPACK_NODE_VERSION=22` to build on the same Node as CI (`.nvmrc`).

Check a deploy: `https://<API host>/api/health` returns
`{"ok":true,"env":"<railway environment>","commit":"<sha>"}`.

## DNS for pakkaagent.in

Add at the domain's DNS provider. Vercel and Railway show the exact target for each custom domain
when you add it; use those values.

| Name | Type | Value | Serves |
|---|---|---|---|
| `staging` | CNAME | Vercel target | Staging app |
| `api-staging` | CNAME | Railway target (staging environment) | Staging API and webhooks |
| `app` | CNAME | Vercel target | Production app |
| `api` | CNAME | Railway target (production environment) | Production API and webhooks |
| `@`, `www` | A / CNAME | Vercel values | Landing page (Dev 3) |
| Resend records | MX, TXT (SPF, DKIM), `_dmarc` TXT | From the Resend dashboard | System email |

Moving a custom domain changes its origin: update `NEXT_PUBLIC_API_URL` on Vercel (and redeploy),
`NEXT_PUBLIC_APP_URL` / `CORS_ALLOWED_ORIGINS` and `INNGEST_SERVE_ORIGIN` on Railway, the Inngest app
URL, the Meta callback URL, and Supabase Auth's Site URL and redirect URLs.

Meta's webhook check: the Meta app's callback URL is `https://<API host>/api/webhooks/whatsapp`
(note `/api/`), and its verify token is the Railway environment's `META_WEBHOOK_VERIFY_TOKEN`. Only
the GET verification exists today; don't subscribe the app to `messages` until the POST handler is
merged. Use the staging API for the test app, and move the callback to the production API when
production goes live (or give staging its own Meta test app).

## Password manager

One shared vault, **Pakka Agent**, in a team password manager (Bitwarden Teams or 1Password
Business). Every credential lives there; nothing is pasted into chat.

| Folder | Who | Holds |
|---|---|---|
| `accounts` | Raja + all devs | Logins: Meta Business, Meta developer app, Razorpay, Google Cloud, Supabase, Vercel, Railway, Inngest, Sentry, Langfuse, Resend, domain registrar, GitHub org |
| `local` | All devs | Shared test-only values: Meta test number, Anthropic dev key, embeddings key, Razorpay test keys |
| `staging` | All devs | Every staging env var, Supabase DB password |
| `production` | Raja + Dev 2 | Every production env var, Supabase DB password, `ENCRYPTION_KEY` |

Name each item after its env var (`ANTHROPIC_API_KEY`) so copying into Railway or Vercel is mechanical. Use a
different `ENCRYPTION_KEY` per environment (`openssl rand -base64 32`). If a production key leaks,
rotating it is a deploy, not a code change.
