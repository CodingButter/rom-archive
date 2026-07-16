// Live proof for the metadata feature. Drives the REAL built artifacts
// (apps/api/dist/src/*) — the same modules the Vercel /api/metadata function
// imports — through a call-counting stub fetch and the real InMemoryCache.
//
// It proves the four load-bearing behaviors of the goal:
//   TGDB:CALLS=1      the budget shield: repeated resolutions of the same game
//                     issue exactly one TGDB request.
//   CACHE:NEGATIVE    a TGDB no-match is cached and not re-fetched within TTL.
//   FALLBACK:LIBRETRO missing key AND floored allowance both serve libretro.
//   UNKNOWN:OK        the endpoint returns HTTP 200 with a graceful record when
//                     no editorial data is available (never a 5xx).
//
// Run from repo root AFTER `pnpm --filter @rom-archive/api build` and the fixture
// copy in run.sh:  node .mastracode/plans/rom-archive-metadata.proof/demo.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "api", "dist", "src");
const { resolveMetadata, InMemoryCache } = await import(join(dist, "metadataService.js"));
const { handleMetadata } = await import(join(dist, "handlers.js"));
const { loadTgdbGenres } = await import(join(dist, "tgdbGenres.js"));

const fixturesDir = join(dist, "fixtures");
const metroid = JSON.parse(readFileSync(join(fixturesDir, "tgdb.bygame.metroidfusion.json"), "utf8"));
const empty = JSON.parse(readFileSync(join(fixturesDir, "tgdb.bygame.empty.json"), "utf8"));

// A stub fetch that counts every TGDB call and returns a chosen body.
function countingFetch(body) {
  const state = { calls: 0 };
  const fetchImpl = async () => {
    state.calls += 1;
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetchImpl, state };
}

const lookups = { genres: loadTgdbGenres() };
let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? "OK  " : "FAIL"}  ${label}`);
  if (!ok) failures += 1;
};

// ── 1. Budget shield: same game resolved 5× → exactly one TGDB request ───────
{
  const { fetchImpl, state } = countingFetch(metroid);
  const cache = new InMemoryCache();
  const deps = { cache, fetchImpl, env: { TGDB_API_KEY: "demo-key" }, lookups };
  let meta;
  for (let i = 0; i < 5; i++) {
    meta = await resolveMetadata("gba", "Metroid Fusion.gba", deps);
  }
  console.log(`TGDB:HIT source=${meta.source} title=${JSON.stringify(meta.title)}`);
  console.log(`TGDB:CALLS=${state.calls}`);
  check("5 resolutions of the same game → exactly 1 TGDB request", state.calls === 1);
  check("resolved from TGDB with the real title", meta.source === "tgdb" && meta.title === "Metroid Fusion");
}

// ── 2. Negative caching: a TGDB no-match is cached, not re-probed ─────────────
{
  const { fetchImpl, state } = countingFetch(empty);
  const cache = new InMemoryCache();
  const deps = { cache, fetchImpl, env: { TGDB_API_KEY: "demo-key" }, lookups };
  for (let i = 0; i < 4; i++) {
    await resolveMetadata("gba", "Some Homebrew Demo.gba", deps);
  }
  console.log(`CACHE:NEGATIVE tgdb_calls=${state.calls}`);
  check("4 resolutions of a no-match game → exactly 1 TGDB request (negative cached)", state.calls === 1);
}

// ── 3. Fallback: missing key AND floored allowance both serve libretro ────────
{
  // (a) no key at all → libretro, zero TGDB calls
  const noKey = countingFetch(metroid);
  const a = await resolveMetadata("gba", "Metroid Fusion.gba", {
    cache: new InMemoryCache(),
    fetchImpl: noKey.fetchImpl,
    env: {},
    lookups,
  });
  console.log(`FALLBACK:LIBRETRO no-key source=${a.source} tgdb_calls=${noKey.state.calls}`);
  check("missing key → libretro, no TGDB spend", a.source === "libretro" && noKey.state.calls === 0);

  // (b) allowance floored → skip TGDB, serve libretro. Pre-seed the allowance
  //     cache below the floor so the service refuses to spend it.
  const floored = countingFetch(metroid);
  const cache = new InMemoryCache();
  await cache.set("meta:v1:tgdb-allowance", 5, 60 * 60 * 1000); // below ALLOWANCE_FLOOR (20)
  const b = await resolveMetadata("gba", "Metroid Fusion.gba", {
    cache,
    fetchImpl: floored.fetchImpl,
    env: { TGDB_API_KEY: "demo-key" },
    lookups,
  });
  console.log(`FALLBACK:LIBRETRO floored source=${b.source} tgdb_calls=${floored.state.calls}`);
  check("allowance floored → libretro, no TGDB spend", b.source === "libretro" && floored.state.calls === 0);
}

// ── 4. Endpoint: graceful 200 through the real handler ───────────────────────
{
  // 4a. Known item, TGDB up → 200 tgdb
  const okFetch = countingFetch(metroid).fetchImpl;
  const good = await handleMetadata("gbahomebrew", "Metroid Fusion.gba", {
    cache: new InMemoryCache(),
    fetchImpl: okFetch,
    env: { TGDB_API_KEY: "demo-key" },
  });
  console.log(`ENDPOINT:OK status=${good.status} source=${good.body.source}`);
  check("handleMetadata known item → 200", good.status === 200 && good.body.source === "tgdb");

  // 4b. Upstream throws → still 200 with a usable record (never a 5xx)
  const throwing = async () => { throw new Error("network down"); };
  const degraded = await handleMetadata("gbahomebrew", "Metroid Fusion.gba", {
    cache: new InMemoryCache(),
    fetchImpl: throwing,
    env: { TGDB_API_KEY: "demo-key" },
  });
  console.log(`UNKNOWN:OK status=${degraded.status} source=${degraded.body.source}`);
  check("upstream throw → graceful 200, never 5xx", degraded.status === 200);

  // 4c. Unknown catalog id → 404 (routing error, the ONLY non-200 path)
  const missing = await handleMetadata("not-a-real-id", "Whatever.gba", {
    cache: new InMemoryCache(),
    fetchImpl: okFetch,
    env: { TGDB_API_KEY: "demo-key" },
  });
  console.log(`ENDPOINT:404 status=${missing.status}`);
  check("unknown catalog id → 404", missing.status === 404);
}

console.log("");
if (failures === 0) {
  console.log("PROOF: GREEN — budget shield + negative caching + libretro fallback + graceful endpoint all verified on branch");
  process.exit(0);
} else {
  console.log(`PROOF: RED — ${failures} check(s) failed`);
  process.exit(1);
}
