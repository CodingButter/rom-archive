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
## Phase 4 — Camera + quirc (PENDING)
## Phase 5 — Scan screen wiring (PENDING)
## Phase 6 — Recognizable install (PENDING)
## Phase 7 — Ship checks (PENDING)
