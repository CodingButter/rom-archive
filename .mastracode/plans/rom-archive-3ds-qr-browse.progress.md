# Progress — On-device browse + QR scanning + recognizable install

Plan: `.mastracode/plans/rom-archive-3ds-qr-browse.md`
Branch: `feat/3ds-qr-browse` (from `main` @ `e195a3b`)

## Phase 0 — Baseline (DONE)

Recorded honest starting state.

- **Branch:** `feat/3ds-qr-browse` cut from `main`; tree clean apart from `.mastracode/`.
- **Core doctest suite (host):** `make -C apps/3ds/core test` →
  **21 test cases / 167 assertions passed, 0 failed.** (Baseline count to beat in Phase 1.)
- **Contract check (RED at baseline — pre-existing drift, not introduced here):**
  `node apps/3ds/core/scripts/check_contract.mjs` exits **1** with:
  - missing sentinel block for `ResolveResponse`
  - missing sentinel block for `ResolvedFile`
  - missing sentinel block for `ScanPointer`
  These three are in `packages/contract/schema/contract-fields.json` (mirrored types)
  but have no `// @contract:fields:...` blocks in
  `apps/3ds/core/include/rom_archive/contract.hpp`. Phase 1 adds them and turns the
  check green. This went unnoticed because `build.sh --check` never runs the contract check.
- **Device build entry point:** `apps/3ds/build.sh` + `apps/3ds/docker/Dockerfile` present
  (Docker devkitARM). Full device build not required in Phase 0.

### Gate: PASS
- doctest green (21/167 recorded).
- contract-check failure recorded with exact three missing types.
- tree clean apart from `.mastracode/`.

## Phase 1 — Core contract mirror + parse (DONE)

- Added 3 structs to `contract.hpp` with sentinel blocks matching
  `contract-fields.json` exactly: `ScanPointer` (v,id,file), `ResolvedFile`
  (7 fields, cover fields optional), `ResolveResponse` (console,files,id,totalBytes).
  `ResolvedFile` declared OUTSIDE `ResolveResponse`'s block (PlanFile/ExcludedFile
  pattern) so its field names don't leak — check stays green.
- JSON seam (`json.hpp`) gained `parseScanPointer`, `parseResolveResponse`,
  `serializeScanPointer`, implemented in BOTH backends
  (`json_nlohmann.cpp` host / `json_jansson.cpp` device, exception-free).
  `serializeScanPointer` hand-builds canonical `v->id->file` order (nlohmann sorts
  keys; jansson insertion order) so host/device emit byte-identical JSON.
- `parseScanPointer` rejects: non-object, v!=1, missing/empty/non-string id,
  file present-but-non-string/empty; ignores unknown keys.
- New fixture `resolve.gba.json` (one file with cover fields, one without).
- 6 new doctest cases (accept pinned bundle+single wire shapes, reject 8 malformed
  variants, ignore extra keys, canonical serialize + round-trip, resolve mapping
  with optional cover present/absent, resolve rejects unknown console/missing fields).

### Gate: PASS
- `check_contract.mjs` → **OK** (pre-existing drift fixed).
- doctest → **27 cases / 210 assertions** (> baseline 21/167).
- `serializeScanPointer` output asserted byte-equal to the pinned website strings.
## Phase 2 — /api/resolve (DONE — commit d549398)
- Added `handleResolve` (pure) in `handlers.ts`: `ScanPointerSchema.safeParse`
  the JSON body → `resolveScan(pointer, fetch)` → `ResolveResponse`. Invalid
  pointer → 400; `ResolveError.status` (404) mapped through; `ArchiveError` → 502.
- Added POST route `apps/site/src/app/api/resolve/route.ts` mirroring `/api/plan`
  (POST, JSON body — so single-ROM filenames with spaces/parens need no
  URL-encoding, matching the device's raw-concatenation HTTP client).
- 6 route tests appended to `routes.test.ts`: bundle → 200 all files;
  single-file `Anguna - Warriors of Virtue (USA) (Unl).gba` (the space/parens
  case a GET would break) → 200 one file; unknown id → 404 (no upstream fetch);
  absent file → 404; `v:2` → 400; unparseable body → 400. Asserts no
  `/download/` or `thumbnails.libretro.com` fetch (bytes never proxied).
- No new schema; catalog whitelist in `resolveScan` keeps the route from being
  an open proxy.

### Gate: PASS
- Site suite 287/287 (was 281; +6 resolve route tests). `tsc --noEmit` clean.
  `next build` lists `/api/resolve` as a dynamic function.
- Diff confined to new route + `handleResolve` + tests. No schema/UI edits.

## Phase 3 — Browse hardening (DONE — device build green)
- `Ui` gained a multi-select mode (`setMultiSelect`, `toggleSelected`,
  `checkedIndices`, `anyChecked`, `pressedX`) plus L/R screen-at-a-time paging
  in `poll()` — the only usable way through a 5359-file No-Intro list.
  `setList` resets to plain single-list mode (catalog unaffected). Rows draw the
  cursor + `[x]`/`[ ]` checkbox + label as one line (no fixed-offset collision).
- `main.cpp` Item screen: enter → `setMultiSelect(true)`; `X` toggles the
  highlighted file; `A` plans the checked subset (`selectedFileNames = {chosen}`)
  or the whole item when nothing is checked (unchanged `std::nullopt` path);
  `B` back. Returning from Confirm re-enters multi-select. Confirm/Downloading/
  Done flow unchanged.

### Gate: PASS
- Host doctest unaffected (27 cases / 210 assertions — ui.cpp/main.cpp are
  device-tree only, not in the host build).
- Device build compiles + links cleanly (Docker): `ui.cpp` compiled,
  `rom-archive.cia` = 246720 bytes, `--check` passed.
- Whole-bundle path preserved (A with nothing checked → `selectedFileNames`
  nullopt); subset selection produces a `DownloadPlanRequest` with the exact
  chosen names.
## Phase 4 — Camera + quirc (DONE — device build green)
- Vendored quirc `lib/` core under `apps/3ds/source/vendor/quirc/` (device tree
  only): `decode.c`, `identify.c`, `quirc.c`, `version_db.c`, `quirc.h`,
  `quirc_internal.h` + `LICENSE` (ISC) + `VERSION.md`. Upstream dlbeer/quirc
  commit `927d680904dc95fdff4cd9d022eb374b438ff8f2`. Demo/test programs
  (libjpeg/SDL/OpenCV) intentionally not vendored.
- Device Makefile: added `source/vendor/quirc` to `SOURCES` + `INCLUDES`, plus
  `-DQUIRC_FLOAT_TYPE=float` (single-precision FPU) and `-DQUIRC_MAX_REGIONS=254`
  (embedded memory budget). Host `core/Makefile` untouched — quirc never enters
  the host build.
- `source/platform/qr_camera_3ds.{hpp,cpp}`: the ONLY module touching `cam:u`
  and quirc. Interface is `QrCamera` with `start()/poll()/stop()` returning
  `QrPoll{NoCode,Found,Error}` + `payload()`. Header keeps the quirc handle as
  `void*` so it stays free of the C types.
  - `start()`: `quirc_new`+`quirc_resize`, then `camInit`, select inner camera,
    RGB565 output, activate, `GetMaxBytes`/`SetTransferBytes`, start capture.
    Any failure tears down what was brought up and returns false.
  - `poll()`: `SetReceiving` one frame, bounded 300ms `svcWaitSynchronization`
    (UI stays live; timeout → NoCode, not fatal), RGB565→8-bit luma into
    `quirc_begin` buffer, `quirc_end`, decode each found code (with `quirc_flip`
    retry on ECC). "No code this frame" is the normal NoCode path.
  - `stop()`: idempotent, order-safe (`StopCapture`→`Activate(SELECT_NONE)`→
    `camExit`, then `quirc_destroy`); runs from dtor and every exit path.
- Fixed a real compile error caught by the Docker build: `CAMU_GetMaxBytes`
  takes `u32*` (not `u16*`); corrected the transfer-unit type.

### Gate: PASS
- Device build compiles + links quirc + module (Docker): `qr_camera_3ds.cpp`
  and `quirc.c` compiled, linked into `rom-archive.elf`, `.cia` = 246720 bytes,
  `--check passed`, exit 0.
- Host doctest suite unaffected: 27 cases / 210 assertions green.
- Boundary clean (grep): only `qr_camera_3ds.cpp` includes `quirc.h` / uses
  `CAMU_`; main.cpp and core see none of it.
## Phase 5 — Wire Scan screen -> /api/resolve -> download (DONE)
- `ApiClient::resolveScan(const ScanPointer&) -> std::optional<ResolveResponse>`:
  POSTs `serializeScanPointer(pointer)` to `/api/resolve`, parses with
  `parseResolveResponse` (POST reuses the proven `fetchPlan` pattern; ROM
  filenames with spaces/parens travel in the JSON body, no URL-encoding).
- New top-level `Screen::Menu` is now the entry point: two rows
  ["Browse catalog", "Scan QR code"]. Catalog still loads once at boot (Browse
  is instant); a catalog failure is non-fatal because Scan does not need it.
- New `Screen::Scan`: `qrCamera.start()`; each frame `poll()` —
  NoCode -> keep scanning; Found -> `parseScanPointer(payload)` (invalid ->
  status hint, stay in Scan camera live; valid -> `stop()` -> `resolveScan` ->
  `planFromResolve` -> Confirm); Error -> `stop()` -> Error. B cancels:
  `stop()` -> Menu. Teardown guaranteed on every exit and on quit (`~QrCamera`).
- `planFromResolve(ResolveResponse)`: straight field map ResolvedFile->PlanFile
  (name/size/md5/downloadUrl/targetPath), fits=true, totalBytes carried. The
  scanned plan runs the SAME Confirm -> Downloading -> Done path, so MD5
  verification and the `roms/`-only path-safety guard in `downloadPlan()` apply
  unchanged — nothing new bypasses them.
- `confirmFromScan` flag routes Confirm's B: scanned -> Menu, browsed -> Item.
  Done's B returns to Menu for both paths.

### Gate: PASS
- Device build compiles + links (Docker): `.cia` = 270784 bytes, `--check
  passed`, exit 0. Zero warnings (one benign GCC-7.1 ABI note from an inlined
  std::vector copy).
- Host core suite unaffected: 27 cases / 210 assertions green.

## Phase 6 — Recognizable install (DONE)
- Added `apps/3ds/icon.png` — a deterministic 48x48 (SMDH icon spec size) game
  cartridge in the site's emerald accent on a cool-slate field, generated by
  `apps/3ds/tools/make_icon.py` (Pillow, re-runnable). devkitARM's SMDH rule
  auto-picks up `$(TOPDIR)/icon.png` (Makefile:150-151) as `APP_ICON`; before
  this the HOME icon was devkitARM's generic default (no `*.png` existed).
- Title text was already correct via the Makefile: `APP_TITLE := ROM Archive`,
  `APP_DESCRIPTION`, `APP_AUTHOR := rom-archive`.
- Title ID unchanged: `app.rsf` still `UniqueId 0xFF3FE`, so updates install
  over the existing HOME entry.

### Gate: PASS (SMDH inspected)
- Device build regenerates `rom-archive.smdh` (14016 bytes, `SMDH` magic);
  `.cia` = 270784 bytes, `--check passed`.
- SMDH decode confirms: short title "ROM Archive", long title the description,
  publisher "rom-archive", and the 48x48 large-icon region is 4544/4608 bytes
  non-zero — the real icon is embedded, not a blank/default placeholder.
## Phase 7 — Ship checks (IN PROGRESS — local gates PASS, awaiting on-device)
- Full gate green:
  - `check_contract.mjs` GREEN (pre-existing baseline drift fixed in P1).
  - Core doctest: 28 cases / 214 assertions green.
  - Site suite: 287/287 green; `tsc --noEmit` clean; `next build` clean.
  - Device `.cia` builds + links quirc + camera + browse, SMDH embeds
    icon/title: 270784 bytes, `--check passed`.
- No-drift (`git diff main...HEAD`): confined to `apps/3ds/`, the single new
  `apps/site` resolve route + handler + tests, and `.mastracode/`. Zero
  `packages/contract` schema edits, zero website-UI edits, zero unrelated
  server edits.
- Adversarial review (anthropic/claude-opus-4-8) on the implemented diff: NO
  must-fix. Verified against source: camera teardown on all five exit paths,
  no stale-item deref, sentinel field-set match, both parsers validate
  identically, QR path inherits downloadPlan's unconditional roms/-only + MD5.
  - Acted on review risks: (1) a NEW doctest for `"files":{}` surfaced a real
    host/device parity bug — host nlohmann accepted a JSON object for `files`
    (range-for over object values) while device jansson rejected non-arrays;
    fixed the host to require an array. (2) Split the scan failure message
    (request/parse failure vs empty resolve). (3) Pinned `totalBytes == sum(
    sizeBytes)` in the resolve route test.
- README updated: two entry paths (browse + scan QR), `/api/resolve`, vendored
  quirc + ISC license, icon/title.
- REMAINING: cut a release tag, confirm `release-cia.yml` succeeds and the
  asset URL returns 200, then hand the user the FBI install QR + on-device
  checklist (recognizable install, browse-select-download, whole-bundle,
  single-ROM QR, bundle QR, camera cancel/re-enter). Human approval gate
  before merge.
