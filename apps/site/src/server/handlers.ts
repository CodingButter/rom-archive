import {
  CatalogResponseSchema,
  DownloadPlanRequestSchema,
  ItemDetailResponseSchema,
  ItemPageResponseSchema,
  ResolveResponseSchema,
  ScanPointerSchema,
  type CatalogResponse,
  type DownloadPlanResponse,
  type ItemDetailResponse,
  type ItemPageResponse,
  type ResolveResponse,
} from "@rom-archive/contract";

import { ArchiveError, fetchItemMetadata, type FetchLike } from "./archiveClient";
import { paginateFiles, type PaginateOptions } from "./paginate";
import { findCatalogEntry, loadCatalog } from "./catalog";
import { unknownMetadata, type GameMetadata } from "./metadata";
import { resolveMetadata, type MetadataCache } from "./metadataService";
import { ResolveError, resolveScan } from "./resolve";
import { loadTgdbGenres } from "./tgdbGenres";
import { buildDownloadPlan } from "./plan";

/**
 * The pure result of a handler: an HTTP status and a JSON-serializable body.
 * The Vercel wrappers adapt this to `(req, res)`; tests and the proof call the
 * pure functions directly. Bodies are always plain objects — never byte streams
 * — which is what proves the "brokers links, never proxies bytes" invariant.
 */
export interface HandlerResult<T> {
  status: number;
  body: T;
}

export interface ErrorBody {
  error: string;
}

/** GET the curated catalog. */
export function handleCatalog(): HandlerResult<CatalogResponse | ErrorBody> {
  const entries = loadCatalog();
  const body: CatalogResponse = { entries: [...entries] };
  // Validate our own output against the contract before returning it.
  return { status: 200, body: CatalogResponseSchema.parse(body) };
}

/**
 * GET item detail (`?id=`) → the item's downloadable files from archive.org.
 *
 * Pagination is ADDITIVE and opt-in: when `pagination` is omitted (or has no
 * page/pageSize/q set), the response is the full flat `ItemDetailResponse` — the
 * exact shape the 3DS resolve/plan pipeline depends on, byte-for-byte unchanged.
 * When any pagination field is present, the response is a bounded
 * `ItemPageResponse` (one page + `total`/`page`/`pageSize`) so a browser never
 * holds a 5,000-row bundle at once.
 */
export async function handleItem(
  id: string | undefined,
  fetchImpl: FetchLike,
  pagination?: PaginateOptions,
): Promise<HandlerResult<ItemDetailResponse | ItemPageResponse | ErrorBody>> {
  if (!id) {
    return { status: 400, body: { error: "missing required query parameter: id" } };
  }
  const entry = findCatalogEntry(id);
  if (!entry) {
    return { status: 404, body: { error: `unknown catalog id: ${id}` } };
  }
  try {
    const files = await fetchItemMetadata(id, fetchImpl);
    if (isPaginated(pagination)) {
      const paged = paginateFiles(files, pagination);
      const body: ItemPageResponse = {
        id,
        console: entry.console,
        files: paged.files,
        total: paged.total,
        page: paged.page,
        pageSize: paged.pageSize,
      };
      return { status: 200, body: ItemPageResponseSchema.parse(body) };
    }
    const body: ItemDetailResponse = { id, console: entry.console, files };
    return { status: 200, body: ItemDetailResponseSchema.parse(body) };
  } catch (err) {
    if (err instanceof ArchiveError) {
      return { status: 502, body: { error: "archive.org metadata request failed" } };
    }
    throw err;
  }
}

/** True when the caller opted into pagination via any of page/pageSize/q. */
function isPaginated(p: PaginateOptions | undefined): p is PaginateOptions {
  return (
    p !== undefined &&
    (p.page !== undefined || p.pageSize !== undefined || p.q !== undefined)
  );
}

/** Injected dependencies for the metadata handler. */
export interface MetadataDeps {
  cache: MetadataCache;
  fetchImpl: FetchLike;
  env: { TGDB_API_KEY?: string | undefined };
}

/**
 * GET game metadata for a catalog item (`?id=` + `?name=`). Derives the console
 * from the catalog id (400 missing id/name, 404 unknown id — same rules as
 * handlePlan) and resolves metadata via the budget-aware service.
 *
 * NEVER throws to the caller on an upstream failure: a broken metadata source
 * must not break the page, so the worst case is a graceful `unknown` record with
 * a 200. Only routing errors (missing/unknown id) produce non-200s.
 */
export async function handleMetadata(
  id: string | undefined,
  name: string | undefined,
  deps: MetadataDeps,
): Promise<HandlerResult<GameMetadata | ErrorBody>> {
  if (!id) {
    return { status: 400, body: { error: "missing required query parameter: id" } };
  }
  if (!name) {
    return { status: 400, body: { error: "missing required query parameter: name" } };
  }
  const entry = findCatalogEntry(id);
  if (!entry) {
    return { status: 404, body: { error: `unknown catalog id: ${id}` } };
  }
  try {
    const meta = await resolveMetadata(entry.console, name, {
      cache: deps.cache,
      fetchImpl: deps.fetchImpl,
      env: deps.env,
      lookups: { genres: loadTgdbGenres() },
    });
    return { status: 200, body: meta };
  } catch {
    // Absolute floor: even an unexpected error yields a graceful unknown record,
    // never a 5xx — the page always renders.
    return { status: 200, body: unknownMetadata(entry.console, name) };
  }
}

/** POST a download plan request → a fit-aware plan. */
export async function handlePlan(
  rawBody: unknown,
  fetchImpl: FetchLike,
): Promise<HandlerResult<DownloadPlanResponse | ErrorBody>> {
  const parsed = DownloadPlanRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid download-plan request" } };
  }
  const req = parsed.data;
  const entry = findCatalogEntry(req.id);
  if (!entry) {
    return { status: 404, body: { error: `unknown catalog id: ${req.id}` } };
  }
  try {
    const files = await fetchItemMetadata(req.id, fetchImpl);
    const plan = buildDownloadPlan(entry.console, files, req);
    return { status: 200, body: plan };
  } catch (err) {
    if (err instanceof ArchiveError) {
      return { status: 502, body: { error: "archive.org metadata request failed" } };
    }
    throw err;
  }
}

/**
 * Resolve a scan pointer (the website "Send to 3DS" QR payload) into a concrete
 * ResolveResponse, reusing the tested resolveScan. The device POSTs the pointer
 * as a JSON body (POST, not GET, so ROM filenames with spaces/parens need no
 * URL-encoding). A schema-invalid pointer is a 400; an id/file the catalog or
 * item doesn't contain surfaces as ResolveError.status (404).
 */
export async function handleResolve(
  rawBody: unknown,
  fetchImpl: FetchLike,
): Promise<HandlerResult<ResolveResponse | ErrorBody>> {
  const parsed = ScanPointerSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid scan pointer" } };
  }
  try {
    const resolved = await resolveScan(parsed.data, fetchImpl);
    return { status: 200, body: ResolveResponseSchema.parse(resolved) };
  } catch (err) {
    if (err instanceof ResolveError) {
      return { status: err.status, body: { error: err.message } };
    }
    if (err instanceof ArchiveError) {
      return { status: 502, body: { error: "archive.org metadata request failed" } };
    }
    throw err;
  }
}
