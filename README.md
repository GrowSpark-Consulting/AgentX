# Spark Agent

A business connects its WhatsApp number and an AI assistant answers enquiries, qualifies leads,
books visits, sends reminders and hands chats to staff — billed in monthly credits.

- Specs and contracts: [docs/handover.md](docs/handover.md)
- Environments, deploys, DNS and secrets: [docs/environments.md](docs/environments.md)
- Rules for Claude Code (and humans): [CLAUDE.md](CLAUDE.md)
- Frontend structure and routes: [docs/frontend-architecture-map.md](docs/frontend-architecture-map.md)

## Repository layout

A pnpm monorepo. Run every command below from the repo root; root scripts run the workspaces.

| Folder | Package | What |
|---|---|---|
| `frontend/` | `@pakka/frontend` | The one Next.js app: `/`, `/onboarding`, `/dashboard`, `/api/*` routes, UI, fixtures, Playwright |
| `backend/` | `@pakka/backend` | Server modules the API routes import: Inngest, `serverEnv()`, agent, channels, booking, billing… |
| `packages/types` | `@pakka/types` | Shared types and Zod schemas |
| `packages/config` | `@pakka/config` | Shared TypeScript base config |
| `supabase/` | — | Migrations and database tests |
| `packs/`, `tests/conversations/`, `scripts/`, `docs/` | — | Industry packs, conversation tests, one-off scripts, docs |

## Run it locally

You need Node 22.12+, pnpm 11 (`corepack enable` picks the pinned version) and Docker Desktop running.

```bash
pnpm install
pnpm db:start                 # local Supabase in Docker; first run pulls images
cp .env.example frontend/.env.local   # then paste the keys printed by `pnpm db:status`
pnpm dev                      # http://localhost:3000
pnpm inngest:dev              # second terminal: Inngest dev server on http://localhost:8288
```

`.env.local` goes in `frontend/`, not the repo root: Next.js only reads env files from the app's
own folder. When `pnpm dev` starts it should print `Environments: .env.local`.

Fill these from `pnpm db:status` into `frontend/.env.local`:

| `frontend/.env.local` | `pnpm db:status` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | API URL (`http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret / service_role key |

Other keys stay empty until the module that needs them lands; ask for test values in the
password manager's `local` folder.

### Check it works

| Check | Expect |
|---|---|
| http://localhost:3000/api/health | `{"ok":true,"env":"local",...}` |
| http://api.localhost:3000/health | Same JSON, through the `api.*` host rewrite |
| http://localhost:8288 → Apps | `pakka-agent` synced with function `system-ping` |
| Inngest UI → send event `system/ping` | A `system-ping` run with status Completed |
| http://127.0.0.1:54323 | Supabase Studio |

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm inngest:dev` | Inngest dev server, pointed at `/api/inngest` |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | What CI runs (plus `pnpm build`), across every workspace |
| `pnpm test:e2e` | Playwright smoke tests for `/onboarding` and `/dashboard` (once: `pnpm --filter @pakka/frontend exec playwright install chromium`) |
| `pnpm db:start` · `pnpm db:stop` · `pnpm db:status` | Local Supabase stack |
| `pnpm db:reset` | Recreate the local database from `supabase/migrations` and the seed |
| `pnpm db:test` | pgTAP database tests in `supabase/tests` (tenant isolation, RLS everywhere) |

## Workflow

Branch from `main` as `feat/<area>-<short-name>` or `fix/...`, open a pull request, wait for CI to go
green, then squash-merge. Reviews are welcome but not required; tag the area's owner when you touch
their code. `main` is protected and deploys to staging. Migrations are append-only.
