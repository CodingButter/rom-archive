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
