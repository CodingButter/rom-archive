# `@rom-archive/site`

The ROM Archive web app: a single Next.js (App Router) project that serves the
browse catalog, ROM-detail pages, and the QR-install page, and hosts the
stateless API as same-origin route handlers under `/api/*`. It reads
archive.org's public Metadata API and TheGamesDB, and **brokers links — it never
proxies ROM bytes.**

## Catalog

The catalog (`src/server/catalog.json`) is a curated list of archive.org item
identifiers, one `kind:"bundle"` entry per supported console. Each entry is a
full-set No-Intro–style item whose per-game files flatten (via
`extractRomFiles`) into loose, md5-bearing ROMs — so a single catalog row yields
both a whole-bundle QR and per-ROM download links with no extra mechanism. The
`console` field on each entry is the single source of truth for a ROM's routed
destination; it is derived server-side, never from the client. The full sets
carry thousands of ROMs each, which is why the item endpoint and ROM list are
paginated (below).

## Cover art

Covers are derived **client-side** from libretro's `Named_Boxarts` thumbnails.
Because every full-set ROM is stored as a per-game archive (`.zip` for No-Intro
NES/SNES/Genesis/PCE, `.7z` for GBA/GB/GBC/GG/SMS/DS), `coverUrlFor`
(`src/lib/cover.ts`) strips the single trailing archive extension — the No-Intro
archive stem _is_ the inner ROM title libretro names its box art by — and builds
`…/Named_Boxarts/<Title>.png`. No image bytes are ever proxied: the browser links
straight to libretro.

Coverage is genuinely **partial** — libretro lacks box art for some obscure
regional/unlicensed dumps. In the per-ROM list (`RomList`), `CoverImage` collapses
any failed image to a placeholder tile. Expect a minority of covers to fall back;
that is not a bug.

The item/bundle page additionally renders a **stitched mosaic cover**
(`src/components/bundle-mosaic.tsx`). It samples a **random, deduplicated spread**
of member ROMs from across the whole bundle — not the first 10, which on sets like
the DS bundle are ten regional variants of the same one or two games — and draws
their box-art onto a single `<canvas>` arranged as a **skewed, receding plane** (a
slightly rotated flat table of covers). The sampling core is a pure, unit-tested
helper (`src/lib/mosaic-sample.ts`): it walks one up-front shuffle of the page
range so every fetch hits a distinct page, dedupes by derived cover URL, and caps
at 10 tiles within a hard fetch bound.

A canvas has no per-`<img>` `onError`, so missing covers are handled at the draw
step: a cover that fails to load is drawn as a muted placeholder cell in its fixed
slot, never a broken-image icon. Because libretro sends **no CORS headers**, the
covers are loaded without `crossOrigin` (an anonymous request would fail to load),
which taints the canvas — so the mosaic is **render-only**: it never calls
`toDataURL`/`toBlob`, and there is deliberately no "save this stitched image"
export. As everywhere else, no image bytes are proxied through the API; the canvas
composes from libretro links in the browser.

The client `coverUrlFor` intentionally diverges from `src/server/cover.ts` on
archive names: the server still gates archives to `null` because its output keys
the on-device `.png` filename, which must match TWiLight's inner-ROM matching.
The **3DS/CIA-side cover download is out of scope here and deferred to a future
plan** — this change is website-display only. `src/lib/cover.test.ts` documents
that divergence and keeps enforcing byte-identity for non-archive names.

## API endpoints

All endpoints are same-origin route handlers under `/api/*`.

### `GET /api/catalog`

Returns the curated catalog: `{ entries: CatalogEntry[] }`.

### `GET /api/item`

Returns an item's downloadable ROM files, resolved from archive.org's Metadata
API. The archive.org bytes are never proxied — each file carries a direct
`downloadUrl`.

Query params:

| Param      | Required | Default | Notes                                                        |
| ---------- | -------- | ------- | ------------------------------------------------------------ |
| `id`       | yes      | —       | Catalog identifier. Unknown id → `404`.                      |
| `page`     | no       | —       | 1-based page number. Presence switches on pagination.        |
| `pageSize` | no       | `60`    | Page size. Clamped to a hard max of `200`.                   |
| `q`        | no       | —       | Case-insensitive substring filter on the ROM file name.      |

**Response shapes (additive / backward-compatible):**

- **No pagination params** (`page`, `pageSize`, and `q` all absent) → the full
  flat `ItemDetailResponse` (`{ id, console, files }`) — unchanged. The 3DS
  resolve/plan pipeline depends on this exact shape.
- **Any pagination param present** → `ItemPageResponse` = `ItemDetailResponse`
  fields plus `{ total, page, pageSize }`, where `files` is one bounded page and
  `total` is the count of files matching `q` across the whole item.

`ItemPageResponse` is a server→browser response only; it is deliberately not part
of the generated C++ mirror set and does not change any QR/3DS wire contract.

### `GET /api/metadata`

Returns game metadata for a ROM (`?id=&name=`), sourced from TheGamesDB with a
libretro fallback. Reads `TGDB_API_KEY` from the environment.

### `POST /api/plan`

Given a scan pointer, returns a fit-aware, collision-safe download plan.

## Environment

| Variable       | Purpose                                             |
| -------------- | --------------------------------------------------- |
| `TGDB_API_KEY` | TheGamesDB key for `/api/metadata`. Never hardcoded. |

See `.env.example`.
