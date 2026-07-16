# ROM Archive — Bundle Mosaic: Random Sample + Canvas Skewed Plane

## Goal

The item/bundle-page mosaic stops showing ten near-identical regional variants of
the same title (the current first-10 strategy — the Nintendo DS bundle opens with
ten *007 - Blood Stone* / *Quantum of Solace* variants). Instead it samples a
**random, deduplicated spread** of member ROMs from across the whole bundle, and
renders their box-art as a **single `<canvas>` composite arranged as a skewed,
receding plane** — a slightly rotated flat table of boxart with per-tile offset
and rotation, as if looking across it at an angle. When done: opening any full-set
item (especially `ni-n-ds-dec_202401`) shows a varied set of *different* games'
covers stitched into one tilted plane; missing covers degrade cleanly (skipped or
a subtle placeholder cell, never a broken-image icon or crash); the link-only
invariant holds (covers load from libretro links, no image bytes ever proxied
through our API).

## Scope

**In:**
- **Extract a pure, exported sampling helper** into a new
  `apps/site/src/lib/mosaic-sample.ts` (or a co-located `mosaic-sample.ts`
  beside the component). It is DOM-free and canvas-free: given `total`, a
  `pageSize`, a target count, and an injectable `random: () => number`, it returns
  the distinct page indices to fetch; and given the fetched files + `console` +
  `coverUrlFor`, it returns the deduped, capped list of `{ name, url }` tiles.
  This is the unit-testable core — sampling spread, dedupe, top-up bound, and
  page↔index mapping are all proven here without jsdom's canvas/image gaps. The
  component consumes it.
- Rewrite `apps/site/src/components/bundle-mosaic.tsx`:
  - **Random spread sampling.** Use the pure helper: probe the bundle's `total`
    (one fetch), then fetch member files drawn randomly from across the whole
    range (distinct random pages, or all files for small bundles), dedupe by
    derived cover URL, target up to 10 distinct tiles.
  - **Canvas skewed-plane render.** One `<canvas>` element; load each sampled
    cover as a plain `Image` (NO `crossOrigin` — libretro sends no CORS headers,
    verified 2026-07-15, so `crossOrigin="anonymous"` would make loads fail),
    draw onto the canvas with per-tile transforms producing a receding, rotated
    plane. Failed image loads are skipped or drawn as a placeholder cell. The
    canvas is render-only (it taints; we never call `toDataURL`/`toBlob`).
- Rewrite `apps/site/src/components/bundle-mosaic.test.tsx` for the new behavior
  (sampling spread, dedupe, no-byte-proxy, zero/error states, canvas guarded
  under jsdom).
- Docs touch-up in `apps/site/README.md` if the current cover-art section
  describes the "first 10" strategy (update to "random spread, canvas plane").

**Out:**
- No change to `apps/site/src/lib/cover.ts` `coverUrlFor` (the Phase-1 fix stays;
  the mosaic helper *imports* it but does not modify it),
  `apps/site/src/server/cover.ts`, `resolve.ts`, the API route handlers, the
  `/api/item` pagination contract, `packages/contract`, or `apps/3ds`.
- No new API surface. Sampling uses the existing `fetchItemPage` (`page`/`pageSize`
  are already contract). No new query params, no server-side "random" endpoint.
- **No image-byte proxying.** The canvas composes from libretro links loaded
  directly in the browser. We do NOT add an API image proxy to make the canvas
  exportable — a truly saveable stitched PNG is explicitly declined (would break
  the bytes-never-proxied invariant; user chose canvas-on-screen-only).
- No new runtime dependencies. Plain `<canvas>` 2D API + React only. No WebGL, no
  three.js, no image libraries.
- No change to `scanPointerValue` / QR wire bytes, `RomList`, `ItemMetadata`, or
  any existing `data-testid` outside the mosaic (`bundle-mosaic`, `mosaic-tile`).

## Do-not list

- Do not proxy or fetch image bytes through our API (`/api/...`, `/download/`).
  The mosaic loads libretro URLs directly in the browser and composes client-side.
- Do not set `img.crossOrigin` on libretro images — libretro has no
  `Access-Control-Allow-Origin`; a crossOrigin request would fail to load. This is
  verified, not assumed.
- Do not call `canvas.toDataURL()` / `canvas.toBlob()` / `getImageData()` on a
  canvas that has drawn a libretro image — it is tainted and will throw a
  SecurityError. Render-only.
- Do not add a new API endpoint, query param, or contract field for random
  sampling. Use the existing `fetchItemPage(page, pageSize)`.
- Do not touch `coverUrlFor`, `server/cover.ts`, `resolve.ts`, route handlers,
  `packages/contract`, or `apps/3ds`.
- Do not add dependencies (no three.js/WebGL/image libs). Plain 2D canvas.
- Do not change `scanPointerValue`, `RomList`, `ItemMetadata`, or any
  `data-testid` outside the mosaic component.
- Do not refactor beyond the mosaic component + its test + the one docs line.

## Iteration protocol

- Within the single build phase, iterate freely — canvas transform math and jsdom
  canvas mocking may take several attempts.
- Every retry states a new hypothesis (what the last failure taught, what's
  different now). Never repeat an attempt unchanged.
- Stop trigger is scope violation, not failure count. If the skewed-plane visual
  genuinely can't be achieved without proxying bytes or adding a dep, stop and
  report the blocker rather than working around the do-not list.
- Discovered work triage:
  - Required + small (stays in the mosaic component/test, breaks nothing on the
    do-not list): do it now, note it in the progress file.
  - Required + large (needs an API/contract change, a new dep, or a do-not
    violation): stop and report — a scope violation the user decides on.
  - Not required (pre-existing issues): record in Follow-ups.
- User-directed amendments outrank the plan.

## Context findings (verified live 2026-07-15)

- **Current strategy is first-10.** `bundle-mosaic.tsx` fetches
  `fetchItemPage(id, { page: 1, pageSize: 10 })` and tiles `res.files.slice(0,10)`
  in a CSS `grid grid-cols-5`. The DS bundle's page 1 is ten *007* regional
  variants → visually ten copies of one box.
- **The endpoint already enables a random spread.** `/api/item` returns
  `ItemPageResponse` with `total`, and honors `page`/`pageSize`. Verified: DS
  bundle `total: 266`. Fetching one file each from ten *random* pages returned ten
  genuinely different titles (`50 Classic Games`, `99 no Namida`, `Actua Pool`,
  `The Last Airbender`, `Action Replay DS`, …). One incidental duplicate appeared
  by chance — deduping by derived cover URL and topping up removes it.
- **Pagination mapping (exact, verified against `paginate.ts:55-56`).**
  `start = (page - 1) * pageSize`. For `pageSize: 1`, **page `N` (1-based) returns
  the file at index `N-1`** — page index is NOT equal to file index. Valid page
  range for `pageSize: 1` is `[1, total]` inclusive (page `total` returns the last
  file; page `total + 1` returns an empty slice). The sampler draws random page
  numbers in `[1, total]` and fetches by page — it never converts page→file index
  by hand, so the mapping stays internally consistent; the helper's tests pin this
  boundary (page `total` non-empty, page `total+1` empty) so no off-by-one hole
  reaches the dedupe/top-up loop.
- **libretro has no CORS.** `curl -I` (with and without an `Origin` header)
  returns `200 image/png` and **no `Access-Control-Allow-Origin`**. Therefore:
  plain `<img>`/`Image` loads work; `crossOrigin="anonymous"` loads would FAIL;
  canvas drawing taints; `toDataURL`/`toBlob` would throw. A single exportable
  PNG is impossible without a byte proxy — declined by design. Canvas-on-screen
  (tainted, render-only) is fully fine and is the chosen approach.
- **jsdom canvas + image gap (drives the test architecture).** jsdom's
  `HTMLCanvasElement.getContext` returns `null` by default (no 2D backend), AND a
  jsdom `new Image(); img.src = url` NEVER fires `onload`/`onerror` (no image
  backend, no network). Consequence: **the canvas draw path and per-tile
  placeholder-on-error path do not execute in jsdom automatically.** Therefore the
  plan does NOT claim those pixel behaviors are unit-tested. Instead:
  - The **pure sampling/dedupe helper** (`mosaic-sample.ts`) carries all the
    testable logic — spread, dedupe, top-up bound, page-range mapping — with
    injected randomness. No canvas, no Image, no flakiness.
  - The **component test** asserts what jsdom CAN observe: it uses the pure helper
    (verified separately), issues the expected fetches (spread via injected/spied
    randomness), creates `Image`s WITHOUT `crossOrigin` (spy on the `Image`
    constructor), makes no `/download/` or byte fetch, guards a null 2D context
    without throwing, and renders nothing on zero-files/rejection. To exercise the
    draw + placeholder paths, the test may (a) inject a mock 2D context via a prop
    or a spied `getContext`, and (b) manually dispatch `load`/`error` on the spied
    `Image` instances, asserting the mock ctx received `drawImage` for a loaded
    cover and a placeholder fill (or a skip) for an errored one. If the executor
    judges the manual-dispatch harness too brittle, the placeholder/draw behavior
    is explicitly downgraded to **manual-verify-only** and the plan's prose must
    not claim it is unit-tested — internal consistency over aspiration.
- **CoverImage per-tile `onError` fallback is lost under canvas.** The old grid
  used `CoverImage` whose `onError` collapsed a dead libretro URL to a
  placeholder. A canvas can't do per-`<img>` error UI, so missing covers are
  handled at the draw step: an image that fails to load is skipped or its slot is
  drawn as a muted placeholder rect (see the jsdom note above for how this is —
  or isn't — covered by tests).
- **Gate shapes (proven to run 2026-07-15).**
  - Full site suite: `pnpm --filter @rom-archive/site test -- --run --reporter=dot`
    → 270 passed (20 files).
  - Focused mosaic: `cd apps/site && pnpm exec vitest run src/components/bundle-mosaic.test.tsx --reporter=dot`.
  - Typecheck: `pnpm --filter @rom-archive/site check`. Build:
    `pnpm --filter @rom-archive/site build`.

## Progress file

`.mastracode/plans/rom-archive-mosaic-canvas.progress.md` — created in Phase 0,
updated only at stop points. Per phase: status, commit SHA(s), verification
commands with actual results, deviations, blockers. A Follow-ups section. Never
committed.

---

## Phase 0 — Baseline

**Implementation.** Confirm a green starting line.
- Branch is `main` (cover-art work already merged); cut `feat/mosaic-canvas` from
  it for isolation, or continue on `main` — record which. (Recommend a feature
  branch since `main` is production.)
- `git status --porcelain` shows only `.mastracode/` untracked.
- Create the progress file with baseline results.

**Tests.** None added. Run existing suites.

**Verification gate (run, record actual output):**
- `pnpm --filter @rom-archive/site test -- --run --reporter=dot` → expect 270.
- `pnpm --filter @rom-archive/site check` → clean.

**Commit.** None.

**Stop point.** Update progress with branch, tree state, actual counts.

**Judge criteria.** Branch/clean-tree recorded; both gate commands run with output
captured; full suite 270 passing; any failure classified.

---

## Phase 1 — Random-spread sampling + canvas skewed-plane render

**Implementation.**

*Pure sampling helper (`apps/site/src/lib/mosaic-sample.ts` — new, DOM-free):*
- `TILE_CAP = 10` and `MAX_FETCHES = 14` (hard bound; see #4). The probe fetch
  COUNTS against `MAX_FETCHES` (so the spread path is probe + up to 13 page
  fetches; the ceiling is unambiguous — addresses R1).
- `shuffledPages(total, random): number[]` — returns a full permutation of
  `[1, total]` (Fisher–Yates using the injected `random: () => number`, defaults
  to `Math.random`). Deterministic under a seeded `random`. This produces ONE
  ordering up front, so there is NO cross-call re-draw: the orchestration walks the
  prefix, and top-up simply continues to the NEXT unseen page in the same
  permutation (addresses must-fix A). No rejection sampling, so no spin even when
  `count` approaches `total` (addresses R3).
- `buildTiles(files, console, coverUrlFor): { name: string; url: string }[]` —
  maps files → `{ name, url: coverUrlFor(console, name) }`, DROPS null-deriving
  URLs, DEDUPES by `url`, preserves first-seen order, caps at `TILE_CAP`. Slot
  order is fixed here at sample time (index-stable — addresses the load-order race
  #6; the canvas draws slot `i` for tile `i` regardless of image load order).
- The component orchestrates: probe → `shuffledPages` → walk the permutation,
  fetching one page at a time, running results through `buildTiles`, and stopping
  as soon as `tiles.length === TILE_CAP` OR total fetches reach `MAX_FETCHES` OR
  the permutation is exhausted. Because it walks a single permutation, every fetch
  targets a DISTINCT page — top-up never re-fetches a known page. On a
  fully-colliding set it returns fewer than 10 tiles rather than spinning.

*Component (`apps/site/src/components/bundle-mosaic.tsx`):*
1. Probe once with `{ page: 1, pageSize: TILE_CAP }`. If `total <= TILE_CAP`, that
   single call already returned all files — done in ONE round-trip (addresses #9;
   the probe IS the fetch). Only when `total > TILE_CAP` does it spread by walking
   `shuffledPages(total, random)` with `pageSize: 1` fetches. In the spread path
   the probe result is used ONLY for `total` (its 10 files are not fed to
   `buildTiles`), so the walk's "distinct page per fetch" invariant stays clean and
   pages 1–10 remain eligible in the permutation like any others. Zero files or
   error → render nothing.
2. All fetches share the `AbortSignal`. Bounded by `MAX_FETCHES`.
3. One `<canvas>` with `data-testid="bundle-mosaic"`, DPR-aware backing
   resolution, sized to the header region, plus an `aria-label` naming it the pack
   cover for `title` (canvas has no intrinsic alt).
4. `const ctx = canvas.getContext("2d"); if (!ctx) return;` — guard the null
   (jsdom / unusual browsers). Never throw.
5. For each tile slot, create `new Image()` **without** `crossOrigin`, set `src`;
   `onload` draws it into its FIXED slot on the receding plane (progressively
   scaled/offset rows, slight global rotation, small per-tile jitter → a tilted
   flat plane). Slot is assigned at sample time, so late loads can't scramble the
   layout.
6. `img.onerror` → the slot is skipped or drawn as a muted placeholder rect —
   never a broken tile. On unmount/abort, guard the handlers with an
   `unmounted`/signal check so a post-unmount load does not draw (an `Image` load
   is not abortable by signal; the handler guard is the mechanism — #8).
7. Never call `toDataURL`/`toBlob`/`getImageData` (tainted canvas). Render-only.

*Constraints honored verbatim:* up to 10 distinct tiles, random spread, missing
covers degrade cleanly, composed in-browser from libretro links only — no
`/download/` or API image-byte fetch, not a wire field, does not touch the
contract/QR/console.

**Tests.**

*`apps/site/src/lib/mosaic-sample.test.ts` (new — pure, no jsdom canvas needed):*
- **Spread / permutation:** `shuffledPages(266, seededRandom)` returns a full
  permutation of `[1..266]` (all distinct, every page present), whose first 10
  entries are NOT the slice `[1..10]`. Uses a DETERMINISTIC injected `random` so
  the assertion is never flaky (#5). Confirms every fetched page is distinct (no
  re-draw — addresses must-fix A at the helper level).
- **Page range boundary:** every returned page is in `[1, total]`; none exceeds
  `total` (pins the #1 mapping — page `total` valid, no `total+1` hole).
- **Dedupe + null drop:** `buildTiles` with members whose cover URLs collide
  (regional variants) and some null-deriving → output has no duplicate URL, no
  null, capped at `TILE_CAP`, first-seen order preserved.
- **Top-up walks distinct pages & terminates:** simulate a set where the first
  several permutation pages collide on cover URL → the orchestration continues to
  the NEXT distinct pages in the permutation (never re-fetching a seen page),
  recovers additional distinct tiles when they exist, and on a fully-colliding set
  returns `< TILE_CAP` tiles within `MAX_FETCHES` without spinning (#4 + must-fix A).
- **Small-bundle:** `total <= TILE_CAP` path takes all files from the single probe
  fetch (asserted via the component's single-fetch call — see below).

*`apps/site/src/components/bundle-mosaic.test.tsx` (rewrite; mock `@/lib/api`
`fetchItemPage`, spy the `Image` constructor, inject/seed randomness):*
- **Spread fetches:** large `total` → the component issues multiple `fetchItemPage`
  calls at DIFFERENT page indices (seeded randomness makes this deterministic),
  all DISTINCT (no page re-fetched), and never the forced first-10 slice.
- **Small bundle → one fetch:** `total <= 10` issues exactly ONE `fetchItemPage`
  (`pageSize: 10`) and no `pageSize: 1` spread calls (#9).
- **No byte proxy:** mocked `fetchItemPage` is the only data call; assert no
  `fetch` to `/download/` or any image byte-read from component code (mirror the
  existing bytes-never-proxied pattern). `Image` `src` assignment is not a `fetch`.
- **No crossOrigin:** spy the `Image` constructor; assert NO created image has
  `crossOrigin` set (guards the CORS regression — required, not optional).
- **Canvas guard:** with `getContext` returning null (jsdom default), the
  component does not throw and renders the canvas element per the guard.
- **Zero files / fetch rejection:** renders nothing, never crashes (keep the
  hardening coverage).
- **(Optional) draw/placeholder:** IF the executor injects a mock 2D context and
  manually dispatches `load`/`error` on spied `Image`s, assert `drawImage` for a
  loaded cover and a placeholder fill/skip for an errored one. If judged too
  brittle, this stays MANUAL-VERIFY-ONLY and no test/prose claims it is covered
  (internal consistency — #2).
- Keep `data-testid="bundle-mosaic"`; assert the canvas `aria-label` mentions the
  title (#7).
- Update `apps/site/src/app/item/[id]/page.test.tsx` only if the mosaic change
  disturbs an existing query; keep all existing assertions intact.

**Verification gate:**
- `cd apps/site && pnpm exec vitest run src/components/bundle-mosaic.test.tsx src/app/item/[id]/page.test.tsx --reporter=dot` → all pass.
- `pnpm --filter @rom-archive/site test -- --run --reporter=dot` → all pass
  (count adjusts with rewritten tests; nothing else regresses).
- `pnpm --filter @rom-archive/site check` → clean.
- `pnpm --filter @rom-archive/site build` → succeeds.

**Commit.** `feat(site): random-spread canvas skewed-plane bundle mosaic`

**Stop point.** Progress file with commit SHA, actual output, and confirmation
that `git diff --stat` lists only the mosaic component + its test, the new
`mosaic-sample.ts` + its test, (optionally) the item-page test, and README —
nothing under `server/`, `api/`, `lib/cover.ts`, or `contract`.

**Judge criteria.** The pure helper `mosaic-sample.ts` exists and is unit-tested
(full-permutation spread not-first-10, page range boundary, dedupe/null-drop,
top-up walking DISTINCT pages and terminating within `MAX_FETCHES`); `bundle-mosaic.tsx` consumes it, renders one `<canvas>`
skewed plane, sets no `crossOrigin` (test-pinned), never calls
`toDataURL`/`toBlob`, guards a null 2D context, degrades on missing covers, and
takes the single-fetch small-bundle path; the diff touches only the mosaic
component/test + helper/test + README (+ optional item-page test); focused + full
suites pass; typecheck + build clean; no do-not violation. Spot-check the
no-crossOrigin, no-byte-proxy, and spread tests against the code.

---

## Phase 2 — Ship checks

**Implementation.**
- Re-run every gate.
- **Docs.** Update the WHOLE cover-art section of `apps/site/README.md`, not just
  the "first-10" line: the paragraph describing `CoverImage` collapsing failed
  images to a per-tile placeholder is now false for the mosaic (canvas has no
  per-`<img>` fallback). Describe the mosaic as a random-spread canvas skewed
  plane, and note the render-only canvas / no-export rationale (libretro has no
  CORS) so the invariant is documented. Also update the stale
  `MOSAIC_TILE_CAP`/module-JSDoc "first 10" comments in the component itself so no
  contradictory comment describes the old strategy (#11).
- **Live proof.** A short runnable check in
  `.mastracode/plans/rom-archive-mosaic-canvas.proof/` that:
  - Deterministic (offline): drives the pure `mosaic-sample.ts` helper and asserts
    (`SPREAD`) sampled page indices over `total=266` are not the first-10 slice and
    span a wide range under a seeded random; (`DEDUPE`) URL collisions and nulls
    are removed; (`BOUND`) a fully-colliding input terminates under `MAX_FETCHES`
    with `< 10` tiles. Depend only on code + fixed input.
  - **Offline `DISTINCT` on REAL data (addresses #10):** bake the real captured
    DS-bundle first-10 names (the `007 - Blood Stone` / `Quantum of Solace`
    variants) into a small fixture and assert offline that `buildTiles` over the
    first-10 collapses to ~1-2 distinct covers (`DISTINCT:FIRST10 <n>`) while
    `buildTiles` over a captured WIDER real-name list yields ~10
    (`DISTINCT:RANDOM <n>`). Scope the claim honestly (R2): this proves the
    dedupe/build step COLLAPSES the first-10 and does NOT collapse a diverse real
    input — it is not, by itself, proof that live random sampling is diverse; the
    offline `SPREAD` marker (first-10-slice avoidance) and the live corroboration
    below carry that.
  - Best-effort (network): re-pull live `/api/item` DS names to corroborate the
    fixture. Informational; inconclusive-with-reason if offline.
  - Artifacts: `demo.mjs`, `run.sh`, `README.md`, `with.txt`.
- Light self-review of the branch diff (no debug code, no stray files, no dep
  churn).
- Adversarial review (prompt below); triage findings; re-run if nontrivial.

**Verification gate:**
- Full suite, check, build all green.
- `git status --short` → only intended files.
- `bash .mastracode/plans/rom-archive-mosaic-canvas.proof/run.sh` → `SPREAD`,
  `DEDUPE`, `BOUND`, and offline `DISTINCT:FIRST10`/`DISTINCT:RANDOM` on the real
  captured DS names green; live corroboration recorded (or
  inconclusive-with-reason).

**Commit.** `docs(site): document random-spread canvas mosaic` (docs only).

**Stop point.** Progress file; review handoff. Do not mark the goal complete — go
to the human approval gate.

### Adversarial review — reviewer prompt (verbatim)

> You are a cold, adversarial code reviewer. Review a change on branch
> `feat/mosaic-canvas` (or `main` if the executor did not cut one — check
> `git branch --show-current`) in `/home/codingbutter/rom-archive`.
>
> **Goal:** The bundle-page mosaic (`apps/site/src/components/bundle-mosaic.tsx`)
> previously tiled the FIRST 10 member ROMs in a CSS grid, which on the Nintendo
> DS bundle showed ten regional variants of the same one or two games. The change
> samples a RANDOM, deduplicated spread of members from across the whole bundle
> and renders their box-art as a SINGLE `<canvas>` composite arranged as a skewed,
> receding plane (tilted flat table of boxart).
>
> **Get the diff:** `git log --oneline -6`, then
> `git diff <base>..HEAD -- apps/site/` where `<base>` is the commit before this
> work.
>
> **Do-not list to enforce:** no image-byte proxying (`/api/...`, `/download/`);
> no `img.crossOrigin` on libretro images (libretro has NO CORS — crossOrigin
> loads FAIL); no `canvas.toDataURL`/`toBlob`/`getImageData` on a
> libretro-tainted canvas (throws); no new API endpoint/query param/contract
> field for sampling (must use existing `fetchItemPage`); no changes to
> `lib/cover.ts` `coverUrlFor`, `server/cover.ts`, `resolve.ts`, route handlers,
> `packages/contract`, `apps/3ds`; no new deps (no three.js/WebGL/image libs);
> `scanPointerValue`/QR bytes and all non-mosaic `data-testid`s unchanged.
>
> **Look for:** whether sampling truly spreads (not an off-by-one that still hits
> page 1, not an unbounded top-up loop on collision-heavy sets, and — critically —
> that top-up draws EXCLUDE already-fetched pages so it never re-fetches a known
> page and burns the fetch budget without recovering distinct tiles); dedupe
> correctness (null-deriving members, identical URLs); the canvas guard for a null
> 2D context; whether a failed/missing cover degrades cleanly (no broken tile, no
> throw); load-order races that scramble the layout; any `crossOrigin` set or any
> `toDataURL`/`toBlob` call; any accidental byte proxy; abort/unmount cleanup of
> pending image loads; weak or missing tests (especially the no-crossOrigin and
> no-byte-proxy assertions); scope adherence.
>
> Report as **Must fix / Risks & questions / Suggested improvements**. Inspect
> only — do not edit.

**Judge criteria.** All gates re-pass; README documents the new strategy +
render-only rationale; proof artifacts exist and ran (`SPREAD`/`DEDUPE` green,
`DISTINCT:*` recorded); `git status --short` shows only intended committed files;
adversarial review invoked with the prompt unmodified, findings surfaced
unfiltered, every must-fix resolved or escalated; the judge spot-checks at least
one claim against the code. Then enter waiting (human approval gate).

### Human approval gate

Even with every criterion met, the goal is NOT complete. Final report:
1. Recap: the strategy change (first-10 → random spread), the canvas skewed
   plane, the CORS/taint constraint that forced render-only, notable deviations.
2. Review map: `bundle-mosaic.tsx` first (sampling + canvas transforms), then its
   test (no-crossOrigin + no-byte-proxy + spread assertions).
3. Manual proof: `bash .mastracode/plans/rom-archive-mosaic-canvas.proof/run.sh`.
4. Unfiltered adversarial findings and each resolution.

Offer walkthrough / self-review / approval. Only explicit human approval passes.

**After approval — offer to open a PR** (or merge to `main` + push for
production, matching how the cover-art work shipped), per the user's direction.

## Risks / notes

- **Canvas can't export to a file** because libretro has no CORS and we won't
  proxy bytes. Chosen and accepted (canvas-on-screen-only). Not a defect.
- **Randomness in tests is injected** (seeded `random`), never real `Math.random`,
  so the spread assertion is deterministic — not flaky.
- **Collision-heavy sets** terminate via the `MAX_FETCHES` hard bound and accept
  fewer than 10 distinct tiles rather than looping.
- **Load-order races** are eliminated by assigning each tile a FIXED slot at
  sample time; the canvas draws slot `i` for tile `i` regardless of image load
  order.
- **Draw/placeholder pixel behavior is not unit-testable under jsdom** (null ctx,
  non-firing image loads). The pure helper carries all testable logic; the draw
  path is either exercised via an injected mock ctx + manual event dispatch or
  explicitly manual-verify-only — the plan never claims coverage it doesn't have.
- **Partial coverage remains expected** — some tiles will be placeholders because
  libretro genuinely lacks those dumps.
