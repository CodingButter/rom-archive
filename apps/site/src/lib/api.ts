import type { CatalogResponse, ItemPageResponse } from "@rom-archive/contract";

/**
 * Base URL for the rom-archive API. Defaults to same-origin (`/api/...`), which
 * is how the Next app and its route handlers deploy together. Override with
 * `NEXT_PUBLIC_API_BASE` when the API is hosted elsewhere.
 */
export const API_BASE: string = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** GET the curated catalog of items. */
export async function fetchCatalog(signal?: AbortSignal): Promise<CatalogResponse> {
  const res = await fetch(`${API_BASE}/api/catalog`, { signal });
  if (!res.ok) {
    throw new Error(`catalog request failed: ${res.status}`);
  }
  return (await res.json()) as CatalogResponse;
}

/**
 * GET one page of an item's ROM files, with an optional name filter. Always
 * passes pagination params, so the endpoint returns the paginated
 * `ItemPageResponse` shape (bounded `files` plus `total`/`page`/`pageSize`) —
 * used by the ROM list to browse bundles with thousands of ROMs without
 * loading every row.
 */
export async function fetchItemPage(
  id: string,
  opts: { page: number; pageSize: number; q?: string },
  signal?: AbortSignal,
): Promise<ItemPageResponse> {
  const params = new URLSearchParams({
    id,
    page: String(opts.page),
    pageSize: String(opts.pageSize),
  });
  if (opts.q) params.set("q", opts.q);
  const res = await fetch(`${API_BASE}/api/item?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(`item page request failed: ${res.status}`);
  }
  return (await res.json()) as ItemPageResponse;
}
