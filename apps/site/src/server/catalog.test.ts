import { describe, expect, it } from "vitest";

import { CONSOLES, CatalogEntrySchema, type Console } from "@rom-archive/contract";
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
    expect(findCatalogEntry("No-Intro_NES")?.console).toBe("nes");
    expect(findCatalogEntry("does-not-exist")).toBeNull();
  });

  it("has unique ids", () => {
    const ids = loadCatalog().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every console is a valid Console enum member", () => {
    const valid = new Set<Console>(CONSOLES);
    for (const e of loadCatalog()) {
      expect(valid.has(e.console)).toBe(true);
    }
  });

  it("covers all 10 consoles with exactly one full-set bundle each", () => {
    const entries = loadCatalog();
    // A full-set bundle is a No-Intro item; the retained homebrew bundles reuse
    // some consoles, so we identify full-set entries by their non-homebrew ids.
    const homebrewIds = new Set(["gbahomebrew"]);
    const fullSet = entries.filter((e) => e.kind === "bundle" && !homebrewIds.has(e.id));
    const byConsole = new Map<Console, number>();
    for (const e of fullSet) {
      byConsole.set(e.console, (byConsole.get(e.console) ?? 0) + 1);
    }
    for (const c of CONSOLES) {
      expect(byConsole.get(c), `console ${c} must have exactly one full-set bundle`).toBe(1);
    }
    expect(fullSet.length).toBe(CONSOLES.length);
  });
});
