# ROM Archive — Cover Art — Progress

Plan: `.mastracode/plans/rom-archive-cover-art.md`
Branch: `feat/rom-archive-monorepo` (no isolation branch cut — implementing on the monorepo branch)

---

## Phase 0 — Baseline ✅

- **Branch:** `feat/rom-archive-monorepo`
- **Tree state:** clean — `git status --porcelain` shows only `?? .mastracode/` (untracked session artifacts).
- **Gates (actual output, 2026-07-15 ~18:04):**
  - `pnpm --filter @rom-archive/site test -- --run --reporter=dot` → **217 passed (19 files)**, 4.18s.
  - `cd apps/site && pnpm exec vitest run src/lib/cover.test.ts src/server/cover.test.ts --reporter=dot` → **88 passed (2 files)**, 793ms.
  - `pnpm --filter @rom-archive/site check` → **clean** (tsc --noEmit, no output).
- **Failures:** none. Green starting line.
- **Commit:** none (baseline only).

---

## Phase 1 — Client cover derivation for per-game archives ✅

- **Commit:** `fa3f50d` — `fix(site): derive libretro covers for per-game archive filenames`.
- **Change:** `coverUrlFor` in `lib/cover.ts` now branches — archive names strip only
  the single archive extension (new `stripArchiveExtension` helper, exported for the
  test), non-archive names keep `stripExtension`. Removed the `return null` archive
  guard. `extensionOf`/`ARCHIVE_EXTENSIONS` retained to *detect* the archive branch.
  `scanPointerValue`, `LIBRETRO_SYSTEM`, `LIBRETRO_ILLEGAL` untouched.
- **`server/cover.ts`:** untouched (`git diff --stat` lists only `lib/cover.ts` +
  `lib/cover.test.ts`).
- **Gates (actual):**
  - focused: `vitest run src/lib/cover.test.ts src/server/cover.test.ts` → **134 passed (2 files)**.
  - full: `pnpm --filter @rom-archive/site test` → **263 passed (19 files)** (was 217; +46 cover assertions).
  - `check` → clean.
- **Deviation (recorded):** the plan's "shared derivation agrees" pin
  `clientCoverUrlFor(c, name) === serverCoverUrlFor(c, stripArchiveExtension(name))`
  fails for archive names whose **stem contains an interior dot**
  (`already.compressed.zip`, `Super Mario Bros. (World).zip`), because the server's
  own `coverUrlFor` still calls `stripExtension` on its input and double-strips the
  dotted stem (`already.compressed` → `already`). Resolution: the shared-derivation
  pin uses **dot-free** archive stems (so the server's `stripExtension` is a no-op and
  the comparison isolates the console map + illegal-char rule as intended); dotted
  stems are covered instead by the direct-URL assertions that prove the client does
  NOT double-strip (`Super Mario Bros. (World).zip` → `.../Super%20Mario%20Bros.%20(World).png`).
  The final-gate divergence assertion (server null, client non-null) runs for all
  archive names including dotted ones. Stays within `apps/site/src/lib/` — no do-not
  violation.

## Phase 2 — Bundle mosaic cover on the item page ✅

- **Commit:** `d1b6a67` — `feat(site): render up-to-10-tile bundle mosaic cover on item page`.
- **New component:** `apps/site/src/components/bundle-mosaic.tsx` — client-only,
  props `{ id, console, title }`, fetches `fetchItemPage(id, {page:1, pageSize:10})`,
  slices to ≤10 files, derives each tile via `coverUrlFor`, tiles with `CoverImage`.
  Loading = skeleton grid; empty/error = renders nothing (`return null`).
- **Wired into** `app/item/[id]/page.tsx` below the title/badges header, above the
  metadata panel (+5 lines).
- **Test:** `bundle-mosaic.test.tsx` — 6 tests: 12 files → 10 tiles (cap + fetch
  args), 3 files → 3 tiles, no global `fetch`/`/download/` byte call, `.zip` member
  derives exact libretro `src`, absent cover (`onError`) → CoverImage placeholder,
  zero files → renders nothing.
- **Gates (actual):**
  - focused: `vitest run bundle-mosaic.test.tsx item/[id]/page.test.tsx` → **8 passed**.
  - full: `pnpm --filter @rom-archive/site test` → **269 passed (20 files)**.
  - `check` → clean. `build` → exit 0 (10 routes).
- **Scope:** `git status`/`diff --stat` = modified `item/[id]/page.tsx` + two new
  `bundle-mosaic.*` files only. Nothing under `server/`, `api/`, `contract`.

## Phase 3 — Ship checks ✅

- **Docs commit:** `1b0e6f4` — `docs(site): document client cover derivation and bundle mosaic`.
  Added a "Cover art" section to `apps/site/README.md`: client-side derivation by
  stripping the archive extension, partial coverage + placeholder fallback, the
  up-to-10 mosaic, the intentional client/server divergence, and the explicit
  out-of-scope note that the 3DS/CIA cover download is a future plan.
- **Review-fix commit:** `7aec3c0` — `test(site): harden bundle mosaic — full
  effect deps, fetch-rejection coverage`. Closes three low-risk adversarial-review
  observations (exhaustive `useEffect` deps, a fetch-rejection test, a stale
  comment). None were must-fixes.
- **Live proof:** `.mastracode/plans/rom-archive-cover-art.proof/` (`demo.mjs`,
  `run.sh`, `README.md`, `with.txt`, `without.txt`). Drives the REAL client
  `coverUrlFor` (Node native TS strip — no build step) against LIVE archive.org
  filenames and LIVE libretro.
  - **with.txt (branch):** all deterministic markers GREEN — `DERIVE:ZIP`,
    `DERIVE:7Z`, `FALLBACK:NULL-FREE` (9 mapped-console archive names),
    `NO-DOUBLE-STRIP` (dotted title + `Game.v1.2`). Live hit-rate `HITRATE:NES
    34/40 (85%)`, `HITRATE:GBA 39/40 (98%)` — well above the 60% bar.
  - **without.txt (base `fa3f50d^`):** all 5 deterministic markers FAIL (base
    returns null for every full-set archive) — red-on-base carried offline.
  - `run.sh` summary: `PROOF: PASS (green on branch, red on base)`.
- **Final gates (actual):**
  - `pnpm --filter @rom-archive/site test` → **270 passed (20 files)**.
  - `pnpm --filter @rom-archive/site check` → clean. `build` → exit 0.
  - `git status --short` → only `?? .mastracode/` (session artifacts uncommitted).
  - `git diff --stat fa3f50d^..HEAD -- apps/site/` → 6 files: `lib/cover.ts`,
    `lib/cover.test.ts`, `components/bundle-mosaic.tsx`, `bundle-mosaic.test.tsx`,
    `app/item/[id]/page.tsx`, `README.md`. Nothing under `server/`, `api/`,
    `contract`, or `apps/3ds`.
- **Adversarial review (anthropic/claude-opus-4-8):** **no must-fix items.**
  Confirmed: branch-not-chain archive strip correct, `scanPointerValue`
  byte-unchanged, `server/cover.ts` untouched, mosaic no-byte-proxy + tile-cap +
  zero/error states correct, no `data-testid`/RomList/metadata/QR surface
  disturbed, no new deps. Three low-risk observations (incomplete `useEffect`
  deps, missing fetch-rejection test, stale comment) all resolved in `7aec3c0`.

## Phase commits

- `fa3f50d` — Phase 1: fix `coverUrlFor` + rewrite parity test.
- `d1b6a67` — Phase 2: bundle mosaic component + item-page wiring.
- `1b0e6f4` — Phase 3: docs.
- `7aec3c0` — Phase 3: review-fix hardening.

---

## Follow-ups

- **`key={file.name}` in the mosaic** would collide if a bundle ever returned two
  members with identical names. No-Intro names are unique per set, so safe today;
  a latent React key warning only if duplicates ever surface. Not required for the
  goal.
- **Two `fetchItemPage` calls per item-page load** (mosaic `pageSize:10` +
  RomList `pageSize:60`). Independent, both bounded; a shared first-page cache
  could dedupe. Not required — noted in the plan's risks.
