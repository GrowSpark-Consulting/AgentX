# Task notes: real-estate pack v1, and packs loaded and stored at startup

Branch `feat/agent-real-estate-pack`. For Dev 2 (Shaaz) and Dev 3 (Dhatri).

> **Do NOT deploy to staging until (1) Dhatri's onboarding wizard lists only industries with an active pack
> (read from `vertical_packs`, not a hard-coded list), and (2) interiors and salon packs exist (Dev 1's next
> PR). Otherwise trial signup fails for every industry except real estate.**
>
> Why: the signup function (`create_trial_tenant`, migration 0006) accepts any industry while `vertical_packs` is
> empty, but as soon as the table has a row it refuses every industry without an active pack. This PR makes the
> server store the real-estate pack on its first start, so from then on only real estate can sign up. Checked on
> the local database: after the pack is stored, real-estate signup works and salon signup fails with
> "salon is not an active pack". The seeded demo businesses are not affected (they are not created by that function).

## 1. What I built and why

The assistant needs to know, for each industry, what to ask a customer, how to score a lead, which visits it
books and which reminders it sends. That description lives in a file per industry. Until now there was no real
file and nothing read the files at all. This PR adds the first real one, for real estate, and makes the server
read every pack file when it starts, check that it is well formed, and save it in the database. If a pack is
broken, or if someone edits a pack that is already live, the server refuses to start and says exactly which file
and which part is wrong, so a bad pack can never reach customers.

Technical details:

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
| `packs/real-estate.json` | The real-estate pack, version 1 (data) |
| `backend/src/agent/packs/sync.ts` | Reads and validates `packs/*.json`, stores new versions, refuses changed published versions, formats what is printed |
| `backend/src/agent/packs/store.ts` | The database calls for `vertical_packs`, and the read-only pack source. Errors carry only the Postgres code |
| `backend/src/scripts/sync-packs.ts` | The `pnpm packs:sync [--check]` command |
| `backend/src/server/main.ts` | **Shaaz's file, approved:** runs the sync before `server.listen`; exits with a clear message on failure. The server setup moved into a `start()` function, unchanged otherwise |
| `railway.json` | **Shaaz's file, approved:** `packs/**` added to the watch paths, so a pack change redeploys |
| `docs/environments.md` | Watch Paths row, and a sentence on the startup step |
| `backend/package.json`, `package.json` | The `packs:sync` script and a root alias |
| tests | `real-estate.test.ts`, `sync.test.ts`, `store.test.ts` (in `backend/src/agent/packs/`) |

## 3. How to run / test it locally

```
pnpm --filter @pakka/backend exec vitest run src/agent/packs     # this PR's tests
pnpm typecheck && pnpm lint && pnpm test                         # everything
pnpm db:reset && pnpm dev                                        # the first server start stores the pack
pnpm packs:sync                                                  # the same step by hand (needs backend/.env.local)
pnpm packs:sync -- --check                                       # validate only, no database
```

Check what is stored: `select key, version, active from vertical_packs;` (Studio, or `docker exec` into the
local database). The real-estate demo business has `vertical = 'real-estate'` and `vertical_version = 1`, so it
matches the stored pack; the interiors and salon demo businesses have no pack yet.

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
- **The trial-signup rule in 0006 is left as designed** (the warning at the top). Relaxing it was not done.

Need review by Dev 3 (Dhatri): the onboarding wizard's industry list (see section 6).

## 5. For Dev 2 (Shaaz)

- **Do not deploy to staging yet** (see the warning at the top).
- **Review `main.ts` and `railway.json`** (both small). If startup cannot reach the database the server now exits
  instead of serving only `/api/health`; Railway's restart policy and healthcheck then roll back a bad deploy.
- **After the first staging deploy**, check the log for `[packs] real-estate@1 inserted`, and that
  `select key, version, active from vertical_packs` shows the row.
- **No Inngest change**, no resync. **No migration.**
- **`pnpm db:reset` empties `vertical_packs`.** Until the next server start or `pnpm packs:sync`, signup accepts any
  industry again (the table is empty), which is the old behaviour.
- To change a live pack, never edit its file: copy it, set `"version": N+1`. A changed published version stops
  startup on purpose. Moving existing businesses to the new version is the later `packs:migrate` script.

## 6. For Dev 3 (Dhatri)

- **The onboarding wizard must list only industries that have an active pack**, read from `vertical_packs`
  (`select key, version, active` is readable by any signed-in user; it is a global catalogue), not from a
  hard-coded list. Today only `real-estate` has one. Until the interiors and salon packs exist and are deployed,
  offering those (or hotel, restaurant, tours, home services) ends in a signup error.
- The pack's `label` ("Real estate") can be shown as the industry name. Fields, scoring and reminders are not for
  the browser: do not read `definition` for anything but the list.
- Do not assume every seeded demo business has a pack: the interiors and salon demo businesses have none yet.

## 7. Follow-ups / not done in this PR

- **Interiors and salon packs** (Dev 1's next PR); then the other industries.
- **A `catalog` block for real estate.** `within_project_band` and `in_project_areas` need project data (price
  bands and areas per project). The catalog engine is not built, so those two rules have nothing to read yet.
- **Reading packs from the database in the pipeline** (the pack source exists; nothing uses it yet), and the
  version migration script (`pnpm packs:migrate`).
- Make onboarding and the signup function agree on one source of truth for "which industries are open".
- Deactivating a pack version (an admin action).
