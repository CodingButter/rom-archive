import { describe, expect, it } from "vitest";

import type { ItemDetailFile } from "@rom-archive/contract";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, paginateFiles } from "./paginate";

function file(name: string): ItemDetailFile {
  return {
    name,
    sizeBytes: 1,
    md5: "d41d8cd98f00b204e9800998ecf8427e",
    downloadUrl: `https://archive.org/download/x/${encodeURIComponent(name)}`,
  };
}

const files: ItemDetailFile[] = [
  file("Alpha (USA).zip"),
  file("Bravo (Japan).zip"),
  file("Charlie (USA).zip"),
  file("Delta (Europe).zip"),
  file("Echo (usa proto).zip"),
];

describe("paginateFiles", () => {
  it("returns the first page and the full total with a default page size", () => {
    const r = paginateFiles(files);
    expect(r.total).toBe(5);
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(r.files.map((f) => f.name)).toEqual(files.map((f) => f.name));
  });

  it("slices a bounded page with 1-based paging", () => {
    const p1 = paginateFiles(files, { page: 1, pageSize: 2 });
    expect(p1.files.map((f) => f.name)).toEqual(["Alpha (USA).zip", "Bravo (Japan).zip"]);
    expect(p1.total).toBe(5);

    const p2 = paginateFiles(files, { page: 2, pageSize: 2 });
    expect(p2.files.map((f) => f.name)).toEqual(["Charlie (USA).zip", "Delta (Europe).zip"]);

    const p3 = paginateFiles(files, { page: 3, pageSize: 2 });
    expect(p3.files.map((f) => f.name)).toEqual(["Echo (usa proto).zip"]);
  });

  it("returns an empty slice with the correct total for an out-of-range page", () => {
    const r = paginateFiles(files, { page: 99, pageSize: 2 });
    expect(r.files).toEqual([]);
    expect(r.total).toBe(5);
    expect(r.page).toBe(99);
  });

  it("clamps page < 1 up to 1", () => {
    const r = paginateFiles(files, { page: 0, pageSize: 2 });
    expect(r.page).toBe(1);
    expect(r.files).toHaveLength(2);
  });

  it("clamps pageSize to the hard maximum", () => {
    const r = paginateFiles(files, { pageSize: 10_000 });
    expect(r.pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("clamps pageSize < 1 up to 1", () => {
    const r = paginateFiles(files, { pageSize: 0 });
    expect(r.pageSize).toBe(1);
    expect(r.files).toHaveLength(1);
  });

  it("filters by a case-insensitive name substring before paging", () => {
    const r = paginateFiles(files, { q: "usa" });
    // matches "Alpha (USA)", "Charlie (USA)", "Echo (usa proto)"
    expect(r.total).toBe(3);
    expect(r.files.map((f) => f.name)).toEqual([
      "Alpha (USA).zip",
      "Charlie (USA).zip",
      "Echo (usa proto).zip",
    ]);
  });

  it("combines a filter with paging: total is the filtered count", () => {
    const r = paginateFiles(files, { q: "usa", page: 2, pageSize: 2 });
    expect(r.total).toBe(3);
    expect(r.files.map((f) => f.name)).toEqual(["Echo (usa proto).zip"]);
  });

  it("returns empty with total 0 when the filter matches nothing", () => {
    const r = paginateFiles(files, { q: "nonexistent-xyz" });
    expect(r.total).toBe(0);
    expect(r.files).toEqual([]);
  });

  it("treats a blank/whitespace q as no filter", () => {
    const r = paginateFiles(files, { q: "   " });
    expect(r.total).toBe(5);
  });
});
