> Archived README of the `pakka-app` export (5 Oct 2026). The export was merged into `frontend/`;
> paths below refer to the old export layout. Current layout: docs/frontend-architecture-map.md.

# Pakka — dashboard UI (Next.js port)

Next.js App Router port of the **"Pakka App First Round (Copy)"** design: the WhatsApp AI-assistant
dashboard (Home, Inbox, Leads, Calendar, Features, Agent settings, Knowledge base, Templates,
Billing & credits, Team, Settings), with all interactions, responsive desktop/mobile layouts,
light/dark themes, account states and the five sample industries.

## Run

```bash
pnpm install                       # pnpm 11 (corepack enable, or npx pnpm@11.21.0)
pnpm dev                           # http://localhost:3000
pnpm build && pnpm start

pnpm lint · pnpm typecheck
pnpm test                          # Vitest: fixture integrity
pnpm exec playwright install chromium   # once
pnpm test:e2e                      # Playwright smoke tests at 1440 / 820 / 390 px (builds and serves on :3100)
```

`pakka-app` is its own pnpm workspace (`pnpm-workspace.yaml`), separate from the root `pakka-agent`
app, until the dashboard is merged into it. See `../docs/frontend-architecture-map.md`.

## Switching states

The original exposed editor props; here they are URL parameters (defaults in brackets):

| Param | Values |
| --- | --- |
| `industry` | `re` (real estate, default) · `salon` · `int` (interior design) · `hotel` · `rest` (restaurant) |
| `theme` | `light` (default) · `dark` |
| `frame` | `fit` (full window, default) · `phone` (390×844 device frame) |
| `account` | `paid` (default) · `trial` · `ended` |
| `credits` | `healthy` (default) · `low` · `zero` |
| `plan` | `starter` · `growth` (default) · `pro` |
| `firstDay` | `1` / `0` (default) |
| `productName` | any text (default `Pakka`) |
| `screen` | `home` · `inbox` · `leads` · `calendar` · `features` · `agent` · `knowledge` · `templates` · `billing` · `team` · `settings` |
| `chat` | open a chat with its lead card pinned, e.g. `karthik` |

Example: `/?industry=salon&theme=dark&account=trial&credits=low&screen=inbox`

## Structure

```
src/app/layout.tsx              root layout, title, font preload
src/app/page.tsx                reads URL params → <PakkaRoot>
src/app/globals.css             Tailwind (theme + utilities), shadcn tokens, Modernist design system,
                                Archivo @font-face, light/dark + WhatsApp palettes
src/components/pakka/
  pakka-root.tsx                client-only mount (the app measures the window on mount)
  runtime.tsx                   DCLogic base class + host component (state/render semantics)
  pakka-app.tsx                 shell: sidebar, top bar, banners, Home, Inbox, Features,
                                mobile tab bar + More sheet, toasts, top-up/upgrade/template dialogs
  pakka-leads.tsx               Leads board + list, lead detail
  pakka-calendar.tsx            Calendar, booking detail, reschedule/cancel
  pakka-agent.tsx               Agent persona, languages, tone, handover triggers
  pakka-knowledge.tsx           FAQs, unanswered questions, documents
  pakka-templates.tsx           WhatsApp template list, editor, builder with live preview
  pakka-billing.tsx             Plans, credit usage, invoices
  pakka-settings.tsx            Profile, business, WhatsApp number, notifications, security…
  pakka-team.tsx                Staff, roles, alert preferences
src/fixtures/                   TEMPORARY sample data, one module per screen (shell, plans, leads, calendar,
                                agent, knowledge, templates, billing, settings, team) + industries.ts for the
                                salon / interior / hotel / restaurant samples. Replaced by API data per
                                ../docs/dashboard-screen-contracts.md
e2e/                            Playwright smoke tests (screens, navigation, dialogs, account states)
public/fonts/                   Archivo (woff2), the files embedded in the original
components.json, src/lib/utils.ts   shadcn/ui configuration and the `cn` helper
```

## Notes

- **Fidelity first.** Markup, inline styles and copy are carried over as authored (mock data now lives in
  `src/fixtures/`, moved without changing output), and each
  screen keeps its original logic class. Screens were checked pixel-for-pixel against the original at
  desktop and mobile sizes across all account states, themes and industries, plus click-through runs.
- **Tailwind without Preflight.** The design was built on browser defaults plus its own base rules, so
  `globals.css` imports Tailwind's theme and utilities layers only. Hover states use Tailwind
  arbitrary-property utilities (`hover:[…]!`).
- **shadcn/ui** is configured (`components.json`, `cn`, tokens mapped to the design system with 0 radius),
  so `npx shadcn add <component>` works for new UI. The existing screens use the design's own
  `.btn`, `.input`, `.dialog`, `.table` classes rather than shadcn primitives, which would change the look.
- `tsconfig.json` has `"strict": false` because the ported screen logic is loosely typed JavaScript.
