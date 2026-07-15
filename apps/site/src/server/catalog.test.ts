import { describe, expect, it } from "vitest";

import { CatalogEntrySchema } from "@rom-archive/contract";
import { findCatalogEntry, loadCatalog } from "./catalog";

describe("curated catalog", () => {
  it("loads and validates every entry against the contract", () => {
    const entries = loadCatalog();
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const e of entries) {
      expect(CatalogEntrySchema.safeParse(e).success).toBe(true);
    }
  });

  it("spans at least two distinct consoles", () => {
    const consoles = new Set(loadCatalog().map((e) => e.console));
    expect(consoles.size).toBeGreaterThanOrEqual(2);
  });

  it("finds a known entry and returns null for an unknown id", () => {
    expect(findCatalogEntry("gbahomebrew")?.console).toBe("gba");
    expect(findCatalogEntry("does-not-exist")).toBeNull();
  });
});
