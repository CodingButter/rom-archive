import type { ItemDetailFile } from "@rom-archive/contract";

/** The shape of a single entry in archive.org's Metadata API `files` array.
 * Only the fields we consume are typed; archive.org includes many more. */
export interface ArchiveFileEntry {
  name: string;
  size?: string;
  md5?: string;
  format?: string;
  source?: string;
}

/** The subset of the archive.org Metadata API response we rely on. */
export interface ArchiveMetadata {
  files: ArchiveFileEntry[];
}

/** Injectable fetch so the client is unit-testable without live network. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const ARCHIVE_METADATA_BASE = "https://archive.org/metadata/";
const ARCHIVE_DOWNLOAD_BASE = "https://archive.org/download/";

/** Filenames that are archive.org bookkeeping, never ROMs. */
const METADATA_NAME_PATTERNS = [
  /_meta\.xml$/i,
  /_files\.xml$/i,
  /_reviews\.xml$/i,
  /_meta\.sqlite$/i,
  /\.torrent$/i,
  /^__ia_thumb\.jpg$/i,
];

/** Extensions we treat as ROM-like and therefore downloadable. */
const ROM_EXTENSIONS = new Set([
  "nds",
  "gba",
  "gb",
  "gbc",
  "sfc",
  "smc",
  "snes",
  "nes",
  "gg",
  "sms",
  "md",
  "gen",
  "bin",
  "pce",
  "zip",
  "7z",
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function isMetadataFile(name: string): boolean {
  return METADATA_NAME_PATTERNS.some((re) => re.test(name));
}

function isRomLike(name: string): boolean {
  return ROM_EXTENSIONS.has(extensionOf(name));
}

/**
 * Strictly parse archive.org's string `size` into a non-negative integer.
 * Returns null for missing/blank/NaN/negative/non-integer values so the caller
 * can drop the file rather than propagate a bad size.
 */
export function parseSize(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

/**
 * Build a download URL for `<identifier>/<name>`, encoding the identifier and
 * each path segment of the name independently so nested archive.org paths
 * (names containing `/`) survive without their slashes being escaped.
 */
export function buildDownloadUrl(id: string, name: string): string {
  const encodedName = name
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${ARCHIVE_DOWNLOAD_BASE}${encodeURIComponent(id)}/${encodedName}`;
}

/**
 * Convert a raw archive.org files array into contract `ItemDetailFile`s.
 * Drops: metadata/bookkeeping files, non-ROM extensions, files without an md5,
 * and files with an unparseable size. The result is exactly the set the console
 * may download and verify.
 */
export function extractRomFiles(id: string, files: ArchiveFileEntry[]): ItemDetailFile[] {
  const out: ItemDetailFile[] = [];
  for (const f of files) {
    if (isMetadataFile(f.name)) continue;
    if (!isRomLike(f.name)) continue;
    if (!f.md5) continue; // md5 is contractually required
    const sizeBytes = parseSize(f.size);
    if (sizeBytes === null) continue;
    out.push({
      name: f.name,
      sizeBytes,
      md5: f.md5,
      downloadUrl: buildDownloadUrl(id, f.name),
    });
  }
  return out;
}

/** Fetch and normalize an archive.org item's downloadable ROM files. */
export async function fetchItemMetadata(
  id: string,
  fetchImpl: FetchLike,
): Promise<ItemDetailFile[]> {
  const res = await fetchImpl(`${ARCHIVE_METADATA_BASE}${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new ArchiveError(`archive.org metadata request failed (${res.status})`, res.status);
  }
  const body = (await res.json()) as ArchiveMetadata;
  const files = Array.isArray(body.files) ? body.files : [];
  return extractRomFiles(id, files);
}

/** Raised when archive.org returns a non-OK response. */
export class ArchiveError extends Error {
  constructor(
    message: string,
    public readonly upstreamStatus: number,
  ) {
    super(message);
    this.name = "ArchiveError";
  }
}
