import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CatalogResponseSchema,
  DownloadPlanResponseSchema,
  ItemDetailResponseSchema,
  ItemPageResponseSchema,
  ResolveResponseSchema,
} from "@rom-archive/contract";

import type { GameMetadata } from "@/server/metadata";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "..", "server", "fixtures");
const realMetadata = JSON.parse(
  readFileSync(join(fixturesDir, "gbahomebrew.metadata.json"), "utf8"),
) as unknown;
const tgdbByGame = JSON.parse(
  readFileSync(join(fixturesDir, "tgdb.bygame.metroidfusion.json"), "utf8"),
) as unknown;

/**
 * Stub the shared realFetch seam so the route handlers exercise their pure
 * cores without touching the network. THROWS on any /download/ URL — the
 * executable bytes-never-proxied guard at the route boundary.
 */
function stubFetch(payload: unknown, opts?: { ok?: boolean; status?: number }) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    if (url.includes("/download/")) {
      throw new Error(`route must never fetch ROM bytes, but fetched: ${url}`);
    }
    return {
      ok: opts?.ok ?? true,
      status: opts?.status ?? 200,
      json: async () => payload,
    };
  };
  vi.doMock("@/server/realFetch", () => ({ realFetch: impl }));
  return { calls };
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("GET /api/catalog", () => {
  it("returns 200 with a schema-valid catalog", async () => {
    const { GET } = await import("./catalog/route");
    const res = GET();
    expect(res.status).toBe(200);
    expect(CatalogResponseSchema.safeParse(await res.json()).success).toBe(true);
  });
});

describe("GET /api/item", () => {
  it("returns 200 schema-valid detail, touching only metadata URLs", async () => {
    const { calls } = stubFetch(realMetadata);
    const { GET } = await import("./item/route");
    const res = await GET(new Request("http://t/api/item?id=gbahomebrew"));
    expect(res.status).toBe(200);
    expect(ItemDetailResponseSchema.safeParse(await res.json()).success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("archive.org/metadata/");
    expect(calls.some((u) => u.includes("/download/"))).toBe(false);
  });

  it("400s on a missing id", async () => {
    stubFetch(realMetadata);
    const { GET } = await import("./item/route");
    const res = await GET(new Request("http://t/api/item"));
    expect(res.status).toBe(400);
  });

  it("404s on an unknown catalog id (no upstream fetch)", async () => {
    const { calls } = stubFetch(realMetadata);
    const { GET } = await import("./item/route");
    const res = await GET(new Request("http://t/api/item?id=not-in-catalog"));
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("502s when archive.org fails upstream", async () => {
    stubFetch({}, { ok: false, status: 500 });
    const { GET } = await import("./item/route");
    const res = await GET(new Request("http://t/api/item?id=gbahomebrew"));
    expect(res.status).toBe(502);
    expect(await res.json()).toHaveProperty("error");
  });

  it("with no pagination params returns the full-list shape (no paging keys)", async () => {
    stubFetch(realMetadata);
    const { GET } = await import("./item/route");
    const res = await GET(new Request("http://t/api/item?id=gbahomebrew"));
    const body = await res.json();
    expect(ItemDetailResponseSchema.safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty("total");
    expect(body).not.toHaveProperty("page");
  });

  it("treats a blank q as absent and keeps the full-list shape", async () => {
    stubFetch(realMetadata);
    const { GET } = await import("./item/route");
    const res = await GET(new Request("http://t/api/item?id=gbahomebrew&q="));
    const body = await res.json();
    expect(ItemDetailResponseSchema.safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty("total");
    expect(body).not.toHaveProperty("page");
  });

  it("forwards page/pageSize and returns a bounded paginated response", async () => {
    stubFetch(realMetadata);
    const { GET } = await import("./item/route");
    const res = await GET(
      new Request("http://t/api/item?id=gbahomebrew&page=1&pageSize=3"),
    );
    expect(res.status).toBe(200);
    const parsed = ItemPageResponseSchema.parse(await res.json());
    expect(parsed.files).toHaveLength(3);
    expect(parsed.total).toBe(10);
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(3);
  });

  it("forwards q and returns only matching files", async () => {
    stubFetch(realMetadata);
    const { GET } = await import("./item/route");
    const res = await GET(new Request("http://t/api/item?id=gbahomebrew&q=usa"));
    const parsed = ItemPageResponseSchema.parse(await res.json());
    expect(parsed.total).toBeGreaterThan(0);
    expect(parsed.files.every((f) => f.name.toLowerCase().includes("usa"))).toBe(true);
  });
});

describe("POST /api/plan", () => {
  it("returns 200 with a schema-valid plan", async () => {
    const { calls } = stubFetch(realMetadata);
    const { POST } = await import("./plan/route");
    const res = await POST(
      new Request("http://t/api/plan", {
        method: "POST",
        body: JSON.stringify({ id: "gbahomebrew", freeSpaceBytes: 100_000_000 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(DownloadPlanResponseSchema.safeParse(await res.json()).success).toBe(true);
    expect(calls.some((u) => u.includes("/download/"))).toBe(false);
  });

  it("400s on a schema-invalid body", async () => {
    stubFetch(realMetadata);
    const { POST } = await import("./plan/route");
    const res = await POST(
      new Request("http://t/api/plan", {
        method: "POST",
        body: JSON.stringify({ id: "gbahomebrew" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400s on an unknown extra key (strict request boundary)", async () => {
    stubFetch(realMetadata);
    const { POST } = await import("./plan/route");
    const res = await POST(
      new Request("http://t/api/plan", {
        method: "POST",
        body: JSON.stringify({
          id: "gbahomebrew",
          freeSpaceBytes: 100_000_000,
          rogue: true,
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("502s when archive.org fails upstream", async () => {
    stubFetch({}, { ok: false, status: 503 });
    const { POST } = await import("./plan/route");
    const res = await POST(
      new Request("http://t/api/plan", {
        method: "POST",
        body: JSON.stringify({ id: "gbahomebrew", freeSpaceBytes: 100_000_000 }),
      }),
    );
    expect(res.status).toBe(502);
  });

  it("400s on an unparseable body", async () => {
    stubFetch(realMetadata);
    const { POST } = await import("./plan/route");
    const res = await POST(
      new Request("http://t/api/plan", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("404s on an unknown catalog id", async () => {
    stubFetch(realMetadata);
    const { POST } = await import("./plan/route");
    const res = await POST(
      new Request("http://t/api/plan", {
        method: "POST",
        body: JSON.stringify({ id: "nope", freeSpaceBytes: 1 }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/metadata", () => {
  it("returns 200 TGDB-sourced metadata for a known item", async () => {
    stubFetch(tgdbByGame);
    vi.stubEnv("TGDB_API_KEY", "test-key");
    const { GET } = await import("./metadata/route");
    const res = await GET(
      new Request("http://t/api/metadata?id=gbahomebrew&name=Metroid%20Fusion.gba"),
    );
    expect(res.status).toBe(200);
    const meta = (await res.json()) as GameMetadata;
    expect(meta.source).toBe("tgdb");
    expect(meta.title).toBe("Metroid Fusion");
    expect(meta.platform).toBe("gba");
  });

  it("400s on a missing id or name", async () => {
    stubFetch(tgdbByGame);
    vi.stubEnv("TGDB_API_KEY", "test-key");
    const { GET } = await import("./metadata/route");
    const noId = await GET(new Request("http://t/api/metadata?name=x.gba"));
    expect(noId.status).toBe(400);
    const noName = await GET(new Request("http://t/api/metadata?id=gbahomebrew"));
    expect(noName.status).toBe(400);
  });

  it("404s on an unknown catalog id", async () => {
    stubFetch(tgdbByGame);
    vi.stubEnv("TGDB_API_KEY", "test-key");
    const { GET } = await import("./metadata/route");
    const res = await GET(
      new Request("http://t/api/metadata?id=not-in-catalog&name=x.gba"),
    );
    expect(res.status).toBe(404);
  });

  it("degrades to a graceful 200 (never 5xx) when the upstream throws", async () => {
    const calls: string[] = [];
    vi.doMock("@/server/realFetch", () => ({
      realFetch: async (url: string) => {
        calls.push(url);
        throw new Error("network down");
      },
    }));
    vi.stubEnv("TGDB_API_KEY", "test-key");
    const { GET } = await import("./metadata/route");
    const res = await GET(
      new Request("http://t/api/metadata?id=gbahomebrew&name=Metroid%20Fusion.gba"),
    );
    expect(res.status).toBe(200);
    const meta = (await res.json()) as GameMetadata;
    expect(["libretro", "unknown"]).toContain(meta.source);
    // The libretro floor still preserves a usable title from the ROM name.
    expect(meta.title).toBe("Metroid Fusion");
    expect(calls.some((u) => u.includes("/download/"))).toBe(false);
  });
});

describe("POST /api/resolve", () => {
  it("resolves a bundle pointer to a schema-valid ResolveResponse with all files", async () => {
    const { calls } = stubFetch(realMetadata);
    const { POST } = await import("./resolve/route");
    const res = await POST(
      new Request("http://t/api/resolve", {
        method: "POST",
        body: JSON.stringify({ v: 1, id: "gbahomebrew" }),
      }),
    );
    expect(res.status).toBe(200);
    const parsed = ResolveResponseSchema.parse(await res.json());
    expect(parsed.id).toBe("gbahomebrew");
    expect(parsed.console).toBe("gba");
    expect(parsed.files).toHaveLength(10);
    // totalBytes is the sum of the file sizes — the device trusts this figure
    // directly (it computes nothing itself), so pin the invariant here.
    expect(parsed.totalBytes).toBe(
      parsed.files.reduce((sum, f) => sum + f.sizeBytes, 0),
    );
    // metadata only — never a ROM byte or cover image
    expect(calls.some((u) => u.includes("/download/"))).toBe(false);
    expect(calls.some((u) => u.includes("thumbnails.libretro.com"))).toBe(false);
  });

  it("resolves a single-file pointer whose filename has spaces and parens", async () => {
    // The exact case a GET transport would silently break: the device POSTs
    // the pointer as a JSON body so the filename needs no URL-encoding.
    stubFetch(realMetadata);
    const { POST } = await import("./resolve/route");
    const res = await POST(
      new Request("http://t/api/resolve", {
        method: "POST",
        body: JSON.stringify({
          v: 1,
          id: "gbahomebrew",
          file: "Anguna - Warriors of Virtue (USA) (Unl).gba",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const parsed = ResolveResponseSchema.parse(await res.json());
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]!.name).toBe(
      "Anguna - Warriors of Virtue (USA) (Unl).gba",
    );
  });

  it("404s on an id not in the curated catalog (no upstream fetch)", async () => {
    const { calls } = stubFetch(realMetadata);
    const { POST } = await import("./resolve/route");
    const res = await POST(
      new Request("http://t/api/resolve", {
        method: "POST",
        body: JSON.stringify({ v: 1, id: "not-in-catalog" }),
      }),
    );
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("404s on a file absent from the item", async () => {
    stubFetch(realMetadata);
    const { POST } = await import("./resolve/route");
    const res = await POST(
      new Request("http://t/api/resolve", {
        method: "POST",
        body: JSON.stringify({ v: 1, id: "gbahomebrew", file: "nope.gba" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("400s on a schema-invalid pointer", async () => {
    stubFetch(realMetadata);
    const { POST } = await import("./resolve/route");
    const res = await POST(
      new Request("http://t/api/resolve", {
        method: "POST",
        body: JSON.stringify({ v: 2, id: "gbahomebrew" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400s on an unparseable body", async () => {
    stubFetch(realMetadata);
    const { POST } = await import("./resolve/route");
    const res = await POST(
      new Request("http://t/api/resolve", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });
});
