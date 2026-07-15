import type { CatalogResponse, ItemDetailResponse } from "@rom-archive/contract";

/**
 * Base URL for the rom-archive API. Defaults to same-origin (`/api/...`), which
 * is how the SPA and its Vercel functions deploy together. Override with
 * `VITE_API_BASE` when the API is hosted elsewhere.
 */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

/** GET the curated catalog of items. */
export async function fetchCatalog(signal?: AbortSignal): Promise<CatalogResponse> {
  const res = await fetch(`${API_BASE}/api/catalog`, { signal });
  if (!res.ok) {
    throw new Error(`catalog request failed: ${res.status}`);
  }
  return (await res.json()) as CatalogResponse;
}

/** GET one item's downloadable files (`?id=`). */
export async function fetchItem(
  id: string,
  signal?: AbortSignal,
): Promise<ItemDetailResponse> {
  const res = await fetch(`${API_BASE}/api/item?id=${encodeURIComponent(id)}`, { signal });
  if (!res.ok) {
    throw new Error(`item request failed: ${res.status}`);
  }
  return (await res.json()) as ItemDetailResponse;
}
