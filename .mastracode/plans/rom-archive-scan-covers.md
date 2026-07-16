# Amendment: QR Scan Mode + Cover Art (individual ROMs & bundles)

Extends the shipped rom-archive monorepo (branch `feat/rom-archive-monorepo`,
last commit `5af5125`) with a second entry point: browse on the web, hand the
console a job by QR, and place cover art alongside ROMs. This is additive — the
existing catalog/item/plan endpoints, the console-agnostic C++ core, the
download/verify/route pipeline, and all current tests stay intact.

## Goal

A user browses the catalog on the website, picks either a single ROM or a whole
item (bundle), and gets a QR code. On the 3DS, a **Scan** mode reads that QR,
calls one API endpoint, and receives a flat, ready-to-execute plan: every ROM's
download link + size + md5 + SD target path, plus an **optional** cover-art URL
and its SD target path. The console streams each ROM (verifying md5, as today),
routes it to `roms/<console>/`, and — when a cover is present — places the PNG in
TWiLight Menu++'s box-art folder. A missing cover never blocks a download.

## Locked decisions (do not re-litigate)

- **One primitive.** An individual ROM is a bundle of size one. The console does
  NOT branch on individual-vs-bundle; it always scans a pointer, calls one
  resolver, and executes a flat plan. Individual vs bundle differ only in what
  the resolver returns.
- **QR carries a pointer, never resolved data.** The QR encodes a small,
  versioned JSON pointer. All links/sizes/covers are resolved fresh from the API
  at scan time. This keeps the QR small (3DS camera is a weak scanner) and never
  stale.
  - Individual: `{ "v": 1, "id": "<archive-item-id>", "file": "<exact archive filename>" }`
  - Bundle:     `{ "v": 1, "id": "<archive-item-id>" }`  (no `file` ⇒ all ROM files in the item)
- **Server owns `console`, not the QR.** The pointer does NOT carry `console`.
  The shipped `/plan` endpoint already derives console server-side from the
  curated catalog (`findCatalogEntry(id).console`) and does not accept a
  client-supplied console; resolve MUST do the same. This removes a second
  source of truth and the possibility of a pointer claiming a console that
  disagrees with the catalog. Consequence: **resolve rejects any `id` not in the
  curated catalog** (same constraint as `/plan`), returning a 404-style error.
- **Bundle = an entire archive.org item.** v1 bundles are exactly one item's ROM
  files. Curated cross-item bundles are explicitly OUT of scope (future catalog
  layer, no wire-format change needed then).
- **Cover source = libretro thumbnails.** Keyless, path-based, PNG, ≤512px wide.
  URL shape: `https://thumbnails.libretro.com/<System Name>/Named_Boxarts/<Game Name>.png`
  where `<System Name>` is the libretro playlist/system folder and `<Game Name>`
  is the title with libretro's illegal chars (`&*/:` `` ` `` `<>?\|"`) replaced by `_`.
- **Cover target = TWiLight Menu++ box-art folder, keyed to the ROUTED rom
  name.** Flat folder: `_nds/TWiLightMenu/boxart/<routed rom basename>.png`,
  where `<routed rom basename>` is the basename of the ROM's FINAL `targetPath`
  after collision disambiguation (the planner appends `~N` before the extension
  on collisions), NOT the raw archive filename. TWiLight matches box art by the
  full rom filename (`SM64DS.nds.png`) or by TID; we use the filename form, so it
  must equal the name actually written to `roms/<console>/`. Deriving the cover
  name from the raw archive name would silently mismatch whenever a collision
  occurred. NOT per-console subfolders. PNG only.
- **Covers only for single-file playable ROMs.** Do NOT derive a cover for
  archive extensions (`.zip`, `.7z`) — `Game.zip.png` matches nothing. Cover
  derivation is gated to the same single-file ROM extensions the planner routes
  directly; archived entries get no cover fields.
- **Cover art is always optional.** Resolver returns `coverUrl`/`coverTargetPath`
  only when a candidate exists; the console treats absence as normal. A cover
  fetch that 404s or fails mid-download is logged and skipped — the ROM result
  is unaffected.
- **Bytes-never-proxied invariant is preserved.** The API resolver still only
  fetches archive.org *metadata* JSON and returns *links* (including the cover
  link). It never fetches ROM bytes or image bytes. The libretro cover URL is
  returned as a link for the console to fetch directly.
- **No new transport risk on device.** Cover downloads reuse the existing
  chunk-callback `HttpClient` with SSL-verify disabled scoped to third-party
  hosts only (archive.org + thumbnails.libretro.com); calls to our own API keep
  peer verification, exactly as `2fac8a1` established.

## Contract changes (packages/contract) — Phase A

Add to the shared wire schema (zod), regenerate JSON Schema + canonical
artifacts, and mirror in C++ (Phase D). All additions are backward compatible.

1. **`ScanPointer`** (new): `{ v: 1, id: string, file?: string }`.
   Strict object (rejects unknown keys — it crosses the QR boundary). NO
   `console` field — console is derived server-side from the curated catalog.
2. **`ResolvedFile`** (new): extends the existing plan file shape with cover fields:
   `{ name, sizeBytes, md5, downloadUrl, targetPath, coverUrl?: string, coverTargetPath?: string }`.
3. **`ResolveResponse`** (new): `{ id, console, files: ResolvedFile[], totalBytes }`.
   (No fit math here — resolve is storage-agnostic; the console still calls the
   existing `/plan` endpoint with free space to get the fit decision, OR the
   resolver is fit-aware if a `freeSpaceBytes` query param is supplied. Decide in
   Phase B; default: resolve is fit-agnostic and returns all files, console
   reuses `/plan` for fit. This keeps responsibilities single-purpose.)
4. Regenerate `console-dirs.json` and `contract-fields.json`; the drift guard
   (`check_contract.mjs`) must cover the new `ResolvedFile`/`ScanPointer`/
   `ResolveResponse` field-name sets via the existing sentinel mechanism. NOTE:
   the drift guard checks field-name sets, not optionality — the new optional
   `coverUrl?`/`coverTargetPath?` fields are name-checked but their optionality
   is not guarded. This is consistent with existing behavior; do not expand the
   guard's contract in this amendment.

Verification (Phase A gate): `pnpm --filter @rom-archive/contract test` green,
`tsc --noEmit` clean, artifacts regenerate byte-identically on re-run.

## Cover resolver (apps/api) — Phase B

New module `apps/api/src/cover.ts`:

- `libretroSystemFor(console: Console): string | null` — maps our console ids to
  libretro system folder names (e.g. `gba → "Nintendo - Game Boy Advance"`,
  `nds → "Nintendo - Nintendo DS"`, `snes/nes/gb/gbc/gg/md/sms/pce` likewise).
  Return `null` for any console with no known libretro folder ⇒ no cover.
- `coverUrlFor(console, romFileName): string | null` — derives the title from the
  ROM filename by stripping the extension, applies libretro's illegal-char
  replacement (`&*/:` `` ` `` `<>?\|"` → `_`), and builds the thumbnails URL.
  Returns `null` when the system is unknown OR the extension is an archive
  (`.zip`/`.7z`). Libretro thumbnail names follow No-Intro naming (title +
  region tags, e.g. `Anguna - Warriors of Virtue (USA) (Unl).png`), so matches
  are best when archive.org filenames already follow No-Intro naming.
- `coverTargetPathFor(routedTargetPath): string` — takes the ROM's FINAL routed
  `targetPath` (post-collision), returns
  `_nds/TWiLightMenu/boxart/<basename of routedTargetPath>.png`. Does NOT
  re-sanitize (the routed path is already sanitized+disambiguated by the
  planner); do not fork the sanitizer.

New module `apps/api/src/resolve.ts`:

- `resolveScan(pointer: ScanPointer, fetchImpl): Promise<ResolveResponse>` —
  derives `console` from the curated catalog (`findCatalogEntry(pointer.id)`);
  rejects (404-style) if the id is not in the catalog. Fetches item metadata via
  the existing `archiveClient`, filters ROM files (existing logic), routes each
  to its final `targetPath` (existing collision-aware planner logic), and for
  each single-file ROM builds `{...planFile, coverUrl?, coverTargetPath?}` where
  `coverTargetPath` is keyed to the ROUTED `targetPath` basename (see Cover
  module). For a pointer with `file`, restrict to that one file (404-style error
  if the file isn't in the item). Never fetches ROM/image bytes.

Cover-candidate policy: the resolver returns `coverUrl` **without** verifying the
image exists (a HEAD per file would blow the 10s function budget and add
archive-of-covers coupling). The console fetch tolerates a 404. Document this.

Verification (Phase B gate): vitest against the recorded `gbahomebrew` fixture —
resolve of a bundle yields N files each with a well-formed `targetPath` and, for
gba, a well-formed libretro `coverUrl` + `_nds/TWiLightMenu/boxart/...png`
`coverTargetPath`; resolve of an individual pointer yields exactly one file;
unknown-console path yields files with no cover fields; mock `fetch` throws on
any `/download/` or `thumbnails.libretro.com` URL to prove no bytes proxied.

## Resolve endpoint (apps/api/api) — Phase C

`apps/api/api/resolve.ts` — thin Vercel wrapper over a pure `handleResolve`
in `handlers.ts` (mirrors existing handler style). Accepts the pointer as a POST
body (or `?p=<base64url json>` GET for QR-driven simplicity — pick POST for
symmetry with `/plan`, GET only if the console's httpc POST proves awkward).
Zod-validate the pointer (strict). Reuse the shared fetch adapter.

Verification (Phase C gate): handler tests — valid pointer → schema-valid
`ResolveResponse`; malformed pointer → 400; mock fetch throws on non-metadata
URLs. `tsc --noEmit` + build clean.

## C++ core mirror (apps/3ds/core) — Phase D

- Mirror `ScanPointer`, `ResolvedFile`, `ResolveResponse` in `contract.hpp` with
  sentinel blocks; update `check_contract.mjs` coverage so drift fails closed.
- `json.hpp`/backends: add `parseResolveResponse` (nlohmann on host,
  jansson on device) and `serializeScanPointer`.
- Extend `download.hpp` orchestration: after a ROM is streamed+verified+routed,
  if the `ResolvedFile` carries `coverTargetPath`/`coverUrl`, fetch the cover via
  the chunk `HttpClient` into `coverTargetPath`. Cover failures are non-fatal:
  a new `DownloadOutcome` field records cover placed / skipped / failed, but the
  ROM outcome is independent. The existing path-traversal guard
  (`isSafeTargetPath`) must also gate cover paths — allow ONLY an anchored
  prefix of `roms/` OR `_nds/TWiLightMenu/boxart/` (prefix at index 0, same
  `rfind(prefix, 0) == 0` style as the shipped guard) and reject any path
  containing `..`. Both allowed roots are exact anchored prefixes so a crafted
  `coverTargetPath` cannot escape via a sibling like `roms-evil/` or a `..`
  segment. Add a unit test per allowed root plus a rejected-escape case.

Verification (Phase D gate): host doctest suite — resolve-response parse
round-trip; download orchestration places a fake cover when present, and still
succeeds (ROM verified) when the fake cover 404s; traversal guard rejects a
malicious `coverTargetPath`. Drift guard clean. All prior core tests still pass.

## Web browse + QR generate (apps/web) — Phase E

- New route `/browse` (or extend Landing): fetch the catalog from the API, list
  items; each item links to an item page.
- Item page `/item/:id`: fetch item detail, list ROM files with size; a
  **"Send whole set to 3DS"** button → QR of the bundle pointer, and per-file
  **"Send this ROM"** → QR of the individual pointer. Reuse the existing `QrCode`
  component; expose the encoded pointer via `data-qr-value` for tests.
- **ROM detail page (`/item/:id/:file`).** A rich per-ROM page: the ROM's cover
  art (from the resolver's `coverUrl`, with a placeholder when absent), title +
  any available details (size, console, filename), and the individual-ROM
  download QR. This is the natural home for the per-file pointer.
- **Bundle detail page.** The item page doubles as the bundle page: pack title,
  the ROM list, the bundle QR, and a **stitched mosaic cover** — up to 10 of the
  member ROMs' `coverUrl` images tiled client-side into one pack image.
  PRESENTATION-ONLY and WEB-ONLY: the mosaic is composed in the browser from the
  same libretro cover links; it is NEVER a wire field, NEVER proxied through our
  link-broker API (the bytes-never-proxied invariant holds — the API returns
  links only), and missing tiles render a placeholder. It does not touch the
  contract, the QR pointer, or the console.
- API base URL from `VITE_API_BASE_URL` (build-time), defaulting to the deployed
  API origin.

Verification (Phase E gate): vitest+testing-library — item page renders one row
per ROM; bundle QR encodes exactly the bundle pointer JSON; individual QR encodes
exactly the individual pointer JSON (decode via qrcode lib data, as existing
tests do); the ROM detail page renders the cover (or placeholder) + individual
QR; the mosaic renders up to 10 tiles from cover links and a placeholder for
missing ones, and makes NO fetch to our API for image bytes. `tsc --noEmit` +
build clean.

## Console Scan UI (apps/3ds) — Phase F

- Add a **Scan** entry to the UI. Use libctru's camera + a QR decode path.
  RESEARCH GATE (Phase F.0): confirm a workable on-device QR decode route
  (quirc is the common homebrew choice; vendor it like doctest/nlohmann, MIT).
  If no clean route exists in the Docker toolchain within a bounded spike, fall
  back to **manual code entry** (type a short pointer id) and record the
  deviation — do NOT block the whole amendment on camera QR.
- On decode: `serializeScanPointer` → POST `/resolve` → `parseResolveResponse` →
  query SD free space → POST `/plan` for fit (reusing existing flow) → confirm →
  download+verify+route each ROM, then place covers. Show per-item cover status.
- **Up-front storage warning (device-only).** The user must never discover a
  space shortfall mid-download. The existing `/plan` fit math already gates the
  ROM bytes (smallest-first; excess reported under `excluded`), and the Scan
  flow reuses `/plan` before any write — so ROM overflow is surfaced at the
  confirm screen, not the hard way. Covers add a wrinkle: they are unverified
  links of UNKNOWN size (we deliberately do not HEAD them), so they cannot enter
  the exact fit calculation. Handle it as a headroom check, not exact math:
  - Show the confirm screen with the total ROM bytes, current free space, and
    (when covers are enabled) a small estimated cover budget (a fixed per-cover
    upper bound, e.g. libretro boxarts are ≤512px PNG ⇒ assume ~256 KB each ×
    cover count) folded into the displayed "space needed".
  - If free space is below `totalRomBytes` → block (existing `/plan` says it
    doesn't fit; refuse or offer the partial set).
  - If free space clears the ROMs but not the ROMs + estimated cover budget →
    WARN clearly ("covers may not all fit") and let the user proceed; covers are
    already non-fatal per file, so a cover that can't be written is skipped like
    a 404. Never let cover placement fail a ROM.
  This keeps fit authority in `/plan` (ROMs) and treats covers as best-effort
  headroom, consistent with covers being optional and unverified.
- **Global cover-download setting (device-only).** Add a persisted user
  preference — "Download cover art" on/off — stored in a small settings file on
  the SD card (e.g. `_nds/TWiLightMenu/rom-archive/settings.json` or a plain
  key/value under the app's own dir), toggled from the UI. This is a
  CONSOLE-layer decision only: the resolver ALWAYS returns `coverUrl`/
  `coverTargetPath`; the device consults the setting and, when covers are
  disabled, simply skips the cover fetch (same code path as a 404 — non-fatal,
  ROM download unaffected). Default: ON. Does NOT touch the contract, the API,
  or the QR pointer. The setting gates the cover-fetch call in the download
  orchestration's platform wrapper, not in the console-agnostic core (the core
  stays pure; the platform layer decides whether to pass a cover-capable sink).

Verification (Phase F gate): full CIA builds in Docker (`build.sh --check`),
`.3dsx` + `.cia` non-empty. On-device behavior remains hardware-bound (documented
as such; not CI-verifiable, consistent with the original plan's stance). The
settings toggle's persistence/skip logic is exercised on-device only; where the
skip decision is a pure predicate it may be host-unit-tested in the core suite.

## Ship checks — Phase G

- `pnpm turbo run test check build` green across contract/api/web.
- Core `make test` green; `check_contract.mjs` clean (now covering new structs).
- `build.sh --check` produces `.cia`.
- Extend `.mastracode/plans/rom-archive.proof/demo.mjs`: add a scan→resolve→plan
  transcript with new marker lines — `RESOLVE:BUNDLE n=<count>`,
  `RESOLVE:INDIVIDUAL`, `COVER:URL <url>`, `COVER:TARGET <path>`,
  `COVER:OPTIONAL-SKIPPED` (404 tolerated). Keep the existing markers green.
- Adversarial review (verbatim prompt below), then STOP at human approval —
  do not self-approve.

## Do-not list

- Do NOT proxy ROM or image bytes through the API. Resolver returns links only.
- Do NOT disable SSL verification for calls to our own API. Third-party hosts
  (archive.org, thumbnails.libretro.com) only, via the existing scoped flag.
- Do NOT fork the FAT32 sanitizer; reuse `sanitize.ts` (TS) and `router.*` (C++).
- Do NOT let a missing/failed cover fail a ROM download.
- Do NOT encode resolved links/sizes/covers into the QR — pointer only.
- Do NOT break any existing endpoint, schema, test, or the drift guard.
- Do NOT introduce curated cross-item bundles in v1.
- Do NOT block the amendment on on-device camera QR — manual-entry fallback is
  acceptable and must be recorded as a deviation if used.

## Known limitations (state plainly in READMEs, do not oversell)

- **Cover hit-rate is partial.** Libretro thumbnails are keyed to No-Intro game
  names. When an archive.org filename follows No-Intro naming (as our
  `gbahomebrew` fixture does), covers match; for arbitrarily-named homebrew,
  many ROMs will have no cover. This is expected and non-fatal by design.
- **Covers are unverified links.** The resolver does not confirm the image
  exists (avoids per-file HEAD within the 10s function budget); the device
  tolerates a 404 at fetch time. A returned `coverUrl` is a best-effort
  candidate, not a guarantee.
- **Archived ROMs get no cover.** `.zip`/`.7z` entries are excluded from cover
  derivation.

## Adversarial review prompt (verbatim, first round)

> Review this amendment implementation on branch `feat/rom-archive-monorepo`
> (diff against tag/commit `5af5125`). Goal: add a QR "scan pointer" entry point
> (individual ROM and whole-item bundle; the pointer carries NO console —
> console is derived server-side from the curated catalog, and resolve rejects
> ids not in the catalog) plus optional libretro cover art keyed to the ROM's
> ROUTED on-SD filename (post collision-disambiguation), placed
> in TWiLight Menu++'s `_nds/TWiLightMenu/boxart/` folder, without breaking the
> shipped catalog/item/plan pipeline. Do-not list: no ROM/image bytes proxied by
> the API (resolver returns links only — verify the resolver/handler tests prove
> fetch is never called on `/download/` or `thumbnails.libretro.com`); SSL-verify
> stays enabled for our own API and disabled only for third-party hosts; the
> FAT32 sanitizer is not forked (TS `sanitize.ts`, C++ `router.*` reused for both
> ROM and cover paths); a missing/404 cover must not fail the ROM download; the QR
> carries only a versioned pointer, never resolved data; no existing endpoint,
> schema, test, or the `check_contract.mjs` drift guard is broken; the path-
> traversal guard now also gates cover targets (allow `roms/` and
> `_nds/TWiLightMenu/boxart/`, reject `..`). The platform layer lives in
> `apps/3ds/source/` (not `src/`). Verify: contract drift guard covers the new
> `ResolvedFile`/`ScanPointer`/`ResolveResponse` structs; the cover URL/target
> derivation matches libretro's illegal-char rule and TWiLight's filename rule
> (`<rom filename>.png`, flat folder, PNG); resolve of a bundle vs an individual
> pointer returns the right file set; unknown-console yields no cover fields; the
> C++ download orchestration places covers when present and stays green when the
> cover 404s; the proof demo emits the new RESOLVE/COVER markers alongside the
> existing PLAN/VERIFY ones. Report Must-fix / Risks & questions / Suggested
> improvements.
