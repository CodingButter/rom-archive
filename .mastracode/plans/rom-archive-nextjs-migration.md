# Goal-Ready Plan: Migrate the web SPA + standalone API to a single Next.js app (TypeScript + Tailwind v4 + shadcn/ui)

Consolidates the two separate Vercel projects — the static Vite/React SPA
(`apps/web`) and the standalone serverless-functions project (`apps/api`) — into
one **Next.js App Router** application. The API's Vercel `(req,res)` function
wrappers become Next **route handlers** in the same app (one origin, no proxy, no
`VITE_API_BASE`), and the UI is rebuilt on **Tailwind v4 + shadcn/ui** for a
professional portfolio-grade surface. The pure domain core (`archiveClient`,
`metadata`, `metadataService`, `cover`, `sanitize`, `plan`, `catalog`, `tgdb*`)
moves **verbatim** — it was written decoupled from Vercel via the `HandlerResult`
seam, so its 81 tests carry over unchanged.

## Goal

The rom-archive web experience runs as a single Next.js (App Router, TypeScript)
application that serves both the pages and the `/api/*` endpoints from one origin,
styled with Tailwind v4 and shadcn/ui. The existing pages (Landing, Install,
Browse, full Item detail with cover art + per-ROM "Send to 3DS" QR) and the four
API endpoints (`catalog`, `item`, `metadata`, `plan`) all work, the pure domain
logic is preserved with its tests green, a live smoke suite can exercise the app
locally (`next dev`) and against a deployed URL, and the `TGDB_API_KEY` is read
only from the environment. Done when: the Next app builds and typechecks clean,
every ported test plus the new page/route tests pass, `next dev` serves pages and
`/api/*` from one origin with no proxy, the smoke suite passes against a running
`next dev`, the QR/console wire contract is byte-for-byte unchanged, no TGDB key
is in tracked files, and the old `apps/web` (Vite) and `apps/api` (standalone
functions) projects are removed.

## Scope

**In:** a new Next.js App Router app (replacing `apps/web`), Tailwind v4 +
shadcn/ui setup, porting the four API function wrappers to Next route handlers,
moving the pure `src/*` domain modules and their tests into the Next app (or a
shared workspace package), rebuilding the four pages as Next routes/components
using shadcn primitives, porting all component + handler tests, a Next-native
live smoke suite, Vercel deploy config for the single app, and removing the two
old apps.

**Out:** any change to `packages/contract` (the shared wire schemas stay
byte-stable), the resolve/plan response shapes, the 3DS/C++ core, the QR pointer
format, or the metadata budget/cache design (TGDB→libretro→unknown logic is
ported as-is, not redesigned). No new metadata features. No IGDB. No visual
redesign beyond re-expressing the existing pages in shadcn/Tailwind (same
information architecture).

Ship in phased commits, with a goal-judge verification stop after every phase.

## Do-not list

Governs the target work only:

- Do not weaken, delete, or skip tests to make verification pass. Ported tests
  must assert the same behavior; a test that cannot be ported is a blocker to
  report, not to delete.
- Do not change the shared wire contract (`packages/contract`), the resolve/plan
  responses, the QR `ScanPointer` format, or anything crossing the QR/console
  boundary. The 3DS app must keep working against the same JSON.
- Do not hardcode the TGDB API key (or any key) in source, tests, fixtures, or
  git. It is read only from `process.env.TGDB_API_KEY`.
- Do not proxy image or ROM bytes through the API — endpoints return strings and
  URLs only (the bytes-never-proxied invariant is preserved).
- Do not alter the pure domain logic's behavior while moving it. Moving files and
  fixing import paths is in-scope; changing algorithms, TTLs, or budget rules is
  out-of-scope for this migration.
- Do not touch the 3DS/C++ core.
- Do not add dependencies beyond the named stack (`next`, `react`/`react-dom` 19,
  `tailwindcss` v4 + `@tailwindcss/postcss`, shadcn/ui and its Radix/`clsx`/
  `tailwind-merge`/`class-variance-authority`/`lucide-react` deps, `next-themes`
  for dark mode, `qrcode`, `vitest` + testing-library, `@vercel/node` types only
  if still needed) without stopping to ask.

## Iteration protocol

- Within a phase, iterate freely — multiple attempts and avenues are expected for
  hard problems (Tailwind v4 + shadcn wiring in a monorepo is the likeliest snag).
- Every retry must state a new hypothesis: what was learned from the last failure
  and what is different this time. Never repeat an attempt unchanged.
- The stop trigger is scope violation, not failure count: if a solution requires
  breaking the do-not list (e.g. editing the contract to make a page compile),
  stop and report the blocker instead of working around it.
- **Escalation path:** when the implementation diverges from this plan's *design*
  (a domain module that cannot move without a behavior change, a route-handler
  shape that cannot preserve the wire response, a shadcn/Tailwind incompatibility
  with the monorepo), stop and consult the user before improvising, and record the
  resolution as a deviation in the progress file.
- Discovered work is triaged by two questions — is it required for the goal, and
  does it fit the current phase's scope?
  - Required and small (within the phase's subsystem, breaks nothing on the
    do-not list): do it now, record as a deviation in the progress file.
  - Required but large (needs scope expansion, new phases, or a do-not violation):
    stop and report immediately.
  - Not required (pre-existing issues, cleanups): record in the progress file's
    **Follow-ups** section and include in the final report.
- **User-directed amendments:** the user outranks the plan. Amendments file:
  `.mastracode/plans/rom-archive-nextjs-migration.amendments.md` (created on the
  first user-directed amendment). If it exists, its entries are part of this
  contract and extend the judge criteria.

## Context findings

Facts established by reading the repo at branch `feat/rom-archive-monorepo`:

- **`apps/web` is a plain Vite + React 18 SPA** — `react-router-dom` routing,
  `vite build` to static `dist`, `vercel.json` rewrites all routes to
  `index.html`. Pages: `Landing`, `Install`, `Browse`, `Item` (full detail:
  metadata panel + whole-item QR + per-ROM list with covers + per-ROM QR),
  plus `QrCode`, `CoverImage`, `RomList`, `ItemMetadata`, `consoles.ts`,
  `cover.ts`, `api.ts`. Component tests use vitest + testing-library with jsdom
  and stubbed `fetch`.
- **`apps/api` is a standalone Vercel functions project** — `api/*.ts` are thin
  `(req,res)` wrappers (`catalog.ts`, `item.ts`, `metadata.ts`, `plan.ts`) over
  **pure** `handle*` functions in `src/handlers.ts` returning
  `HandlerResult<T> = { status, body }`. `api/_fetch.ts` provides `realFetch`
  narrowed to the `FetchLike` seam. This decoupling is the migration's leverage:
  the wrappers are ~15 lines each and trivially become Next route handlers; the
  pure core is framework-agnostic already.
- **Pure domain modules** (`src/`): `archiveClient`, `catalog`, `cover`,
  `metadata`, `metadataService`, `plan`, `resolve`, `sanitize`, `tgdbGenres`,
  `tgdbPlatforms`, plus fixtures and `catalog.json`. 81 API tests, 11 web tests,
  both typechecks clean at migration start (verified).
- **`packages/contract`** exports the wire schemas (`CatalogEntry`,
  `ItemDetailResponse`, `DownloadPlanResponse`, `ScanPointer`, `ResolveResponse`,
  `Console`, etc.) and is consumed by web, api, AND the 3DS build. It is frozen —
  untouched by this migration.
- **Tooling (confirmed current, 2026):** Next.js 15 App Router; Tailwind **v4** is
  the recommended choice for new projects — CSS-first `@theme` config, automatic
  content detection, `@import "tailwindcss"` replacing the old `@tailwind`
  directives, no `tailwind.config.js` needed. shadcn/ui fully supports Tailwind v4
  + React 19 with the `new-york` style as default and `data-slot` attributes on
  primitives. `next-themes` handles dark mode. shadcn is initialized via
  `npx shadcn@latest init` and components added with `npx shadcn@latest add`.
- **Turborepo:** root `turbo run build|test|check|lint` orchestrates the
  workspaces; the new app must register the same `build`/`test`/`check` scripts so
  root orchestration and Vercel's `turbo` build filter keep working.
- **Uncommitted pre-migration work** (Vite dev proxy in `vite.config.ts`, a
  `*.smoke.test.ts` + `vitest.smoke.config.ts`, a `smoke` script) targets the
  old Vite app and is **superseded** by this migration — Phase 0 discards it, but
  the smoke-test *concept* is re-created Next-native in a later phase.

## Progress file

Maintain `.mastracode/plans/rom-archive-nextjs-migration.progress.md` (never
commit it):

- Created in Phase 0, updated **only at stop points** (phase granularity).
- Per phase: status, commit SHA(s), verification commands run with **actual
  results**, deviations, blockers.
- A **Follow-ups** section for discovered non-required work.
- Ground truth for resuming after a pause or context loss.

---

## Phase 0 — Baseline + reset uncommitted Vite work

**Implementation:**
- Confirm branch, clean tree except `.mastracode/` and the known uncommitted Vite
  smoke/proxy files.
- Run the current gates green as the pre-migration baseline: API tests (81), web
  tests (11), both typechecks.
- **Discard the superseded uncommitted Vite work** (`apps/web/vite.config.ts`
  proxy change, `apps/web/vitest.smoke.config.ts`, `apps/web/src/site.smoke.test.ts`,
  the `smoke`/proxy edits to `apps/web/package.json`) — `git checkout`/`clean`
  only those specific paths, nothing else. Record exactly what was discarded.
- Create the progress file with the baseline results.

**Tests for this phase:** none added — baseline only.

**Verification gate:**
```
git status --porcelain
pnpm --filter @rom-archive/api test -- --run --reporter=dot
pnpm --filter @rom-archive/api check
pnpm --filter @rom-archive/web test -- --run --reporter=dot
pnpm --filter @rom-archive/web check
```

**Commit:** none (baseline + local reset only).

**Stop point:** progress file with baseline recorded; report tree state, test
results, and exactly which uncommitted files were discarded. Wait for the judge.

**Judge criteria:** verified when the four gate commands are recorded green, the
uncommitted Vite smoke/proxy files are gone, the tree is otherwise clean apart
from `.mastracode/`, and the progress file exists.

---

## Phase 1 — Scaffold the Next.js app (TS + Tailwind v4 + shadcn/ui) alongside the old apps

**Implementation:**
- Create `apps/site` (new Next.js App Router app; keeping `apps/web` temporarily
  so the migration is reversible until Phase 5). Use TypeScript, App Router,
  `src/` dir, `@/*` alias, Tailwind v4. React 19 to match shadcn defaults.
- Initialize Tailwind v4 (CSS-first: `@import "tailwindcss"` in
  `src/app/globals.css`, `@tailwindcss/postcss` in postcss config) and shadcn/ui
  (`npx shadcn@latest init`, `new-york` style, dark mode via `next-themes`).
- Register `build` (`next build`), `check` (`tsc --noEmit`), `test` (`vitest run`),
  and a `dev` (`next dev`) script so root turbo orchestration works. Wire
  `@rom-archive/contract` as a workspace dep.
- Add a single shadcn smoke component (e.g. Button) on a placeholder home route to
  prove Tailwind + shadcn render and build.
- Set up vitest + testing-library for the Next app (jsdom, RTL, same setup file
  pattern as the old web app).

**Tests for this phase:** one trivial render test asserting the placeholder home
route renders the shadcn Button (proves the toolchain end-to-end).

**Verification gate:**
```
pnpm --filter @rom-archive/site build
pnpm --filter @rom-archive/site check
pnpm --filter @rom-archive/site test -- --run --reporter=dot
pnpm --filter @rom-archive/api test -- --run --reporter=dot   # old apps still green
pnpm --filter @rom-archive/web test -- --run --reporter=dot
```

**Commit:** `feat(site): scaffold Next.js app with Tailwind v4 and shadcn/ui`

**Stop point:** progress file update; report the scaffold, the pinned versions
(Next/React/Tailwind/shadcn), and the smoke render result. Wait for the judge.

**Judge criteria:** verified when the Next app builds, typechecks, and its smoke
render test passes; Tailwind v4 + shadcn are wired CSS-first (no legacy
`tailwind.config.js` requirement) with dark mode; root turbo scripts recognize the
app; the old apps are still green; and pinned versions are recorded.

---

## Phase 2 — Move the pure domain core + its tests into the Next app

**Implementation:**
- Move the framework-agnostic domain modules and their tests from `apps/api/src`
  into the Next app (e.g. `apps/site/src/server/`): `archiveClient`, `catalog`,
  `cover`, `metadata`, `metadataService`, `plan`, `resolve`, `sanitize`,
  `tgdbGenres`, `tgdbPlatforms`, plus `fixtures/` and `catalog.json`.
- Fix only import paths and fixture-load paths — **no behavior changes**. Preserve
  the `HandlerResult`/`FetchLike` seams and the `handle*` functions verbatim.
- Confirm fixture/`catalog.json` reads resolve under Next's server runtime (Next
  traces server file reads like Vercel did; verify the read path).

**Tests for this phase:** all 81 API-domain tests ported and passing unchanged in
the Next app's vitest (handlers, metadata, metadataService, cover, plan, resolve,
sanitize, archiveClient, catalog, tgdbPlatforms). No assertions weakened.

**Verification gate:**
```
pnpm --filter @rom-archive/site test -- --run --reporter=dot   # includes the 81 ported
pnpm --filter @rom-archive/site check
```

**Commit:** `refactor(site): move pure domain core and tests into the Next app`

**Stop point:** progress file update; report the moved files and the ported test
count (must equal 81 domain tests + Phase 1's render test). Wait for the judge.

**Judge criteria:** verified when every domain test passes in the Next app with
**no** weakened assertions, the `handle*` functions and pure modules are unchanged
in behavior (diff shows only path/import edits), fixtures load under Next, and
typecheck is clean.

---

## Phase 3 — Port the four API endpoints to Next route handlers

**Implementation:**
- Create App Router route handlers under `apps/site/src/app/api/*/route.ts` for
  `catalog`, `item`, `metadata`, `plan`, each a thin adapter: parse the Next
  `Request` (query/JSON body), call the corresponding `handle*` pure function with
  `realFetch` (and, for metadata, the module-level `InMemoryCache` singleton +
  `process.env.TGDB_API_KEY`), and return `Response.json(body, { status })`.
- Preserve method guards (405 on wrong method), query param handling, and the
  exact response bodies. `metadata` keeps the warm-invocation `InMemoryCache`
  singleton and the graceful-`unknown` floor.
- Keep `realFetch`/`FetchLike` seam so nothing stubs globals.

**Tests for this phase:** route-handler tests (Next-native: invoke the exported
`GET`/`POST` with a constructed `Request`) covering, per endpoint, the same cases
the old wrappers/handlers covered: 200 happy path (fixture-backed), 400
missing-param, 404 unknown id, 405 wrong method, and metadata's graceful-`unknown`
on upstream failure + bytes-never-proxied guard.

**Verification gate:**
```
pnpm --filter @rom-archive/site test -- --run --reporter=dot
pnpm --filter @rom-archive/site check
grep -rn "6b371d60" apps/site ; test $? -eq 1   # key never present
```

**Commit:** `feat(site): port catalog/item/metadata/plan to Next route handlers`

**Stop point:** progress file update; report the four routes and the handler-test
results. Wait for the judge.

**Judge criteria:** verified when all four route handlers return the same status +
body shapes as the old wrappers (proven by tests: 200/400/404/405 + graceful
unknown), the metadata cache singleton and key-from-env behavior are preserved,
the bytes-never-proxied guard passes, no key appears in `apps/site`, and typecheck
is clean.

### Mid-run adversarial review (this phase)

The route-handler boundary is where the wire contract could silently drift —
review it before the pages build on it. Run `adversarial_review` (fall back to a
**non-forked** subagent; if neither, the judge performs it) with `plan_path` =
`.mastracode/plans/rom-archive-nextjs-migration.md` and this **verbatim** prompt:

> You are reviewing Phase 3 of a Next.js migration on branch
> `feat/rom-archive-monorepo` in the rom-archive repo. The prior standalone Vercel
> API (`apps/api/api/*.ts` thin `(req,res)` wrappers over pure `handle*` functions
> in `handlers.ts` returning `{status, body}`) is being reimplemented as Next App
> Router route handlers in `apps/site/src/app/api/*/route.ts`. Goal: identical wire
> responses (status codes and JSON bodies) for `catalog`, `item`, `metadata`,
> `plan`, so the 3DS app and web keep working unchanged. Get the diff with
> `git diff feat/rom-archive-monorepo...HEAD -- apps/site/src/app/api apps/api/api`
> and compare each new route handler against the old wrapper it replaces. Do-not
> list: no key in source/tests (grep `6b371d60`); no byte proxying (bodies are
> strings/URLs only); no change to `packages/contract` or the resolve/plan/QR wire
> shapes; the metadata graceful-`unknown` floor and warm `InMemoryCache` singleton
> and key-from-env must be preserved; no behavior change to the pure core. Look
> for: response-shape drift (status or body differences vs the old wrapper),
> missing method guards, query/body parsing bugs (array-valued query params, JSON
> body parse), cache singleton scope mistakes, key leakage, and weak tests that
> assert less than the old handler tests did. Report as Must fix / Risks &
> questions / Suggested improvements. Inspect only; do not edit.

Triage: must-fixes fixed and committed within this phase (re-run the reviewer if
fixes were nontrivial); risks/questions to the final report; improvements to
Follow-ups.

---

## Phase 4 — Rebuild the four pages as Next routes with shadcn/ui

**Implementation:**
- Rebuild the pages as App Router routes, same information architecture, now with
  Tailwind v4 + shadcn primitives (Card, Button, Badge, Skeleton, etc.) and dark
  mode via `next-themes`:
  - `/` Landing (intro + supported consoles + link to Browse).
  - `/install` FBI install QR page.
  - `/browse` catalog grouped by console, linking to items.
  - `/item/[id]` full detail: metadata panel, whole-item "Send to 3DS" QR, and the
    per-ROM list with libretro cover art + per-ROM single-file QR.
- Same-origin data fetching (no `VITE_API_BASE`, no proxy) — pages/components call
  `/api/*` on the same origin. Client components for the interactive bits (QR
  toggles, fetch-on-mount); server components where a static render suffices.
- Port `QrCode` (encodes the versioned `ScanPointer` verbatim), `CoverImage`
  (graceful fallback), the console labels, and the client-side cover-URL helper.
- Keep the QR-encoded pointer JSON byte-identical to today's
  (`{"v":1,"id":...}` / `{"v":1,"id":...,"file":...}`).

**Tests for this phase:** port + adapt the component/page tests to the Next app:
Landing (one item per contract console), Install (QR encodes the configured CIA
URL), Browse (grouped list + links, graceful failure), Item (catalog-derived
title, whole-item bundle-pointer QR, per-ROM row + single-file-pointer QR on
toggle, unknown-item state), ItemMetadata (populated panel, graceful empty/unknown,
never-throws on failure). No assertions weakened; QR-value assertions must check
the exact pointer JSON.

**Verification gate:**
```
pnpm --filter @rom-archive/site test -- --run --reporter=dot
pnpm --filter @rom-archive/site check
pnpm --filter @rom-archive/site build
```

**Commit:** `feat(site): rebuild landing/install/browse/item pages on shadcn/ui`

**Stop point:** progress file update; report the pages, the ported test count, and
the build result. Wait for the judge.

**Judge criteria:** verified when all four pages render and their ported tests pass
with unchanged assertions, the QR pointer JSON is byte-identical to the current
app (asserted in tests), fetching is same-origin with no proxy/base-URL, dark mode
works, the app builds, and typecheck is clean.

---

## Phase 5 — Deploy config, smoke suite, remove old apps

**Implementation:**
- Add the single-app Vercel config for `apps/site` (App Router build; `/api/*`
  served as route handlers from the same origin). Document `TGDB_API_KEY` in the
  app's `.env.example` and ensure `.env*` (except `.env.example`) is gitignored.
- Re-create the **live smoke suite** Next-native (opt-in via `SMOKE_BASE_URL`):
  hits `/api/catalog`, `/api/item`, `/api/metadata`, an unknown-id 404, and the
  SPA routes (`/`, `/browse`, `/item/x`) returning HTML 200 — validating shapes
  against `packages/contract`. No-op when the env var is unset; proven to fail
  when pointed at a broken base. Add a `smoke` script.
- **Remove the old apps:** delete `apps/web` (Vite) and `apps/api` (standalone
  functions) once `apps/site` fully subsumes them. Update root workspace config,
  turbo pipeline, and any root docs/README referencing the old apps. Confirm
  `packages/contract` and the 3DS build are untouched.
- Update docs/README: the app is now a single Next.js project; document the
  endpoints, the `TGDB_API_KEY` env var, `next dev`, and the smoke command.

**Tests for this phase:** the smoke suite (no-op green without a base URL; run once
against a live `next dev` to prove pages + `/api/*` work end-to-end from one
origin, capturing the transcript).

**Verification gate:**
```
pnpm --filter @rom-archive/site test -- --run --reporter=dot
pnpm --filter @rom-archive/site check
pnpm --filter @rom-archive/site build
pnpm --filter @rom-archive/site smoke            # no-op green (no SMOKE_BASE_URL)
turbo run build check test                        # whole monorepo, old apps gone
grep -rn "6b371d60" . ; test $? -eq 1
git status --short
```

**Live proof** (user-observable → required; activate `prove-it`). Start
`next dev`, then run the smoke suite with `SMOKE_BASE_URL=http://localhost:3000`
and capture the transcript to
`.mastracode/plans/rom-archive-nextjs-migration.proof/with.txt`, showing:
- `API:CATALOG:200` + contract-valid catalog from the same origin (no proxy),
- `API:ITEM:200` and `API:METADATA:200` (source ∈ tgdb|libretro|unknown),
- `API:ITEM:404` for an unknown id,
- `PAGE:200` for `/`, `/browse`, `/item/x` serving the Next app.
Also capture a `next dev` screen/recording of Browse → Item showing the shadcn UI,
cover art, and a per-ROM QR, per the `prove-it` rubric. Include a red/green pair:
the smoke suite failing against a bogus base URL (proving it bites) vs. passing
against `next dev`.

**Whole-feature adversarial review** (before this phase's stop point). Prefer
`adversarial_review` (fall back to a **non-forked** subagent; if neither, the
judge performs it), `plan_path` =
`.mastracode/plans/rom-archive-nextjs-migration.md`, this **verbatim** prompt:

> You are performing a final cold review of a Next.js migration on branch
> `feat/rom-archive-monorepo` in the rom-archive monorepo. The prior architecture
> (a static Vite/React SPA `apps/web` plus a standalone Vercel functions project
> `apps/api`) has been consolidated into one Next.js App Router app `apps/site`
> using TypeScript, Tailwind v4, and shadcn/ui; the API function wrappers are now
> Next route handlers sharing the origin; the pure domain core moved unchanged.
> Get the full diff with `git diff feat/rom-archive-monorepo...HEAD` and read the
> old `apps/web`/`apps/api` at the base commit for the behavior that had to be
> preserved. Do-not list: no change to `packages/contract`, the resolve/plan
> responses, or the QR `ScanPointer` JSON (the 3DS app depends on these); no byte
> proxying (endpoints return strings/URLs); no TGDB key in tracked files (grep
> `6b371d60`); no behavior change to the ported domain core; no 3DS/C++ changes;
> only the named dependency stack. Look for: wire-response drift on any of the four
> endpoints vs the old wrappers, QR pointer JSON drift, domain logic accidentally
> changed while moving, weak or missing ported tests, cache-singleton scope
> mistakes, key leakage, dead code and accidental churn, leftover references to the
> deleted apps, broken root turbo/Vercel config, and scope adherence against the
> goal and do-not list. Report as Must fix / Risks & questions / Suggested
> improvements. Inspect only; never edit.

Triage: must-fixes fixed and committed here (re-run reviewer if nontrivial);
risks/questions to the human report; improvements to Follow-ups.

**Commit:** `feat(site): single-app Vercel config, live smoke suite, remove old
web+api apps` (plus a docs commit if separate).

**Stop point + human approval gate:** even when every criterion is verified, the
goal is **NOT** auto-complete — enter *waiting* (needs user input). Write the final
report as a review handoff:
1. **Recap** (~10 lines): commits, the before/after architecture (two apps → one
   Next app), notable deviations.
2. **Review map:** commit reading order; the files carrying the core decisions
   (route handlers, moved domain core, page components); what deserves most
   scrutiny (wire-response parity, QR pointer parity, key handling).
3. **Manual proof:** `next dev` + the smoke command and expected markers,
   referencing the proof transcript and recording.
4. **Unfiltered adversarial findings** and how each was resolved.
Then offer next steps (interactive walkthrough, self-review, or approval) and
remind the user to set `TGDB_API_KEY` in the new single-project deploy env and to
rotate the previously-leaked key.

**After approval — offer to open a PR** (activate `new-pr`). Do not open before
approval. Once open, subscribe via `github_subscribe_pr` if available and follow
`pr-follow-through`; the goal completes only on merge or explicit user
confirmation.

**Judge criteria:** verified when the whole monorepo builds/checks/tests green with
the old apps removed, the smoke suite is no-op green (and proven to bite), the live
proof transcript + recording exist showing same-origin pages + `/api/*`, the QR
pointer JSON and the four endpoint responses match the pre-migration behavior, no
key is in tracked files, `git status` shows only intended files, docs are updated,
and the review process held (reviewer invoked with the plan's prompt unmodified,
findings unfiltered, must-fixes resolved, judge spot-checked findings). The judge
must NOT mark complete — it enters *waiting* for human approval; if a PR opens it
stays *waiting* through follow-through.

---

## Risks / notes

- **Tailwind v4 + shadcn in a pnpm/turbo monorepo** is the likeliest friction
  (PostCSS wiring, `@import "tailwindcss"` content detection, the `@/*` alias).
  Phase 1 isolates this so it's proven before any real UI is built.
- **The pure-core move must be behavior-preserving.** The diff for Phase 2 should
  be import/path edits only; any algorithmic change is a scope violation.
- **Wire parity is the whole point.** The 3DS app and the contract are the
  contract; Phases 3–4 assert the endpoint bodies and QR pointer JSON are
  byte-identical. Any drift is a must-fix, not a follow-up.
- **`next dev` vs Vercel runtime for fixture reads:** verify server-side
  `catalog.json`/fixture reads resolve under Next; if Next's file tracing differs,
  record the fix (e.g. import the JSON as a module) as a deviation.
- **Reversibility:** the old apps live until Phase 5, so every phase before removal
  is reversible and independently green.
- **The previously-leaked TGDB key** must be rotated and set in the new
  single-project deploy env (reminded at the human gate).

---
