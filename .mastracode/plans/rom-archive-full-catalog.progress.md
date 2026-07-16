# Progress — ROM Archive Full Curated Catalog

Plan: `.mastracode/plans/rom-archive-full-catalog.md`
Branch: `feat/rom-archive-monorepo`

---

## Phase 0 — Baseline — ✅ COMPLETE

**Status:** verified green before any change.

- **Branch:** `feat/rom-archive-monorepo` (correct).
- **Tree:** effectively clean. `git status --porcelain` shows:
  - ` M .gitignore` — a pre-existing benign one-line add (`.vercel`) from the earlier deploy work. Not from this plan; kept (correct, harmless). Classified: unrelated pre-existing.
  - `?? .mastracode/` — expected (plans/progress/proof, never committed).
- **Env:** workspace already installed/built; contract package resolves.
- **Baseline gates (actual results):**
  - `pnpm --filter @rom-archive/site test -- --run --reporter=dot` → **190 passed (190)**, 17 test files. Green.
  - `pnpm --filter @rom-archive/site check` → clean (tsc --noEmit, no output).
- **Pre-existing same-domain note:** `apps/site/src/server/catalog.test.ts` already exists (3 tests, generic assertions ≥3 entries / ≥2 consoles). Phase 1 will extend it to pin the 10-console coverage. No same-domain failures.

**Commit:** none (baseline only).

**Contract shapes confirmed for later phases (from `packages/contract/src/schemas.ts`):**
- `CatalogEntrySchema` = `{ id, title, console(ConsoleSchema), kind: "bundle"|"single", approxSizeBytes?: int≥0 }`.
- `ItemDetailResponseSchema` = `{ id, console, files: ItemDetailFile[] }`; `ItemDetailFile` = `{ name, sizeBytes, md5(required), downloadUrl }`.
- `ScanPointerSchema` = strict `{ v: 1, id, file? }` — QR wire contract, must not change.
- Phase 2 additive type: `ItemPageResponseSchema` = ItemDetailResponse fields + `{ total, page, pageSize }`.
- Consoles (`CONSOLES`): nds, gba, gb, gbc, snes, nes, gg, sms, md, pce (10).
- Existing catalog.json: 3 homebrew bundles (gbahomebrew/gba, nes-homebrew-collection/nes, gameboy-homebrew/gb).

---

## Follow-ups (discovered, non-required)

- `.gitignore` `.vercel` add is untracked-domain churn from prior work; leave as-is.

---

## Phase 1 — Curate full-set bundle per console — ✅ COMPLETE

**Commit:** `b6e1de7` — feat(site): curate full-set archive.org bundle per console.

**Verified ids (live archive.org, via extractRomFiles predicate):**

| console | id | roms | approxSizeBytes |
|---|---|---|---|
| nes  | `No-Intro_NES` | 5359 | 904272100 |
| snes | `No-Intro_Super_Nintendo_SNES` | 3996 | 3723057590 |
| gba  | `No-Intro_GBA` | 3381 | 11700254272 |
| gbc  | `No-Intro_GBC` | 1931 | 797037420 |
| gb   | `No-Intro_GB` | 1896 | 202784144 |
| nds  | `ni-n-ds-dec_202401` (decrypted) | 266 | 5306671976 |
| md   | `ef_mega_genesis_no-intro_2024-04-21` | 3264 | 2524223542 |
| sms  | `nointro.ms-mkiii` | 696 | 78367732 |
| gg   | `nointro.gg` | 820 | 140204412 |
| pce  | `ef_pce_No-Intro_2024` | 480 | 110950918 |

Plus retained homebrew: `gbahomebrew` (gba, 10 roms — still live).

**Deviations:**
- Candidate `sega-mega-drive-genesis-no-intro_202603` (from plan Context) rejected: it stores 8 sub-collection zips (TOSEC blobs), not per-game files. Replaced with `ef_mega_genesis_no-intro_2024-04-21` (3264 per-game `.zip`) — largest clean per-game Genesis set. New hypothesis proven: per-game layout required, not a sub-zip mega-item.
- **Dead-id data fix (required-and-small):** pre-existing homebrew ids `nes-homebrew-collection` and `gameboy-homebrew` now return 0 files upstream (removed/renamed on archive.org — the churn risk realized). Dropped both; the nes/gb full-set bundles supersede them. `gbahomebrew` still resolves (kept). No new homebrew ids invented.
- DS: largest available *decrypted* No-Intro set is `ni-n-ds-dec_202401` (266 titles, 5.31 GB, per-game `.7z` with md5 — correct format for TWiLightMenu++/nds-bootstrap). Encrypted sets rejected (wrong format for the console).

**Verification (actual):**
- `pnpm --filter @rom-archive/site test -- --run --reporter=dot` → **193 passed (193)**, 17 files (catalog.test.ts grew 3→6, incl. the 10-console coverage assertion).
- `pnpm --filter @rom-archive/site check` → clean.
- `node .mastracode/plans/rom-archive-full-catalog.proof/verify-catalog.mjs` → **all 11 ids yield >=1 md5-bearing ROM file** (transcript above).

---

## Phase 2 — Additive pagination + name search on the item path — ✅ COMPLETE

**Commit:** `daa65b5` — feat(site): add additive pagination and name search to the item endpoint.

**Changed files:**
- `packages/contract/src/schemas.ts` + `index.ts` — new `ItemPageResponseSchema` = `ItemDetailResponse` fields + `{total,page,pageSize}`. Additive: it is NOT added to the gen script's `jsonSchemaTargets`/`mirroredTypes`, so **no new schema artifact or C++ mirror is emitted** (verified: `git status` shows zero churn in `packages/contract/schema/`, artifacts test still green). No existing schema modified.
- `apps/site/src/server/paginate.ts` (new) — pure `paginateFiles(files, {q,page,pageSize})`. Defaults pageSize 60, hard max 200, page clamps to ≥1, filtered-total, out-of-range → empty slice.
- `apps/site/src/server/handlers.ts` — `handleItem` gains optional 3rd arg `pagination`. **Absent/empty ⇒ unchanged full-list `ItemDetailResponse`.** Any of page/pageSize/q present ⇒ `ItemPageResponse`.
- `apps/site/src/app/api/item/route.ts` — reads `page/pageSize/q`; builds options only when at least one present (id-only preserves full-list shape).
- Tests: `paginate.test.ts` (new), `handlers.test.ts` (+6, incl. pinned "no params ⇒ byte-identical `{console,files,id}` with no paging keys, 10 files"), `routes.test.ts` (+3, forwards params / absent ⇒ full list).

**Verification (actual):**
- site suite → **211 passed (211)**, 18 files.
- `pnpm --filter @rom-archive/site check` → clean.
- `pnpm --filter @rom-archive/contract test -- --run` → **17 passed (17)** (artifacts exact-set assertions still green ⇒ additive confirmed).

**Deviations:** none beyond the deliberate decision to keep `ItemPageResponse` out of the generated-artifact set (it is a browser response, not a QR/3DS wire type). Recorded here as the design-consistent choice.

---

## Phase 3 — Paginated, searchable per-ROM list UI — ✅ COMPLETE

**Commit:** `aa094c4` — feat(site): paginated searchable ROM list for large bundles.

**Changed files:**
- `apps/site/src/lib/api.ts` — added `fetchItemPage(id,{page,pageSize,q},signal)` (always sends paging params ⇒ `ItemPageResponse`). Removed the now-dead `fetchItem` full-list helper (no remaining caller).
- `apps/site/src/components/rom-list.tsx` — rewritten to page/search: debounced (300ms) search box drives `q` and resets to page 1; prev/next pager walks pages via server `total` and `PAGE_SIZE=60`; only the current page renders. **`RomRow` and `scanPointerValue(id, file.name)` are byte-identical to before** — per-ROM QR wire value unchanged. Empty-search → empty state, not a crash.
- `apps/site/src/components/rom-list.test.tsx` (new, 5 tests) — one bounded page renders; per-ROM QR pins exact `{"v":1,"id":"x","file":"Game (USA) 1.gba"}`; debounced search issues `q=` + `page=1`; pager issues `page=2`; no-match → empty state.
- `apps/site/src/app/item/[id]/page.test.tsx` — item mock now returns the `ItemPageResponse` shape (adds `total/page/pageSize`); whole-bundle QR assertion (`{"v":1,"id":"gbahomebrew"}`) unchanged, still green.

**Whole-bundle QR untouched:** `app/item/[id]/page.tsx` still renders `scanPointerValue(id)` (no file) independent of pagination; its test still passes.

**Verification (actual):**
- rom-list suite → 5/5 green; full site suite → **216 passed (216)**, 19 files.
- `pnpm --filter @rom-archive/site check` → clean; `next build` → compiled + 10 static pages.
- Known cosmetic: one React `act()` warning from a trailing fetch-resolution state update; all assertions use `waitFor` and pass. Logged as a Follow-up, not a bug.

**Deviations:** removed `fetchItem` (dead code) rather than keeping it as a no-op export — required-and-small, within the item subsystem, breaks nothing.

---

## Follow-ups (non-required)
- rom-list test emits a cosmetic React `act()` warning on a trailing async state update; consider wrapping the final settle. Not a correctness issue.
- `.gitignore` carries a benign `.vercel` entry from earlier deploy work (uncommitted, unrelated to this plan).

---

## Phase 4 — Ship checks (docs, live proof, adversarial review) — ✅ COMPLETE

**Commits:**
- `13f4818` — docs(site): document item pagination + full-set catalog.
- `6e06f28` — chore: ignore .vercel local deploy dir (folds the pre-existing benign `.gitignore` add into a tracked commit so the tree is clean).
- `a1b8b09` — fix(site): keep blank q additive on the item endpoint (adversarial-review fix).

**Docs:**
- New `apps/site/README.md` — documents the curated full-set catalog, all `/api/*` endpoints, the `/api/item` `page`/`pageSize`/`q` params, the additive `ItemPageResponse` (absent params ⇒ full flat list), and the `TGDB_API_KEY` env var.
- Root `README.md` now points at `apps/site/README.md` (was only `apps/3ds/README.md`).

**Live proof** (`.mastracode/plans/rom-archive-full-catalog.proof/`, transcript in `with.txt`):
- `demo.mjs` — drives the REAL built Next route handler `GET /api/item` (via `next start`) against live archive.org for `No-Intro_NES` (5359 ROMs). All checks green: full-list backward-compat (no paging keys), page 1 bounded to 60, `total===5359`, search "Mario" narrows to 81 (all matches), out-of-range page ⇒ empty slice + correct total, per-ROM and whole-bundle `ScanPointer` wire values valid. No byte proxying.
- `verify-catalog.mjs` — catalog canary: all 11 ids yield ≥1 md5-bearing ROM live.

**Adversarial review** (anthropic/claude-opus-4-8, on `git diff fa5adb8..HEAD`):
- **No Must-fix.** Confirmed: additive contract holds (flat shape only when no paging param), `total` is the filtered count, no `ItemPageResponse` schema artifact emitted, `console` is server-derived, QR wire byte-identical.
- **One behavioral edge fixed:** `?q=` (empty string) previously forced the paginated shape while blank `page`/`pageSize` coerced to absent — an asymmetry that could truncate an unpaginated caller to one page. Fixed via `strParam` (blank ⇒ undefined); pinned by a new route test. → `a1b8b09`.
- Remaining review notes (latent client/server `PAGE_SIZE` coupling, out-of-range page not clamped in UI though unreachable via the debounce reset, `intParam` doc-comment overstated enforcement) — the doc comment was tightened; the rest are non-blocking latent-coupling notes, left as follow-ups.
- Catalog "11 entries" is intentional: 10 distinct consoles + 1 retained live homebrew (`gbahomebrew`).

**Verification (actual):**
- site suite → **217 passed (217)**, 19 files (added the blank-`q` route test).
- `tsc --noEmit` → exit 0; `next build` → compiled, 10 static pages.
- No schema-artifact drift (`packages/contract/schema/` clean); TGDB key not in tracked source.

**Deviations:** none.

---

## Status: plan complete through Phase 4 (ship checks green).

Next focus: professional UI redesign (separate plan). Not started.
