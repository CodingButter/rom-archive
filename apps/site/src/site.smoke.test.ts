import { describe, expect, it } from "vitest";

import {
  CatalogResponseSchema,
  ItemDetailResponseSchema,
  type CatalogResponse,
} from "@rom-archive/contract";

/**
 * Live end-to-end smoke suite. Opt-in: set `SMOKE_BASE_URL` to a running server
 * (e.g. `http://localhost:3000` from `next dev`, or a deployed URL) and this
 * exercises the real pages and `/api/*` route handlers from one origin — no
 * mocks, no proxy. Without the env var the suite is a single no-op green guard,
 * so it never breaks CI where no server is running.
 *
 * The metadata source field validates the graceful-degradation contract: it is
 * always one of tgdb | libretro | unknown regardless of whether `TGDB_API_KEY`
 * is set on the target, so the suite passes against any correctly-wired deploy.
 */
const BASE = process.env.SMOKE_BASE_URL;

async function get(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`);
}

if (!BASE) {
  describe("live smoke (skipped: set SMOKE_BASE_URL to run)", () => {
    it("is a no-op when SMOKE_BASE_URL is unset", () => {
      expect(BASE).toBeUndefined();
    });
  });
} else {
  describe(`live smoke against ${BASE}`, () => {
    let catalog: CatalogResponse;

    it("API:CATALOG:200 — returns a contract-valid catalog from the same origin", async () => {
      const res = await get("/api/catalog");
      console.log(`API:CATALOG:${res.status}`);
      expect(res.status).toBe(200);
      const body: unknown = await res.json();
      catalog = CatalogResponseSchema.parse(body);
      expect(catalog.entries.length).toBeGreaterThan(0);
    });

    it("API:ITEM:200 — returns a contract-valid item detail", async () => {
      const id = catalog.entries[0]!.id;
      const res = await get(`/api/item?id=${encodeURIComponent(id)}`);
      console.log(`API:ITEM:${res.status}`);
      expect(res.status).toBe(200);
      const detail = ItemDetailResponseSchema.parse(await res.json());
      // The API never proxies bytes — every download URL points off-origin.
      for (const f of detail.files) {
        expect(f.downloadUrl.startsWith(BASE)).toBe(false);
      }
    });

    it("API:METADATA:200 — returns a graceful metadata record", async () => {
      const entry = catalog.entries[0]!;
      const res = await get(
        `/api/metadata?id=${encodeURIComponent(entry.id)}&name=${encodeURIComponent(entry.title)}`,
      );
      console.log(`API:METADATA:${res.status}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { source?: string };
      expect(["tgdb", "libretro", "unknown"]).toContain(body.source);
    });

    it("API:ITEM:404 — unknown id is a 404", async () => {
      const res = await get("/api/item?id=__does_not_exist__");
      console.log(`API:ITEM:${res.status}`);
      expect(res.status).toBe(404);
    });

    it.each(["/", "/browse", "/item/x"])(
      "PAGE:200 — %s serves the Next app as HTML",
      async (path) => {
        const res = await get(path);
        console.log(`PAGE:${res.status} ${path}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type") ?? "").toContain("text/html");
      },
    );
  });
}
