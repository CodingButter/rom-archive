# Plan: On-device browse + QR scanning + recognizable install for the rom-archive 3DS app

## Objective

Make the installed 3DS app fully usable on its own and recognizable once
installed:

1. **In-app browse (harden what exists).** The app already does
   `Catalog → Item → Confirm → Download`. Today "Item" only plans the *whole*
   bundle, and large No-Intro sets (5359 files) are unusable as one flat list.
   Add per-file selection and paged browsing so a user can pick one ROM or a
   subset without QR.
2. **In-app QR scanning (new).** Add a camera + QR-decode path that reads the
   website's `ScanPointer` JSON, resolves it via the server, and feeds the
   existing MD5-verified download flow.
3. **Recognizable install (new).** Give the CIA a real HOME-menu title and
   icon so it shows up as "ROM Archive" with a distinct icon in the title list,
   not a bare Title ID / generic homebrew placeholder.

Both download paths converge on the existing download orchestrator that writes
to `roms/<console>/` with MD5 verification.

### End state (verifiable)

- Building `apps/3ds` produces a `.cia` that (a) installs with a recognizable
  "ROM Archive" title + custom icon in the HOME menu, and (b) boots to a menu
  offering **Browse** and **Scan QR**.
- Browse: open a bundle, page through its ROMs, toggle-select individual files,
  plan + download the selection. Whole-bundle download still works.
- Scan QR: the camera opens, decoding a website "Send to 3DS" QR (bundle or
  single ROM) resolves through a new `/api/resolve` endpoint to the same
  MD5-verified download path; files land in `roms/<console>/`.
- The C++ **core** gains the three already-declared-but-unmirrored contract
  types (`ScanPointer`, `ResolveResponse`, `ResolvedFile`) with sentinel blocks,
  a pure host-tested `ScanPointer` parser, and a `ResolveResponse` parser — all
  testable off-device.
- `check_contract.mjs` passes (it currently FAILS — see grounding), the full
  core `doctest` suite passes, and the device build compiles + links the new
  camera/QR module and the icon/SMDH.

### Out of scope (explicitly deferred)

- Box art **placement/toggle behavior** on device beyond parsing the
  now-available `coverUrl`/`coverTargetPath` fields. `ResolvedFile` already
  carries cover fields; wiring actual cover *download* into the on-device flow
  and the global toggle is a follow-on. This plan makes the fields *available*
  and parsed; it does not have to trigger cover downloads. (If cover download is
  trivial to enable once fields are present, it may be included — but it is not
  a gate.)
- Any change to the website UI, the wire *shapes* (no new fields on existing
  types), or `packages/contract` schema definitions. Note: this plan DOES add
  one server HTTP route (`/api/resolve`) that exposes the already-existing,
  already-tested `resolveScan` function using existing schemas — see grounding.

## Grounding (verified against source — corrections from first draft included)

- **App entry state machine** — `apps/3ds/source/main.cpp`: `enum class Screen {
  Catalog, Item, Confirm, Downloading, Done, Error }`, D-pad `Ui` list picker +
  status line. Download streams + verifies MD5 via `downloadPlan()` and routes
  to `roms/<console>/`. Path-safety rejects targets outside `roms/` and any
  `..`.
- **The wire `ScanPointer`** — `apps/site/src/lib/cover.ts` `scanPointerValue()`,
  pinned by `apps/site/src/lib/cover.test.ts`:
  - Bundle: `{"v":1,"id":"gbahomebrew"}`
  - Single ROM: `{"v":1,"id":"gbahomebrew","file":"Metroid Fusion (USA).gba"}`
  - Key order `v → id → file`; `file` optional; **console NOT carried**.
- **CORRECTION — `resolveScan` already exists server-side** —
  `apps/site/src/server/resolve.ts`: `resolveScan(pointer, fetchImpl) →
  ResolveResponse` derives `console` from the catalog, filters by `file`
  (404 if the named file is absent), routes each file's `targetPath` via the
  shared sanitizer, and attaches `coverUrl` + `coverTargetPath` per file. It is
  fully tested (`resolve.test.ts`) but **NOT wired to any HTTP route** — the API
  route table exposes only `catalog`, `item`, `metadata`, `plan`. The intended
  design (schemas exist for it) is to expose this via `/api/resolve` and have the
  device consume `ResolveResponse`. This plan does that instead of reinventing
  resolution on-device.
- **CORRECTION — `ScanPointer`, `ResolveResponse`, `ResolvedFile` ARE
  contract-mirrored types** — `packages/contract/schema/contract-fields.json`
  lists all three (fields: `ScanPointer`=`[file,id,v]`,
  `ResolveResponse`=`[console,files,id,totalBytes]`,
  `ResolvedFile`=`[coverTargetPath,coverUrl,downloadUrl,md5,name,sizeBytes,targetPath]`),
  and `generate-schema.ts` `mirroredTypes` explicitly includes them. But
  `apps/3ds/core/include/rom_archive/contract.hpp` has sentinel blocks for only
  4 types (`CatalogEntry`, `ItemDetailFile`, `DownloadPlanRequest`,
  `DownloadPlanResponse`). Therefore **`check_contract.mjs` currently FAILS** on a
  clean baseline (its loop at line 92 `fail()`s for every manifest type lacking a
  block — three are missing). This drift went unnoticed because `build.sh
  --check` (used by `release-cia.yml`) runs only `make` + packaging, never the
  contract check. **This plan must ADD the three missing C++ structs + sentinel
  blocks**, turning the contract check green — the opposite of the first draft's
  (wrong) claim to keep them out.
- **`DownloadPlanRequest { id, freeSpaceBytes, selectedFileNames }`** exists and
  still drives `/api/plan` + `downloadPlan()`. The QR path resolves a
  `ScanPointer` to a concrete file list via `/api/resolve` → then plans/downloads
  those files through the existing machinery.
- **Core test pattern** — `apps/3ds/core/tests/main.cpp`: `doctest`, fixtures
  from `ROM_ARCHIVE_FIXTURE_DIR`, parse seams returning `std::optional`. The host
  test build (`core/Makefile`) compiles `core/src` + `json_nlohmann.cpp`.
- **JSON seam** — `apps/3ds/core/include/rom_archive/json.hpp`: free functions
  returning `std::optional`, backed by nlohmann (host) / jansson (device). New
  `parseScanPointer` and `parseResolveResponse` follow this exact seam; add
  signatures to `json.hpp`, implement in **both** `json_nlohmann.cpp` and
  `json_jansson.cpp`.
- **Build tree layout matters for isolation** — the **device** Makefile compiles
  `SOURCES := source source/platform core/src`; the **host** test build compiles
  `core/src` (+ `json_nlohmann.cpp`). Therefore **camera code and vendored quirc
  MUST live under `source/` (device-only tree), NEVER `core/src`** — otherwise the
  host doctest build would try to compile libctru/quirc it cannot link.
  `core/vendor/` today holds only host-safe header libs (doctest); quirc does not
  belong there.
- **QR decode library** — no libctru decoder. **quirc** (ISC license —
  permissive) is the standard choice; Anemone3DS/QRaken drive `cam:u` frames into
  it and are **GPLv3 → reference-only** (approach + API usage; all code here is
  original).
- **Icon / HOME-menu identity** — `apps/3ds/Makefile` sets `APP_TITLE := ROM
  Archive`, `APP_DESCRIPTION`, `APP_AUTHOR := rom-archive`; devkitARM's rule
  builds the SMDH from these. `build.sh` generates a placeholder *banner*
  (`banner.png`) + silent audio and passes `-icon "$TARGET.smdh"` to makerom.
  **There is no `icon.png` anywhere in the tree**, so the HOME-menu icon is
  devkitARM's generic default. Adding a `48×48 icon.png` (the size devkitARM's
  `_3DSXTOOL`/smdh rule expects) picked up by the build gives a distinct icon;
  the title text is already "ROM Archive" via `APP_TITLE`. This is the recognize-
  in-the-list requirement.

## Do-not list (regression guards)

- Do **not** change `packages/contract` **schema definitions** or add any new
  *wire field* to an existing type. (Adding the `/api/resolve` route that exposes
  the existing `resolveScan`/`ResolveResponse` is allowed and required; it
  introduces no new schema.)
- Do **not** change the website UI or any unrelated server behavior.
- Do **not** alter the existing `downloadPlan()` orchestrator, `router`, `fit`,
  `md5`, `file_sink`, or `sanitize` behavior. New code calls them.
- Do **not** weaken path-safety: every download (browse or QR) still goes through
  the same `downloadPlan()` guard rejecting non-`roms/` targets and `..`.
- Do **not** proxy ROM or image bytes through the API. `/api/resolve` returns
  metadata + links only (as `resolveScan` already does).
- Do **not** put camera code or vendored quirc under `core/` — device tree only.
- Do **not** break the existing whole-bundle browse+download flow.
- The three new contract structs must match `contract-fields.json` field sets
  **exactly** (name-for-name) so `check_contract.mjs` passes; do not add/rename
  fields on the C++ side.

## Iteration protocol

Each phase: implement → build the affected target → run its gate → only then
commit. Fix root causes (no suppressions/casts) and re-run before moving on.
Camera behavior that can't be host-tested is covered by (a) host tests of the
pure parse/resolve-consume logic and (b) a device build that compiles + links,
with final behavior proven on real hardware in ship checks. If on-device camera
capture proves unreliable after a bounded effort (≈ up to 2 substantive
debugging attempts against the documented failure modes), stop and report what
was tried, the exact symptom, and the fallback (browse works). Do not fake
camera success.

**On-device testing is release-driven — never SD-card-swap driven.** The user
tests on real hardware by installing the CIA over the network via FBI's Remote
Install QR, NOT by removing the SD card (repeated SD removal risks damaging the
device and card). So when a change needs on-device verification: tag a release →
`release-cia.yml` builds + publishes `rom-archive.cia` to
`releases/latest/download/` → confirm the workflow succeeded and the asset URL
returns HTTP 200 → hand the user the FBI install QR/URL and the specific checks.
**Never ask the user to test before a published release asset resolves 200.**
Batch verifiable work between release rounds to minimize them.

---

## Phase 0 — Baseline (and record the pre-existing contract-check failure)

**Goal:** an honest known state on a fresh branch.

Steps:
1. Create `feat/3ds-qr-browse` from `main`; tree clean (only `.mastracode/`
   untracked acceptable).
2. Run the core host `doctest` suite; record pass count.
3. Run `node apps/3ds/core/scripts/check_contract.mjs` and **record that it
   fails today** with missing sentinel blocks for `ScanPointer`,
   `ResolveResponse`, `ResolvedFile`. This is the pre-existing drift Phase 1
   fixes — do not treat it as green.
4. Confirm the device build entry point (`apps/3ds/build.sh`, Docker) exists;
   do not require a full device build here.
5. Write `.mastracode/plans/rom-archive-3ds-qr-browse.progress.md` capturing the
   baseline, including the recorded contract-check failure.

**Gate (before Phase 1):** doctest suite passes (record count); contract-check
failure is recorded with its exact three missing types; tree clean apart from
`.mastracode/`.

---

## Phase 1 — Core: mirror the 3 contract types + `ScanPointer`/`ResolveResponse` parse (pure, host-tested)

**Goal:** turn the contract check green and give the core a host-tested path from
a decoded QR string to a resolved file list.

Steps:
1. In `contract.hpp`, add three structs with sentinel blocks whose field sets
   exactly match `contract-fields.json`:
   - `ScanPointer` — `// @contract:fields:ScanPointer:begin/end`, fields
     `v`, `id`, `file` (file optional).
   - `ResolvedFile` — fields `name`, `sizeBytes`, `md5`, `downloadUrl`,
     `targetPath`, `coverUrl`, `coverTargetPath` (cover fields optional).
   - `ResolveResponse` — fields `id`, `console`, `files`, `totalBytes`.
   Add matching field-type choices consistent with the existing structs
   (e.g. `std::optional<std::string>` for optional strings, `Console` enum for
   `console`, `std::vector<ResolvedFile>` for `files`).
   **Footgun to avoid:** `check_contract.mjs` collects the last identifier before
   every `;` inside a sentinel block. Since `ResolveResponse` contains
   `std::vector<ResolvedFile> files;`, `ResolvedFile` MUST be declared as its own
   struct with its OWN sentinel block, *outside and before* `ResolveResponse`'s
   block — exactly how `PlanFile`/`ExcludedFile` sit outside `DownloadPlanResponse`
   in `contract.hpp`. Nesting the definition would leak `ResolvedFile`'s field
   names into `ResolveResponse`'s set and turn the check red.
2. Add to the JSON seam (`json.hpp`), implemented in **both** backends:
   - `std::optional<ScanPointer> parseScanPointer(const std::string&)` —
     reject (nullopt) on: non-object, `v != 1`, missing/empty/non-string `id`,
     `file` present but non-string or empty. Ignore unknown extra keys.
   - `std::optional<ResolveResponse> parseResolveResponse(const std::string&)` —
     validates the resolve endpoint's response into the mirrored struct
     (unknown console id → nullopt, missing required fields → nullopt).
   - `std::string serializeScanPointer(const ScanPointer&)` producing the
     canonical `{"v":1,"id":...[, "file":...]}` JSON. **The device POSTs this as
     a JSON body to `/api/resolve` — mandated, not optional.** GET is forbidden
     here: a `ScanPointer.file` is a ROM filename like `Metroid Fusion
     (USA).gba` (spaces, parens), and the device HTTP client concatenates URLs
     with **no percent-encoding** (`api_client.cpp:21`, whose own comment states
     values are assumed URL-safe archive.org ids). A GET `?file=...` would ship a
     malformed request line and silently break the single-ROM scan path while the
     bundle case (no `file`) passes. POST-with-body reuses the proven `fetchPlan`
     pattern (`serializeDownloadPlanRequest` + `http_.postJson`, `api_client.cpp:25-29`)
     and sidesteps encoding entirely.
3. Add `doctest` cases in `core/tests/main.cpp` (+ fixtures as needed):
   - `parseScanPointer` accepts the two pinned website strings exactly (assert
     against `{"v":1,"id":"gbahomebrew"}` and the single-file string).
   - Rejects: `v:2`, missing `id`, empty `id`, `file` non-string, empty `file`,
     non-object, garbage.
   - `parseResolveResponse` round-trips a representative resolve JSON fixture
     into `ResolveResponse` with correct console, files (incl. optional cover
     fields present/absent), and `totalBytes`.

**Gate:**
- `node apps/3ds/core/scripts/check_contract.mjs` **passes** (all manifest types
  now have matching blocks — the pre-existing failure is fixed).
- Core `doctest` suite passes with the new cases (record count > Phase 0).
- Parse output matches the pinned website examples exactly.

**Commit** when green.

---

## Phase 2 — Server: expose `/api/resolve` (thin wrapper over existing `resolveScan`)

**Goal:** give the device an HTTP endpoint that turns a `ScanPointer` into a
`ResolveResponse`, reusing the existing tested function.

Steps:
1. Add a **POST** `/api/resolve` route (Next.js route handler, matching the
   existing `/api/plan` POST style — NOT GET, to stay consistent with the device
   POST decision in Phase 1 and avoid URL-encoding filenames). It reads a
   `ScanPointer` from the JSON body, validates it against `ScanPointerSchema`,
   calls `resolveScan(pointer, fetch)`, and returns the `ResolveResponse` JSON.
   Map `ResolveError.status` (404) through; malformed pointer → 400.
2. Add route tests mirroring the existing route-adapter test style: valid bundle
   pointer → 200 `ResolveResponse` with all files; valid single-file → 200 with
   one file; **a single-file pointer whose `file` contains a space (the pinned
   `Metroid Fusion (USA).gba`) resolves end-to-end through the transport** (the
   exact case a GET transport would silently break); unknown id → 404; unknown
   file → 404; malformed pointer → 400.
3. This introduces **no new schema** — `ResolveResponse`/`ResolvedFile`/
   `ScanPointer` already exist in `packages/contract`.
4. **Abuse surface is bounded by the catalog whitelist — do not weaken it.**
   `resolveScan` (`resolve.ts:35-38`) rejects any `pointer.id` not in the curated
   catalog *before* any archive.org fetch, and never proxies ROM/image bytes.
   That whitelist is what makes a public route safe (no open proxy / SSRF); the
   implementer must not refactor the catalog check away or add a bypass.

**Gate:**
- The site test suite passes (existing + new route tests).
- `tsc --noEmit` clean; `next build` succeeds.
- Diff confined to the new route + its test (plus wiring). No schema edits, no UI
  edits.

**Commit** when green.

---

## Phase 3 — In-app browse hardening (per-file selection + paging)

**Goal:** browse a real bundle without QR — page a large file list, select
individual ROMs.

Steps:
1. Extend `Ui` (`ui.hpp`/`ui.cpp`) with a multi-select list mode (row toggle +
   shoulder/D-pad paging) while keeping the existing single-list mode for the
   catalog screen.
2. In `main.cpp`, extend the `Item` screen: toggle-select files → plan the
   selection (`selectedFileNames = {chosen}`); keep "plan all" whole-bundle
   unchanged; page through `item.files` client-side. An id-only `GET /api/item`
   returns the FULL unpaginated file list (`item/route.ts` only paginates when
   `page`/`pageSize`/`q` are present), so client-side windowing of the fetched
   list is correct and needs no new API wiring.
3. `Confirm/Downloading/Done` flow unchanged.

**Gate:** core suite green; device build compiles + links; progress note
documents whole-bundle path preserved and subset selection produces a correct
`DownloadPlanRequest`.

**Commit** when green.

---

## Phase 4 — Camera + quirc capture module (isolated, highest risk)

**Goal:** a self-contained device module that opens the camera and returns a
decoded QR string, behind a clean interface.

Steps:
1. **Vendor quirc under `apps/3ds/source/vendor/quirc/`** (device tree only)
   with its ISC `LICENSE`; wire its C sources/includes into the **device**
   Makefile `SOURCES`/`INCLUDES` only. Record the upstream version/commit. Do
   NOT place it under `core/` (would poison the host build).
2. Add `source/platform/qr_camera_3ds.{hpp,cpp}` exposing a minimal interface
   (e.g. `QrCamera` with `start()/poll()/stop()` returning a decoded payload
   when found). Grounded in documented failure modes:
   - init `cam:u`, capture frames into a fixed buffer, feed quirc;
   - **bound quirc input** (cap size / guard non-QR frames) to avoid the known
     stack overflow; "no code this frame" is normal, not error;
   - safe teardown (`stop()` idempotent, correct free order) to avoid exit races.
3. This module is the **only** thing touching `cam:u`/quirc; `main.cpp` sees only
   the interface header (grep-confirm no quirc/cam includes leak into main/core).

**Gate:** device build compiles + links quirc + module (Docker, tailed); host
suite unaffected + green; interface boundary clean (grep).

**Commit** when green.

---

## Phase 5 — Wire the `Scan` screen → `/api/resolve` → download

**Goal:** connect Scan → resolve → existing download flow.

Steps:
1. Add `Screen::Scan` + a top-level menu choice (Browse vs Scan QR).
2. Add `ApiClient::resolveScan(const ScanPointer&) → std::optional<ResolveResponse>`
   calling `/api/resolve` (Phase 2), parsed via `parseResolveResponse`.
3. Scan flow: enter `Scan`, `start()` camera, "point at QR" status. On decode →
   `parseScanPointer`; invalid → error status, stay/back out; valid → `stop()`
   camera → `resolveScan(pointer)` → build a plan/download from the returned
   `ResolveResponse.files` (each `ResolvedFile` already carries `targetPath`,
   `downloadUrl`, `md5`, `sizeBytes`) → run the existing
   `Confirm → Downloading → Done` path with the same MD5 + path-safety guards.
   `B`/cancel → `stop()` → Catalog.
4. Guarantee camera teardown on every exit from `Scan`.

**Gate:** device build compiles + links; core suite green; progress note
documents: QR path reuses the MD5-verified download with unchanged path-safety;
single-ROM pointer downloads exactly one file to `roms/<console>/`; invalid QR
handled without crash.

**Commit** when green.

---

## Phase 6 — Recognizable install (HOME-menu title + icon)

**Goal:** the installed CIA shows a real name + distinct icon in the title list.

Steps:
1. Add a `48×48` PNG at exactly `apps/3ds/icon.png` — devkitPro's `3ds_rules`
   SMDH recipe picks up `$(TOPDIR)/icon.png` (48×48 is the SMDH icon spec size).
   A wrong path/size silently falls back to the generic icon and the only proof
   is an on-device install, so pin this exactly. Keep it simple and recognizable
   (e.g. a labelled cartridge/archive glyph).
2. Confirm `APP_TITLE`/`APP_DESCRIPTION`/`APP_AUTHOR` produce the intended SMDH
   long/short title so HOME shows "ROM Archive". Adjust the banner-generation in
   `build.sh` only if needed to keep it consistent (banner is separate from the
   HOME icon; the SMDH icon is what shows in the list).
3. Do NOT change `UniqueId`/Title ID (`0xFF3FE`) — keep the same title id so
   updates install over the existing entry.

**Gate:** device build produces `.smdh` embedding the new icon + title (verify
via build output / `strings`/smdhtool if available, or by the on-device install
in ship checks). Diff confined to the icon asset + Makefile/build.sh wiring +
`apps/3ds`.

**Commit** when green.

---

## Phase 7 — Ship checks

**Goal:** prove it end-to-end and safe to release.

Steps:
1. **Full gate:** core `doctest` green (final count); `check_contract.mjs`
   **green**; site suite + `tsc --noEmit` + `next build` green (for the
   `/api/resolve` addition); device `.cia` builds cleanly (Docker), links quirc +
   camera + browse, embeds the icon/title.
2. **No-drift:** `git diff main...HEAD` limited to `apps/3ds/`, the single new
   `apps/site` resolve route + its test, and `.mastracode/`. Zero
   `packages/contract` schema edits, zero website UI edits, zero unrelated server
   edits.
3. **Live proof (on-device, via FBI QR — no SD swap):** cut a release tag →
   confirm `release-cia.yml` succeeded and `releases/latest/download/rom-archive.cia`
   returns HTTP 200 → hand the user the FBI Remote-Install QR/URL + checklist:
   - Install: the app appears in HOME as "ROM Archive" with the custom icon.
   - Browse: open a bundle, page + select a single ROM, download → lands in
     `roms/<console>/`, MD5 `[ok]`.
   - Browse whole-bundle still works (regression).
   - Scan single-ROM QR → that one ROM downloads to the right folder.
   - Scan bundle QR → bundle plans + downloads (SD free space respected; partial
     shows excluded).
   - Camera teardown: cancel a scan + re-enter — no freeze/black-screen.
   Do not ask the user to test until the release asset URL is confirmed 200.
4. **Adversarial review** on the implemented diff; apply must-fixes; re-review.
5. Update `apps/3ds/README.md`: two entry paths (browse + scan-QR), the
   `/api/resolve` endpoint, vendored quirc + license, and the icon/title.
6. **Human approval gate** before merge (the on-device proof is a real hardware
   step the user runs).

**Definition of done:**
- `check_contract.mjs` green (pre-existing drift fixed); core suite green; site
  suite + build green; `.cia` builds, links all new code, embeds icon/title.
- Diff limited to `apps/3ds/` + the one resolve route/test + `.mastracode/`; no
  contract-schema/website-UI changes.
- On-device proof passes: recognizable install, browse-select-download, whole-
  bundle, single-ROM QR, bundle QR, camera cancel/re-enter — files in
  `roms/<console>/`, MD5 verified.
- Adversarial review has no outstanding must-fix items.
- quirc vendored (ISC) under `source/`; README documents both paths + endpoint.

## Risks & mitigations

- **Camera unreliability (highest).** Black-screen/freeze on some consoles;
  quirc stack overflow on junk frames; exit races. Mitigation: isolate behind an
  interface, bound quirc input, safe teardown on all exits, browse remains the
  guaranteed path, escalation clause caps thrash + forces an honest report.
- **quirc build integration under devkitARM.** Plain C; device Makefile only,
  under `source/vendor/`. If it won't build, report the exact toolchain error.
- **Contract-check was red at baseline.** Fixing it (Phase 1) touches
  `contract.hpp` for three types; keep field sets exact or the check stays red.
- **`/api/resolve` is a real server addition** (revises the first draft's
  "device-only" framing). It is thin (wraps tested `resolveScan`) and adds no
  schema, but it must be tested and must not disturb existing routes.
- **Large bundle in one list.** No-Intro NES = 5359 files. UI paging (Phase 3)
  keeps it usable.
- **Icon size/format.** devkitARM expects a specific SMDH icon size (48×48). Get
  it right or the build ignores it and falls back to the generic icon.

## Reviewer brief (for adversarial review)

- **Goal:** device-focused feature — in-app browse-with-selection, camera QR
  scanning reusing the existing MD5-verified download path, a new thin
  `/api/resolve` route exposing the existing tested `resolveScan`, and a
  recognizable HOME-menu icon/title.
- **Get the diff:** branch `feat/3ds-qr-browse`, `git diff main...HEAD`.
- **Load-bearing facts to check:** (1) `ScanPointer`/`ResolveResponse`/
  `ResolvedFile` are contract-mirrored types whose C++ blocks were MISSING at
  baseline — Phase 1 must add them and turn `check_contract.mjs` green;
  (2) `resolveScan` already exists and is only newly exposed via `/api/resolve`
  (no new schema); (3) quirc + camera live under `source/` only, never `core/`;
  (4) every download still goes through `downloadPlan()` path-safety + MD5;
  (5) icon is 48×48 SMDH, Title ID `0xFF3FE` unchanged.
- **Flag:** any new wire field on an existing type, any website-UI edit, any
  camera/quirc code under `core/`, any path-safety/MD5 bypass, any ROM/image
  byte proxying, or a `parseScanPointer` that doesn't match the pinned website
  wire shape exactly.
- **Rubric:** `/home/codingbutter/Downloads/plan-main/plan-main/skills/plan-rubric/SKILL.md`.
