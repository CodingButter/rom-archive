import { describe, expect, it } from "vitest";

import type { Console, ItemDetailFile } from "@rom-archive/contract";

import { MAX_FETCHES, TILE_CAP, buildTiles, shuffledPages } from "./mosaic-sample";

/** A deterministic PRNG so spread assertions are never flaky. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function file(name: string): ItemDetailFile {
  return {
    name,
    sizeBytes: 1024,
    md5: "abc",
    downloadUrl: `https://archive.org/download/x/${encodeURIComponent(name)}`,
  };
}

describe("shuffledPages", () => {
  it("returns a full permutation of [1..total] — every page present, all distinct", () => {
    const total = 266;
    const pages = shuffledPages(total, seededRandom(1));

    expect(pages).toHaveLength(total);
    expect(new Set(pages).size).toBe(total); // all distinct — no re-draw possible
    expect([...pages].sort((a, b) => a - b)).toEqual(
      Array.from({ length: total }, (_, i) => i + 1),
    );
  });

  it("does not begin with the first-10 slice [1..10] (spreads instead of first-N)", () => {
    const pages = shuffledPages(266, seededRandom(1));
    const firstTen = pages.slice(0, 10);
    expect(firstTen).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("keeps every page within [1, total] — no page > total, no total+1 hole", () => {
    const total = 266;
    const pages = shuffledPages(total, seededRandom(42));
    for (const p of pages) {
      expect(p).toBeGreaterThanOrEqual(1);
      expect(p).toBeLessThanOrEqual(total);
    }
  });

  it("is deterministic under a seeded random", () => {
    expect(shuffledPages(50, seededRandom(7))).toEqual(shuffledPages(50, seededRandom(7)));
  });

  it("returns [] for total <= 0", () => {
    expect(shuffledPages(0, seededRandom(1))).toEqual([]);
    expect(shuffledPages(-5, seededRandom(1))).toEqual([]);
  });

  it("simulated top-up walks DISTINCT pages and stops within MAX_FETCHES on a colliding set", () => {
    // A bundle where every member derives the SAME cover URL. Walking the
    // permutation one page at a time, buildTiles never grows past 1 tile, so the
    // orchestration must fall back to the MAX_FETCHES bound — and every page it
    // touched must be distinct (permutation prefix), never a re-fetch.
    const total = 40;
    const permutation = shuffledPages(total, seededRandom(3));
    const derive = () => "https://same.example/cover.png";

    const collected: string[] = [];
    const touchedPages: number[] = [];
    let fetches = 1; // the probe counts against MAX_FETCHES

    for (const p of permutation) {
      if (collected.length >= TILE_CAP || fetches >= MAX_FETCHES) break;
      touchedPages.push(p);
      fetches += 1;
      // One synthetic file per page (page N → the file at that page).
      const tiles = buildTiles([file(`row ${p}.zip`)], "nes" as Console, derive);
      for (const t of tiles) {
        if (!collected.includes(t.url)) collected.push(t.url);
      }
    }

    expect(fetches).toBeLessThanOrEqual(MAX_FETCHES);
    expect(new Set(touchedPages).size).toBe(touchedPages.length); // all distinct
    expect(collected.length).toBeLessThan(TILE_CAP); // colliding set never fills
    expect(collected.length).toBe(1); // one shared cover
  });
});

describe("buildTiles", () => {
  it("dedupes by cover URL, drops null-deriving members, caps at TILE_CAP, keeps first-seen order", () => {
    // Two regional variants collide on cover URL; `unmapped` derives to null.
    const derive = (_c: Console, name: string): string | null => {
      if (name.startsWith("Same")) return "https://x/Same.png";
      if (name.startsWith("unmapped")) return null;
      return `https://x/${name}.png`;
    };
    const files = [
      file("Same (USA).zip"),
      file("Same (Europe).zip"), // duplicate cover URL → dropped
      file("unmapped.zip"), // null → dropped
      file("Alpha.zip"),
      file("Beta.zip"),
    ];

    const tiles = buildTiles(files, "nes" as Console, derive);

    expect(tiles.map((t) => t.url)).toEqual([
      "https://x/Same.png",
      "https://x/Alpha.zip.png",
      "https://x/Beta.zip.png",
    ]);
    // No duplicate URLs.
    expect(new Set(tiles.map((t) => t.url)).size).toBe(tiles.length);
  });

  it("caps at TILE_CAP even when more distinct covers exist", () => {
    const files = Array.from({ length: 25 }, (_, i) => file(`Game ${i} (USA).zip`));
    const derive = (_c: Console, name: string) => `https://x/${name}.png`;
    const tiles = buildTiles(files, "nes" as Console, derive);
    expect(tiles).toHaveLength(TILE_CAP);
  });

  it("returns the real coverUrlFor derivation by default (a .zip yields a libretro URL)", () => {
    const tiles = buildTiles([file("Metroid (USA).zip")], "nes" as Console);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]!.url).toContain("thumbnails.libretro.com");
    expect(tiles[0]!.url).toContain("Metroid%20(USA).png");
  });
});
