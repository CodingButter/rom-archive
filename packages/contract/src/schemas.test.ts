import { describe, expect, it } from "vitest";

import {
  CatalogResponseSchema,
  DownloadPlanRequestSchema,
  DownloadPlanResponseSchema,
  ItemDetailFileSchema,
  ItemDetailResponseSchema,
  ScanPointerSchema,
  ResolveResponseSchema,
  type CatalogResponse,
  type DownloadPlanRequest,
  type DownloadPlanResponse,
  type ItemDetailResponse,
  type ScanPointer,
  type ResolveResponse,
} from "./schemas.js";

const catalog: CatalogResponse = {
  entries: [
    { id: "homebrew-pack", title: "Homebrew Pack", console: "gba", kind: "bundle" },
    {
      id: "single-demo",
      title: "Single Demo",
      console: "nds",
      kind: "single",
      approxSizeBytes: 1024,
    },
  ],
};

const itemDetail: ItemDetailResponse = {
  id: "homebrew-pack",
  console: "gba",
  files: [
    {
      name: "demo.gba",
      sizeBytes: 4096,
      md5: "0123456789abcdef0123456789abcdef",
      downloadUrl: "https://archive.org/download/homebrew-pack/demo.gba",
    },
  ],
};

const planRequest: DownloadPlanRequest = {
  id: "homebrew-pack",
  freeSpaceBytes: 1_000_000,
  selectedFileNames: ["demo.gba"],
};

const planResponse: DownloadPlanResponse = {
  fits: true,
  totalBytes: 4096,
  freeSpaceBytes: 1_000_000,
  files: [
    {
      name: "demo.gba",
      sizeBytes: 4096,
      md5: "0123456789abcdef0123456789abcdef",
      downloadUrl: "https://archive.org/download/homebrew-pack/demo.gba",
      targetPath: "roms/gba/demo.gba",
    },
  ],
  excluded: [{ name: "big.gba", sizeBytes: 9_000_000, reason: "insufficient-space" }],
};

const bundlePointer: ScanPointer = { v: 1, id: "homebrew-pack" };
const individualPointer: ScanPointer = { v: 1, id: "homebrew-pack", file: "demo.gba" };

const resolveResponse: ResolveResponse = {
  id: "homebrew-pack",
  console: "gba",
  files: [
    {
      name: "demo.gba",
      sizeBytes: 4096,
      md5: "0123456789abcdef0123456789abcdef",
      downloadUrl: "https://archive.org/download/homebrew-pack/demo.gba",
      targetPath: "roms/gba/demo.gba",
      coverUrl:
        "https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Advance/Named_Boxarts/demo.png",
      coverTargetPath: "_nds/TWiLightMenu/boxart/demo.gba.png",
    },
    // a file with no cover candidate (archived / unknown system): cover fields absent
    {
      name: "archive.zip",
      sizeBytes: 8192,
      md5: "ffffffffffffffffffffffffffffffff",
      downloadUrl: "https://archive.org/download/homebrew-pack/archive.zip",
      targetPath: "roms/gba/archive.zip",
    },
  ],
  totalBytes: 12288,
};

describe("wire schemas round-trip", () => {
  it("parses and re-serializes valid fixtures unchanged", () => {
    for (const [schema, value] of [
      [CatalogResponseSchema, catalog],
      [ItemDetailResponseSchema, itemDetail],
      [DownloadPlanRequestSchema, planRequest],
      [DownloadPlanResponseSchema, planResponse],
      [ScanPointerSchema, bundlePointer],
      [ScanPointerSchema, individualPointer],
      [ResolveResponseSchema, resolveResponse],
    ] as const) {
      const parsed = schema.parse(value);
      expect(parsed).toEqual(value);
      // parse(serialize(parse(x))) is stable
      expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(value);
    }
  });
});

describe("wire schemas reject invalid input", () => {
  it("rejects an unknown console", () => {
    expect(
      CatalogResponseSchema.safeParse({
        entries: [{ id: "x", title: "X", console: "ps2", kind: "single" }],
      }).success,
    ).toBe(false);
  });

  it("requires md5 on item files (drop-if-no-md5 contract)", () => {
    expect(
      ItemDetailFileSchema.safeParse({
        name: "demo.gba",
        sizeBytes: 4096,
        downloadUrl: "https://archive.org/download/x/demo.gba",
      }).success,
    ).toBe(false);
    // empty md5 is also invalid
    expect(
      ItemDetailFileSchema.safeParse({
        name: "demo.gba",
        sizeBytes: 4096,
        md5: "",
        downloadUrl: "https://archive.org/download/x/demo.gba",
      }).success,
    ).toBe(false);
  });

  it("rejects negative or non-integer byte counts", () => {
    expect(
      DownloadPlanRequestSchema.safeParse({ id: "x", freeSpaceBytes: -1 }).success,
    ).toBe(false);
    expect(
      DownloadPlanRequestSchema.safeParse({ id: "x", freeSpaceBytes: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects a non-URL downloadUrl", () => {
    expect(
      ItemDetailFileSchema.safeParse({
        name: "demo.gba",
        sizeBytes: 4096,
        md5: "0123456789abcdef0123456789abcdef",
        downloadUrl: "not a url",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown extra properties (additionalProperties: false shape)", () => {
    expect(
      DownloadPlanRequestSchema.safeParse({
        id: "x",
        freeSpaceBytes: 10,
        surprise: true,
      }).success,
    ).toBe(false);
  });

  it("rejects a scan pointer with an unknown key (strict QR boundary)", () => {
    expect(
      ScanPointerSchema.safeParse({ v: 1, id: "x", console: "gba" }).success,
    ).toBe(false);
  });

  it("rejects a scan pointer with the wrong version", () => {
    expect(ScanPointerSchema.safeParse({ v: 2, id: "x" }).success).toBe(false);
  });
});
