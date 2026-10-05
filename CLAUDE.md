# Pakka Agent

Multi-tenant SaaS. A business connects WhatsApp; an AI assistant answers, qualifies, books,
reminds and hands off to staff. Billing in credits. Full specs: docs/handover.md.

## Stack
Next.js 16 (App Router, TS strict) on Vercel · Supabase (Postgres, Auth, Realtime, pgvector) ·
Inngest jobs · Anthropic API · Meta WhatsApp Cloud API (direct, no BSP) · Razorpay ·
Tailwind + shadcn/ui · Zod · Vitest

## Non-negotiable rules
- Every table has tenant_id and RLS. Every server query filters by tenant_id.
- Code decides, the LLM only extracts (step 4) and writes text (step 7). No business logic in prompts.
- All outbound messages go through notify.send(). All credit changes go through spend_credits().
- Check isEnabled(tenantId, featureKey) before any optional behaviour.
- Validate every external input and every LLM output with Zod.
- Webhooks and Inngest steps must be idempotent.
- WhatsApp tokens and app secrets live only in whatsapp_connections, encrypted; never log, return or send them to the browser.
- Never write industry names in code; branch on pack capabilities.
- Never commit secrets. Mask phone numbers in logs.
- Migrations are append-only in supabase/migrations.
- Channels are adapters (backend/src/channels), industries are packs (packs/*.json), features are rows in `features`.
- Read env through `serverEnv()` in backend/src/lib/env.ts (import `@pakka/backend/lib/env`); add new variables to its schema and to .env.example.

## Where things live
pnpm monorepo. frontend/ is the one Next.js app (routes incl. app/api, UI, fixtures, Playwright);
backend/ is @pakka/backend (server modules the API routes import); packages/types, packages/config.
backend/src: channels/whatsapp(+/connect)  agent  booking  notify  billing  consent  features  kb  inngest  lib
frontend: app/  components/{ui,dashboard,onboarding}  features/<screen>  fixtures/  styles/  tests/
packs/ · tests/conversations/ · supabase/migrations/ · docs/frontend-architecture-map.md

## Commands
pnpm dev · pnpm inngest:dev · pnpm test · pnpm typecheck · pnpm lint · pnpm build · pnpm test:e2e
(root scripts run every workspace; one package: pnpm --filter @pakka/frontend <script>)
pnpm db:start · pnpm db:reset · pnpm db:status · pnpm db:stop
Coming later: pnpm test:conversations (M3) · pnpm packs:migrate (M7)

## Before you finish a task
Run typecheck, lint and tests. Update tests/conversations if agent behaviour changed.

@AGENTS.md
