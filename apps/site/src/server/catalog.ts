import { CatalogEntrySchema, type CatalogEntry } from "@rom-archive/contract";
import { z } from "zod";

import catalogData from "./catalog.json";

const CatalogFileSchema = z.array(CatalogEntrySchema);

let cached: readonly CatalogEntry[] | null = null;

/** Load and validate the curated catalog (cached after first read). */
export function loadCatalog(): readonly CatalogEntry[] {
  if (cached) return cached;
  const parsed: readonly CatalogEntry[] = Object.freeze(
    CatalogFileSchema.parse(catalogData),
  );
  cached = parsed;
  return parsed;
}

/** Look up one catalog entry by archive.org identifier, or null if unknown. */
export function findCatalogEntry(id: string): CatalogEntry | null {
  return loadCatalog().find((e) => e.id === id) ?? null;
}
