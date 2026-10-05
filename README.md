# Pakka Agent

A business connects its WhatsApp number and an AI assistant answers enquiries, qualifies leads,
books visits, sends reminders and hands chats to staff — billed in monthly credits.

- Specs and contracts: [docs/handover.md](docs/handover.md)
- Environments, deploys, DNS and secrets: [docs/environments.md](docs/environments.md)
- Rules for Claude Code (and humans): [CLAUDE.md](CLAUDE.md)

## Run it locally

You need Node 22.12+, pnpm 11 (`corepack enable` picks the pinned version) and Docker Desktop running.

```bash
pnpm install
pnpm db:start                 # local Supabase in Docker; first run pulls images
cp .env.example .env.local    # then paste the keys printed by `pnpm db:status`
pnpm dev                      # http://localhost:3000
pnpm inngest:dev              # second terminal: Inngest dev server on http://localhost:8288
```

Fill these from `pnpm db:status` into `.env.local`:

| `.env.local` | `pnpm db:status` |
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
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | What CI runs (plus `pnpm build`) |
| `pnpm db:start` · `pnpm db:stop` · `pnpm db:status` | Local Supabase stack |
| `pnpm db:reset` | Recreate the local database from `supabase/migrations` and the seed |
| `pnpm db:test` | pgTAP database tests in `supabase/tests` (tenant isolation, RLS everywhere) |

## Workflow

Branch from `main` as `feat/<area>-<short-name>` or `fix/...`, open a pull request, get CI green and
one review from the area's reviewer, then squash-merge. `main` is protected and deploys to staging.
Migrations are append-only; schema changes need review from all three developers.
