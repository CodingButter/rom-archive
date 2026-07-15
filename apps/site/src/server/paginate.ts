import type { ItemDetailFile } from "@rom-archive/contract";

/** Default page size when a caller opts into pagination without specifying one. */
export const DEFAULT_PAGE_SIZE = 60;
/** Hard upper bound on page size, so a caller can never request the whole 5,000-row list. */
export const MAX_PAGE_SIZE = 200;

export interface PaginateOptions {
  /** Optional case-insensitive substring filter on the file name. */
  q?: string | undefined;
  /** 1-based page number. Values < 1 are clamped to 1. */
  page?: number | undefined;
  /** Page size. Clamped to [1, MAX_PAGE_SIZE]; defaults to DEFAULT_PAGE_SIZE. */
  pageSize?: number | undefined;
}

export interface PaginateResult {
  /** The bounded slice of files for this page (may be empty for out-of-range pages). */
  files: ItemDetailFile[];
  /** Count of files matching `q` across the whole item (the filter, not the page). */
  total: number;
  /** The resolved 1-based page number. */
  page: number;
  /** The resolved page size after clamping. */
  pageSize: number;
}

/** Clamp to an integer in [min, max], falling back to `fallback` for non-finite input. */
function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  const n = Math.trunc(value);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * Filter by an optional case-insensitive name substring, then return one bounded
 * page. `total` is the filtered count across the whole item (so the UI can build
 * a pager); an out-of-range page yields an empty slice with the correct total.
 * Pure and side-effect free — the same input always gives the same page.
 */
export function paginateFiles(
  files: ItemDetailFile[],
  options: PaginateOptions = {},
): PaginateResult {
  const query = options.q?.trim().toLowerCase();
  const filtered = query
    ? files.filter((f) => f.name.toLowerCase().includes(query))
    : files;

  const pageSize = clampInt(options.pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const page = clampInt(options.page, 1, Number.MAX_SAFE_INTEGER, 1);

  const start = (page - 1) * pageSize;
  const slice = start >= filtered.length ? [] : filtered.slice(start, start + pageSize);

  return { files: slice, total: filtered.length, page, pageSize };
}
