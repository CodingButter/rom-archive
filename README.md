# ROM Archive

A homebrew ROM downloader for the Nintendo 3DS. Browse a console-organized
catalog of public-domain / homebrew titles hosted on [archive.org](https://archive.org),
check the SD card has room, download the ROMs directly to the console, verify
each file against its published MD5, and drop it into the right
`sd:/roms/<console>/` folder for [TWiLight Menu++](https://github.com/DS-Homebrew/TWiLightMenu).

The catalog here is intentionally limited to freely distributable homebrew and
unlicensed titles.

## The three artifacts

This is a monorepo that ships three cooperating pieces:

| Path | What it is |
| --- | --- |
| `apps/3ds` | The on-device app, packaged as an installable `.cia`. A C++ program with a host-testable, console-agnostic core (`apps/3ds/core`) and a thin libctru platform layer (`apps/3ds/source`). |
| `apps/api` | A stateless Vercel serverless API that reads archive.org's public Metadata API and returns catalog / item / download-plan JSON. It **brokers links and never proxies ROM bytes.** |
| `apps/web` | A landing page and QR-install page (Vite + React) that serves the `.cia` for install via FBI. |

A shared contract package (`packages/contract`, zod + generated JSON Schema) is
the single source of truth for the wire format. The C++ structs mirror it by
hand, kept honest by a drift guard (`apps/3ds/core/scripts/check_contract.mjs`)
that fails the build if the mirror and the schema disagree.

## How it fits together

```
  ┌──────────┐   catalog / item / plan JSON    ┌─────────────┐
  │  3DS app │ ──────────────────────────────► │  apps/api   │
  │ (.cia)   │ ◄────────────────────────────── │  (Vercel)   │
  └────┬─────┘   (free space in, plan out)      └──────┬──────┘
       │                                               │  metadata only
       │  direct ROM download (streamed,               ▼
       │  MD5-verified, never via the API)      ┌─────────────┐
       └──────────────────────────────────────► │ archive.org │
                                                 └─────────────┘
```

The console sends the API its SD free space; the API fetches the item's
archive.org metadata, expands a bundle into a flat per-file list, does the
storage-fit math (smallest-first), and returns a plan of direct download URLs
with on-SD target paths. The console then streams each ROM straight from
archive.org to the SD card — chunk by chunk, never buffering a whole ROM in RAM
— computing MD5 on the fly and rejecting any file whose digest does not match.
The API is only ever asked for bounded JSON; the ROM bytes never pass through
it.

## Install flow (on hardware)

1. Deploy `apps/api` and `apps/web`, and host the built `.cia`.
2. On the 3DS, open [FBI](https://github.com/Steveice10/FBI) →
   **Remote Install → Scan QR Code**.
3. Scan the QR code on the web app's `/install` page (it encodes the `.cia`
   URL). FBI downloads and installs the app.
4. Launch **ROM Archive** from the HOME menu, pick a title, confirm the plan,
   and let it download. Files land in `sd:/roms/<console>/`, ready for
   TWiLight Menu++.

## Building

Prerequisites: [pnpm](https://pnpm.io), Node 20+, and Docker (for the 3DS
cross-compile toolchain).

```sh
pnpm install

# TypeScript workspaces (contract, api, web): build, typecheck, test
pnpm turbo run build check test

# The console-agnostic C++ core, host unit tests + contract drift guard
cd apps/3ds/core && make test && node scripts/check_contract.mjs

# The full 3DS app → .3dsx + .cia, built in the devkitARM Docker image
cd apps/3ds && ./build.sh --check
```

Per-app details are in `apps/api/README.md` and `apps/3ds/README.md`.

## Proof

An end-to-end host demo runs the real API handlers and the real C++ download
core (no device, no running server):

```sh
node .mastracode/plans/rom-archive.proof/demo.mjs
```

It shows the fit math (everything-fits vs. smallest-first partial fit), asserts
the API never reaches for a `/download/` URL, and runs the core's download
orchestration to stream + MD5-verify + route a good ROM and to reject a
corrupted one.
