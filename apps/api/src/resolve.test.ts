import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { ResolveResponseSchema, type ScanPointer } from "@rom-archive/contract";

import type { ArchiveMetadata, FetchLike } from "./archiveClient.js";
import { ResolveError, resolveScan } from "./resolve.js";

const here = dirname(fileURLToPath(import.meta.url));
const real = JSON.parse(
  readFileSync(join(here, "fixtures", "gbahomebrew.metadata.json"), "utf8"),
) as ArchiveMetadata;

/**
 * A fetch that serves the metadata fixture but THROWS on any ROM download or
 * cover-image URL — proving resolve never proxies bytes.
 */
function metadataOnlyFetch(): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = vi.fn(async (url: string) => {
    calls.push(url);
    if (url.includes("/download/") || url.includes("thumbnails.libretro.com")) {
      throw new Error(`resolve must not fetch bytes: ${url}`);
    }
    return { ok: true, status: 200, json: async () => real };
  });
  return { fetchImpl, calls };
}

describe("resolveScan", () => {
  it("resolves a bundle into all ROM files with cover fields and validates against the contract", async () => {
    const { fetchImpl, calls } = metadataOnlyFetch();
    const pointer: ScanPointer = { v: 1, id: "gbahomebrew" };

    const res = await resolveScan(pointer, fetchImpl);

    expect(res.id).toBe("gbahomebrew");
    expect(res.console).toBe("gba");
    expect(res.files).toHaveLength(10);
    expect(res.totalBytes).toBe(
      res.files.reduce((s, f) => s + f.sizeBytes, 0),
    );

    for (const f of res.files) {
      expect(f.targetPath.startsWith("roms/gba/")).toBe(true);
      // gba is a known libretro system and these are .gba files ⇒ cover present
      expect(f.coverUrl).toMatch(/^https:\/\/thumbnails\.libretro\.com\//);
      expect(f.coverTargetPath).toBe(
        `_nds/TWiLightMenu/boxart/${f.targetPath.slice("roms/gba/".length)}.png`,
      );
    }

    expect(ResolveResponseSchema.safeParse(res).success).toBe(true);
    // only the metadata URL was fetched
    expect(calls).toEqual(["https://archive.org/metadata/gbahomebrew"]);
  });

  it("resolves an individual pointer to exactly one file", async () => {
    const { fetchImpl } = metadataOnlyFetch();
    const target = "Anguna - Warriors of Virtue (USA) (Unl).gba";
    const res = await resolveScan(
      { v: 1, id: "gbahomebrew", file: target },
      fetchImpl,
    );
    expect(res.files).toHaveLength(1);
    expect(res.files[0]!.name).toBe(target);
    expect(res.files[0]!.coverUrl).toContain("thumbnails.libretro.com");
  });

  it("rejects an id not in the curated catalog (404-style)", async () => {
    const { fetchImpl } = metadataOnlyFetch();
    await expect(
      resolveScan({ v: 1, id: "not-in-catalog" }, fetchImpl),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a pointer whose file is not in the item (404-style)", async () => {
    const { fetchImpl } = metadataOnlyFetch();
    await expect(
      resolveScan({ v: 1, id: "gbahomebrew", file: "nope.gba" }, fetchImpl),
    ).rejects.toBeInstanceOf(ResolveError);
  });
});
