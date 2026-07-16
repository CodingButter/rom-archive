# Progress — Next.js migration (rom-archive)

Governing plan: `.mastracode/plans/rom-archive-nextjs-migration.md`
Branch: `feat/rom-archive-monorepo`
User directive: full autonomous execution, no approval stops (given at plan approval).

---

## Phase 0 — Baseline + reset uncommitted Vite work — ✅ COMPLETE

Baseline gates (pre-migration), all green:
- `pnpm --filter @rom-archive/api test --run` → **81 passed** (10 files)
- `pnpm --filter @rom-archive/api check` → clean
- `pnpm --filter @rom-archive/web test --run` → **11 passed** (5 files)
- `pnpm --filter @rom-archive/web check` → clean

Discarded superseded uncommitted Vite work (proxy + smoke, replaced by the
Next-native smoke suite in Phase 5):
- `git checkout -- apps/web/package.json apps/web/vite.config.ts` (reverted proxy + smoke script)
- removed `apps/web/src/site.smoke.test.ts`
- removed `apps/web/vitest.smoke.config.ts`

Tree after reset: only `.mastracode/` untracked. No commit (baseline only).

Deviations: none.

---

## Phase 1 — Scaffold Next.js app — ✅ COMPLETE (commit `b1fb198`)

Created `apps/site` (registered in `pnpm-workspace.yaml`). Pinned versions:
- Next **15.5.20**, React **19**, Tailwind **v4** (CSS-first `@import "tailwindcss"`
  + `@tailwindcss/postcss`, no `tailwind.config.js`), shadcn **new-york** style
  (Button written directly + `@radix-ui/react-slot`, `cn` util), dark mode via
  `next-themes`, vitest + testing-library (jsdom).
- `@rom-archive/contract` wired as workspace dep via `transpilePackages`.

Gates (all green):
- `pnpm --filter @rom-archive/site check` → clean
- `pnpm --filter @rom-archive/site test --run` → **1 passed** (render smoke)
- `pnpm --filter @rom-archive/site build` → compiled + 4 static pages
- old apps still green: api **81**, web **11**
- `turbo run check --dry` lists `@rom-archive/site` → root orchestration works

Deviations: shadcn components written directly (not via interactive `shadcn add`)
— identical output, avoids the interactive CLI. Recorded as intentional.

## Phase 2 — Move pure domain core + tests — ✅ COMPLETE (commit `95f232a`)

Moved `apps/api/src/*` domain modules + `fixtures/` + `catalog.json` into
`apps/site/src/server/`. Diff of the 9 unchanged modules = **import-extension
strips only** (`.js` → none, for the Vite/Next bundler) — logic byte-identical.

Two intentional Next-runtime adaptations (recorded deviations):
- `catalog.ts`: `readFileSync(../catalog.json)` → `import catalogData from "./catalog.json"`.
- `tgdbGenres.ts`: `readFileSync(fixtures/…)` → `import genresFile from "./fixtures/tgdb.genres.json"`.
  Both because `import.meta.url` + `readFileSync` is fragile under Next's bundler;
  JSON module import is the Next-native equivalent. Behavior unchanged (same cached
  parse, same shape).

Also removed `noUncheckedIndexedAccess` from the site tsconfig — I had added it in
Phase 1, but the moved domain **tests** were authored against the API tsconfig
(which does not set it). Removing it keeps the moved tests behavior-identical
rather than editing faithfully-moved test assertions. Recorded as intentional.

Test count: **67** = 66 moved domain tests + 1 render smoke. The 15 handler tests
(`apps/api/api/handlers.test.ts`) belong to the route-handler boundary → ported in
Phase 3.

Gates: site check clean, test 67 passed, build compiles (JSON module imports
resolve under Next). Committed `95f232a`.

## Phase 3 — Port API endpoints to Next route handlers — ✅ COMPLETE (commits `7446fa5`, `22e9ce9`)

Four App Router route handlers under `apps/site/src/app/api/*/route.ts`, each a
thin adapter over the pure `handle*` core:
- `catalog` GET → `handleCatalog()`.
- `item` GET → `handleItem(searchParams.get("id"), realFetch)`.
- `metadata` GET → `handleMetadata(id, name, { cache, fetchImpl, env })` with a
  module-scoped `InMemoryCache` singleton (warm-invocation scope, identical to old)
  and `TGDB_API_KEY` read only from `process.env`.
- `plan` POST → `handlePlan(await req.json() (catch→undefined), realFetch)`.
- `realFetch` seam re-created at `src/server/realFetch.ts`.

Tests: ported the 15 handler tests verbatim (import paths only) + 15 new
route-boundary tests exercising the `Request`→`Response` adapters (200/400/404/405-
implicit/502/graceful-unknown + bytes-never-proxied guard). Site total: **97**
(66 domain + 15 handler + 15 route + 1 render). Check clean, build compiles all
four routes as dynamic functions.

**Deviation (recorded):** Next auto-returns **405** for unexported methods with an
empty body + `Allow` header, whereas the old Vercel wrappers returned
`{"error":"method not allowed"}` JSON. Status is identical (405); only the 405
body/Content-Type differ. This was never a tested contract (old handler tests
never asserted the 405 body) and no client parses it — harmless wire delta,
accepted.

**Mid-run adversarial review** (anthropic/claude-opus-4-8): **no must-fixes**;
confirmed byte-identical pure core, no key leakage, correct cache scope, wire
parity. Three test-parity nits — all fixed in `22e9ce9` (plan 502 + strict-extra-
key route tests, uniform env stub, title-on-degrade assertion). The 405-body
divergence flagged as the only genuine wire delta → recorded above.

## Phase 4 — Rebuild pages on shadcn/ui — ✅ COMPLETE (commit `ce3207b`)

Four pages ported from the Vite/react-router app to the Next App Router:
- `app/page.tsx` (landing) + `app/install/page.tsx` — server components; install
  reads `CIA_URL` from the new `lib/cia.ts` (App Router forbids arbitrary named
  exports from a page module, so the URL lives in a lib and both page + test
  import it).
- `app/browse/page.tsx` + `app/item/[id]/page.tsx` — `"use client"` components
  that fetch at runtime (`useEffect` + `AbortController`), identical state
  machines to the originals. Item reads the route param via `useParams` from
  `next/navigation`.

Building blocks re-created as client components under `components/`: `qr-code`,
`cover-image`, `item-metadata`, `rom-list`. `lib/`: `consoles`, `cover`
(client-side libretro cover derivation + `scanPointerValue`), `api` (base from
`NEXT_PUBLIC_API_BASE`), `cia`. Added shadcn `card` + `badge` primitives.

**Wire invariant preserved:** the "Send to 3DS" QR still encodes the exact
`ScanPointer` JSON the 3DS parses — bundle `{"v":1,"id":"..."}` and single-file
`{"v":1,"id":"...","file":"..."}`. Both asserted byte-for-byte in the Item test.

Tests: every page/component test ported (router providers swapped for direct
render + a `next/navigation` mock for the Item param). Site total: **108** (67
domain/handler/route + 41 page/component). Check clean; `next build` compiles all
routes — `/`, `/browse`, `/install` static, `/item/[id]` + 4 API routes dynamic.
Old apps untouched (81 API, 11 web) pending removal in Phase 5.

## Phase 5 — Deploy config, smoke suite, remove old apps, proof — ✅ COMPLETE

**Deploy config.** `apps/site/vercel.json` — single-app Vercel project; monorepo
install builds the contract dep first (`turbo run build --filter=@rom-archive/contract`),
Next auto-detected for the app build. `turbo.json` `build` outputs now include
`.next/**` (excluding `.next/cache/**`).

**Turbo ordering fix.** `apps/site`'s `check` (`tsc --noEmit`) reads
`.next/types/**` (App Router route types) which only exist after `next build`.
Added a per-package override `@rom-archive/site#check` → `dependsOn`
`@rom-archive/site#build`, so `turbo run build check test` generates the route
types before typechecking. Verified from a clean `.next`: **6/6 turbo tasks
green** (build, check, test across site + contract).

**Live smoke suite.** `apps/site/vitest.smoke.config.ts` (node env, `*.smoke.test.ts`
only) + `apps/site/src/site.smoke.test.ts`. Opt-in via `SMOKE_BASE_URL`:
- unset → single guard test passes, live checks skipped (CI-safe no-op).
- set → validates `/api/catalog`, `/api/item`, `/api/metadata` against contract
  schemas, unknown-id 404, and `/`, `/browse`, `/item/x` serving HTML.
Proven non-vacuous: bites against a broken base (wrong status / HTML-not-JSON).

**Removed old apps.** Deleted `apps/api` (39 files) and `apps/web` (25 files).
`pnpm-workspace.yaml` now lists only `apps/site`, `apps/3ds`, `packages/*`.
Regenerated `pnpm-lock.yaml` (removed 122 packages). Updated docs: root `README.md`
(topology, install flow, build workspaces, env/smoke dev notes), `apps/3ds/README.md`
(install page path), and `apps/3ds/core/include/rom_archive/router.hpp` comment
(`apps/api/src` → `apps/site/src/server`).

**Live proof.** `next start -p 3400` against the production build, ran
`SMOKE_BASE_URL=http://localhost:3400 pnpm smoke` → **7/7 green**: catalog 200
(contract-valid), item 200, metadata 200 (graceful), unknown-id 404, and `/`,
`/browse`, `/item/x` each 200 HTML. End-to-end proof the migrated stack (route
handlers + moved domain core + shadcn pages) serves correctly on a real Next
server.

**Final gates.** Site: **108** unit tests green (16 files; smoke excluded from
default `test`). `tsc --noEmit` clean. `next build` succeeds. Full monorepo
`turbo run build check test` **6/6 green** from clean `.next`. Key `6b371d60`
never in tracked source (`git grep` exit 1; only appears in plan/progress
markdown check-literals).

**Deviations (recorded):**
- Per-package turbo `check`→`build` dependency for the site (Next route-type
  generation ordering) — not in the original plan; required for `tsc` to see
  `.next/types`. Idiomatic monorepo fix.
- Fixtures live at source next to the modules (`import`-ed as JSON modules), so
  Next bundling ships them — no runtime `readFileSync` (established Phase 2).

## Follow-ups
- `NEXT_PUBLIC_API_BASE` defaults to same-origin; set only if the API is ever
  split to a separate deploy (not needed for the single-app Vercel project).
- InMemoryCache is per-instance (cold-start-cleared on serverless) — acceptable
  for v1; a shared cache (Upstash/@vercel functions cache) is a future upgrade.
