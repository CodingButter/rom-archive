import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import type { FetchLike } from "./archiveClient";
import {
  MetadataError,
  deriveSearchTitle,
  fetchLibretroMetadata,
  fetchTgdbMetadata,
  unknownMetadata,
} from "./metadata";

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"));

const byGame = readFixture("tgdb.bygame.metroidfusion.json");
const empty = readFixture("tgdb.bygame.empty.json");
const genresTable = (() => {
  const g = readFixture("tgdb.genres.json") as {
    data: { genres: Record<string, { name: string }> };
  };
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(g.data.genres)) out[id] = v.name;
  return out;
})();

function okFetch(body: unknown): FetchLike {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
}

describe("deriveSearchTitle", () => {
  it("strips a trailing extension and normalizes whitespace", () => {
    expect(deriveSearchTitle("Metroid Fusion.gba")).toBe("Metroid Fusion");
    expect(deriveSearchTitle("Super  Mario   World.sfc")).toBe("Super Mario World");
  });

  it("leaves a name without an extension untouched", () => {
    expect(deriveSearchTitle("Metroid Fusion")).toBe("Metroid Fusion");
  });
});

describe("fetchTgdbMetadata", () => {
  it("maps the first real result and reads the remaining allowance", async () => {
    const fetchImpl = okFetch(byGame);
    const { meta, remainingAllowance } = await fetchTgdbMetadata(
      "gba",
      "Metroid Fusion",
      "test-key",
      fetchImpl,
      { genres: genresTable },
    );

    expect(remainingAllowance).toBe(998);
    expect(meta).not.toBeNull();
    expect(meta?.source).toBe("tgdb");
    expect(meta?.title).toBe("Metroid Fusion");
    expect(meta?.platform).toBe("gba");
    expect(meta?.releaseDate).toBe("2003-02-14");
    expect(meta?.genres).toEqual(["Action", "Adventure"]);
    expect(meta?.overview).toMatch(/Samus Aran/);
    expect(meta?.boxartUrl).toBe(
      "https://cdn.thegamesdb.net/images/original/boxart/front/83094-1.jpg",
    );
  });

  it("passes the platform filter and api key in the request URL", async () => {
    const fetchImpl = okFetch(byGame);
    await fetchTgdbMetadata("gba", "Metroid Fusion", "secret-key", fetchImpl);
    const calledUrl = (fetchImpl as unknown as { mock: { calls: string[][] } })
      .mock.calls[0][0];
    expect(calledUrl).toContain("apikey=secret-key");
    expect(calledUrl).toContain("filter%5Bplatform%5D=5");
    expect(calledUrl).toContain("include=boxart");
  });

  it("returns null meta on a zero-result response", async () => {
    const { meta, remainingAllowance } = await fetchTgdbMetadata(
      "gba",
      "No Such Game",
      "test-key",
      okFetch(empty),
    );
    expect(meta).toBeNull();
    expect(remainingAllowance).toBe(998);
  });

  it("throws MetadataError with the upstream status on a non-OK response", async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
    });
    await expect(
      fetchTgdbMetadata("gba", "Metroid Fusion", "test-key", fetchImpl),
    ).rejects.toMatchObject({ name: "MetadataError", upstreamStatus: 429 });
    await expect(
      fetchTgdbMetadata("gba", "Metroid Fusion", "test-key", fetchImpl),
    ).rejects.toBeInstanceOf(MetadataError);
  });

  it("returns only strings/URLs — never proxies bytes", async () => {
    const { meta } = await fetchTgdbMetadata(
      "gba",
      "Metroid Fusion",
      "test-key",
      okFetch(byGame),
      { genres: genresTable },
    );
    for (const value of Object.values(meta ?? {})) {
      const t = typeof value;
      expect(t === "string" || Array.isArray(value)).toBe(true);
    }
    // boxart is a URL string, not fetched bytes
    expect(meta?.boxartUrl?.startsWith("https://")).toBe(true);
  });
});

describe("fetchLibretroMetadata", () => {
  it("returns a title-only record from the derived name", () => {
    const meta = fetchLibretroMetadata("snes", "Chrono Trigger.sfc");
    expect(meta).toEqual({
      title: "Chrono Trigger",
      platform: "snes",
      source: "libretro",
    });
  });
});

describe("unknownMetadata", () => {
  it("returns a graceful unknown record", () => {
    const meta = unknownMetadata("nds", "Mystery.nds");
    expect(meta.source).toBe("unknown");
    expect(meta.title).toBe("Mystery");
    expect(meta.platform).toBe("nds");
  });
});
