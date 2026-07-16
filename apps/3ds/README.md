# ROM Archive — 3DS app

The on-device Nintendo 3DS homebrew app, packaged as an installable `.cia`.

## Layout

```
apps/3ds/
  core/          console-agnostic C++17 core — host-unit-tested, no libctru
    include/     the seams: contract, http_client, file_sink, json, download, md5, fit
    src/         the logic: download orchestration, streaming MD5, console routing
    tests/       doctest suite + fixtures (run on the host g++)
    scripts/     check_contract.mjs — drift guard vs. the TS contract
  source/        libctru platform layer (built only for ARM)
    platform/    httpc client, SD file sink, jansson JSON, citro2d UI, API
                 client, camera+QR capture (qr_camera_3ds)
    vendor/quirc vendored QR decoder (ISC) — device tree only, never host-built
    main.cpp     the app: menu → {browse | scan} → confirm → download → done
  tools/         make_icon.py — regenerates the 48×48 HOME-menu icon
  icon.png       the HOME-menu icon devkitARM's SMDH rule embeds
  docker/        the devkitARM build image (base + makerom + bannertool)
  Makefile       cross-compiles source/ + core/src → .elf/.3dsx/.smdh
  build.sh       Docker build harness → .cia
  app.rsf        makerom spec for CIA packaging
```

## Two ways to get a ROM

The app opens on a small menu with two entry paths that both funnel into the
**same** MD5-verified, path-safe download orchestrator (`downloadPlan()` — it
rejects any target outside `roms/` or containing `..`):

- **Browse** the catalog on-device: open a bundle, page through its ROMs
  (`L`/`R`), toggle-select individual files (`X`) or plan the whole bundle
  (`A`), then download. Large No-Intro sets are paged, so a 5000-file bundle
  stays usable.
- **Scan QR**: point the camera at a "Send to 3DS" QR from the website (a
  bundle or a single ROM). The decoded pointer is resolved server-side into a
  concrete file list, then downloaded through the identical flow.

### The scan path and `/api/resolve`

A website QR encodes a small `ScanPointer` — `{"v":1,"id":"<bundle>"}` for a
whole bundle, plus `"file":"<name>"` for a single ROM. The device **POSTs** that
JSON to `/api/resolve` (POST, not GET, so ROM names with spaces and parentheses
travel in the body without URL-encoding). The server derives the console from
the catalog, routes each file's `targetPath`, and returns a `ResolveResponse`
of concrete files with download URLs and MD5s — metadata and links only, never
proxied ROM/image bytes. The device maps that response onto the existing plan
shape and downloads it.

The QR decoder is [quirc](https://github.com/dlbeer/quirc) (ISC license),
vendored under `source/vendor/quirc/` (see its `VERSION.md` for the pinned
commit). It lives in the device-only source tree and is compiled solely into
the ARM build — the host doctest build never touches it. All camera and quirc
usage is confined to `source/platform/qr_camera_3ds.{hpp,cpp}`.

The core is deliberately split from the platform layer. Everything that can be
tested without a console — download orchestration, incremental MD5, console→path
routing, FAT32 filename sanitization, fit math — lives in `core/` and is proven
by fast host unit tests. The platform layer in `source/` only supplies the real
libctru implementations of the core's seams (HTTP over `httpc`, SD writes,
jansson JSON).

## Host-testing the core

No devkitARM needed:

```sh
cd apps/3ds/core
make test                    # doctest suite (native g++)
node scripts/check_contract.mjs   # fail if the C++ mirror drifts from the contract
```

## Building the .cia

The full app cross-compiles in the pinned devkitARM Docker image (built once
from `docker/`, then reused). Requires Docker.

```sh
cd apps/3ds
./build.sh            # produces rom-archive.3dsx and rom-archive.cia
./build.sh --check    # same, then asserts both artifacts exist and are non-empty
```

Point the app at your deployed API at build time:

```sh
API_BASE_URL="https://your-api.example" ./build.sh
```

Build artifacts (`.elf` / `.3dsx` / `.smdh` / `.bnr` / `.cia`) are gitignored.

## Installing and testing on hardware

1. Host the built `rom-archive.cia` somewhere the console can reach (the
   `apps/site` install page serves it and shows a QR code).
2. On the 3DS, open **FBI → Remote Install → Scan QR Code** and scan it. FBI
   downloads and installs the `.cia`.
3. Launch **ROM Archive** — it appears in the HOME menu with its own name and
   cartridge icon (from `icon.png`, embedded in the SMDH). The Title ID is
   fixed (`0xFF3FE`), so re-installing a newer build updates the same entry.
4. From the menu, choose **Browse catalog** or **Scan QR code**.
   - Browse: open a title, page with `L`/`R`, select files with `X` (or plan
     all with `A`), then confirm. The app reports SD free space and what fits.
   - Scan: point the camera at a website "Send to 3DS" QR; the resolved files
     go straight to the confirm screen.
5. Press **A** to download. Each ROM streams to `sd:/roms/<console>/`, is
   MD5-verified, and a corrupted file is rejected rather than kept.
6. Open TWiLight Menu++ — the downloaded ROMs appear under their console.

### Note on transport

The 3DS SSL sysmodule ships a frozen root-CA store that cannot validate modern
archive.org certificates, so the httpc client disables SSL peer verification for
the archive.org transfer and follows redirects to data nodes manually. This
applies only to the direct-to-archive.org ROM download; integrity is guaranteed
by the mandatory MD5 check against archive.org's published checksum, not by the
transport.

A live download on physical hardware is the only part of the pipeline that
cannot be exercised in CI (no console, and emulator httpc fidelity is
unreliable). Every piece of logic that is ours is covered by the host tests and
the end-to-end proof; the manual steps above are the smoke test for the
libctru transport itself.
