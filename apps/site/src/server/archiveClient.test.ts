import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { ItemDetailFileSchema } from "@rom-archive/contract";
import {
  ArchiveError,
  buildDownloadUrl,
  extractRomFiles,
  fetchItemMetadata,
  parseSize,
  type ArchiveMetadata,
  type FetchLike,
} from "./archiveClient";

const here = dirname(fileURLToPath(import.meta.url));
function loadFixture(name: string): ArchiveMetadata {
  return JSON.parse(
    readFileSync(join(here, "fixtures", name), "utf8"),
  ) as ArchiveMetadata;
}

const real = loadFixture("gbahomebrew.metadata.json");
const edge = loadFixture("edgecases.metadata.json");

describe("parseSize", () => {
  it("parses valid integer strings", () => {
    expect(parseSize("0")).toBe(0);
    expect(parseSize("1710888")).toBe(1710888);
  });
  it("rejects blank, missing, non-numeric, negative, and fractional", () => {
    expect(parseSize(undefined)).toBeNull();
    expect(parseSize("")).toBeNull();
    expect(parseSize("   ")).toBeNull();
    expect(parseSize("not-a-number")).toBeNull();
    expect(parseSize("-5")).toBeNull();
    expect(parseSize("1.5")).toBeNull();
    expect(parseSize("12abc")).toBeNull();
  });
  it("rejects values beyond safe integer range", () => {
    expect(parseSize("99999999999999999999")).toBeNull();
  });
});

describe("buildDownloadUrl", () => {
  it("encodes the identifier and each path segment independently", () => {
    expect(buildDownloadUrl("gbahomebrew", "Anguna (USA) (Unl).gba")).toBe(
      "https://archive.org/download/gbahomebrew/Anguna%20(USA)%20(Unl).gba",
    );
  });
  it("preserves slashes in nested names (per-segment encoding, not whole-string)", () => {
    const url = buildDownloadUrl("edgecases", "subdir/nested rom (v1.1).gba");
    expect(url).toBe(
      "https://archive.org/download/edgecases/subdir/nested%20rom%20(v1.1).gba",
    );
    expect(url).not.toContain("%2F");
  });
});

describe("extractRomFiles — real gbahomebrew fixture", () => {
  const files = extractRomFiles("gbahomebrew", real.files);

  it("keeps exactly the 10 .gba ROMs and drops the 3 metadata files", () => {
    expect(files).toHaveLength(10);
    expect(files.every((f) => f.name.endsWith(".gba"))).toBe(true);
    expect(files.some((f) => f.name.includes("_meta") || f.name.includes("_files"))).toBe(
      false,
    );
  });

  it("every emitted file is contract-valid with a real md5 and size", () => {
    for (const f of files) {
      expect(ItemDetailFileSchema.safeParse(f).success).toBe(true);
      expect(f.md5).toMatch(/^[0-9a-f]{32}$/);
      expect(f.sizeBytes).toBeGreaterThan(0);
    }
  });
});

describe("extractRomFiles — edge cases", () => {
  const files = extractRomFiles("edgecases", edge.files);
  const names = files.map((f) => f.name);

  it("keeps only the two well-formed ROMs", () => {
    expect(names).toEqual(["good-rom.gba", "subdir/nested rom (v1.1).gba"]);
  });
  it("drops the md5-less derivative file", () => {
    expect(names).not.toContain("derivative-no-md5.gba");
  });
  it("drops files with an unparseable or missing size", () => {
    expect(names).not.toContain("bad-size.gba");
    expect(names).not.toContain("missing-size.gba");
  });
  it("drops non-ROM extensions and metadata files", () => {
    expect(names).not.toContain("readme.txt");
    expect(names).not.toContain("edgecases_meta.xml");
    expect(names).not.toContain("edgecases_files.xml");
  });
});

describe("fetchItemMetadata", () => {
  it("fetches only the metadata URL (never a download URL)", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => real };
    });
    const files = await fetchItemMetadata("gbahomebrew", fetchImpl);
    expect(files).toHaveLength(10);
    expect(calls).toEqual(["https://archive.org/metadata/gbahomebrew"]);
    expect(calls.some((u) => u.includes("/download/"))).toBe(false);
  });

  it("throws ArchiveError with the upstream status on a non-OK response", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    await expect(fetchItemMetadata("whatever", fetchImpl)).rejects.toBeInstanceOf(
      ArchiveError,
    );
    await fetchItemMetadata("whatever", fetchImpl).catch((e: ArchiveError) => {
      expect(e.upstreamStatus).toBe(503);
    });
  });

  it("tolerates a missing files array", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({}) as ArchiveMetadata,
    });
    expect(await fetchItemMetadata("empty", fetchImpl)).toEqual([]);
  });
});
