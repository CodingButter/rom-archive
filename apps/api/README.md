# @rom-archive/api

Stateless Vercel serverless API that brokers archive.org download links for the
ROM Archive 3DS app. It reads archive.org's public Metadata API, expands items
into flat per-file URL lists, and does storage-fit math against the free space
the console reports. **It never proxies or streams ROM bytes** — every response
is bounded JSON (catalog / item detail / download plan); the heavy download is a
direct 3DS ↔ archive.org transfer.

## Endpoints

- `GET /api/catalog` → `CatalogResponse` — the curated catalog.
- `GET /api/item?id=<archive.org-id>` → `ItemDetailResponse` — the item's
  downloadable ROM files (name, size, md5, direct download URL).
- `POST /api/plan` (`DownloadPlanRequest`) → `DownloadPlanResponse` — a fit-aware
  plan: which files fit the reported free space (smallest-first), their on-SD
  target paths, and what was excluded and why.

All request/response shapes come from `@rom-archive/contract`.

## Architecture

Each Vercel function in `api/` is a thin `(req, res)` wrapper over an exported
pure function in `src/handlers.ts` (`handleCatalog`, `handleItem`, `handlePlan`)
that takes plain input and returns `{ status, body }`. Tests and the end-to-end
proof call the pure functions directly, so no running server is needed to
exercise the full request logic.

## Local development

```sh
# from the repo root
pnpm --filter @rom-archive/api build
# run the functions locally (requires the Vercel CLI)
cd apps/api && vercel dev
```

## Tests

```sh
pnpm --filter @rom-archive/api test
```

Tests run entirely offline against committed archive.org metadata fixtures. The
mock `fetch` throws if a handler ever reaches for a `/download/` URL, which is
the executable guarantee that the API brokers links and never proxies bytes.
