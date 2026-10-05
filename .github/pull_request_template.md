## What and why

<!-- One or two lines. Link the module / milestone (e.g. "Module 7, M1"). -->

## Area

- [ ] Agent (Dev 1, reviewer Dev 2)
- [ ] Booking, jobs and money (Dev 2, reviewer Dev 3)
- [ ] Dashboard and onboarding (Dev 3, reviewer Dev 1)
- [ ] Shared: schema, types, CI, environments (all three review)

## Definition of done

- [ ] Works on staging, not just locally
- [ ] Unit tests for logic; conversation tests updated if agent behaviour changed
- [ ] Typecheck, lint and tests green in CI
- [ ] RLS covers any new table; every query filters by `tenant_id`
- [ ] No secrets in code or logs; phone numbers masked
- [ ] Errors reach Sentry; LLM calls visible in Langfuse
- [ ] Audit log written for any action a business would want to trace
- [ ] `CLAUDE.md` or `docs/handover.md` updated if a contract changed

<!-- Schema changes (supabase/migrations) need review from all three developers.
     Keep PRs under ~400 changed lines. -->
