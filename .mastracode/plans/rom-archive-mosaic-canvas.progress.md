# ROM Archive — Bundle Mosaic: Random Sample + Canvas Skewed Plane — Progress

Plan: `.mastracode/plans/rom-archive-mosaic-canvas.md`
Branch: `feat/mosaic-canvas` (cut from `main`; `main` is production, so isolating).

---

## Phase 0 — Baseline ✅

- **Branch:** `feat/mosaic-canvas` — cut clean from `main` (production).
- **Tree state:** `git status --porcelain` → only `?? .mastracode/` (untracked
  session artifacts). No source drift.
- **Gates (actual output, 2026-07-15):**
  - `pnpm --filter @rom-archive/site test -- --run --reporter=dot` →
    **Test Files 20 passed (20)**, **Tests 270 passed (270)**.
  - `pnpm --filter @rom-archive/site check` → clean (tsc --noEmit, exit 0).
- No commit (baseline only).

## Phase 1 — Random-spread sampling + canvas skewed-plane render ✅

- **Commit:** `8779e40` — feat(site): random-spread canvas skewed-plane bundle mosaic.
- **New pure helper:** `apps/site/src/lib/mosaic-sample.ts` — `shuffledPages`
  (full Fisher–Yates permutation, injected RNG), `buildTiles` (dedupe by cover
  URL, null-drop, first-seen, cap at `TILE_CAP=10`), `MAX_FETCHES=14` (probe
  counts against it). DOM-free.
- **Component rewrite:** `bundle-mosaic.tsx` — probe once; small bundle
  (`total <= 10`) uses the probe's files in ONE fetch; large bundle walks the
  permutation one `pageSize:1` page at a time (every fetch a DISTINCT page, top-up
  never re-fetches, bounded by `MAX_FETCHES`). One `<canvas role="img">` with an
  `aria-label` naming the pack cover; DPR-aware; `getContext("2d")` null-guarded;
  each cover loaded via `new Image()` WITHOUT `crossOrigin`; `onload` draws into a
  fixed slot on a receding/rotated plane, `onerror` draws a muted placeholder
  cell; unmount guarded via a `disposed` flag; never calls
  `toDataURL`/`toBlob`/`getImageData`.
- **Tests:**
  - `mosaic-sample.test.ts` (9) — full-permutation distinctness, not-first-10,
    page range `[1,total]`, deterministic under seed, `[]` for `total<=0`,
    simulated top-up walking distinct pages + terminating within `MAX_FETCHES` on a
    colliding set, dedupe/null-drop/cap/first-seen, real `coverUrlFor` default.
  - `bundle-mosaic.test.tsx` (8) — small-bundle SINGLE fetch (pageSize 10), large
    bundle spreads over multiple DISTINCT pages (≤13, not first-10 slice), no
    `/download/` or global-fetch, no `crossOrigin` on created Images (spied
    constructor + injected mock ctx), null-2D-context no-throw renders `<canvas>`,
    draw-vs-placeholder via manual `onload`/`onerror` dispatch, zero-files renders
    nothing, fetch-rejection renders nothing.
- **Gates (actual):**
  - Focused: `bundle-mosaic.test.tsx` + `item/[id]/page.test.tsx` → 10 passed.
  - Full suite → **Test Files 21 passed (21)**, **Tests 280 passed (280)**.
  - `check` (tsc --noEmit) → exit 0. `build` → exit 0, 10 routes.
- **Diff scope:** only the mosaic component + test and the new helper + test.
  Nothing under `server/`, `api/`, `lib/cover.ts`, or `contract`.
- **Deviations / notes:**
  - Next lint emits an advisory serialization warning for the injectable `random`
    prop on the "use client" component. It is NOT a build error (build exits 0);
    the item page never passes `random` (defaults to `Math.random`), only tests
    inject it. Left as-is.
  - jsdom logs a benign "Not implemented: getContext" console.error when the
    component probes for a 2D context (it correctly returns null and the guard
    handles it). Cosmetic stderr only; tests pass. Not suppressed, so the genuine
    null-guard test still exercises the real null path.

## Phase 2 — Ship checks ✅

- **Docs:** `apps/site/README.md` cover-art section rewritten — bundle mosaic now
  described as a random-spread, canvas-stitched skewed plane (not the old first-10
  grid); render-only / no-export rationale documented (libretro has no CORS, so the
  canvas taints and `toDataURL`/`toBlob` would throw — canvas-on-screen only).
- **Live proof:** `.mastracode/plans/rom-archive-mosaic-canvas.proof/`
  (`demo.mjs`, `run.sh`, `README.md`, `with.txt`, `without.txt`).
  `bash run.sh` result:
  - Branch (with helper) — GREEN: `SPREAD` (seeded shuffle first-10 ≠ `[1..10]`,
    full distinct in-range permutation), `DEDUPE` (3 tiles from colliding+null
    input), `BOUND` (fully-colliding set: 14 fetches, 1 tile, 13 distinct pages,
    terminates), `DISTINCT:FIRST10<=2` (2 covers from real captured 007 variants),
    `DISTINCT:RANDOM>=8` (10 covers from a wide real DS name sample).
  - `LIVE:DS` (informational): re-pulled `ni-n-ds-dec_202401` live → 266 `.7z`
    members, first = `007 - Blood Stone (Canada).7z` — corroborates the pathology
    this fix addresses.
  - Base (`8779e40^`, no helper) — RED: `mosaic-sample.ts` absent, demo can't load.
  - `PROOF: PASS (green on branch, red on base)`.
- **Adversarial review** (anthropic/claude-opus-4-8, on implemented change):
  **no must-fix.** Confirmed structurally: no `crossOrigin`, no
  `toDataURL`/`toBlob`/`getImageData`, no byte proxy, `coverUrlFor`/contract/
  handlers untouched, no new deps, `data-testid="bundle-mosaic"` preserved, and
  the critical top-up-never-refetches property holds by design (single-permutation
  walk).
  - Acted on 2 non-blocking items: (1) added a test that an `Image` `onload`
    firing AFTER unmount does not `drawImage` (the disposed-guard path the review
    called the weakest untested spot); (2) corrected a misleading `fixedRandom`
    doc comment that wrongly claimed `random()=0` leaves ascending order.
  - Noted as accepted (not defects): probe result discarded in the spread path
    (one of 14 fetches spent to read `total` — documented, intentional); helper
    top-up test re-implements the walk while the component test exercises the real
    loop (both green).
- **Gates (actual, post-fix):** full suite **281 passed (281)** (21 files),
  `check` (tsc --noEmit) exit 0, `build` exit 0 (10 routes).
- **Commits:** Phase-1 impl `8779e40`; docs + review fixes committed this phase.
- **Diff scope:** only `bundle-mosaic.{tsx,test.tsx}`, `mosaic-sample.{ts,test.ts}`,
  and `apps/site/README.md`. No `server/`, `api/`, `lib/cover.ts`, or `contract`.

---

## Follow-ups

- 3DS-side cover download for full-set archive bundles is still deferred (separate
  future work) — unchanged by this plan.
