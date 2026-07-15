import type {
  Console,
  DownloadPlanRequest,
  DownloadPlanResponse,
  ExcludedFile,
  ItemDetailFile,
  PlanFile,
} from "@rom-archive/contract";

import { sanitizeForPlan, targetPathFor } from "./sanitize";

/**
 * Build a fit-aware download plan from an item's files and the console's
 * request. Selection is applied first (default: all files). If the selected set
 * doesn't fit the reported free space, files are included **smallest-first**
 * until the next file would overflow; the remainder is reported under
 * `excluded` with reason `insufficient-space`. Smallest-first makes the excluded
 * set deterministic and testable.
 *
 * Target paths route through the shared sanitizer (collision-disambiguated
 * across the whole selected set) so the on-SD names are FAT32-safe.
 */
export function buildDownloadPlan(
  console: Console,
  files: ItemDetailFile[],
  req: DownloadPlanRequest,
): DownloadPlanResponse {
  const selection = selectFiles(files, req.selectedFileNames);
  const excluded: ExcludedFile[] = selection.notSelected.map((f) => ({
    name: f.name,
    sizeBytes: f.sizeBytes,
    reason: "not-selected" as const,
  }));

  // Smallest-first greedy fit over the selected files.
  const bySize = [...selection.selected].sort(
    (a, b) => a.sizeBytes - b.sizeBytes || a.name.localeCompare(b.name),
  );

  const included: ItemDetailFile[] = [];
  let totalBytes = 0;
  const overflow: ItemDetailFile[] = [];
  for (const f of bySize) {
    if (totalBytes + f.sizeBytes <= req.freeSpaceBytes) {
      included.push(f);
      totalBytes += f.sizeBytes;
    } else {
      overflow.push(f);
    }
  }
  for (const f of overflow) {
    excluded.push({
      name: f.name,
      sizeBytes: f.sizeBytes,
      reason: "insufficient-space",
    });
  }

  const sanitized = sanitizeForPlan(included.map((f) => f.name));
  const planFiles: PlanFile[] = included.map((f, i) => ({
    name: f.name,
    sizeBytes: f.sizeBytes,
    md5: f.md5,
    downloadUrl: f.downloadUrl,
    targetPath: targetPathFor(console, sanitized[i]!),
  }));

  return {
    fits: overflow.length === 0,
    totalBytes,
    freeSpaceBytes: req.freeSpaceBytes,
    files: planFiles,
    ...(excluded.length > 0 ? { excluded } : {}),
  };
}

function selectFiles(
  files: ItemDetailFile[],
  selectedNames: string[] | undefined,
): { selected: ItemDetailFile[]; notSelected: ItemDetailFile[] } {
  if (selectedNames === undefined) {
    return { selected: files, notSelected: [] };
  }
  const wanted = new Set(selectedNames);
  const selected: ItemDetailFile[] = [];
  const notSelected: ItemDetailFile[] = [];
  for (const f of files) {
    if (wanted.has(f.name)) selected.push(f);
    else notSelected.push(f);
  }
  return { selected, notSelected };
}
