import { describe, expect, it } from "vitest";

import {
  DownloadPlanResponseSchema,
  type ItemDetailFile,
} from "@rom-archive/contract";
import { buildDownloadPlan } from "./plan";

function file(name: string, sizeBytes: number): ItemDetailFile {
  return {
    name,
    sizeBytes,
    md5: "0".repeat(32),
    downloadUrl: `https://archive.org/download/x/${encodeURIComponent(name)}`,
  };
}

const files = [
  file("big.gba", 1000),
  file("small.gba", 100),
  file("medium.gba", 500),
];

describe("buildDownloadPlan", () => {
  it("fits everything when free space is ample and validates against the contract", () => {
    const plan = buildDownloadPlan("gba", files, {
      id: "x",
      freeSpaceBytes: 10_000,
    });
    expect(plan.fits).toBe(true);
    expect(plan.totalBytes).toBe(1600);
    expect(plan.files).toHaveLength(3);
    expect(plan.excluded).toBeUndefined();
    expect(DownloadPlanResponseSchema.safeParse(plan).success).toBe(true);
    // target paths route into roms/gba
    expect(plan.files.every((f) => f.targetPath.startsWith("roms/gba/"))).toBe(true);
  });

  it("includes smallest-first and excludes the overflow deterministically", () => {
    // room for small(100) + medium(500) = 600, but not big(1000)
    const plan = buildDownloadPlan("gba", files, {
      id: "x",
      freeSpaceBytes: 600,
    });
    expect(plan.fits).toBe(false);
    expect(plan.totalBytes).toBe(600);
    expect(plan.files.map((f) => f.name)).toEqual(["small.gba", "medium.gba"]);
    expect(plan.excluded).toEqual([
      { name: "big.gba", sizeBytes: 1000, reason: "insufficient-space" },
    ]);
  });

  it("handles the exact-fit boundary (total == free space)", () => {
    const plan = buildDownloadPlan("gba", files, {
      id: "x",
      freeSpaceBytes: 1600,
    });
    expect(plan.fits).toBe(true);
    expect(plan.files).toHaveLength(3);
  });

  it("respects an explicit selection and marks the rest not-selected", () => {
    const plan = buildDownloadPlan("gba", files, {
      id: "x",
      freeSpaceBytes: 10_000,
      selectedFileNames: ["small.gba"],
    });
    expect(plan.files.map((f) => f.name)).toEqual(["small.gba"]);
    expect(plan.excluded).toEqual([
      { name: "big.gba", sizeBytes: 1000, reason: "not-selected" },
      { name: "medium.gba", sizeBytes: 500, reason: "not-selected" },
    ]);
  });

  it("produces an empty plan when nothing fits", () => {
    const plan = buildDownloadPlan("gba", files, { id: "x", freeSpaceBytes: 50 });
    expect(plan.fits).toBe(false);
    expect(plan.files).toHaveLength(0);
    expect(plan.excluded).toHaveLength(3);
    expect(DownloadPlanResponseSchema.safeParse(plan).success).toBe(true);
  });

  it("handles an empty selection array (nothing selected)", () => {
    const plan = buildDownloadPlan("gba", files, {
      id: "x",
      freeSpaceBytes: 10_000,
      selectedFileNames: [],
    });
    expect(plan.files).toHaveLength(0);
    expect(plan.excluded).toHaveLength(3);
    expect(plan.excluded!.every((e) => e.reason === "not-selected")).toBe(true);
  });
});
