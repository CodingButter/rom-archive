# ROM Archive — Make Cover Art Work on the Website

## Goal

Every ROM in the full-set catalog that libretro actually has box art for shows a
real cover on the website, instead of the 🎮 placeholder tile it shows today. The
item/bundle page additionally renders the **stitched mosaic cover** the original
scan-covers spec called for — up to 10 member ROMs' covers tiled into one pack
image. When this is done: opening any full-set item (e.g. `No-Intro_NES`) shows
real box art for the large majority of recognizable ROMs in the list and a
multi-tile mosaic in the header; titles libretro genuinely lacks fall back to the
placeholder cleanly (no broken-image icons). Website-display only — the 3DS/CIA
download path is untouched and explicitly deferred to a later plan.

## Scope

**In:**
- Fix `apps/site/src/lib/cover.ts` `coverUrlFor` so per-game archive filenames
  (`.zip`/`.7z`, as used by every full-set No-Intro bundle) derive a libretro
  thumbnail URL from the inner title stem instead of returning `null`.
- Build the spec'd **bundle mosaic** as a new client-only component on the
  item/bundle page: up to the first 10 member ROMs' derived cover URLs tiled into
  one pack image, placeholder for missing/absent tiles.
- Update the client/server cover parity test to an **intentional-divergence**
  test that documents why the two files now differ.
- Docs note + live proof.

**Out:**
- Any change to `apps/site/src/server/cover.ts`, `resolve.ts`, the resolve/plan
  wire contract, or the 3DS download/cover-placement path. The on-device cover
  download is a separate future plan (the user confirmed: once the website proves
  the derivation, the CIA-side change is trivial and done separately).
- Any change to the API, route handlers, `packages/contract`, or `apps/3ds`.
- No new runtime dependencies. No image proxying — the mosaic composes from
  libretro links in the browser; the bytes-never-proxied invariant holds.

Ship in phased commits, with a goal-judge verification stop after every phase.

## Do-not list

- Do not weaken, delete, or skip tests to make verification pass. The parity test
  is *rewritten* to assert an intentional divergence with a documented rationale —
  it is not deleted or loosened into a no-op.
- Do not change public contracts/interfaces beyond what this plan states. No
  changes to `packages/contract`, the API wire shapes, or the QR `ScanPointer`
  JSON bytes.
- Do not touch `apps/site/src/server/cover.ts`, `server/resolve.ts`, or anything
  under `apps/site/src/app/api/` or `apps/site/src/server/`. This is a
  client-display-only change.
- Do not modify `scanPointerValue` in `lib/cover.ts` (its key order and bytes are
  a frozen wire contract with the 3DS; it lives in the file being edited — leave
  it exactly as-is).
- Do not add or bump dependencies. Use the existing `CoverImage` component and
  React only.
- Do not refactor beyond the phase's stated scope.
- Do not HEAD/GET libretro or archive.org image bytes from client code to
  "pick tiles that resolve" — that fights the link-only invariant. Derive the
  first-10 URLs and let each tile's `onError` fall back independently.

## Iteration protocol

- Within a phase, iterate freely — multiple attempts and avenues are expected for
  hard problems.
- Every retry must state a new hypothesis: what was learned from the last failure
  and what's different this time. Never repeat an attempt unchanged.
- The stop trigger is scope violation, not failure count: if a solution requires
  breaking the do-not list (e.g. touching `server/cover.ts` or the contract to
  make covers work), stop and report the blocker instead of working around it.
- **Escalation path:** when the implementation diverges from this plan's *design*
  (the mosaic can't plug into the item header as specified, the parity test can't
  express the divergence cleanly, an import cycle appears), consult the user
  before improvising, and record the resolution as a deviation in the progress
  file.
- Discovered work is triaged by two questions — is it required for the goal, and
  does it fit the current scope?
  - Required and small (stays within `apps/site/src/lib/` or `apps/site/src/components/`,
    breaks nothing on the do-not list): do it now, record it as a deviation in the
    progress file.
  - Required but large (needs a server/contract change, new dependency, or a
    do-not violation): stop and report immediately — a discovered scope violation;
    the user decides whether to expand the goal.
  - Not required (pre-existing issues, cleanups): record in a **Follow-ups**
    section of the progress file and include in the final report.
- **User-directed amendments** — the user outranks the plan. A user imperative
  ("add X", "change Y") or explicit acceptance ("yes, do that") is an amendment to
  the contract, not scope creep — never remove or defer user-requested work to
  satisfy a scope objection. A user *question* is never an amendment: it opens a
  discussion detour whose blocking event is the user's next reply. Amendments
  file: `.mastracode/plans/rom-archive-cover-art.amendments.md` — may not exist
  yet; created on the first user-directed amendment. If it exists, its entries are
  part of this contract and extend the judge criteria.

## Context findings

Researched against the live repo and live archive.org/libretro on 2026-07-15.

- **Root cause of broken covers.** `apps/site/src/lib/cover.ts` `coverUrlFor`
  returns `null` for any file whose extension is in `ARCHIVE_EXTENSIONS`
  (`zip`, `7z`) — line 49 (`if (ARCHIVE_EXTENSIONS.has(extensionOf(romFileName))) return null;`).
  The full-set catalog (`b6e1de7`) stores every ROM as a **per-game archive**:
  No-Intro NES/SNES/Genesis/PCE use `.zip`, GBA/GB/GBC/GG/SMS/DS use `.7z`. So
  every ROM in the full-set catalog derives no cover and renders the 🎮
  placeholder. The guard predates the full-set catalog — it was written when
  covers were only derived for loose `.gba`/`.nes` files, where a `.zip` really
  would have been an opaque multi-ROM archive.
- **The fix is proven against live libretro.** No-Intro names files as
  `<Title> (Region).zip` — a **single** archive extension over the exact
  No-Intro title. Stripping that one archive extension yields the precise stem
  libretro uses for `Named_Boxarts/<Title>.png`. Verified against the live
  `No-Intro_NES` bundle: pulling real `.zip` filenames, stripping the archive
  ext, and issuing HEAD to libretro returned **HTTP 200 for 33/40 `(USA)` titles
  (~83%) and 30/40 random-across-set (~75%)**. There is no double-extension case
  (0 of 5359 NES files match `*.nes.zip`).
- **Coverage is genuinely partial — the placeholder is not a bug.** Libretro's
  thumbnail set lacks some obscure regional/unlicensed dumps. `CoverImage`
  (`apps/site/src/components/cover-image.tsx`) already collapses a failed `<img>`
  (`onError`) to the placeholder tile, so absent titles degrade cleanly. The
  correct proof bar is therefore "a substantial majority of a real random sample
  resolves to 200", not 100%.
- **Two callers, deliberately diverging after this change.** `coverUrlFor` exists
  in two files: `lib/cover.ts` (client display, `rom-list.tsx`) and
  `server/cover.ts` (resolve/plan → 3DS). Today `lib/cover.test.ts` asserts they
  are **byte-identical** across all consoles (82 assertions) as a drift guard.
  This plan fixes only the client. The server side is intentionally left gating
  archives because its output feeds `coverTargetPathFor`, which keys the on-device
  `.png` filename off the routed archive basename (`Game.zip` → `Game.zip.png`) —
  and TWiLight matches box art against the *extracted inner* ROM name
  (`Game.nes`), so a naive server-side fix would write a mismatched `.png` name to
  real hardware. That is exactly the deferred CIA-side work. The parity test is
  therefore rewritten to assert an **intentional divergence** (client derives for
  archives; server still gates them) with a frozen rationale comment — it stays a
  meaningful drift guard for the shared console map and illegal-char rule
  (non-archive names must still agree byte-for-byte), while explicitly encoding the
  one place the two files are allowed to differ.
- **Bundle mosaic is spec'd, never built.** `.mastracode/plans/rom-archive-scan-covers.md`
  lines 189–196 specify the item/bundle page must show "a **stitched mosaic
  cover** — up to 10 of the member ROMs' `coverUrl` images tiled client-side into
  one pack image. PRESENTATION-ONLY and WEB-ONLY... NEVER a wire field, NEVER
  proxied through our link-broker API... missing tiles render a placeholder. It
  does not touch the contract, the QR pointer, or the console." The Next.js
  migration + UI redesign rebuilt the item page but this mosaic never landed
  (`browse` uses a console-glyph gradient tile; the item header shows no cover
  mosaic today). It is in-scope for "make the coverart work" and depends on the
  Phase 1 fix — without it every mosaic tile would be a placeholder.
- **Item-page integration point.** `apps/site/src/app/item/[id]/page.tsx` is a
  client component that already resolves the `CatalogEntry` (so it has
  `entry.console`) and renders the metadata panel, whole-item QR, and `RomList`.
  The mosaic is a new client component placed in the header region; it fetches the
  first page via the existing `fetchItemPage(id, { page: 1, pageSize: 10 })`
  (`lib/api.ts`) to obtain up to 10 member filenames + the console, derives each
  cover URL with the fixed `coverUrlFor`, and tiles them. No new fetch surface.
- **Gate shapes (proven to run 2026-07-15).**
  - Full site suite: `pnpm --filter @rom-archive/site test -- --run --reporter=dot`
    → 217 passed (19 files), ~4.3s.
  - Focused cover files: `cd apps/site && pnpm exec vitest run src/lib/cover.test.ts src/server/cover.test.ts --reporter=dot`
    → 88 passed (2 files), <1s.
  - Build: `pnpm --filter @rom-archive/site build`. Typecheck: `pnpm --filter @rom-archive/site check`.

## Progress file

The executor maintains `.mastracode/plans/rom-archive-cover-art.progress.md`:
- Created in Phase 0, updated **only at stop points** (phase granularity).
- Per phase: status, commit SHA(s), verification commands run with **actual
  results**, deviations, blockers.
- A **Follow-ups** section for discovered non-required work.
- Ground truth for resuming after a pause/restart. Never commit it (nor the plan
  or amendments file).

---

## Phase 0 — Baseline

**Implementation.** Confirm environment and a green starting line so later
failures are attributable.
- Confirm branch is `feat/rom-archive-monorepo` (or cut `feat/cover-art` from it
  if the executor prefers isolation — either is acceptable; record which).
- `git status --porcelain` shows only `.mastracode/` untracked (clean tree
  otherwise).
- Create `.mastracode/plans/rom-archive-cover-art.progress.md` and record baseline
  results.

**Tests for this phase.** None added. Run the existing suites that later phases
verify against.

**Verification gate (run, record actual output):**
- `pnpm --filter @rom-archive/site test -- --run --reporter=dot` → expect 217
  passed.
- `cd apps/site && pnpm exec vitest run src/lib/cover.test.ts src/server/cover.test.ts --reporter=dot`
  → expect 88 passed.
- `pnpm --filter @rom-archive/site check` → clean.

Classify any pre-existing failure as unrelated (record) or same-domain
(root-cause before proceeding — the cover files are the work surface, so any
failure there must be understood, not labeled).

**Commit.** None (baseline only).

**Stop point.** Update progress file with branch, tree state, and actual test
counts. Wait for the judge.

**Judge criteria.** Phase 0 is verified when: the branch and clean-tree state are
recorded; all three gate commands were actually run with output captured in the
progress file; the full suite shows 217 passing and the focused cover files show
88 passing; any failure is classified.

---

## Phase 1 — Client cover derivation for per-game archives

**Implementation.**
- Edit **only** `apps/site/src/lib/cover.ts`. In `coverUrlFor`, replace the
  early-return archive guard with archive-extension **stripping** — but the title
  derivation must **branch**, not chain two strips.

  **Critical design correctness (do not get this wrong):** the current code
  derives the title with `stripExtension(name)`, which cuts at the *last* `.`.
  No-Intro titles routinely contain `.` (`Super Mario Bros. (World)`, `Dr.`,
  `Mr.`, `Game.v1.2`). If you strip the archive ext and then *also* run
  `stripExtension`, you double-strip: `"Super Mario Bros. (World).zip"` →
  (archive strip) → `"Super Mario Bros. (World)"` → (`stripExtension`) →
  `"Super Mario Bros"`, which is the WRONG libretro stem. Verified at draft time.

  The correct control flow:
  1. Add a helper `stripArchiveExtension(name)` that returns the input with a
     **single** trailing `.zip`/`.7z` removed (case-insensitive, anchored to the
     end), or returns the input **unchanged** when there is no trailing archive
     ext.
  2. In `coverUrlFor`, compute the title as: **if** the name has a trailing
     archive ext → `title = stripArchiveExtension(name)` (the archive stem IS the
     full inner title — do **not** call `stripExtension` on it). **Else** →
     `title = stripExtension(name)` (byte-identical to today's non-archive
     behavior). Then apply the `LIBRETRO_ILLEGAL` `_`-replacement and build the URL
     exactly as today.
  3. Remove the `if (ARCHIVE_EXTENSIONS.has(extensionOf(romFileName))) return null;`
     early return. Keep `extensionOf`/`ARCHIVE_EXTENSIONS` only if still used to
     *detect* the archive branch; delete whatever becomes dead so no unused symbol
     lingers.
- Concrete expected outputs (these become test assertions — must hold against the
  code): `"Super Mario Bros. (World).zip"` on `nes` →
  `…/Named_Boxarts/Super%20Mario%20Bros.%20(World).png` (note: `encodeURIComponent`
  leaves `(`, `)`, `.` literal and encodes spaces to `%20`); `"Game.v1.2.zip"` →
  stem `Game.v1.2` (NOT `Game.v1`); a plain `"Metroid Fusion (USA).gba"` →
  byte-identical to today (no archive ext, non-archive branch); `".zip"` alone is
  not a real No-Intro name — acceptable to produce an empty-ish stem, but do not
  crash.
- Do **not** touch `scanPointerValue`, `LIBRETRO_SYSTEM`, or `LIBRETRO_ILLEGAL` —
  the console map and illegal-char rule stay byte-identical to the server (the
  parity test still enforces this for non-archive names AND for the shared
  derivation on archive names — see the test below).
- Do **not** touch `server/cover.ts`.

**Tests for this phase.**
- Rewrite `apps/site/src/lib/cover.test.ts` (keep the `server/cover.ts` import at
  the top — the divergence test still needs to read server output; do not "clean
  up" the now-asymmetric import):
  - Keep the client/server agreement assertions for **non-archive** sample names
    (the shared console map + illegal-char rule must still be byte-identical — the
    real drift guard). Explicitly retain `"NoExtensionRom"` and
    `"Metroid Fusion (USA).gba"` in this non-archive set — they exercise the
    no-extension and plain-`.gba` `stripExtension` paths that must stay stable.
  - **Intentional-divergence block for archive names** (`already.compressed.zip`,
    `homebrew.7z`, plus a No-Intro-style `<Title> (Region).zip`): assert two
    things, not one — (a) the **shared derivation still agrees**: the client's
    derived stem equals what the server *would* derive if it stripped the archive
    ext (i.e. pin `clientCoverUrlFor(console, name)` against
    `serverCoverUrlFor(console, stripArchiveExtension(name))` for the same
    console — proving the console map + illegal-char rule remain identical on the
    path that actually ships), and (b) the **final gate diverges**: raw
    `serverCoverUrlFor(console, name)` returns `null` while `clientCoverUrlFor`
    returns the derived URL. Include a comment block stating *why* the final gate
    differs (server output feeds on-device `.png` naming; deferred to the CIA
    plan). This keeps the guard live on the production (archive) path instead of
    freezing the two files as simply "allowed to differ".
    - If `stripArchiveExtension` is not exported, the test may inline the same
      single-trailing-`.zip`/`.7z` strip to compute the expected server-would-derive
      input; either is acceptable — the point is pinning shared derivation.
  - Add direct assertions on the client fix: `"Super Mario Bros. (World).zip"` on
    `nes` derives
    `https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Super%20Mario%20Bros.%20(World).png`
    (proves no double-strip — the `.` after `Bros` survives); `"Game.v1.2.zip"`
    yields stem `Game.v1.2`; a `.7z` name on `gba` derives the GBA system path; a
    plain `.gba` name is byte-unchanged from prior behavior; a name with illegal
    chars still `_`-replaces; an **uppercase** archive ext `"Game (USA).ZIP"`
    derives a non-null URL (pins the case-insensitive strip, not just prose).
  - Keep the `scanPointerValue` describe block untouched.

**Verification gate:**
- `cd apps/site && pnpm exec vitest run src/lib/cover.test.ts src/server/cover.test.ts --reporter=dot`
  → all pass (parity for non-archive names + intentional divergence for archives).
- `pnpm --filter @rom-archive/site test -- --run --reporter=dot` → still 217+
  (count may rise with new assertions; nothing regresses).
- `pnpm --filter @rom-archive/site check` → clean.

**Commit.** `fix(site): derive libretro covers for per-game archive filenames`

**Stop point.** Update progress file with the commit SHA, the actual test output,
and confirmation that `server/cover.ts` is untouched (`git diff --stat` shows only
`lib/cover.ts` + `lib/cover.test.ts`). Wait for the judge.

**Judge criteria.** Phase 1 is verified when: `lib/cover.ts` strips archive
extensions and derives a non-null libretro URL for `.zip`/`.7z` names (spot-check
the added test assertions against the code); the parity test still enforces
byte-identity for non-archive names and now documents the archive divergence with
a rationale; `server/cover.ts` is unchanged; `git diff --stat` for the commit
lists only `apps/site/src/lib/cover.ts` and `apps/site/src/lib/cover.test.ts`; the
focused and full suites pass; typecheck clean; no do-not violation.

---

## Phase 2 — Bundle mosaic cover on the item page

**Implementation.**
- Create `apps/site/src/components/bundle-mosaic.tsx` — a client component
  (`"use client"`) with props `{ id: string; console: Console; title: string }`.
  It fetches the first page via
  `fetchItemPage(id, { page: 1, pageSize: 10 }, signal)` (existing `lib/api.ts`
  function — no new API surface), takes up to the first 10 returned files, derives
  each tile URL with `coverUrlFor(console, file.name)` (the Phase 1 fixed
  function), and renders them tiled into one pack image. Each tile reuses
  `CoverImage` so a missing/absent cover collapses to the placeholder
  independently. States: loading (skeleton/placeholder grid), error or
  zero-files (render nothing or a single placeholder — never crash the page).
  Spec constraints honored verbatim: **up to 10** tiles (fewer for small
  bundles), missing tiles render a placeholder, composed in the browser from
  libretro links only — **no** `/download/` or API image-byte fetch, not a wire
  field, does not touch the contract/QR/console.
  - Give the mosaic container `data-testid="bundle-mosaic"` and each tile a
    stable structure so the test can count tiles.
- Edit `apps/site/src/app/item/[id]/page.tsx` to render `<BundleMosaic ...>` in
  the header region when `entry` is ready (it has `entry.console` and `title`).
  Place it below the title/badges, above the metadata panel. Do not alter the
  existing whole-item QR card, metadata panel, `RomList`, or any existing
  `data-testid` (`send-all`, etc.).

**Tests for this phase.**
- Create `apps/site/src/components/bundle-mosaic.test.tsx` (jsdom, mock
  `@/lib/api` `fetchItemPage`):
  - Renders up to 10 tiles from a mocked 10-file page; asserts the mosaic
    container exists and tile count is bounded at 10 (feed 12 files → 10 tiles).
  - A small bundle (3 files) renders exactly 3 tiles (no padding to 10).
  - Makes **no** fetch to `/download/` or any image-byte URL — assert the mocked
    `fetchItemPage` is the only data call and no `fetch` to `/download/` occurs
    (mirror the existing bytes-never-proxied test pattern).
  - Tile URLs are derived via `coverUrlFor` (a `.zip` member yields a non-null
    libretro `src`, proving the Phase 1 fix flows through the mosaic).
  - **Absent-cover tile falls back to a placeholder, not a gap or crash**: feed a
    member whose `coverUrlFor` returns `null` (e.g. an unmapped console tile, or
    simulate the `<img>` `onError`) and assert that tile renders the `CoverImage`
    placeholder (`role="img"` with the `(no cover art)` label) — this is the
    spec's headline ("missing tiles render a placeholder"), so it must be tested at
    the mosaic level, not merely inherited from `CoverImage`.
- Extend/adjust `apps/site/src/app/item/[id]/page.test.tsx` only if the mosaic's
  presence disturbs an existing query; keep all existing assertions
  (`send-all`, per-ROM QR, `scanPointerValue` bytes) intact.

**Verification gate:**
- `cd apps/site && pnpm exec vitest run src/components/bundle-mosaic.test.tsx src/app/item/[id]/page.test.tsx --reporter=dot`
  → all pass.
- `pnpm --filter @rom-archive/site test -- --run --reporter=dot` → all pass.
- `pnpm --filter @rom-archive/site check` → clean.
- `pnpm --filter @rom-archive/site build` → succeeds (item route still builds).

**Commit.** `feat(site): render up-to-10-tile bundle mosaic cover on item page`

**Stop point.** Update progress file with the commit SHA and actual output;
confirm `git diff --stat` lists only the new mosaic component, its test, the item
page, and (if touched) the item page test — nothing under `server/`, `api/`, or
`contract`. Wait for the judge.

**Judge criteria.** Phase 2 is verified when: `bundle-mosaic.tsx` exists, is
client-only, fetches via `fetchItemPage` with `pageSize: 10`, tiles **up to 10**
covers (bounded — 12 files → 10 tiles; 3 files → 3 tiles), uses `CoverImage` for
per-tile fallback, and makes no image-byte/`/download/` fetch (spot-check the test
asserting this); it is rendered on the item page without breaking any existing
`data-testid` or QR byte assertion; the diff touches only client component/page
files; focused + full suites pass; typecheck + build clean; no do-not violation.

---

## Phase 3 — Ship checks

**Implementation.**
- Re-run every phase's focused verification.
- **Docs.** Add a short note to `apps/site/README.md` (cover-art section, or a new
  one): covers are derived client-side from libretro Named_Boxarts by stripping
  the per-game archive extension; coverage is partial and absent titles fall back
  to a placeholder; the bundle mosaic tiles up to 10 member covers. State
  explicitly that the 3DS/CIA-side cover download is out of scope / a future plan.
  If the searched docs already cover derivation elsewhere, record the search and
  why the note lands where it does.
- **Live proof.** Build `.mastracode/plans/rom-archive-cover-art.proof/` per the
  proof plan below and run it green. This is built during Phases 1–2 to prove the
  change to the executor as it goes, and only *verified current* here.
- Light self-review sweep of the full branch diff (no debug code, no stray files,
  no lockfile churn — no deps were added).
- Adversarial review (below), fixes triaged, re-run if nontrivial.

**Live proof — proof plan (contract).**
- Method: a runnable Node script `demo.mjs` in
  `.mastracode/plans/rom-archive-cover-art.proof/` that:
  1. Imports the **compiled/real** `coverUrlFor` from the built site (or imports
     the source via a tiny inline transpile step consistent with prior proofs in
     this repo — match the existing `.proof/demo.mjs` approach used by
     `rom-archive-full-catalog.proof`).
  2. Pulls real filenames from the **live** `No-Intro_NES` (`.zip`) and
     `No-Intro_GBA` (`.7z`) archive.org bundles.
  3. Derives cover URLs through `coverUrlFor` and issues HEAD to libretro for a
     random sample per console.
  4. Prints two marker classes:
     - **Deterministic / offline (the real gate — no network):** `DERIVE:ZIP`
       (a `.zip` name yields a non-null libretro URL), `DERIVE:7Z` (a `.7z` name
       yields a non-null URL), `FALLBACK:NULL-FREE` (no full-set-style archive
       name on a **libretro-mapped** console returns null from the client fn —
       scoped to mapped consoles; `coverUrlFor` still legitimately returns null
       for an unmapped console by design; do not overgeneralize into "coverUrlFor
       never returns null"). These depend only on the code and fixed sample
       names — they must pass regardless of network.
     - **Best-effort / network (informational, not a hard red):** `HITRATE:NES
       <n>/<m>`, `HITRATE:GBA <n>/<m>` from live HEADs.
  - The mosaic tile-cap is **not** a proof marker (a Node HEAD script can't
    exercise the React component); its authority is the Phase 2 jsdom unit test
    (12 files → 10 tiles). Do not add a theatrical `MOSAIC` marker.
- **Pass bar (green):** the deterministic markers (`DERIVE:ZIP`, `DERIVE:7Z`,
  `FALLBACK:NULL-FREE`) all pass. When the network is reachable, hit-rate should
  be ≥ 60% on each sampled console (observed ~75–83% at draft time — the bar sits
  safely below to prove covers genuinely resolve, not 0%). The 60% bar is
  deliberate: libretro coverage is partial, so 100% would be a false bar.
- **Network policy (so the gate never flaps red for the wrong reason):** the
  `HITRATE` HEADs hit **live** libretro + archive.org. If the network is
  unreachable or upstream returns availability errors (timeouts, 5xx storm, bundle
  listing fetch fails), the demo records the run as **inconclusive with a stated
  reason** and does **not** report red — a `503` storm returning `0/40` is an
  availability problem, not a code regression. Only the deterministic markers gate
  the phase; `HITRATE` is corroborating evidence when the network cooperates.
- Realism ladder: this drives the **real** client function against **live**
  archive.org filenames and **live** libretro — the realest transcript-capturable
  proof. A browser recording of the item page is a nice-to-have but not required.
  For the *fix*, the demo also records a `without.txt`: running the **deterministic
  derivation** against the **base commit's** `coverUrlFor` (which returns `null`
  for every full-set `.zip`/`.7z`) → `DERIVE:ZIP`/`DERIVE:7Z` **fail** and
  `FALLBACK:NULL-FREE` fails (base returns null), demonstrating red-on-base,
  green-on-branch **without depending on network** (the offline markers carry the
  red, not the flaky hit-rate).
- Artifacts: `demo.mjs`, `run.sh`, `README.md`, captured `with.txt` (branch,
  green) and `without.txt` (base, red for the fix).

**Verification gate:**
- `pnpm --filter @rom-archive/site test -- --run --reporter=dot` → all pass.
- `pnpm --filter @rom-archive/site check` → clean.
- `pnpm --filter @rom-archive/site build` → succeeds.
- `git status --short` → only intended files (source + tests + README; `.proof/`
  and `.mastracode/` are session artifacts, not committed).
- `bash .mastracode/plans/rom-archive-cover-art.proof/run.sh` → deterministic
  markers green per the pass bar (`with.txt`); `without.txt` shows the base-commit
  red on the deterministic markers (`DERIVE:*`/`FALLBACK:NULL-FREE` fail on base).
  `HITRATE:*` recorded as corroboration (or inconclusive-with-reason if the
  network is down) — never the sole red.

**Commit.** `docs(site): document client cover derivation and bundle mosaic`
(docs only — proof artifacts and progress/plan files are not committed).

**Stop point.** Update progress file; write the review handoff. Do **not** mark
the goal complete — go to the human approval gate.

### Adversarial review — reviewer prompt (verbatim)

> You are a cold, adversarial code reviewer. You have not seen this work before.
> Review a change on branch `feat/rom-archive-monorepo` (or `feat/cover-art` if
> the executor cut one — check `git branch --show-current`) in the repo at
> `/home/codingbutter/rom-archive`.
>
> **Goal of the change:** Make ROM cover art appear on the website. The full-set
> catalog stores every ROM as a per-game archive (`.zip` for No-Intro
> NES/SNES/Genesis/PCE, `.7z` for GBA/GB/GBC/GG/SMS/DS). The client cover
> derivation (`apps/site/src/lib/cover.ts` `coverUrlFor`) previously returned
> `null` for archive files, so every full-set ROM showed a placeholder. The fix
> strips the archive extension and derives a libretro Named_Boxarts URL from the
> inner No-Intro title stem. A new client-only bundle-mosaic component tiles up to
> 10 member covers on the item page.
>
> **Get the diff:** `git log --oneline -8` to find the phase commits, then
> `git diff <base>..HEAD -- apps/site/` where `<base>` is the commit before this
> work (look for the first cover-art commit's parent). Build history context with
> `git log --oneline -- apps/site/src/lib/cover.ts apps/site/src/components/`
> before judging pattern consistency.
>
> **Do-not list to enforce (scope):** no changes to `apps/site/src/server/cover.ts`,
> `server/resolve.ts`, anything under `apps/site/src/app/api/` or
> `apps/site/src/server/`, `packages/contract`, or `apps/3ds`. `scanPointerValue`
> in `lib/cover.ts` must be byte-unchanged (frozen QR wire contract). No new
> dependencies. The mosaic must NOT fetch image bytes or `/download/` URLs from
> the client — it derives libretro links only.
>
> **Amendments file:** `.mastracode/plans/rom-archive-cover-art.amendments.md`. If
> it exists, its entries are part of the contract — user-directed work in it is
> in-scope, not creep.
>
> **Look for:** bugs in the archive-extension stripping (double extensions,
> `.zip`-in-the-middle names, dotfiles, no-extension names, case sensitivity);
> whether the parity test still meaningfully guards client/server drift for
> non-archive names or was gutted into a no-op; whether the intentional divergence
> for archives is documented with a real rationale; the mosaic's tile cap (exactly
> "up to 10", not 10-or-crash on small bundles), its no-byte-proxy guarantee, and
> its behavior on zero-file/error states; any accidental change to QR JSON bytes,
> existing `data-testid`s, or the metadata/RomList surface; dead code left after
> removing the archive guard; weak or missing tests; brittleness; changes that
> fight the file history's established patterns; and scope adherence against the
> goal, the do-not list, and the amendments file if present.
>
> Report findings as **Must fix / Risks & questions / Suggested improvements**.
> You inspect only — do not edit.

**Judge criteria.** Phase 3 (final) is verified when: all focused verifications
re-pass; `apps/site/README.md` documents the derivation + mosaic + out-of-scope
CIA note (or the docs search is recorded with evidence); the live-proof artifacts
exist and were run — `with.txt` shows the deterministic markers green on branch
and `without.txt` shows them red on base for the fix (base `coverUrlFor` returns
null → `DERIVE:*`/`FALLBACK:NULL-FREE` fail), with `HITRATE` ≥ 60% on branch when
the network was reachable (or inconclusive-with-reason recorded);
`git status --short` shows only intended committed files; the adversarial review
was invoked with the prompt **unmodified**, its findings appear **unfiltered** in
the stop report, and every must-fix was resolved or explicitly escalated; the
judge spot-checks at least one finding or executor claim against the code. Then
the judge enters **waiting** (human approval gate) — it does **not** mark the goal
complete on its own.

### Human approval gate

Even with every criterion verified, the goal is NOT complete. The judge goes to
*waiting*. The final report is a **review handoff for the user**:
1. **Recap** (~10 lines): the commits, the one-line-fix root cause, the mosaic,
   the intentional parity divergence, notable deviations.
2. **Review map:** read `lib/cover.ts` first (the fix), then `lib/cover.test.ts`
   (the divergence rationale), then `bundle-mosaic.tsx` + its test; the thing most
   deserving scrutiny is the parity-test divergence (it loosens a drift guard by
   design) and the mosaic's no-byte-proxy guarantee.
3. **Manual proof:** `bash .mastracode/plans/rom-archive-cover-art.proof/run.sh`;
   expect the deterministic markers green (and ≥60% hit-rate if online);
   `without.txt` shows base-commit red on those deterministic markers.
4. **Unfiltered adversarial review findings** and each resolution.

Then offer: interactive chunk-by-chunk walkthrough, self-review with questions, or
approval. Only explicit human approval passes this gate. Anything else (a
question, a design challenge) is a discussion detour — answer it and return to
waiting; it becomes an amendment only on explicit user direction after.

**After approval — offer to open a PR.** Only once the user has explicitly
approved. If a `new-pr` skill is available, activate and follow it. Opening the PR
does not complete the goal: stay open through PR follow-through (CI + review
comments via the confidence bar) until the PR is merged or the user confirms the
work is fully done.

## Risks / notes

- **Partial coverage is expected, not a defect.** ~1 in 4 tiles may fall back to
  the placeholder because libretro genuinely lacks those dumps. Do not chase 100%;
  do not add client-side HEAD-probing to "pick resolving tiles" (breaks the
  link-only invariant).
- **The parity test loosens a drift guard by design.** After this change,
  `lib/cover.ts` and `server/cover.ts` intentionally differ for archive names. The
  rewritten test must keep enforcing byte-identity for non-archive names (the real
  shared surface: console map + illegal-char rule) so the guard isn't gutted.
- **`scanPointerValue` shares the edited file.** It is a frozen QR wire contract —
  do not touch it while editing `coverUrlFor` in the same file.
- **No double-extension case in the real data** (0/5359 NES files are
  `*.nes.zip`), so stripping exactly one archive extension is safe; still strip
  only one to avoid mangling a legitimate `Game.v1.2.zip`-style stem.
- **CIA-side is explicitly deferred.** The user confirmed the on-device cover
  download becomes trivial once the website derivation is proven, and will be its
  own plan — the server-side `.png`-naming concern lives there, not here.
