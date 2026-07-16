# Progress: Game Metadata (TGDB + libretro fallback)

Plan: `.mastracode/plans/rom-archive-metadata.md`
Branch: `feat/rom-archive-monorepo`  ·  Baseline HEAD: `f36a409`

> Updated only at phase stop points. Never committed.

---

## Phase 0 — Baseline ✅

- **Branch:** `feat/rom-archive-monorepo` (building on it; not cutting a new branch).
- **Working tree:** clean except untracked `.mastracode/` (`git status --porcelain` → `?? .mastracode/`).
- **Baseline gate results (all green):**
  - `pnpm --filter @rom-archive/api test -- --run --reporter=dot` → **53 passed** (7 files).
  - `pnpm --filter @rom-archive/api check` → clean.
  - `pnpm --filter @rom-archive/web test -- --run --reporter=dot` → **4 passed** (2 files).
- **Pre-existing failures:** none.
- **Deviations:** none.

---

## Phase 1 — Env config + TGDB platform mapping ✅

- **Commit:** `c197e8e`
- **Files:** `apps/api/src/tgdbPlatforms.ts`, `tgdbPlatforms.test.ts`,
  `src/fixtures/tgdb.platforms.json`, `apps/api/.env.example`, `apps/api/.gitignore`.
- **Platform ids** captured live from TGDB `/v1/Platforms` (200, 153 platforms),
  trimmed fixture to our 10 + Mega Drive(36) + 3DO(25). Verified ids:
  nds=8, gba=5, gb=4, gbc=41, snes=6, nes=7, gg=20, sms=35, md=18(Genesis), pce=34(TG16).
- **Gates:** `tgdbPlatforms.test.ts` 3 tests pass (56 total green); `api check` clean;
  key grep over tracked/repo files finds only the plan-file literal (no real key).
- **Deviations:**
  1. Fixture placed at `apps/api/src/fixtures/` (repo convention) not `apps/api/fixtures/`
     (plan wording) — matches existing `gbahomebrew.metadata.json` loading pattern.
  2. Fixture is trimmed (12 platforms) not the full 153, to keep it reviewable;
     still a real captured response.

## Phase 2 — Metadata client ✅

- **Commit:** `2286765`
- **Files:** `apps/api/src/metadata.ts`, `metadata.test.ts`, fixtures
  `tgdb.bygame.metroidfusion.json` (real Metroid Fusion/GBA capture, allowance 998),
  `tgdb.bygame.empty.json`, `tgdb.genres.json` (30 real genres).
- **Design:** `deriveSearchTitle` (extension strip + whitespace collapse, aligns
  with cover.ts), `fetchTgdbMetadata` (maps first result, reads
  `remaining_monthly_allowance`, front-boxart URL, zero→null, non-OK→MetadataError),
  `fetchLibretroMetadata` (title-only floor), `unknownMetadata` (graceful sentinel).
  TGDB returns genres/devs/pubs as id arrays → genres resolved via shipped table,
  dev/pub names via caller-supplied `TgdbLookups` (keeps client pure, no 8k-row tables).
- **Gates:** 9 metadata tests pass (65 total); `api check` clean; no `process.env`
  in `metadata.ts`.
- **Deviations:** dev/publisher name resolution deferred to caller-supplied lookup
  maps (large TGDB tables not shipped as fixtures) — client drops those fields when
  no map is provided. Recorded as a v1 limitation; can be enriched in the service.

## Phase 3 — Budget-aware cache orchestrator ✅

- **Commits:** `e56aa60` (orchestrator), `930dcc6` (review must-fix: TTL semantics
  + expiry tests), `589f825` (review round-2: docstring alignment).
- **Files:** `apps/api/src/metadataService.ts`, `metadataService.test.ts`.
- **Design:** `MetadataCache` interface + `InMemoryCache` (injectable clock).
  `resolveMetadata` — cache hit short-circuits; TGDB on miss when keyed + allowance
  above floor; confirmed no-match → long (~30d) confirmed-negative shield;
  no-key/floored/error → short (~6h) retry TTL. Allowance remembered in-cache
  (6h TTL), floor=20.
- **Vercel-cache decision (DEVIATION):** `@vercel/functions` is NOT installed
  (only `@vercel/node` types). Per plan, kept `InMemoryCache` as the wired default
  rather than adding an unconfirmed dep; cache stays behind `MetadataCache` so a
  `VercelRuntimeCache` can drop in later. Trade-off: in-memory cache is
  per-instance / cold-start-cleared — acceptable floor, weaker global shield.
- **Gates:** 11 service tests pass (76 total), incl. budget-shield (TGDB once),
  negative caching, allowance floor + floor+1 + null, and 3 clock-driven TTL-expiry
  tests; `api check` clean.
- **Mid-run adversarial review:** ran (opus-4-8), 2 rounds.
  - Must-fix #1 (TTL asymmetry = budget leak for no-match ROMs): FIXED — confirmed
    no-match now gets the long shield, undefinitive gets short retry.
  - Must-fix #2 (plan step-4 unknown sentinel drop): documented as intentional
    deviation (libretro is terminal floor; `unknownMetadata` wired at handler layer).
  - Round-2 Must-fix (stale docstring): FIXED in `589f825`.
  - Risks/questions carried to final report: soft floor under concurrency (plan-noted);
    allowance-less TGDB response keeps last value 6h; confirmed-neg re-probe test
    also relies on allowance expiry (clarified via comment).

## Phase 4 — Endpoint + web metadata panel ✅

- **API endpoint:**
  - `apps/api/src/tgdbGenres.ts` — cached genre id→name loader (mirrors `catalog.ts`),
    used to resolve TGDB's numeric genre ids without spending budget.
  - `apps/api/src/handlers.ts` — `handleMetadata(id, name, deps)` →
    `HandlerResult<GameMetadata | ErrorBody>`. 400 on missing id/name, 404 on unknown
    id (via `findCatalogEntry`), otherwise `resolveMetadata`. Never 5xx's on upstream
    failure — a thrown (non-`MetadataError`) error is caught and degrades to
    `unknownMetadata(console, name)` with a 200.
  - `apps/api/api/metadata.ts` — Vercel GET wrapper (method guard, query extraction,
    module-level `InMemoryCache` singleton across warm invocations, `process.env`
    injection, shared `realFetch`).
- **Web panel:**
  - `apps/web/src/ItemMetadata.tsx` — runtime fetch from `/api/metadata`, renders
    title/platform/release/genre/dev/publisher/overview/boxart; a failed request OR
    an `unknown` record collapse to the same graceful "No metadata available" state.
    API base via `VITE_API_BASE` (defaults same-origin).
  - `apps/web/src/Item.tsx` + `App.tsx` route `/item/:id` (`?name=`).
  - Panel styles appended to `apps/web/src/styles.css`.
- **Tests:**
  - `apps/api/api/handlers.test.ts` — +5 metadata cases (200 fixture-backed, 400×2,
    404, graceful-200-on-throw). Uses `tgdb.bygame.metroidfusion.json`.
  - `apps/web/src/ItemMetadata.test.tsx` — +3 (populated panel, unknown→empty,
    fetch-fail→empty).
- **Gate results (all green):** API **81 passed** (10 files), API typecheck clean,
  web **7 passed** (3 files), web typecheck clean, web `build` succeeds (197 modules).

### Deviation — the plan's assumed web surface did not exist

The plan's "context findings" stated `apps/web` already had a `/browse` catalog and
an `/item/:id` ROM-detail page with a cover mosaic + per-ROM QR, and that the task
was to "add a metadata panel to the existing page." **That surface does not exist on
disk** — `apps/web` had only two routes (`Landing`, `Install`), no item-detail page,
no browse page, and no runtime API fetching at all.

Resolution (within do-not list; recorded here, not silently absorbed): rather than
invent the full cover-mosaic + QR ROM-detail surface (a large unrequested scope
expansion the do-not list forbids), I built the metadata deliverable as intended —
a self-contained `ItemMetadata` panel that fetches the endpoint and renders metadata
+ the graceful empty state — and wired it into a **minimal** `/item/:id` route so the
surface exists and is testable. The endpoint (the plan's real, verifiable core) is
complete. **Flagged for the human gate:** if a full ROM-detail page with cover mosaic
and QR is wanted, that is a separate piece of work.

## Phase 5 — Ship checks ✅

- **All gates green:** API **81** passed, API typecheck clean, web **7** passed,
  web typecheck clean, web `build` succeeds. Re-run at stop point.
- **Key grep:** `git grep 6b371d60` → no match in tracked files (exit 1). No
  `apikey`/`api_key` strings in fixtures.
- **git status:** only untracked `.mastracode/` (session artifacts).
- **Docs:** `apps/api/README.md` updated — added the `GET /api/metadata` endpoint,
  an Environment section documenting `TGDB_API_KEY`, and `handleMetadata` in the
  handler list. (Searched: repo `README.md`, `apps/api/README.md`, `apps/3ds/README.md`
  — the API README is the only endpoint doc.)
- **Live proof:** `.mastracode/plans/rom-archive-metadata.proof/` — `demo.mjs`
  drives the REAL built `dist` artifacts (`resolveMetadata` + `handleMetadata`)
  via a call-counting stub fetch + `InMemoryCache`. `with.txt` captured, all
  markers GREEN: `TGDB:CALLS=1` (budget shield), `CACHE:NEGATIVE tgdb_calls=1`,
  `FALLBACK:LIBRETRO tgdb_calls=0` (no-key AND floored), `UNKNOWN:OK status=200`,
  `ENDPOINT:404`. Rerun: `bash .mastracode/plans/rom-archive-metadata.proof/run.sh`.

### Adversarial review

`adversarial_review` returned an empty body on two attempts (tool/model issue);
no spawnable subagent tool is registered in this session. Per the plan's terminal
fallback ("if neither, the judge performs it"), the judge performed a rigorous
cold self-review of the full diff (`git diff f36a409...HEAD`) against the goal and
do-not list.

- **Scope/do-not:** diff touches only `apps/api` + `apps/web`; no
  `packages/contract`, resolve/plan, QR/console-boundary, or 3DS/C++ changes. No
  byte proxying (results are strings/URLs only). Key never in source/tests/
  fixtures/git. Cache stays behind `MetadataCache`. No new deps. ✅
- **Budget shield:** verified by reading `resolveMetadata` (cache checked first;
  every non-hit path writes a cache entry before returning) AND empirically by the
  proof (`TGDB:CALLS=1` across 5 same-game resolutions). ✅
- **Must fix:** none found.
- **Risks & questions (carried to report):**
  1. `InMemoryCache` is per-instance / cold-start-cleared on Vercel serverless —
     weaker global shield than a shared cache; plan-acknowledged, interface allows
     a later swap.
  2. libretro fallback is title-only (v1 design).
  3. Web defaults API base to same-origin `/api`; separate deploys need
     `VITE_API_BASE`.
- **Web-surface deviation:** judged the right call — building the full
  cover-mosaic/QR ROM-detail surface would be unrequested scope creep against the
  do-not list; the minimal `/item/:id` + `ItemMetadata` panel satisfies the goal
  (metadata on item detail + graceful empty state).

---

## Follow-ups

- **Full `/item/:id` ROM-detail surface** (cover mosaic + per-ROM "Send to 3DS" QR)
  does not exist in `apps/web` despite the plan's context findings claiming it did.
  The metadata panel is wired into a minimal item route; a complete detail page is
  out of this goal's scope and would need its own plan.
- **`vercel.json` `includeFiles`** — the metadata endpoint reads
  `src/fixtures/tgdb.genres.json` relative to source; production relies on Vercel's
  file tracing (same as the existing `catalog.json` handlers). Adding an explicit
  `includeFiles` glob would be belt-and-suspenders. Not required (tracing already
  proven by the shipping catalog handler).
- **Enrich libretro fallback** beyond title-only would need a richer keyless
  source (amendment, not in v1).
