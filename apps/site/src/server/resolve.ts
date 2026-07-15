import type { ResolvedFile, ResolveResponse, ScanPointer } from "@rom-archive/contract";

import { fetchItemMetadata, type FetchLike } from "./archiveClient";
import { findCatalogEntry } from "./catalog";
import { coverTargetPathFor, coverUrlFor } from "./cover";
import { sanitizeForPlan, targetPathFor } from "./sanitize";

/** Raised when a scan pointer names something the catalog/item doesn't contain. */
export class ResolveError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ResolveError";
  }
}

/**
 * Resolve a scan pointer into a flat, ready-to-execute file list. Console is
 * derived server-side from the curated catalog (single source of truth) — a
 * pointer id not in the catalog is rejected (404). Each ROM is routed to its
 * final collision-disambiguated `targetPath` using the same sanitizer the
 * planner uses, and each single-file playable ROM gets optional cover fields
 * keyed to that ROUTED basename. A pointer with `file` restricts the result to
 * exactly that file (404 if the item doesn't contain it).
 *
 * This never fetches ROM or image bytes — only archive.org metadata JSON. The
 * libretro cover URL is returned as an unverified link for the console to fetch.
 */
export async function resolveScan(
  pointer: ScanPointer,
  fetchImpl: FetchLike,
): Promise<ResolveResponse> {
  const entry = findCatalogEntry(pointer.id);
  if (!entry) {
    throw new ResolveError(`unknown catalog id: ${pointer.id}`, 404);
  }

  const allFiles = await fetchItemMetadata(pointer.id, fetchImpl);

  const selected =
    pointer.file === undefined
      ? allFiles
      : allFiles.filter((f) => f.name === pointer.file);

  if (pointer.file !== undefined && selected.length === 0) {
    throw new ResolveError(`file not found in item ${pointer.id}: ${pointer.file}`, 404);
  }

  // Route through the shared sanitizer so target paths are FAT32-safe and
  // collision-disambiguated across the whole selected set — identical to /plan.
  const routed = sanitizeForPlan(selected.map((f) => f.name));

  const files: ResolvedFile[] = selected.map((f, i) => {
    const targetPath = targetPathFor(entry.console, routed[i]!);
    const coverUrl = coverUrlFor(entry.console, f.name);
    const base: ResolvedFile = {
      name: f.name,
      sizeBytes: f.sizeBytes,
      md5: f.md5,
      downloadUrl: f.downloadUrl,
      targetPath,
    };
    if (coverUrl !== null) {
      base.coverUrl = coverUrl;
      base.coverTargetPath = coverTargetPathFor(targetPath);
    }
    return base;
  });

  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

  return { id: pointer.id, console: entry.console, files, totalBytes };
}
