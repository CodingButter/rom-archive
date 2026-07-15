import type { Console, ItemDetailFile } from "@rom-archive/contract";

import { coverUrlFor } from "@/lib/cover";

/**
 * Pure, DOM-free sampling core for the bundle mosaic. Split out from the
 * component so the testable logic — random spread, dedupe, top-up bound, and the
 * page-range mapping — is proven here with an injected `random`, without jsdom's
 * canvas/image gaps (jsdom `getContext` returns null and `Image` never fires
 * load/error, so none of that is unit-testable in the component).
 */

/** Maximum number of distinct covers the mosaic composes. */
export const TILE_CAP = 10;

/**
 * Hard ceiling on total `fetchItemPage` calls per mosaic render, INCLUDING the
 * probe. So the spread path is the probe plus up to 13 `pageSize: 1` page
 * fetches. This bounds a collision-heavy bundle to a fixed number of round-trips
 * rather than spinning; on a fully-colliding set the mosaic accepts fewer than
 * `TILE_CAP` tiles.
 */
export const MAX_FETCHES = 14;

/** One `{ name, url }` tile: a member ROM and its derived (non-null) cover URL. */
export interface MosaicTile {
  name: string;
  url: string;
}

/**
 * A full Fisher–Yates permutation of the 1-based page numbers `[1, total]`,
 * using the injected `random: () => number` (defaults to `Math.random`).
 *
 * Producing ONE ordering up front is what makes the top-up safe: the
 * orchestration walks this permutation as a prefix, so every fetch targets a
 * DISTINCT page and top-up simply continues to the next unseen page — a known
 * page can never be re-fetched. There is no rejection sampling, so there is no
 * spin even when the needed count approaches `total`. Deterministic under a
 * seeded `random`, so tests are never flaky. Returns `[]` for `total <= 0`.
 */
export function shuffledPages(total: number, random: () => number = Math.random): number[] {
  const n = Math.max(0, Math.trunc(total));
  const pages = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = pages[i]!;
    pages[i] = pages[j]!;
    pages[j] = tmp;
  }
  return pages;
}

/**
 * Map member files to `{ name, url }` tiles, dropping members whose cover URL
 * derives to null (unmapped console), deduping by URL (regional variants of the
 * same title share a cover), preserving first-seen order, and capping at
 * `TILE_CAP`. Slot order is fixed here at sample time so the canvas can draw slot
 * `i` for tile `i` regardless of image load order (no load-order race).
 */
export function buildTiles(
  files: readonly ItemDetailFile[],
  console: Console,
  derive: (console: Console, name: string) => string | null = coverUrlFor,
): MosaicTile[] {
  const tiles: MosaicTile[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    if (tiles.length >= TILE_CAP) break;
    const url = derive(console, f.name);
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    tiles.push({ name: f.name, url });
  }
  return tiles;
}
