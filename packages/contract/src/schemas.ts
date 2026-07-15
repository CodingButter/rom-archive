import { z } from "zod";
import { ConsoleSchema } from "./console.js";

/** A non-negative integer byte count. archive.org reports sizes as strings; the
 * API parses them to strict integers before they reach the wire. */
const ByteCount = z.number().int().nonnegative();

/**
 * A catalog entry describes one archive.org item we expose. `kind` marks
 * whether the item is a single ROM or a "bundle" (an item whose files are
 * individual ROMs the API lists flat — the console never unzips).
 */
export const CatalogEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  console: ConsoleSchema,
  kind: z.enum(["bundle", "single"]),
  approxSizeBytes: ByteCount.optional(),
});
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

export const CatalogResponseSchema = z.object({
  entries: z.array(CatalogEntrySchema),
});
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

/**
 * One downloadable file. `md5` is REQUIRED: the API drops any archive.org file
 * lacking an md5 (derivative/metadata files), so the on-device verifier can
 * always assume a checksum is present. `downloadUrl` is the direct archive.org
 * URL (the API never proxies bytes).
 */
export const ItemDetailFileSchema = z.object({
  name: z.string().min(1),
  sizeBytes: ByteCount,
  md5: z.string().min(1),
  downloadUrl: z.url(),
});
export type ItemDetailFile = z.infer<typeof ItemDetailFileSchema>;

export const ItemDetailResponseSchema = z.object({
  id: z.string().min(1),
  console: ConsoleSchema,
  files: z.array(ItemDetailFileSchema),
});
export type ItemDetailResponse = z.infer<typeof ItemDetailResponseSchema>;

/**
 * The console asks the server to plan a download: which item, which files
 * (default: all), and how much SD space is free so the server does the fit math.
 * Strict: this is a system boundary (untrusted client input), so unknown keys
 * are rejected rather than silently stripped — matching the emitted JSON
 * Schema's `additionalProperties: false`.
 */
export const DownloadPlanRequestSchema = z.strictObject({
  id: z.string().min(1),
  selectedFileNames: z.array(z.string().min(1)).optional(),
  freeSpaceBytes: ByteCount,
});
export type DownloadPlanRequest = z.infer<typeof DownloadPlanRequestSchema>;

/** A file included in a plan, with its resolved on-SD target path. */
export const PlanFileSchema = z.object({
  name: z.string().min(1),
  sizeBytes: ByteCount,
  md5: z.string().min(1),
  downloadUrl: z.url(),
  targetPath: z.string().min(1),
});
export type PlanFile = z.infer<typeof PlanFileSchema>;

/** A file left out of a plan, with the reason. */
export const ExcludedFileSchema = z.object({
  name: z.string().min(1),
  sizeBytes: ByteCount,
  reason: z.enum(["insufficient-space", "not-selected"]),
});
export type ExcludedFile = z.infer<typeof ExcludedFileSchema>;

export const DownloadPlanResponseSchema = z.object({
  fits: z.boolean(),
  totalBytes: ByteCount,
  freeSpaceBytes: ByteCount,
  files: z.array(PlanFileSchema),
  excluded: z.array(ExcludedFileSchema).optional(),
});
export type DownloadPlanResponse = z.infer<typeof DownloadPlanResponseSchema>;

/**
 * The versioned pointer a QR code carries. It names an item and, optionally, a
 * single file within it (a bundle omits `file` ⇒ all ROM files). It carries NO
 * `console`: console is derived server-side from the curated catalog, so there
 * is exactly one source of truth. Strict: it crosses the QR boundary (untrusted
 * input), so unknown keys are rejected rather than silently stripped.
 */
export const ScanPointerSchema = z.strictObject({
  v: z.literal(1),
  id: z.string().min(1),
  file: z.string().min(1).optional(),
});
export type ScanPointer = z.infer<typeof ScanPointerSchema>;

/**
 * One file in a resolve response: the plan file shape plus OPTIONAL cover-art
 * fields. `coverUrl` is a best-effort libretro thumbnail link (unverified — the
 * console tolerates a 404); `coverTargetPath` is the TWiLight box-art path keyed
 * to the ROM's routed on-SD basename. Both are present only for single-file
 * playable ROMs with a known libretro system; archived entries omit them.
 */
export const ResolvedFileSchema = z.object({
  name: z.string().min(1),
  sizeBytes: ByteCount,
  md5: z.string().min(1),
  downloadUrl: z.url(),
  targetPath: z.string().min(1),
  coverUrl: z.url().optional(),
  coverTargetPath: z.string().min(1).optional(),
});
export type ResolvedFile = z.infer<typeof ResolvedFileSchema>;

/**
 * The flat, storage-agnostic result of resolving a scan pointer. `console` is
 * derived from the curated catalog. No fit math here — the console still calls
 * `/plan` with free space for the fit decision.
 */
export const ResolveResponseSchema = z.object({
  id: z.string().min(1),
  console: ConsoleSchema,
  files: z.array(ResolvedFileSchema),
  totalBytes: ByteCount,
});
export type ResolveResponse = z.infer<typeof ResolveResponseSchema>;
