> Archived README of the `pakka-onboarding` export (5 Oct 2026). The export was merged into `frontend/`;
> paths below refer to the old export layout. Current layout: docs/frontend-architecture-map.md.

# Pakka onboarding (Next.js port)

The seven-screen Pakka onboarding prototype, ported to Next.js App Router,
TypeScript, Tailwind CSS v4 and shadcn/ui.

```bash
npm install
npm run dev     # http://localhost:3000 → redirects to /onboarding
```

## Structure

```
app/
  layout.tsx              Archivo via next/font/google
  globals.css             Modernist tokens → shadcn vars → Tailwind theme
  page.tsx                redirects to /onboarding
  onboarding/page.tsx     renders <OnboardingFlow />
components/
  ui/                     shadcn primitives themed to Modernist
    button.tsx input.tsx label.tsx switch.tsx dialog.tsx
  onboarding/
    data.ts               all mock data (6 trades, FAQs, checks, pop-up, QR)
    state.ts              state shape, initial state, helpers
    primitives.tsx        StepIntro, RuleHeading, SquareRadio, CopyRow, CheckRow
    onboarding-flow.tsx   header, progress, timers, step routing, footer nav
    step-verify-phone.tsx step 1  Verify phone (+ OTP)
    step-business.tsx     step 2  Business name + trade picker
    step-teach.tsx        step 3  Website import animation, services, FAQs
    step-try.tsx          step 4  QR + WhatsApp test chat
    step-whatsapp.tsx     step 5  Facebook / manual (partner, own app), checks, live
    meta-popup.tsx        simulated Facebook Embedded Signup window
    step-team.tsx         step 6  Staff, Google Calendar, feature toggles
    step-live.tsx         “You’re live.” screen
lib/utils.ts              cn()
```

## Things to wire up

- `ROUTES` in `components/onboarding/data.ts`: the landing page (`/`) and
  dashboard (`/dashboard`) aren't part of this export; point them where yours live.
- Everything is client-side mock behaviour (timed checks, fake OTP, fake
  import). Replace the timers in `onboarding-flow.tsx` with real API calls.

## Prototype behaviours worth knowing (all preserved)

- Manual “own app” checks fail at row 1 unless the token starts with `EAA`;
  then at row 2 without IDs; then at row 4 without an app secret.
- Partner checks fail without a WABA ID / phone number ID.
- Manual runs pause on the last row until “Prototype: ‘hi’ received” is clicked.
- Closing the Meta pop-up records the screen it was closed on.
