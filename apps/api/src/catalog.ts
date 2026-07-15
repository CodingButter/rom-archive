import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CatalogEntrySchema, type CatalogEntry } from "@rom-archive/contract";
import { z } from "zod";

const CatalogFileSchema = z.array(CatalogEntrySchema);

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(here, "..", "catalog.json");

let cached: readonly CatalogEntry[] | null = null;

/** Load and validate the curated catalog (cached after first read). */
export function loadCatalog(): readonly CatalogEntry[] {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(catalogPath, "utf8")) as unknown;
  const parsed: readonly CatalogEntry[] = Object.freeze(CatalogFileSchema.parse(raw));
  cached = parsed;
  return parsed;
}

/** Look up one catalog entry by archive.org identifier, or null if unknown. */
export function findCatalogEntry(id: string): CatalogEntry | null {
  return loadCatalog().find((e) => e.id === id) ?? null;
}
