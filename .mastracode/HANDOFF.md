# Session handoff — rom-archive (written 2026-07-16, migrating dev machine → dev-beast)

Read this first. It captures exactly where work stopped mid-round so the next
session can resume without re-diagnosis. The previous machine was Jamie's
laptop; work continues on dev-beast.

## Project state (all merged + released)

- `main` is the only branch that matters; everything through `366467d` is
  merged, pushed, and released.
- **Website**: Next.js 15 app in `apps/site`, live at
  `https://rom-archive.vercel.app` (Vercel auto-deploys `main`). 287/287 tests.
- **3DS app**: `apps/3ds`, released as **v1.1.0** —
  `https://github.com/CodingButter/rom-archive/releases/latest/download/rom-archive.cia`
  (HTTP 200, 270784 bytes). Built by `.github/workflows/release-cia.yml` on
  `v*` tags (devkitARM Docker). Local build: `apps/3ds/build.sh --check`
  (needs Docker; tail the output).
- The full QR+browse plan (`.mastracode/plans/rom-archive-3ds-qr-browse.md`)
  completed all 7 phases; adversarial review clean. Host doctest: 28 cases /
  214 assertions. `check_contract.mjs` green.

## WHERE WE STOPPED: v1.1.0 failed on-device testing (3 bugs + 1 UX request)

Jamie installed v1.1.0 on real hardware. Results:

### Bug 1 — Browse catalog: "network error" on device
**Diagnosed, fix known, NOT yet implemented.**
`apps/3ds/source/platform/http_client_3ds.cpp`: API calls (`getString`,
`postJson`) run with TLS verification ON (`insecure=false`). The 3DS's frozen
root-CA store cannot validate vercel.app's modern cert chain — the file's own
comment admits this exact problem for archive.org (where verify is already
disabled). `fetchCatalog` fails TLS → "network error".
**Fix**: pass `insecure=true` for ALL requests (flip lines ~139 and ~151, or
collapse the parameter). Update the comment honestly: the root store can't
validate modern chains anywhere; ROM bytes remain MD5-verified; API metadata
trust is a documented tradeoff (standard practice — FBI/Anemone/Universal-
Updater all disable verify).

### Bug 2 — Scan QR: camera "not working", nothing on top screen
**Diagnosed, fix designed, NOT yet implemented.** Two layers:

(a) **Capture bugs** in `apps/3ds/source/platform/qr_camera_3ds.cpp`, found by
comparing against Anemone3DS's proven `source/camera.c` (fetched to
`/tmp/anemone-camera.c` on the old machine; re-fetch from
`https://raw.githubusercontent.com/astronautlevel2/Anemone3DS/master/source/camera.c`):
  1. We use `SELECT_IN1` (inner camera, faces the user). Every QR homebrew
     (Anemone/FBI/QRaken) uses **`SELECT_OUT1`** (outer) — you point the
     console's back at the screen. Switch to OUT1.
  2. We never call **`CAMU_SetTrimming(PORT_CAM1, false)`** — Anemone does.
     Without it transfer geometry can mismatch → receive never completes →
     poll() times out forever. Likely the root cause of "camera dead".
  3. Our RGB565 buffer is a `std::vector` (app heap). CAMU DMA wants
     **`linearAlloc`** memory (Anemone line 95). Switch.
  4. Also add `CAMU_SetFrameRate(SELECT_OUT1, FRAME_RATE_30)`.
  5. Our poll() re-arms `CAMU_SetReceiving` every call even when the previous
     receive is still pending (300ms timeout path) — leak/conflict. Restructure:
     arm once in `start()`, store the event handle as a member; `poll()` waits
     with a short timeout (~16-33ms); on event fire → close handle, process
     frame, re-arm. On many consecutive timeouts (~60), recover with
     `CAMU_ClearBuffer` + `CAMU_StartCapture` + re-arm; only after repeated
     failed recoveries return `QrPoll::Error`. Teardown order (Anemone lines
     148-166): StopCapture → wait `CAMU_IsBusy` false → ClearBuffer →
     Activate(SELECT_NONE) → camExit → linearFree → close handles.

(b) **No viewfinder** — the user can't aim. Add one using the FBI/Anemone
CPU-swizzle pattern (Anemone `update_ui`, lines 174-201):
  - `C3D_Tex` 512×256 `GPU_RGB565`, `C3D_TexSetFilter(GPU_LINEAR, GPU_LINEAR)`.
  - `Tex3DS_SubTexture subt = { 400, 240, 0.0f, 1.0f, 400.0f/512.0f, 1.0f - (240.0f/256.0f) }`.
  - Per new frame, morton-swizzle RGB565 into the tex:
    `dst = ((((y>>3)*(512>>3) + (x>>3)) << 6) + ((x&1)|((y&1)<<1)|((x&2)<<1)|((y&2)<<2)|((x&4)<<2)|((y&4)<<3)))`
  - `C2D_DrawImageAt({&tex, &subt}, 0, 0, ...)` on the TOP screen target.
  - Plumbing plan: `QrCamera` exposes `const u16* frame()` + a new-frame flag;
    `Ui` (apps/3ds/source/platform/ui.{hpp,cpp}) gains a `drawScan(frame)`
    method (top = viewfinder, bottom = existing status line); `main.cpp`'s
    `Screen::Scan` case calls `ui.drawScan(...)` instead of the generic
    `ui.draw()` at the loop tail (note: `ui.draw()` runs unconditionally at
    main.cpp:317 — gate it for Scan).
  - Write ORIGINAL code from the pattern (Anemone is GPLv3 — reference only;
    the morton formula/API sequence are standard, but do not copy code).

### Bug 3 — Installed CIA doesn't appear on HOME menu (shows in FBI titles)
**Investigated — CIA looks structurally CORRECT; likely needs a console
reboot.** Verified on the v1.1.0 artifacts: SMDH region-free (0xFFFFFFFF @
0x2018), Visible flag set (flags 0x141 @ 0x2028), TID `000400000FF3FE00`
(proper 00040000 Application) present in ticket+TMD, icon embedded, Category:
Application, UseOnSD true (apps/3ds/app.rsf). FBI listing it under Titles
proves the install. Most probable cause: HOME menu title cache — **ask Jamie
whether it appeared after a full reboot** before touching anything. (He DID
manage to launch the app somehow — worth asking how.) If still hidden after
reboot, next suspects: HOME's ~300 SD-title display limit; then compare RSF
against FBI's cia.rsf.

### UX request 4 — Website QR codes too small to scan
Jamie: clicking a QR (per-ROM "Send to 3DS" in
`apps/site/src/components/rom-list.tsx` AND the whole-bundle QR card in
`apps/site/src/app/item/[id]/page.tsx`) should open a **large modal** with a
much bigger QR — the 3DS camera needs size/clarity. NOT implemented yet.
Constraints: keep `data-testid="qr"` + `data-qr-value` byte-identical QR JSON
(`scanPointerValue` key order v→id→file is test-pinned), keep QR white bg +
quiet zone (`qr-code.tsx` margin: 2, bg-white), don't break the 287-test suite
(rom-list tests pin "Send to 3DS"/"Hide QR" button text, searchbox role, "ROMs
(n)"/"Page n of m" single text nodes).

## Release protocol (IMPORTANT — how Jamie tests)
On-device testing is release-driven, NEVER SD-card-swap. Flow: fix → build
`apps/3ds/build.sh --check` → commit to `main` → tag `v1.1.1` → push tag →
`release-cia.yml` builds+publishes → **confirm the workflow succeeded AND
`releases/latest/download/rom-archive.cia` returns HTTP 200** → only then hand
Jamie the FBI Remote-Install URL + a test checklist. Site changes deploy by
pushing `main` (Vercel auto). The device API origin is baked at build:
`API_BASE_URL` repo variable = `https://rom-archive.vercel.app` (already set).

## Environment notes for dev-beast
- Needs: node/pnpm (site: `pnpm install`, `pnpm test` in apps/site), Docker
  (3DS build image builds itself on first `build.sh` run), `gh` CLI authed for
  releases, git identity.
- Vercel project `rom-archive` (team codingbutters-projects) is git-connected;
  no local Vercel setup needed.
- TGDB_API_KEY lives in Vercel env vars only (never commit).

## Suggested task order on resume
1. TLS fix (small, unblocks Browse — Bug 1).
2. Camera rewrite + viewfinder (Bug 2a + 2b, biggest chunk).
3. Website QR modal (Request 4) — push main, verify live.
4. Build + tag v1.1.1, verify 200, hand Jamie the install QR + checklist
   (include: reboot console and recheck HOME menu for Bug 3; ask how he
   launched the app).
5. Host suite + contract check must stay green (28 cases / 214 assertions).
