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
    platform/    httpc client, SD file sink, jansson JSON, citro2d UI, API client
    main.cpp     the app: catalog → item → confirm → download → done
  docker/        the devkitARM build image (base + makerom + bannertool)
  Makefile       cross-compiles source/ + core/src → .elf/.3dsx/.smdh
  build.sh       Docker build harness → .cia
  app.rsf        makerom spec for CIA packaging
```

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
   `apps/web` install page serves it and shows a QR code).
2. On the 3DS, open **FBI → Remote Install → Scan QR Code** and scan it. FBI
   downloads and installs the `.cia`.
3. Launch **ROM Archive**, pick a catalog title, and press **A** to build a
   plan. The app reports the SD free space and which files fit.
4. Press **A** to download. Each ROM streams to `sd:/roms/<console>/`, is
   MD5-verified, and a corrupted file is rejected rather than kept.
5. Open TWiLight Menu++ — the downloaded ROMs appear under their console.

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
