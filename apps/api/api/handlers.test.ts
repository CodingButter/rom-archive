import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CatalogResponseSchema,
  DownloadPlanResponseSchema,
  ItemDetailResponseSchema,
} from "@rom-archive/contract";
import type { FetchLike } from "../src/archiveClient.js";
import { handleCatalog, handleItem, handlePlan } from "../src/handlers.js";

const here = dirname(fileURLToPath(import.meta.url));
const realMetadata = JSON.parse(
  readFileSync(join(here, "..", "src", "fixtures", "gbahomebrew.metadata.json"), "utf8"),
) as unknown;

/**
 * A mock fetch that records every URL it is asked for and — critically —
 * THROWS if a handler ever tries to fetch an archive.org `/download/` URL
 * (a ROM byte stream). This is the executable enforcement of the
 * bytes-never-proxied invariant: a handler that reaches for bytes fails the test.
 */
function metadataOnlyFetch(payload: unknown): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetch: FetchLike = async (url: string) => {
    calls.push(url);
    if (url.includes("/download/")) {
      throw new Error(`handler must never fetch ROM bytes, but fetched: ${url}`);
    }
    return { ok: true, status: 200, json: async () => payload };
  };
  return { fetch, calls };
}

describe("handleCatalog", () => {
  it("returns a schema-valid catalog with 200", () => {
    const { status, body } = handleCatalog();
    expect(status).toBe(200);
    expect(CatalogResponseSchema.safeParse(body).success).toBe(true);
  });
});

describe("handleItem", () => {
  it("returns schema-valid item detail and touches only metadata URLs", async () => {
    const { fetch, calls } = metadataOnlyFetch(realMetadata);
    const { status, body } = await handleItem("gbahomebrew", fetch);
    expect(status).toBe(200);
    expect(ItemDetailResponseSchema.safeParse(body).success).toBe(true);
    // bytes-never-proxied: every fetch was to a metadata URL, none to /download/
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("archive.org/metadata/");
    expect(calls.some((u) => u.includes("/download/"))).toBe(false);
  });

  it("400s on a missing id", async () => {
    const { fetch } = metadataOnlyFetch(realMetadata);
    const { status } = await handleItem(undefined, fetch);
    expect(status).toBe(400);
  });

  it("404s on an unknown catalog id", async () => {
    const { fetch, calls } = metadataOnlyFetch(realMetadata);
    const { status } = await handleItem("not-in-catalog", fetch);
    expect(status).toBe(404);
    // unknown id short-circuits before any upstream fetch
    expect(calls).toHaveLength(0);
  });

  it("502s when archive.org fails upstream", async () => {
    const fetch: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const { status, body } = await handleItem("gbahomebrew", fetch);
    expect(status).toBe(502);
    expect(body).toHaveProperty("error");
  });
});

describe("handlePlan", () => {
  const validReq = { id: "gbahomebrew", freeSpaceBytes: 100_000_000 };

  it("returns a schema-valid plan and touches only metadata URLs", async () => {
    const { fetch, calls } = metadataOnlyFetch(realMetadata);
    const { status, body } = await handlePlan(validReq, fetch);
    expect(status).toBe(200);
    expect(DownloadPlanResponseSchema.safeParse(body).success).toBe(true);
    expect(calls.every((u) => u.includes("archive.org/metadata/"))).toBe(true);
    expect(calls.some((u) => u.includes("/download/"))).toBe(false);
  });

  it("400s on a schema-invalid body (missing freeSpaceBytes)", async () => {
    const { fetch } = metadataOnlyFetch(realMetadata);
    const { status } = await handlePlan({ id: "gbahomebrew" }, fetch);
    expect(status).toBe(400);
  });

  it("400s on an unknown extra key (strict request boundary)", async () => {
    const { fetch } = metadataOnlyFetch(realMetadata);
    const { status } = await handlePlan({ ...validReq, rogue: true }, fetch);
    expect(status).toBe(400);
  });

  it("404s on an unknown catalog id", async () => {
    const { fetch, calls } = metadataOnlyFetch(realMetadata);
    const { status } = await handlePlan({ id: "nope", freeSpaceBytes: 1 }, fetch);
    expect(status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("502s when archive.org fails upstream", async () => {
    const fetch: FetchLike = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const { status } = await handlePlan(validReq, fetch);
    expect(status).toBe(502);
  });
});
