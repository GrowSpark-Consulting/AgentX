# Task notes: real-estate pack v1, and packs loaded and stored at startup

Branch `feat/agent-real-estate-pack`. For Dev 2 (Shaaz) and Dev 3 (Dhatri).

> **Deploy order.** All three launch packs (real estate, interiors, salon) are in this PR, so trial signup keeps
> working for the three industries the product launches with. Signup still refuses any other industry once the
> table has a row (migration 0006, unchanged). **Dhatri's onboarding wizard must list only industries with an
> active pack**, read from `vertical_packs`, not a hard-coded list (see section 6); do not offer other
> industries in the UI until their pack exists.

## 1. What I built and why

The assistant needs to know, for each industry, what to ask a customer, how to score a lead, which visits it
books and which reminders it sends. That description lives in a file per industry. Until now there was no real
file and nothing read the files at all. This PR adds the three we launch with (real estate, interior design and beauty parlour) and makes the server
read every pack file when it starts, check that it is well formed, and save it in the database. If a pack is
broken, or if someone edits a pack that is already live, the server refuses to start and says exactly which file
and which part is wrong, so a bad pack can never reach customers.

Technical details:

- **Waiting out a short database outage at startup.** If the database is unreachable or restarting while the
  server starts (common when Railway and Supabase come up together), the pack sync now waits and tries again for
  for up to 40 seconds after the process started (pauses of 1, 2, 4, 8, 10 and 10 s; each call is cut off after
  5 s). A refusal that waiting cannot fix (missing permission, a wrong URL or a rejected key, a bad statement), an
  invalid pack, or a changed published version still fails at once. A try that starts by 40 s ends by about 50 s,
  inside Railway's 60 s healthcheck, so a long outage ends in a failed deploy with a clear message, not a hang.
- **`packs/interiors.json`, version 1.** Asks for property type, area in sq ft, scope (full home, kitchen,
  wardrobes, living room, bedrooms, renovation), budget, possession date, and the property's pincode (the visit
  is at the customer's address, and the slot engine checks the pincode against each person's service area).
  Books `field_visit` (a site measurement). Score out of 100: budget in band 30, possession within 90 days 25,
  scope full home or kitchen 15, area from 600 sq ft 15, property type 5, pincode in service area 10; hot from 70,
  warm from 40; a hard fail for a budget below the cheapest service. Reminders 24 h and 2 h before the visit,
  feedback 2 h after it.
- **`packs/salon.json`, version 1.** Asks for the services, preferred stylist, date, time of day (morning,
  afternoon, evening) and party size. Books `slot`. Score out of 100: services in the catalogue 40, date within 7
  days 30, stylist available 10, time within working hours 10, two or more people 10; hot from 60, warm from 30
  (a beauty booking is a lighter decision than a home purchase); a hard fail when none of the requested services
  is offered. Same reminder and feedback offsets, plus a no-show rebooking template.
- **`packs/real-estate.json`, version 1.** Fields: budget, preferred area, type (1BHK to plot), timeline, funding,
  and `decision_maker` (yes/no, "Are you the buyer or co-buyer?"; the handover's field list forgot it although
  the scoring rule uses it). Scoring out of 100 (budget in project band 30, timeline 0-3m 25, area in project
  areas 20, funding 15, decision maker 10), hot from 70, warm from 40, and a hard fail for a budget below the
  cheapest project. Books `site_visit`. Reminders are relative to the visit: 24 hours and 2 hours before, feedback
  2 hours after it ends. No schema change was needed.
- **Startup.** Before listening, `main.ts` reads every `packs/*.json`, validates it with the pack format and
  the loader's own checks, and stores new versions in `vertical_packs` by `(key, version)`. An invalid file fails
  startup naming the file and the field; the pack's own text is never printed.
- **Published versions are never changed.** If a file's definition differs from what is stored for the same
  `(key, version)`, startup fails and names the parts that differ (for example `label, scoring`) and says to
  publish the change as version N+1. Key order and whitespace do not count as a difference (the database keeps
  JSON in its own order).
- **Safe when several servers start at once.** Each pack is inserted only if absent (`ON CONFLICT (key, version)
  DO NOTHING`), then what is stored is read back and compared with the file. Servers with the same file all
  succeed; servers with different files for one version cannot both win. Checked on the local database with three
  `packs:sync` at the same moment: one inserted, two unchanged, one row.
- **Also a command:** `pnpm packs:sync` does the same by hand; `pnpm packs:sync --check` validates the files only
  (no database, no environment). After `pnpm db:reset` the table is empty until the next server start or sync.
- **Read-only pack source** (`createDbPackSource`) so the pipeline can load a tenant's pinned `(key, version)`
  from `vertical_packs` with the existing `loadPack`. Not used by any route yet.
- Packs are stored `active = true`. The sync never changes `active` on an existing row.

## 2. Files changed and what each does

| File | What it does |
|---|---|
| `packs/real-estate.json`, `interiors.json`, `salon.json` | The three launch packs, version 1 (data) |
| `backend/src/agent/packs/sync.ts` | Reads and validates `packs/*.json`, stores new versions, refuses changed published versions, retries a briefly unavailable store (40 s budget), formats what is printed |
| `backend/src/agent/packs/store.ts` | The database calls for `vertical_packs`, (5 s timeout each) and the read-only pack source. Errors carry only the Postgres code or HTTP status, marked transient or not |
| `backend/src/scripts/sync-packs.ts` | The `pnpm packs:sync [--check]` command |
| `backend/src/server/main.ts` | **Shaaz's file, approved:** runs the sync before `server.listen`, logs each wait, exits with a clear message on failure. The server setup moved into a `start()` function; `registerWhatsAppSender()` and `logPath` (added on main since) are kept |
| `railway.json` | **Shaaz's file, approved:** `packs/**` added to the watch paths, so a pack change redeploys |
| `docs/environments.md` | Watch Paths row, and a sentence on the startup step |
| `backend/package.json`, `package.json` | The `packs:sync` script and a root alias |
| tests | `real-estate.test.ts`, `interiors.test.ts`, `salon.test.ts`, `launch-packs.test.ts`, `sync.test.ts`, `store.test.ts` (in `backend/src/agent/packs/`) |

## 3. How to run / test it locally

```
pnpm --filter @pakka/backend exec vitest run src/agent/packs     # this PR's tests
pnpm typecheck && pnpm lint && pnpm test                         # everything
pnpm db:reset && pnpm dev                                        # the first server start stores the pack
pnpm packs:sync                                                  # the same step by hand (needs backend/.env.local; override the three Supabase values in the shell for a local run)
pnpm packs:sync -- --check                                       # validate only, no database
```

Check what is stored: `select key, version, active from vertical_packs;` (Studio, or `docker exec` into the
local database). Each demo business has `vertical` equal to its pack key and `vertical_version = 1`, so all three
match a stored pack:

```sql
select t.name, t.vertical, vp.active, vp.definition->'bookingModes'
from tenants t left join vertical_packs vp on vp.key = t.vertical and vp.version = t.vertical_version
where t.name like 'Spark Agent Demo%';
```

To see the retry: `docker pause supabase_db_pakka-agent`, start `pnpm packs:sync`, wait about 10 s, then
`docker unpause supabase_db_pakka-agent`. The log shows `the pack store is unavailable (try 1)` and then the packs.

## 4. Decisions made

Need review by Dev 2 (Shaaz):

- **Packs load when the server starts, and also by command.** Startup is what the handover asks for and makes a
  bad pack fail the deploy's healthcheck; the command is for a pre-deploy check and after `pnpm db:reset`.
- **A file is named after its pack key** (`packs/real-estate.json` holds key `real-estate`), one version per file.
  A new version replaces the file with `"version": N+1` and the old version stays in the table.
- **No migration:** `vertical_packs` (primary key `(key, version)`, `definition jsonb`, `active`) already fits.
- **`active = true` on insert**, never changed afterwards. A pack that should not launch is simply not put in
  `packs/`. Switching a version off later is a manual or admin action.
- **The stored definition is the file as written**, not the parsed result, so a later change to the pack
  format's defaults can never make an old, unchanged pack look "changed".
- **Packs folder from the source file's location**, not the working directory (the server runs with `backend/` as
  its working directory). The deploy root is the repo root (`docs/environments.md`), so `packs/` is present.
  A missing folder fails startup. After the first deploy the log line `[packs] real-estate@1 inserted` (or
  `unchanged`) confirms it.
- **`railway.json` watch path** `packs/**`, so a pack-only change redeploys.
- **The trial-signup rule in 0006 is left as designed.** With three packs stored, signup works for real estate,
  interiors and salon and refuses every other industry.
- **Salon does not hand over on `hot_lead`** (the other two packs do). A hot salon lead is someone ready to book a
  slot, which the agent does by itself; handing it to staff would hand over nearly every good booking. Reminder
  `event` names (`site_measurement`, `appointment`, `site_visit`) are free labels, not booking modes: the loader
  does not tie them to `bookingModes`, and the reminder scheduler (Shaaz) should key on `anchor` and `offset`.
- **Interiors collects the address at booking**, not as a lead field: the pack asks only for the pincode, which
  the slot engine needs; the booking step (Day 3) asks for the street address of the visit.
- **Interiors has an optional `pincode` field** that the handover's interiors description does not list. The
  booking is a visit at the customer's address and `findSlots` takes a pincode, so without it the slot engine
  could not check the service area. It is optional, so nobody is blocked from booking without it.
- **Salon asks the date and the time of day as two fields** (`preferred_date`, `preferred_time`), so each can be
  scored and asked for on its own. `preferred_time` is morning, afternoon or evening, matching the slot
  engine's day parts. Party size is optional.
- **Scoring numbers are first guesses** (Raja reviews the weights and thresholds after the first scored test chats,
  as the Day 3 list says). The named matchers (`within_service_band`, `in_service_catalog`, `starts_within_days`,
  `in_service_area`, `is_available_stylist`, `within_working_hours`, `none_in_service_catalog`) are implemented by
  the scoring engine on Day 3, like `within_project_band` for real estate.
- **Retry budget 40 s from process start** (pauses of 1, 2, 4, 8, 10, 10 s = 35 s), shared by all packs like the
  healthcheck is; each pack gets its own count of tries. The time the process spent starting counts. A try that
  times out may still reach the database, so the next try can run beside it: safe, because the insert is
  `ON CONFLICT DO NOTHING`. Transient: Postgres 08xxx, 53200, 53300, 57P01-03, 57014, 40001, 40P01, PGRST000-003;
  HTTP 408, 425, 429 and 5xx; no answer at all; a call that does not answer in 5 s. Any other 4xx with no Postgres
  code (a wrong `NEXT_PUBLIC_SUPABASE_URL`, a rejected key) is a refusal and fails at once with `HTTP <status>` in
  the message. If a try's answer was lost after the row went in, the retry reports the pack as `unchanged`.
- **The demo businesses are checked by a file test, not a pgTAP test.** `vertical_packs` is filled by the server's
  sync, not by a migration, so a database test has nothing to join after `pnpm db:reset`. `launch-packs.test.ts`
  checks the seed file against the pack files, and the join was run on the local database (section 3).
- **No scorer understands the named matchers yet.** The "loads without warnings" tests prove the loader accepts the
  pack, not that a scoring engine knows `within_service_band` and the others; that engine is Day 3.

Need review by Dev 3 (Dhatri): the onboarding wizard's industry list (see section 6).

## 5. For Dev 2 (Shaaz)

- **Safe to deploy once this PR is merged**: all three launch packs are included. Nothing to set on Railway.
- **Review `main.ts` and `railway.json`** (both small). If startup cannot reach the database the server now exits
  instead of serving only `/api/health`; Railway's restart policy and healthcheck then roll back a bad deploy.
- **After the first staging deploy**, check the log for `[packs] interiors@1 inserted`, `real-estate@1 inserted` and
  `salon@1 inserted`, and that `select key, version, active from vertical_packs` shows three rows. If the database
  is slow to come up you will see `the pack store is unavailable (try N)` first; that is the retry working.
- **No Inngest change**, no resync. **No migration.**
- **`pnpm db:reset` empties `vertical_packs`.** Until the next server start or `pnpm packs:sync`, signup accepts any
  industry again (the table is empty), which is the old behaviour.
- To change a live pack, never edit its file: copy it, set `"version": N+1`. A changed published version stops
  startup on purpose. Moving existing businesses to the new version is the later `packs:migrate` script.

## 6. For Dev 3 (Dhatri)

- **The onboarding wizard must list only industries that have an active pack**, read from `vertical_packs`
  (`select key, version, active` is readable by any signed-in user; it is a global catalogue), not from a
  hard-coded list. Today three have one: `real-estate`, `interiors` and `salon`. Offering any other industry (hotel, restaurant,
  tours, home services) ends in a signup error until its pack exists.
- The pack's `label` ("Real estate", "Interior design", "Beauty parlour") can be shown as the industry name. Fields, scoring and reminders are not for
  the browser: do not read `definition` for anything but the list.
- All three seeded demo businesses have their pack (version 1). A business created by signup is pinned to the
  newest active version of the pack it chose.

## 7. Follow-ups / not done in this PR

- **The other industries** (hotel, restaurant, plumber/electrician, tours) as packs; the tours pack is specified in the handover.
- **A `catalog` block for real estate.** `within_project_band` and `in_project_areas` need project data (price
  bands and areas per project). The catalog engine is not built, so those two rules have nothing to read yet.
- **Reading packs from the database in the pipeline** (the pack source exists; nothing uses it yet), and the
  version migration script (`pnpm packs:migrate`).
- Make onboarding and the signup function agree on one source of truth for "which industries are open".
- Deactivating a pack version (an admin action).
