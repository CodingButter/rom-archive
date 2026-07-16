# ROM Archive — Full Curated Catalog (archive.org full-set bundles)

## Goal

Expand the ROM Archive catalog from 3 homebrew bundles to a curated full-set bundle for **every one of the 10 supported consoles**, sourced from the largest clean archive.org No-Intro-style items, so a user can browse a real library per console and send any whole bundle or individual ROM to their 3DS. Because these items carry 4,000+ loose per-ROM files, the item-detail page and `/api/item` must gain **in-item pagination and name search** so a 5,000-ROM bundle is usable in a browser without loading every row at once. The end state: `/browse` lists a bundle per console; each item page renders the metadata panel, the whole-bundle QR, and a **paginated, searchable** per-ROM list with working per-ROM "Send to 3DS" QR codes; every curated catalog id is verified to return md5-bearing ROM files from archive.org.

## Scope

**In:**
- Research + hand-verify one archive.org full-set bundle identifier per console (10 total), each confirmed via `/metadata/` to return loose, md5-bearing ROM files (not a single opaque blob).
- Add the verified entries to `apps/site/src/server/catalog.json` (existing curated-list model; `console` derived server-side stays the single source of truth).
- Add **server-side pagination + name filtering** to the item path so large bundles are consumable: a new query surface on `/api/item` (`?id=&page=&pageSize=&q=`) returning a bounded page plus a total count, without breaking the existing full-list contract used by the 3DS resolve/plan flow.
- Rebuild the item-detail per-ROM list UI (`rom-list.tsx`) to drive that pagination/search: a search box and pager, so only one page of rows renders at a time.
- Live proof that a real 5,000-file bundle browses, paginates, searches, and yields valid per-ROM + whole-bundle QR pointers.

**Out:**
- Any change to the QR `ScanPointer` wire contract, the `/plan` fit logic, or the 3DS client.
- Dynamic/live archive.org search as a browse mechanism (rejected — see Context findings).
- Cover-art or metadata behavior changes.

Ship in phased commits, with a goal-judge verification stop after every phase.

## Do-not list

- Do not weaken, delete, or skip tests to make verification pass.
- Do not change the `ScanPointer` QR wire contract, `DownloadPlanRequest/Response`, or the `ResolveResponse` shape — the 3DS client depends on them byte-for-byte.
- Do not change the **default** `/api/item` behavior in a way that breaks callers that expect the full flat file list (the resolve/plan pipeline). Pagination must be additive and opt-in via query params; absent params ⇒ current behavior preserved.
- Do not add or bump dependencies not named in this plan (this plan names **none** — pagination/search are hand-rolled).
- Do not refactor beyond the item-path pagination/search and catalog data; leave metadata, cover, cache, and plan code untouched.
- Do not proxy archive.org bytes — the API brokers links only.
- Do not hardcode any secret; no new env vars are introduced.

## Iteration protocol

- Within a phase, iterate freely — multiple attempts and avenues are expected for hard problems (e.g. finding a clean per-console bundle whose files flatten to real ROMs).
- Every retry must state a new hypothesis: what was learned from the last failure and what's different this time. Never repeat an attempt unchanged.
- The stop trigger is scope violation, not failure count: if a solution requires breaking the do-not list (e.g. changing the QR contract, or a bundle only works by proxying bytes), stop and report the blocker instead of working around it.
- **Escalation path:** when implementation diverges from this plan's *design* (a pagination surface that can't stay backward-compatible, a bundle that has no clean loose-ROM item, an import cycle), consult the user before improvising, and record the resolution as a deviation in the progress file.
- Discovered work triage: required-and-small (within the item subsystem / catalog data, breaks nothing on the do-not list) → do it now, record as a deviation. Required-but-large (needs a contract change, new phases, or a do-not violation) → stop and report immediately. Not-required (pre-existing issues, cleanups) → record in the progress file's **Follow-ups** section and the final report.
- **User-directed amendments** — the user outranks the plan. Amendments file: `.mastracode/plans/rom-archive-full-catalog.amendments.md` — may not exist yet; created on the first user-directed amendment. If it exists, its entries are part of this contract and extend the judge criteria. Only explicit user direction qualifies (an imperative or an agreement); a user question is a discussion detour (verdict *waiting*), not an amendment. On amendment: append the user's request quoted verbatim, what it changes, and how the added work will be verified.

## Context findings

The research that shaped this plan:

- **The catalog is already a curated list of archive.org identifiers.** `apps/site/src/server/catalog.json` is a small array of `{id,title,console,kind}`; `loadCatalog`/`findCatalogEntry` (`catalog.ts`) validate it against `CatalogEntrySchema`, and `console` is derived from this list server-side as the single source of truth (`schemas.ts` ScanPointer note). Adding a full-set item is just adding a curated row — the existing model scales to big items with no new mechanism.
- **A curated big-bundle per console beats dynamic search — verified live.** Free-text archive.org `advancedsearch.php` for e.g. `snes rom` returns 1,608 hits dominated by movies, RetroPie disk images, and translation patches; even `title:(super nintendo) AND mediatype:software` mixes Wii/3DS/N64 items. archive.org full-text search has no notion of "clean full ROM set," so a dynamic engine would need quality filtering it can't reliably do. Curated identifiers sidestep this entirely and keep browse fast (no per-request archive.org latency, no rate-limit exposure).
- **The existing item pipeline already flattens a bundle into per-ROM files.** `fetchItemMetadata` → `extractRomFiles` (`archiveClient.ts`) drops metadata/bookkeeping files, keeps ROM-like extensions with an md5, and builds per-file download URLs. Verified live against `No-Intro_NES` (5,359 md5-bearing ROM files) and `No-Intro_Super_Nintendo_SNES` (3,996). So each curated bundle **automatically** yields both the whole-bundle QR (pointer with no `file`) and per-ROM links (pointer with `file`) — the same flow the 3 homebrew bundles use today, pointed at bigger items.
- **The ROMs are per-game `.zip` files.** No-Intro items store each game as its own `.zip`; `.zip` is already in `ROM_EXTENSIONS` (`archiveClient.ts`), so they pass the filter. TWiLightMenu++ loads zipped ROMs for these systems. Document this; do not special-case it.
- **Scale is the real work.** `handleItem` returns *every* file flat (`handlers.ts`), and `rom-list.tsx` renders all of them (`state.files.map`). 4,000–5,000 rows in a browser is a genuine UX/perf failure. Hence the additive pagination/search on the item path — the substance of this plan beyond the data edit. Pagination is server-side (bounded page + total) so the browser never holds 5,000 rows; the whole-bundle QR still points at the whole item (it carries only the id, no per-file list), so bundle send is unaffected by pagination.
- **Candidate identifiers found (each still needs per-item `/metadata/` verification in Phase 1):** NES `No-Intro_NES` (~0.9 GB, 5,359 ROMs ✓verified), SNES `No-Intro_Super_Nintendo_SNES` (~3.7 GB, 3,996 ✓verified), GBA `No-Intro_GBA` (~11.7 GB), GBC `No-Intro_GBC` (~0.8 GB), GB (No-Intro GB family — resolve exact id in Phase 1), DS `ni-n-ds-dec_202401` (decrypted, ~5.3 GB), Genesis/md `sega-mega-drive-genesis-no-intro_202603` (~9 GB), Master System/sms `nointro.ms-mkiii`, Game Gear/gg `nointro.gg` or `ni-se-gg`, PC Engine/pce (No-Intro PC Engine — resolve exact id in Phase 1). Consoles map to `Console`: nds, gba, gb, gbc, snes, nes, gg, sms, md, pce.

## Progress file

Maintain `.mastracode/plans/rom-archive-full-catalog.progress.md` next to this plan. Created in Phase 0, updated **only at stop points** (phase granularity). Per phase record: status, commit SHA(s), verification commands run **with actual results**, deviations, blockers. Keep a **Follow-ups** section for discovered non-required work. The stop-point report and the progress file carry the same content. This file is ground truth for resuming after a pause or context loss. Never commit it (nor this plan or the amendments file).

---

## Phase 0 — Baseline

**Implementation:**
- Confirm branch is `feat/rom-archive-monorepo` (or cut `feat/full-catalog` if the user prefers); confirm clean tree via `git status --porcelain` (only `.mastracode/` untracked is acceptable).
- Environment: ensure workspace is installed/built per repo docs (`pnpm install`; `turbo run build --filter=@rom-archive/contract` so the contract package resolves). A "package not built" failure is a setup problem to fix, never a baseline fact.
- Run the focused suites later phases use, confirm green **before** changes.
- Create the progress file; record branch, tree state, and baseline results. Classify any pre-existing failure as unrelated or same-domain (same-domain = item route, handlers, archiveClient, catalog, or rom-list); root-cause any same-domain failure.

**Verification gate:**
```
git status --porcelain
pnpm --filter @rom-archive/site test -- --run --reporter=dot
pnpm --filter @rom-archive/site check
```
**Commit:** none (baseline only).
**Stop point:** write progress file; report branch, tree, actual test counts/results. Wait for judge.
**Judge criteria:** Phase 0 is verified when the working tree is clean on the correct branch, the site suite passes with a recorded count, `check` is clean, and the progress file records the baseline with any pre-existing failure classified.

---

## Phase 1 — Verify + curate one full-set bundle per console

**Implementation:**
- For each of the 10 consoles, take the candidate id from Context findings and verify it live against `https://archive.org/metadata/<id>/files`: confirm it returns **loose, md5-bearing ROM files** that `extractRomFiles` will keep (ROM-like extension incl. `.zip`, present `md5`, parseable `size`), not a single opaque blob. Where a candidate id is unresolved (GB, pce) or fails verification, iterate: search `advancedsearch.php` (`title:("No-Intro" AND "<system>") AND mediatype:software`, sort `item_size desc`) and pick the largest item whose files flatten to real ROMs. Record the chosen id, file count, and a sample filename per console in the progress file.
- Add the 10 verified entries to `apps/site/src/server/catalog.json` with `kind: "bundle"`, correct `console`, and a human title. Keep the 3 existing homebrew entries (they remain valid). Optionally set `approxSizeBytes` from the item's reported size (optional field already in `CatalogEntrySchema`).
- Write a **verification script** in the proof dir (`.mastracode/plans/rom-archive-full-catalog.proof/verify-catalog.mjs`) that, for every catalog id, hits the real archive.org metadata endpoint through the compiled `extractRomFiles` and asserts ≥1 md5-bearing ROM file — this both proves the data and becomes the live-proof artifact. (Building the demo alongside the feature per prove-it doctrine.)

**Tests for this phase:**
- `apps/site/src/server/catalog.test.ts` (add if absent): every catalog entry parses `CatalogEntrySchema`; every `console` is a valid `Console`; ids are unique; all 10 consoles are covered exactly once by a `kind:"bundle"` entry. No network in unit tests — pure JSON assertions.

**Verification gate:**
```
pnpm --filter @rom-archive/site test -- --run src/server/catalog.test.ts --reporter=dot --bail 1
pnpm --filter @rom-archive/site check
node .mastracode/plans/rom-archive-full-catalog.proof/verify-catalog.mjs   # live: every id yields ROM files
```
**Commit:** `feat(site): curate full-set archive.org bundle per console`
**Stop point:** update progress file with the chosen id + verified file count per console; report. Wait for judge.
**Judge criteria:** Phase 1 is verified when catalog.json contains exactly one `kind:"bundle"` entry per each of the 10 consoles (plus the retained homebrew entries), `catalog.test.ts` passes, `check` is clean, and the live `verify-catalog.mjs` transcript in the progress file shows every id returning ≥1 md5-bearing ROM file. A judge spot-checks two ids against `https://archive.org/metadata/<id>` with its readonly tools.

---

## Phase 2 — Server-side pagination + name search on the item path (additive)

**Implementation:**
- Add a pure, testable paginator to the server layer (new `apps/site/src/server/paginate.ts` or extend `handlers.ts`): given the full `ItemDetailFile[]`, an optional case-insensitive substring `q`, a 1-based `page`, and a bounded `pageSize` (default e.g. 60, hard max e.g. 200), return `{ files: page-slice, total: filtered-count, page, pageSize }`.
- Extend `handleItem` to accept optional `page/pageSize/q`. **Backward compatible:** when all are absent, return the current full-list `ItemDetailResponse` unchanged (resolve/plan pipeline untouched). When any pagination param is present, return a paginated response. Introduce the paginated shape as a **new contract type** in `packages/contract` (e.g. `ItemPageResponseSchema` = `ItemDetailResponse` fields + `total/page/pageSize`) — additive, no existing schema modified. Validate output against the schema before returning, matching the existing `handleItem` pattern.
- Update `apps/site/src/app/api/item/route.ts` to read `page/pageSize/q` from the query string and pass them through. Absent ⇒ unchanged behavior.

**Tests for this phase:**
- `apps/site/src/server/paginate.test.ts`: slicing math, 1-based paging, out-of-range page → empty slice with correct total, `pageSize` clamping to the hard max, case-insensitive `q` filtering, `q` with no matches → empty + total 0.
- Extend `apps/site/src/server/handlers.test.ts`: `handleItem` with no pagination params returns the full list (unchanged contract); with `page/pageSize/q` returns a bounded page + correct total; unknown id still 404; bytes never proxied (existing `metadataOnlyFetch`-style guard reused).
- Extend `apps/site/src/app/api/routes.test.ts`: the route forwards `page/pageSize/q`; absent params ⇒ full-list response.

**Verification gate:**
```
pnpm --filter @rom-archive/site test -- --run src/server/paginate.test.ts src/server/handlers.test.ts src/app/api/routes.test.ts --reporter=dot --bail 1
pnpm --filter @rom-archive/site check
pnpm --filter @rom-archive/contract test -- --run --reporter=dot
```
**Commit:** `feat(site): add additive pagination and name search to the item endpoint`
**Stop point:** update progress; report changed files + actual results. Wait for judge.
**Judge criteria:** Phase 2 is verified when: the new `ItemPageResponseSchema` is additive (no existing contract schema changed — judge diffs `packages/contract`); `handleItem` with no params returns the byte-identical full-list shape (a named test asserts this); paginated calls return bounded pages with correct totals; all named suites pass; `check` clean; no do-not violation (ScanPointer/plan contracts untouched).

---

## Phase 3 — Paginated, searchable per-ROM list UI

**Implementation:**
- Rewrite `apps/site/src/components/rom-list.tsx` to consume the paginated endpoint: a search input (debounced, drives `q`), a pager (prev/next + page indicator using `total`/`pageSize`), rendering only the current page's rows. Preserve exactly the existing per-row behavior: cover via `coverUrlFor`, the "Send to 3DS" toggle, and `scanPointerValue(id, file.name)` for the per-ROM QR — the QR wire value must stay identical.
- Update `apps/site/src/lib/api.ts` `fetchItem` (or add `fetchItemPage`) to pass `page/pageSize/q`; keep the existing signature working for any other caller.
- The whole-bundle QR on the item page (`app/item/[id]/page.tsx`) is unchanged — it carries only the id and is independent of pagination. Confirm it still renders.
- Extend the live-proof demo so it exercises a paginated + searched page of a real 5,000-file bundle and asserts a valid per-ROM `ScanPointer` and the whole-bundle `ScanPointer` are produced.

**Tests for this phase:**
- Update `apps/site/src/components/rom-list.test.tsx` (and the item page test if present): renders one page of rows, typing in search refetches with `q`, pager advances pages, a per-ROM QR carries the exact `scanPointerValue(id, name)` string, empty search result renders an empty-state not a crash. Mock the fetch; assert request URLs carry the expected params.

**Verification gate:**
```
pnpm --filter @rom-archive/site test -- --run src/components/rom-list.test.tsx --reporter=dot --bail 1
pnpm --filter @rom-archive/site test -- --run --reporter=dot
pnpm --filter @rom-archive/site check
```
**Commit:** `feat(site): paginated searchable ROM list for large bundles`
**Stop point:** update progress; report. Wait for judge.
**Judge criteria:** Phase 3 is verified when the item page renders only a bounded page of rows for a large bundle, search and paging issue requests with the right params (asserted in tests), the per-ROM and whole-bundle QR wire values are unchanged from before this plan (a test pins the exact `scanPointerValue` output), the full site suite passes, and `check` is clean.

---

## Phase 4 — Ship checks

**Implementation:**
- Re-run every phase's focused verification from a clean state.
- **Docs:** update `apps/site/README.md` (or the API endpoints doc) to document the new `/api/item` `page/pageSize/q` params and the paginated response shape, and note the catalog now carries full-set bundles. Evidence the docs search in the progress file. New public surface (the query params + response schema) defaults to needing docs.
- **Live proof:** finalize `.mastracode/plans/rom-archive-full-catalog.proof/`: `verify-catalog.mjs` (every id yields ROM files) and a `demo.mjs` driving the built `handleItem` for a real large bundle — page 1, a `q` search, out-of-range page, plus asserting a valid per-ROM and whole-bundle `ScanPointer`. Capture `with.txt`. This is a feature (not a fix), so the working transcript is the required artifact; a browser recording is optional since the surface is adequately captured by the transcript + existing component tests.
- **Light self-review sweep** over the full branch diff: no debug code, no stray files in `git status`, no lockfile churn (no deps added), no accidental formatting noise.
- **Adversarial review** (see prompt below) before this phase's stop point. Prefer the `adversarial_review` tool with `plan_path` = this plan; fall back to a non-forked subagent; if neither is available, **the judge performs the review itself** at the stop point. Triage: must-fixes fixed+committed in this phase (re-run reviewer if fixes were nontrivial); risks/questions → final report; improvements → Follow-ups.

**Verification gate:**
```
pnpm --filter @rom-archive/site test -- --run --reporter=dot
pnpm --filter @rom-archive/contract test -- --run --reporter=dot
pnpm --filter @rom-archive/site check
node .mastracode/plans/rom-archive-full-catalog.proof/verify-catalog.mjs
node .mastracode/plans/rom-archive-full-catalog.proof/demo.mjs
git status --short
```
**Commit:** `docs(site): document item pagination + full-set catalog` (plus any review-fix commits).

### Adversarial reviewer prompt (verbatim)

> You are a cold, independent reviewer of a change on branch `feat/rom-archive-monorepo` in the `rom-archive` monorepo. **Goal:** expand the ROM Archive catalog to one curated full-set archive.org bundle per each of 10 consoles, and make the item-detail page usable for bundles with 4,000+ ROMs by adding **additive** server-side pagination + name search to the `/api/item` path and a paginated/searchable per-ROM list UI.
>
> **Do-not list (violations are Must-fix):** no change to the `ScanPointer` QR wire contract, `DownloadPlanRequest/Response`, or `ResolveResponse`; `/api/item` with no pagination params MUST return the pre-existing full flat file list unchanged (the 3DS resolve/plan pipeline depends on it); no new dependencies; no byte proxying of archive.org content; no refactor outside the item path + catalog data; no hardcoded secrets.
>
> Get the full diff with `git log --oneline main..HEAD` then `git diff main...HEAD` (or the base the branch was cut from). Before judging pattern consistency, run `git log` on the changed files (`catalog.json`, `handlers.ts`, `archiveClient.ts`, `rom-list.tsx`, `api/item/route.ts`, `packages/contract`) to learn the established conventions. The plan is at `.mastracode/plans/rom-archive-full-catalog.md`; its amendments file, if present, is `.mastracode/plans/rom-archive-full-catalog.amendments.md` — entries there are user-directed and in-contract, not scope creep.
>
> Look for: backward-compatibility breaks in `handleItem` (does absent-params truly equal the old shape?); pagination math bugs (off-by-one, page bounds, pageSize clamping, filter+page interaction); the per-ROM and whole-bundle QR `ScanPointer` values changing (they must be byte-identical to before); weak or missing tests (is the "no params ⇒ full list" invariant actually pinned? is the QR wire value pinned?); catalog entries that don't actually yield md5 ROM files; dead code, accidental churn, brittleness; and scope adherence against the goal and do-not list. Report as **Must fix / Risks & questions / Suggested improvements**. Inspect only — do not edit.

**Stop point:** update progress with the unfiltered review findings and their resolutions; then the **human approval gate** — the goal is NOT complete even if all criteria pass; go to *waiting*. Produce a review handoff for the user: Recap (~10 lines), Review map (commit order, the pagination-compat commit and catalog data deserve the most scrutiny), Manual proof (the `verify-catalog.mjs` + `demo.mjs` commands, what to expect, and the `with.txt` path), and the unfiltered adversarial findings with resolutions. Then offer next steps as options (interactive walkthrough / self-review / approval). After explicit approval, offer to open a PR (activate `new-pr` if available); opening the PR keeps the goal open through PR follow-through.

**Judge criteria:** Phase 4 is verified when all focused suites + both proof scripts pass from clean, docs document the new query params and response shape (with the docs search evidenced — a bare "no docs needed" fails), `git status --short` shows only intended files, the adversarial review ran with this plan's prompt unmodified and its findings appear unfiltered in the stop report with every must-fix resolved or escalated, and the judge spot-checks one finding or claim against the code. The goal then waits for human approval; it does not self-complete.

---

## Risks / notes

- **Backward compatibility is the sharpest edge.** `/api/item` is consumed by the 3DS resolve/plan pipeline expecting the full flat list. Pagination MUST be opt-in; the "absent params ⇒ old shape" invariant needs a pinned test, or the console breaks silently.
- **QR wire stability.** Per-ROM and whole-bundle `ScanPointer` JSON must not change — a 3DS already-paired flow depends on it. Pin the exact `scanPointerValue` output in a test.
- **`.zip`-wrapped ROMs.** No-Intro items store per-game `.zip`s; already ROM-like. TWiLightMenu++ reads zipped ROMs for these systems. If any chosen console set is *not* zip-wrapped or uses a per-file layout `extractRomFiles` drops, that surfaces in Phase 1 verification — pick a different item.
- **archive.org item churn.** Curated ids can be removed/renamed upstream. `verify-catalog.mjs` is the canary; a dead id is a data fix, not a code bug.
- **DS is "decrypted".** `ni-n-ds-dec_202401` is decrypted DS ROMs — correct for TWiLightMenu++/nds-bootstrap. Confirm in Phase 1 the files are `.nds`/`.zip` with md5s.
