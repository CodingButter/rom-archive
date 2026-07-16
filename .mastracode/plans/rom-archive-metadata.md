# Goal-Ready Plan: Game Metadata (TheGamesDB primary + libretro fallback)

Adds a **metadata layer** to the rom-archive API so the web ROM detail page can
show canonical title, platform, release date, genre, overview, and
developer/publisher. Primary source is **TheGamesDB (TGDB)** — a keyed hosted API
with a **hard ~1000 request/month budget**. Because that budget is tiny against
"thousands of ROM pages per console," the design is caching-first: TGDB is hit at
most once per game per long TTL window, with a **keyless libretro fallback** for
misses and quota exhaustion, degrading finally to an "unknown" state that never
errors the page.

## Goal

The rom-archive API exposes a metadata endpoint that, given a curated catalog
`id` and a ROM/item name, returns game metadata sourced from TGDB when available,
libretro identification as fallback, and a graceful "unknown" record otherwise —
with the TGDB API key read only from `TGDB_API_KEY` (never committed) and a cache
that guarantees each distinct game triggers **at most one** TGDB request per TTL
window. The web SPA renders this metadata on `/item/:id` with a graceful empty
state. Done when: the endpoint and its cache/fallback logic are implemented and
tested, the web panel renders metadata and the empty state, the full test suite
and typecheck are green, and no TGDB key string exists in tracked files.

## Scope

**In:** a pure TGDB+libretro metadata client, a budget-aware caching orchestrator,
a Vercel function endpoint following the existing `apps/api/api/*.ts` wrapper
pattern, `console → TGDB platform id` mapping, env/config for the key, and a web
metadata panel on the existing `/item/:id` route.

**Out:** hash-based (md5) matching (TGDB public API is name/platform search);
screenshot galleries / ratings / editorial beyond TGDB's core fields; exposing
metadata to the 3DS, the QR pointer, or the resolve/plan wire contract; a curated
manual-override table for mismatched titles.

Ship in phased commits, with a goal-judge verification stop after every phase.

## Do-not list

Governs the target work only:

- Do not weaken, delete, or skip tests to make verification pass.
- Do not change the shared wire contract (`packages/contract`), the resolve/plan
  responses, or anything that crosses the QR/console boundary. Metadata is
  web-only.
- Do not hardcode the TGDB API key (or any key) in source, tests, fixtures, or
  git. The key is read only from `process.env.TGDB_API_KEY`.
- Do not proxy image or ROM bytes through the API — metadata results are strings
  and URLs only (preserves the existing archiveClient bytes-never-proxied
  invariant).
- Do not add or bump dependencies not named in this plan without stopping to ask.
  (Named/allowed: `@vercel/functions` **only if** Phase C confirms it is the
  runtime-cache path and it is not already available; otherwise none.)
- Do not refactor beyond each phase's stated scope; do not touch the 3DS/C++ core.

## Iteration protocol

- Within a phase, iterate freely — multiple attempts and avenues are expected for
  hard problems.
- Every retry must state a new hypothesis: what was learned from the last failure
  and what is different this time. Never repeat an attempt unchanged.
- The stop trigger is scope violation, not failure count: if a solution requires
  breaking the do-not list, stop and report the blocker instead of working around
  it.
- **Escalation path:** when the implementation diverges from this plan's *design*
  (an ordering that doesn't work, a cache interface that doesn't fit the Vercel
  runtime, a TGDB response shape that doesn't map as specified), stop and consult
  the user before improvising, and record the resolution as a deviation in the
  progress file.
- Discovered work is triaged by two questions — is it required for the goal, and
  does it fit the current phase's scope?
  - Required and small (within the phase's subsystem, breaks nothing on the
    do-not list): do it now, record as a deviation in the progress file.
  - Required but large (needs scope expansion, new phases, or a do-not violation):
    stop and report immediately — the user decides whether to expand the goal.
  - Not required (pre-existing issues, cleanups): record in the progress file's
    **Follow-ups** section and include in the final report. Never silently absorb
    or drop.
- **User-directed amendments:** the user outranks the plan. Amendments file:
  `.mastracode/plans/rom-archive-metadata.amendments.md` — may not exist yet;
  created on the first user-directed amendment. If it exists, its entries are part
  of this contract and extend the judge criteria. Only explicit user direction
  (an imperative or an acceptance) qualifies; a user question is a discussion
  detour, not an amendment. Append the user's request quoted verbatim, what it
  changes, and how the added work will be verified.

## Context findings

Facts established by reading the repo at branch `feat/rom-archive-monorepo`
(commit context: Phase B of the prior scan/covers amendment is committed;
`.mastracode/` is the only untracked path):

- **`apps/web` is a static Vite + React SPA**, not Next.js. It builds to `dist`
  and rewrites all routes to `index.html` (`apps/web/vercel.json`) — client-side
  routing via `react-router-dom`. **There is no SSR, no ISR, no `use cache` on the
  web side.** Consequence: the earlier two-layer "edge-cached page render" design
  does not apply. ALL metadata fetching and caching must live in the **API app**
  (`apps/api`, the Vercel functions), which the SPA calls at runtime. This is
  cleaner — one owner for TGDB, libretro, and the cache.
- **API function pattern:** `apps/api/api/*.ts` are thin Vercel route wrappers
  (`catalog.ts`, `item.ts`, `plan.ts`) over pure handlers in
  `apps/api/src/handlers.ts`; `apps/api/api/_fetch.ts` is the shared fetch;
  `apps/api/api/handlers.test.ts` tests them. The metadata endpoint follows this
  exactly: `apps/api/api/metadata.ts` wrapper → `handleMetadata` in
  `src/handlers.ts`.
- **Handler style:** `HandlerResult<T> = { status, body }`, pure functions with an
  injected `FetchLike`, console derived server-side via `findCatalogEntry(id)`
  (404 on unknown id — same rule metadata must follow). `ArchiveError` carries
  `upstreamStatus`; the metadata client mirrors this with `MetadataError`.
- **Cover title derivation already exists** in `apps/api/src/cover.ts`
  (`coverUrlFor` strips extension + normalizes). Metadata search-title derivation
  reuses/aligns with this so covers and metadata agree on the same title.
- **10 consoles** (`nds gba gb gbc snes nes gg sms md pce`) with a
  `CONSOLE_TO_ROMS_DIR` mapping in `packages/contract`. Metadata adds a parallel
  `console → TGDB platform id` map (API-local, not contract).
- **Test tooling:** vitest in both apps. Verified-runnable gate commands (executed
  during planning, all green): API tests `pnpm --filter @rom-archive/api test --
  --run --reporter=dot` (53 passing), API typecheck `pnpm --filter @rom-archive/api
  check`, web tests `pnpm --filter @rom-archive/web test -- --run --reporter=dot`
  (4 passing).
- **Why TGDB + libretro rather than IGDB:** IGDB requires a Twitch app + phone 2FA
  (rejected by the user as too much friction). TGDB gives a plain key via signup
  but caps at ~1000 req/month. libretro is keyless/uncapped but identification
  only. The chosen design uses TGDB for editorial data within budget and libretro
  as the always-available floor.
- **Security note:** the user pasted a live TGDB key into chat. It is treated as
  compromised; the plan never commits it, and a ship check greps tracked files for
  it. The user has committed to rotating it.

## Progress file

Maintain `.mastracode/plans/rom-archive-metadata.progress.md` (never commit it):

- Created in Phase 0, updated **only at stop points** (phase granularity).
- Per phase: status, commit SHA(s), verification commands run with **actual
  results**, deviations, blockers.
- A **Follow-ups** section for discovered non-required work.
- Ground truth for resuming after a pause or context loss.

---

## Phase 0 — Baseline

**Implementation:**
- Confirm branch is `feat/rom-archive-monorepo` (or create `feat/rom-archive-metadata`
  off it) and working tree is clean except the untracked `.mastracode/`.
- Confirm dependencies are installed / workspace packages built; if a fresh
  worktree, run the repo's documented setup (`pnpm install --frozen-lockfile`)
  before classifying any failure.
- Run the focused gates the later phases use; confirm green **before** any change.
- Create the progress file; record branch, tree state, and baseline test results.
- Classify any pre-existing failure as unrelated or same-domain (root-cause
  same-domain ones).

**Tests for this phase:** none added — this establishes the baseline.

**Verification gate:**
```
git status --porcelain
pnpm --filter @rom-archive/api test -- --run --reporter=dot
pnpm --filter @rom-archive/api check
pnpm --filter @rom-archive/web test -- --run --reporter=dot
```
(All four executed during planning and green: API 53 passing, web 4 passing.)

**Commit:** none (baseline only).

**Stop point:** update progress file with baseline results; report tree state and
test results. Wait for the judge.

**Judge criteria:** Phase 0 is verified when the progress file exists with the
four baseline command results recorded green (or pre-existing failures classified
with root cause), the working tree is clean apart from `.mastracode/`, and the
branch is correct.

---

## Phase 1 — Env config + TGDB platform mapping

**Implementation:**
- `apps/api/src/tgdbPlatforms.ts`: `CONSOLE_TO_TGDB_PLATFORM: Record<Console,
  number | null>`. **Verify each id against a captured `/v1/Platforms` fixture**
  (do not ship guessed ids). Absent/`null` ⇒ TGDB skipped for that console
  (libretro still applies).
- Add `apps/api/fixtures/tgdb.platforms.json` — a captured `/v1/Platforms`
  response used to justify the ids in a test.
- Env documentation: add/extend `apps/api/.env.example` with
  `TGDB_API_KEY=` and a comment (keyed, ~1000 req/month, rotate if leaked).
  Confirm `.env*` except `.env.example` is gitignored (the repo already has
  `apps/api/.gitignore`); add the pattern if missing.

**Tests for this phase:** `apps/api/src/tgdbPlatforms.test.ts` — asserts each
non-null mapped id matches an entry in the platforms fixture, and that all 10
consoles are present as keys (value may be null).

**Verification gate:**
```
pnpm --filter @rom-archive/api test -- --run src/tgdbPlatforms.test.ts --reporter=dot
pnpm --filter @rom-archive/api check
grep -rn "6b371d60" . ; test $? -eq 1   # key must NOT be found in the repo
```

**Commit:** `feat(api): add TGDB platform-id map and metadata env config`

**Stop point:** update progress file; report changed files and command results.
Wait for the judge.

**Judge criteria:** verified when `tgdbPlatforms.test.ts` passes, every non-null
platform id is backed by the fixture, `.env.example` documents the key,
`.gitignore` excludes real `.env` files, typecheck is clean, and the key grep
returns nothing in tracked files. Commit contains only the intended files.

---

## Phase 2 — Metadata client (pure TGDB + libretro fetch/map)

**Implementation:** `apps/api/src/metadata.ts`, pure and injectable-fetch, mirrors
`archiveClient.ts` style:
- `GameMetadata` type: `{ title, platform, releaseDate?, genres?, overview?,
  developer?, publisher?, boxartUrl?, source: "tgdb" | "libretro" | "unknown" }`.
- `deriveSearchTitle(name)` — aligns with `cover.ts` title derivation (strip
  extension, normalize).
- `fetchTgdbMetadata(title, platformId, key, fetchImpl)` → calls TGDB
  `/v1/Games/ByGameName` (name + `filter[platform]`, `apikey` from arg), maps the
  first result to `GameMetadata` (`source: "tgdb"`), returns `{ meta,
  remainingAllowance }` (reads `remaining_monthly_allowance` from the response).
  Zero results ⇒ `meta: null`. Non-OK ⇒ throws `MetadataError(status)`.
- `fetchLibretroMetadata(console, name)` → identification-only fallback: returns a
  minimal `GameMetadata` (`source: "libretro"`, title + platform from the derived
  title/console). Document inline that this is title-only unless a richer keyless
  source is added later.
- `MetadataError extends Error` with `upstreamStatus` (mirrors `ArchiveError`).
- No env access, no caching, no budget logic here.

**Tests for this phase:** `apps/api/src/metadata.test.ts` with fixtures
`apps/api/fixtures/tgdb.bygame.<title>.json` (a real captured `ByGameName`
response for a known GBA title) and a zero-result fixture. Covers: maps a real
result, reads `remainingAllowance`, zero-result → null, non-OK → throws, results
are strings/URLs only (bytes-never-proxied assertion).

**Verification gate:**
```
pnpm --filter @rom-archive/api test -- --run src/metadata.test.ts --reporter=dot
pnpm --filter @rom-archive/api check
```

**Commit:** `feat(api): add TGDB + libretro metadata client`

**Stop point:** update progress file; report. Wait for the judge.

**Judge criteria:** verified when `metadata.test.ts` passes against a **real**
captured fixture (not a synthetic stub), the client never accesses `process.env`,
returns only strings/URLs, throws `MetadataError` on non-OK, and typecheck is
clean.

---

## Phase 3 — Budget-aware cache orchestrator

**Implementation:** `apps/api/src/metadataService.ts`:
- `MetadataCache` interface: `get(key): Promise<GameMetadata | null>`,
  `set(key, value, ttlMs): Promise<void>`.
- `InMemoryCache` implementation (Map + expiry) for tests/local.
- Production cache binding: **confirm during this phase** whether Vercel's runtime
  cache (`getCache` from `@vercel/functions`) is available in this project's plan/
  runtime; if yes, implement a `VercelRuntimeCache` behind `MetadataCache`; if not
  or uncertain, keep `InMemoryCache` as the wired default and record the decision
  as a deviation. Adding `@vercel/functions` is permitted **only** if this
  confirms it is the path (per do-not list).
- `resolveMetadata(console, name, deps)` where `deps = { cache, fetchImpl, env,
  now }`. Flow:
  1. key = `meta:v1:<console>:<normalizedTitle>`; `cache.get` hit (positive OR
     negative) returns immediately.
  2. miss + `env.TGDB_API_KEY` present + last-known allowance above floor →
     `fetchTgdbMetadata`; success ⇒ cache positive (long TTL) + record allowance;
     zero-result ⇒ cache negative (short TTL) then try libretro.
  3. no key / allowance floored / TGDB threw ⇒ `fetchLibretroMetadata`; cache
     result (medium TTL).
  4. nothing ⇒ cache an "unknown" sentinel (short TTL) and return it.
- Constants documented with rationale: positive TTL ~30d, negative ~24h, allowance
  floor ~20.

**Tests for this phase:** `apps/api/src/metadataService.test.ts` — cache hit (no
fetch), miss → TGDB → cached, **negative caching** (a miss does NOT re-hit TGDB
within TTL), allowance floor forces libretro, missing key skips TGDB, TGDB error
falls back to libretro. **Assert the TGDB fetch is called exactly once** across
repeated `resolveMetadata` calls for the same game (the budget shield).

**Verification gate:**
```
pnpm --filter @rom-archive/api test -- --run src/metadataService.test.ts --reporter=dot
pnpm --filter @rom-archive/api check
```

**Commit:** `feat(api): add budget-aware metadata cache orchestrator`

**Stop point:** update progress file (record the Vercel-cache decision); report.
Wait for the judge.

**Judge criteria:** verified when `metadataService.test.ts` passes including the
"TGDB called exactly once for repeated same-game resolutions" and negative-caching
assertions, the cache is behind the `MetadataCache` interface (no Vercel specifics
leak into the service), the allowance-floor and missing-key paths serve libretro,
and typecheck is clean.

### Mid-run adversarial review (this phase)

The cache/budget orchestrator is the structural heart of the goal — review it
before the endpoint and web build on it. Run `adversarial_review` (fall back to a
**non-forked** subagent; if neither, the judge performs it) with `plan_path` =
`.mastracode/plans/rom-archive-metadata.md` and this **verbatim** prompt:

> You are reviewing Phase 3 of a metadata feature on branch
> `feat/rom-archive-monorepo` (or `feat/rom-archive-metadata`) in the rom-archive
> repo. Goal: a budget-aware metadata service where TheGamesDB (hard ~1000
> req/month cap) is hit at most once per game per TTL window, with a keyless
> libretro fallback and an "unknown" floor, so the page never errors. Get the diff
> so far with `git diff feat/rom-archive-monorepo...HEAD -- apps/api/src/metadataService.ts apps/api/src/metadata.ts`
> and read `git log` on those files for prior patterns. Do-not list: no key in
> source/tests/git; no byte proxying; cache stays behind the `MetadataCache`
> interface; no unapproved deps. Amendments file (if present):
> `.mastracode/plans/rom-archive-metadata.amendments.md` — its entries are
> in-contract. Look for: races/logic errors in the cache flow, cases where TGDB
> could be called more than once per game per TTL (budget leak), negative-caching
> gaps, allowance-floor off-by-ones, missing edge cases, weak tests that assert
> less than they claim, dead code, and any drift from the archiveClient patterns.
> Report as Must fix / Risks & questions / Suggested improvements. Inspect only;
> do not edit.

Triage: must-fixes fixed and committed within this phase (re-run the reviewer if
fixes were nontrivial); risks/questions to the final report; improvements to
Follow-ups.

---

## Phase 4 — Endpoint + web metadata panel

**Implementation:**
- `apps/api/src/handlers.ts`: `handleMetadata(id, name, deps)` →
  `HandlerResult<GameMetadata | ErrorBody>`. Derives console via
  `findCatalogEntry(id)` (400 missing id, 404 unknown id — same rules as
  `handlePlan`), calls `resolveMetadata`. **Never throws to the caller on upstream
  failure** — worst case returns an "unknown" `GameMetadata`, because a broken
  metadata source must not break the page.
- `apps/api/api/metadata.ts`: Vercel wrapper following `item.ts`/`plan.ts`,
  injecting the production cache and `process.env` and the shared fetch from
  `_fetch.ts`.
- `apps/web`: on the existing `/item/:id` route, fetch metadata at runtime from
  the new endpoint and render a metadata panel (title, platform, release date,
  genre, overview, dev/publisher, optional boxart). Absent/`unknown` renders a
  graceful "No metadata available" state, never an error. Cover mosaic + QR
  unchanged.

**Tests for this phase:**
- `apps/api/api/handlers.test.ts`: metadata cases — 200 with fixture-backed meta,
  400 on missing id/name, 404 on unknown id, graceful `unknown` on upstream
  failure (fetch throws).
- `apps/web/src/Item.test.tsx` (or the existing item test file): renders the
  metadata panel for a known item and the empty state when metadata is `unknown`.

**Verification gate:**
```
pnpm --filter @rom-archive/api test -- --run api/handlers.test.ts --reporter=dot
pnpm --filter @rom-archive/api check
pnpm --filter @rom-archive/web test -- --run --reporter=dot
pnpm --filter @rom-archive/web check
```

**Commit:** `feat: metadata endpoint and web ROM-detail metadata panel`

**Stop point:** update progress file; report. Wait for the judge.

**Judge criteria:** verified when the metadata handler tests pass (200/400/404 +
graceful-unknown), the endpoint follows the existing wrapper pattern, the web
panel renders metadata and the empty state in its test, and both apps' typecheck
is clean. The endpoint never 5xx's on an upstream metadata failure.

---

## Phase 5 — Ship checks

**Implementation / verification:**
- Re-run every phase's focused gate:
```
pnpm --filter @rom-archive/api test -- --run --reporter=dot
pnpm --filter @rom-archive/api check
pnpm --filter @rom-archive/web test -- --run --reporter=dot
pnpm --filter @rom-archive/web check
```
- `grep -rn "6b371d60" .` over tracked files returns nothing (key never
  committed).
- `git status --short` contains only intended files (plan/progress/amendments
  files are session artifacts — never committed).
- **Docs:** the metadata endpoint is new public API surface. Search the repo's
  docs/README for the endpoint list and add the metadata endpoint + `TGDB_API_KEY`
  env var. A "no docs needed" claim must cite the paths searched.
- **Light self-review sweep** over the full branch diff: leftover debug/TODO,
  commented-out code, stray files, lockfile churn, formatting noise.

**Live proof** (user-observable behavior → required; activate the `prove-it`
skill and follow it). Proof plan: a runnable Node script demo in
`.mastracode/plans/rom-archive-metadata.proof/` that drives `resolveMetadata` and
`handleMetadata` with a stub fetch and the `InMemoryCache`, printing markers that
prove the budget shield and fallbacks:
- `TGDB:HIT` / `TGDB:CALLS=1` — repeated resolutions of the same game issue
  exactly one TGDB fetch.
- `CACHE:NEGATIVE` — a TGDB miss is cached and not re-fetched within TTL.
- `FALLBACK:LIBRETRO` — missing key and floored allowance both serve libretro.
- `UNKNOWN:OK` — no match yields a graceful unknown record, HTTP 200.
Capture the transcript as `with.txt` (feature: working transcript). No recording
needed — the behavior is non-visual and transcript-captured. (The demo is built
alongside Phase 3–4 and run in their gates to prove the change to the executor;
this phase confirms the artifact is current.)

**Adversarial review** (whole-feature, before this phase's stop point). Prefer
`adversarial_review` (fall back to a **non-forked** subagent; if neither, the
judge performs it), `plan_path` =
`.mastracode/plans/rom-archive-metadata.md`, this **verbatim** prompt:

> You are performing a final cold review of a metadata feature on branch
> `feat/rom-archive-monorepo` (or `feat/rom-archive-metadata`) in the rom-archive
> monorepo. Goal: an API metadata endpoint sourcing game metadata from TheGamesDB
> (keyed, hard ~1000 req/month cap) with a keyless libretro fallback and an
> "unknown" floor, cached so each distinct game triggers at most one TGDB request
> per TTL window; a static Vite/React web SPA renders the metadata on `/item/:id`
> with a graceful empty state. Get the full diff with
> `git diff feat/rom-archive-monorepo...HEAD` and read `git log` on the changed
> files for the patterns to match (`apps/api/src/archiveClient.ts`,
> `handlers.ts`, `apps/api/api/*.ts`). Do-not list: no TGDB key in
> source/tests/fixtures/git (grep `6b371d60`); no change to `packages/contract`,
> the resolve/plan responses, or anything crossing the QR/console boundary; no
> byte proxying (results are strings/URLs only); cache behind the `MetadataCache`
> interface; no unapproved deps; no 3DS/C++ changes. Amendments file (if present):
> `.mastracode/plans/rom-archive-metadata.amendments.md` — its entries are
> in-contract, not scope creep. Look for: bugs and logic mistakes, budget leaks
> (any path calling TGDB more than once per game per TTL), missing edge cases,
> unnecessary complexity, weak or misleading tests, dead code and accidental
> churn, brittleness, drift from established file patterns, and scope adherence
> against the goal and do-not list. Report as Must fix / Risks & questions /
> Suggested improvements. Inspect only; never edit.

Triage: must-fixes fixed and committed here (re-run reviewer if nontrivial);
risks/questions to the human report; improvements to Follow-ups.

**Commit:** `chore: metadata feature ship checks (docs, proof, review fixes)`
(only if ship checks produce changes; otherwise no commit).

**Stop point + human approval gate:** even when every criterion is verified, the
goal is **NOT** auto-complete — enter *waiting* (needs user input). Write the
final report as a **review handoff for the user** (cold reviewer):
1. **Recap** (~10 lines): commits, the core behavior (TGDB+libretro+cache, web
   panel), notable deviations (esp. the Vercel-cache decision from Phase 3).
2. **Review map:** commit reading order, which files carry the core decisions
   (`metadataService.ts`, `metadata.ts`, `handlers.ts`), what deserves most
   scrutiny (budget-shield correctness, key handling).
3. **Manual proof:** the demo command and expected markers, referencing
   `.mastracode/plans/rom-archive-metadata.proof/with.txt`.
4. **Unfiltered adversarial findings** (per reviewer when multiple ran) and how
   each was resolved.
Then offer next steps: interactive walkthrough, self-review, or approval — and
explicitly remind the user to **rotate the leaked TGDB key** and set the new value
in the deployment env before production use.

**After approval — offer to open a PR** (activate `new-pr` if available). Do not
open a PR before approval. Once open, if `github_subscribe_pr` exists, subscribe
and follow `pr-follow-through`. Opening the PR does not complete the goal: it
stays open through PR follow-through; complete only when the PR is merged or the
user explicitly confirms done.

**Judge criteria:** verified when all focused gates are green, the key grep is
empty, `git status` shows only intended files, docs are updated (or a
paths-searched justification given), the live-proof `with.txt` exists showing the
budget-shield + fallback markers, and the **review process** held: the reviewer(s)
were invoked with the plan's prompt unmodified, findings appear unfiltered in the
report, every must-fix was resolved or escalated, and the judge spot-checked one
or two findings against the code. The judge must NOT mark complete — it enters
*waiting* for human approval; and if a PR is opened it stays *waiting* through
follow-through, completing only on merge or explicit user confirmation.

---

## Risks / notes

- **TGDB platform ids must be verified** against a live/captured `/v1/Platforms`
  pull before hardcoding — guessed ids silently return wrong-console matches
  (Phase 1 enforces this via fixture-backed tests).
- **libretro fallback is title-only** unless a richer keyless lookup is added —
  the plan assumes this is acceptable for v1. If the user wants richer libretro
  data, that is an amendment.
- **Vercel runtime-cache availability** (`getCache` vs none) is confirmed in
  Phase 3 and hidden behind `MetadataCache`; `InMemoryCache` is the safe default.
  Note: a purely in-memory cache in a serverless function is per-instance and
  cold-start-cleared — acceptable as a floor but weaker as a global budget shield;
  a shared runtime cache is preferred if available. Record the decision.
- **1000/month is genuinely small.** A first crawl of thousands of distinct games
  could exhaust it; the allowance floor + libretro fallback + negative caching
  keep the page functional through exhaustion, degrading to identification-only
  rather than breaking.
- **The pasted TGDB key is compromised** — the plan never commits it, and the user
  must rotate it (reminded at the human gate).
