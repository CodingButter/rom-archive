import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import type { FetchLike } from "./archiveClient";
import {
  ALLOWANCE_FLOOR,
  CONFIRMED_NEGATIVE_TTL_MS,
  InMemoryCache,
  POSITIVE_TTL_MS,
  RETRY_TTL_MS,
  resolveMetadata,
  type ResolveDeps,
} from "./metadataService";

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"));

const byGame = readFixture("tgdb.bygame.metroidfusion.json") as Record<string, unknown>;
const empty = readFixture("tgdb.bygame.empty.json");

/** A fetch mock that returns the given body and counts calls. */
function countingFetch(body: unknown, allowance?: number): FetchLike & { calls: () => number } {
  let n = 0;
  const payload =
    allowance === undefined
      ? body
      : { ...(body as object), remaining_monthly_allowance: allowance };
  const fn = (async (_url: string) => {
    n += 1;
    return { ok: true, status: 200, json: async () => payload };
  }) as FetchLike & { calls: () => number };
  fn.calls = () => n;
  return fn;
}

function deps(over: Partial<ResolveDeps> & { fetchImpl: FetchLike }): ResolveDeps {
  return {
    cache: over.cache ?? new InMemoryCache(),
    fetchImpl: over.fetchImpl,
    env: over.env ?? { TGDB_API_KEY: "test-key" },
    lookups: over.lookups,
  };
}

describe("resolveMetadata", () => {
  it("returns a TGDB record on a miss and caches it (positive)", async () => {
    const fetchImpl = countingFetch(byGame);
    const d = deps({ fetchImpl });
    const meta = await resolveMetadata("gba", "Metroid Fusion.gba", d);
    expect(meta.source).toBe("tgdb");
    expect(meta.title).toBe("Metroid Fusion");
  });

  it("BUDGET SHIELD: repeated resolutions of the same game hit TGDB exactly once", async () => {
    const fetchImpl = countingFetch(byGame);
    const d = deps({ fetchImpl });
    for (let i = 0; i < 5; i++) {
      await resolveMetadata("gba", "Metroid Fusion.gba", d);
    }
    expect(fetchImpl.calls()).toBe(1);
  });

  it("NEGATIVE CACHING: a TGDB zero-result is cached and not re-fetched within TTL", async () => {
    const fetchImpl = countingFetch(empty);
    const d = deps({ fetchImpl });
    const first = await resolveMetadata("gba", "No Such Game.gba", d);
    const second = await resolveMetadata("gba", "No Such Game.gba", d);
    // Zero result falls back to libretro, cached under the confirmed-negative shield.
    expect(first.source).toBe("libretro");
    expect(second.source).toBe("libretro");
    expect(fetchImpl.calls()).toBe(1);
  });

  it("skips TGDB entirely when no key is configured, serving libretro", async () => {
    const fetchImpl = countingFetch(byGame);
    const d = deps({ fetchImpl, env: { TGDB_API_KEY: undefined } });
    const meta = await resolveMetadata("gba", "Metroid Fusion.gba", d);
    expect(meta.source).toBe("libretro");
    expect(fetchImpl.calls()).toBe(0);
  });

  it("stops spending TGDB once the remembered allowance is at/below the floor", async () => {
    const cache = new InMemoryCache();
    // First call reports an allowance right at the floor.
    const lowFetch = countingFetch(byGame, ALLOWANCE_FLOOR);
    await resolveMetadata("gba", "Metroid Fusion.gba", deps({ fetchImpl: lowFetch, cache }));
    expect(lowFetch.calls()).toBe(1); // the probe that recorded the low allowance

    // A DIFFERENT game now: allowance is floored, so TGDB must be skipped.
    const nextFetch = countingFetch(byGame);
    const meta = await resolveMetadata(
      "gba",
      "Some Other Game.gba",
      deps({ fetchImpl: nextFetch, cache }),
    );
    expect(meta.source).toBe("libretro");
    expect(nextFetch.calls()).toBe(0);
  });

  it("falls back to libretro when TGDB errors (non-OK)", async () => {
    const errFetch: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const spy = vi.fn(errFetch);
    const meta = await resolveMetadata("gba", "Metroid Fusion.gba", deps({ fetchImpl: spy }));
    expect(meta.source).toBe("libretro");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("caches an error-driven libretro fallback so a retry does not re-hit TGDB", async () => {
    let n = 0;
    const errFetch: FetchLike = async () => {
      n += 1;
      return { ok: false, status: 500, json: async () => ({}) };
    };
    const d = deps({ fetchImpl: errFetch });
    await resolveMetadata("gba", "Metroid Fusion.gba", d);
    await resolveMetadata("gba", "Metroid Fusion.gba", d);
    expect(n).toBe(1);
  });

  it("allows exactly one probe when the allowance is unknown (null), then respects the recorded value", async () => {
    const cache = new InMemoryCache();
    // Report allowance just ABOVE the floor on the first probe.
    const first = countingFetch(byGame, ALLOWANCE_FLOOR + 1);
    await resolveMetadata("gba", "Metroid Fusion.gba", deps({ fetchImpl: first, cache }));
    expect(first.calls()).toBe(1);

    // floor+1 is above the floor ⇒ a different game may still probe TGDB.
    const second = countingFetch(byGame);
    const meta = await resolveMetadata(
      "gba",
      "Another Game.gba",
      deps({ fetchImpl: second, cache }),
    );
    expect(meta.source).toBe("tgdb");
    expect(second.calls()).toBe(1);
  });

  describe("TTL expiry (clock-driven)", () => {
    it("re-probes TGDB for the SAME game only after the positive TTL elapses", async () => {
      let clock = 1_000_000;
      const cache = new InMemoryCache(() => clock);
      const fetchImpl = countingFetch(byGame);
      const d = deps({ fetchImpl, cache });

      await resolveMetadata("gba", "Metroid Fusion.gba", d);
      // Within the positive window: cached, no new fetch.
      clock += POSITIVE_TTL_MS - 1;
      await resolveMetadata("gba", "Metroid Fusion.gba", d);
      expect(fetchImpl.calls()).toBe(1);

      // Past the positive window: entry expired, exactly one more probe.
      clock += 2;
      await resolveMetadata("gba", "Metroid Fusion.gba", d);
      expect(fetchImpl.calls()).toBe(2);
    });

    it("shields a confirmed TGDB no-match for the long confirmed-negative TTL, not a day", async () => {
      let clock = 1_000_000;
      const cache = new InMemoryCache(() => clock);
      const fetchImpl = countingFetch(empty);
      const d = deps({ fetchImpl, cache });

      await resolveMetadata("gba", "No Such Game.gba", d);
      // A full day later a confirmed no-match must NOT re-hit TGDB. At day+1 the
      // recorded allowance (998, from the empty fixture) is still fresh and above
      // floor, so it is the confirmed-negative SHIELD — not a floored allowance —
      // that suppresses the fetch here.
      clock += 24 * 60 * 60 * 1000 + 1;
      const again = await resolveMetadata("gba", "No Such Game.gba", d);
      expect(again.source).toBe("libretro");
      expect(fetchImpl.calls()).toBe(1);
      // But it does re-probe once the long confirmed-negative shield elapses.
      clock += CONFIRMED_NEGATIVE_TTL_MS;
      await resolveMetadata("gba", "No Such Game.gba", d);
      expect(fetchImpl.calls()).toBe(2);
    });

    it("retries TGDB quickly after an error (RETRY_TTL), not after days", async () => {
      let clock = 1_000_000;
      const cache = new InMemoryCache(() => clock);
      let n = 0;
      const errFetch: FetchLike = async () => {
        n += 1;
        return { ok: false, status: 503, json: async () => ({}) };
      };
      const d = deps({ fetchImpl: errFetch, cache });

      await resolveMetadata("gba", "Metroid Fusion.gba", d);
      expect(n).toBe(1);
      // Just past the short retry window: TGDB is probed again.
      clock += RETRY_TTL_MS + 1;
      await resolveMetadata("gba", "Metroid Fusion.gba", d);
      expect(n).toBe(2);
    });
  });
});
