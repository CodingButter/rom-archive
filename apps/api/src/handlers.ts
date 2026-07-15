import {
  CatalogResponseSchema,
  DownloadPlanRequestSchema,
  ItemDetailResponseSchema,
  type CatalogResponse,
  type DownloadPlanResponse,
  type ItemDetailResponse,
} from "@rom-archive/contract";

import { ArchiveError, fetchItemMetadata, type FetchLike } from "./archiveClient.js";
import { findCatalogEntry, loadCatalog } from "./catalog.js";
import { buildDownloadPlan } from "./plan.js";

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

/** GET item detail (`?id=`) → the item's downloadable files from archive.org. */
export async function handleItem(
  id: string | undefined,
  fetchImpl: FetchLike,
): Promise<HandlerResult<ItemDetailResponse | ErrorBody>> {
  if (!id) {
    return { status: 400, body: { error: "missing required query parameter: id" } };
  }
  const entry = findCatalogEntry(id);
  if (!entry) {
    return { status: 404, body: { error: `unknown catalog id: ${id}` } };
  }
  try {
    const files = await fetchItemMetadata(id, fetchImpl);
    const body: ItemDetailResponse = { id, console: entry.console, files };
    return { status: 200, body: ItemDetailResponseSchema.parse(body) };
  } catch (err) {
    if (err instanceof ArchiveError) {
      return { status: 502, body: { error: "archive.org metadata request failed" } };
    }
    throw err;
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
