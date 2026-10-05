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
- Channels are adapters (src/channels), industries are packs (packs/*.json), features are rows in `features`.
- Read env through `serverEnv()` in src/lib/env.ts; add new variables to its schema and to .env.example.

## Where things live
src/channels/whatsapp(+/connect)  src/agent  src/booking  src/notify  src/billing  src/consent
src/features  src/kb  src/inngest  src/lib  src/types · packs/ · tests/conversations/ · supabase/migrations/

## Commands
pnpm dev · pnpm inngest:dev · pnpm test · pnpm typecheck · pnpm lint · pnpm build
pnpm db:start · pnpm db:reset · pnpm db:status · pnpm db:stop
Coming later: pnpm test:conversations (M3) · pnpm packs:migrate (M7)

## Before you finish a task
Run typecheck, lint and tests. Update tests/conversations if agent behaviour changed.

@AGENTS.md
