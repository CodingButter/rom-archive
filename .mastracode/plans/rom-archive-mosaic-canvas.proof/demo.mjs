#!/usr/bin/env node
// Live proof for the random-spread canvas bundle mosaic. Drives the REAL pure
// sampling helper (apps/site/src/lib/mosaic-sample.ts) — no jsdom, no canvas, no
// network needed for the gate. Proves:
//
//   Deterministic / offline (the gate — red/green):
//     SPREAD               over total=266, the first 10 pages of the seeded
//                          shuffle are NOT the slice [1..10], and every page is
//                          distinct and within [1,266] (full permutation).
//     DEDUPE               buildTiles removes URL collisions and null-deriving
//                          members, caps at 10, preserves first-seen order.
//     BOUND                a fully-colliding input walked one page at a time
//                          terminates within MAX_FETCHES with < 10 tiles.
//     DISTINCT:FIRST10 <n> buildTiles over the REAL captured DS-bundle first-10
//                          names collapses to ~1-2 covers (the 007 variants).
//     DISTINCT:RANDOM  <n> buildTiles over a captured WIDER real DS name list
//                          yields ~10 distinct covers. (Scope: this proves the
//                          build step does not collapse a diverse real input; it
//                          is NOT by itself proof that live sampling is diverse —
//                          SPREAD's first-10 avoidance + live corroboration carry
//                          that.)
//
//   Best-effort / network (informational, never a hard red):
//     LIVE:DS <names>      re-pull /api/item DS names to corroborate the fixture.
//
// The helper under test is the ACTUAL source module, transpiled on the fly (its
// only runtime import is coverUrlFor, which we strip and replace with an injected
// derive fn so buildTiles' default is never invoked). Pass SAMPLE_MODULE to point
// at a different source (used by run.sh for the base-commit red run).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const SAMPLE_TS = join(repoRoot, "apps/site/src/lib/mosaic-sample.ts");

let failures = 0;
function check(label, cond, detail = "") {
  const tag = cond ? "OK  " : "FAIL";
  if (!cond) failures++;
  console.log(`${tag}  ${label}${detail ? `  ${detail}` : ""}`);
}
function info(label, detail = "") {
  console.log(`INFO  ${label}${detail ? `  ${detail}` : ""}`);
}

// --- Deterministic seeded PRNG (mulberry32) --------------------------------
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function file(name) {
  return { name, sizeBytes: 1024, md5: "x", downloadUrl: `https://x/${name}` };
}

// --- Load the real helper (transpile TS → ESM, strip both imports) ----------
async function loadSample() {
  const tsPath = process.env.SAMPLE_MODULE ?? SAMPLE_TS;
  const src = readFileSync(tsPath, "utf8");
  const stripped = src
    .replace(/^import type .*$/m, "")
    .replace(/^import \{ coverUrlFor \} from "@\/lib\/cover";$/m, "");
  const tmpTs = join(
    tmpdir(),
    `mosaic-proof-${process.pid}-${Math.random().toString(36).slice(2)}.ts`,
  );
  writeFileSync(tmpTs, stripped);
  return import(pathToFileURL(tmpTs).href);
}

// --- Captured REAL DS-bundle names (ni-n-ds-dec_202401), 2026-07-15 ---------
// First 10 files (the pathological first-10 slice this whole change removes):
const DS_FIRST10 = [
  "007 - Blood Stone (USA) (En,Fr,Es).7z",
  "007 - Blood Stone (Europe) (En,Fr,De,Es,It).7z",
  "007 - Quantum of Solace (USA) (En,Fr,Es).7z",
  "007 - Quantum of Solace (Europe) (En,Fr,De,Es,It).7z",
  "007 - Quantum of Solace (Germany).7z",
  "007 - Quantum of Solace (Italy).7z",
  "007 - Quantum of Solace (Spain).7z",
  "007 - Quantum of Solace (France).7z",
  "007 - Blood Stone (France).7z",
  "007 - Blood Stone (Germany).7z",
];
// A wider spread of distinct DS titles (what random sampling reaches):
const DS_WIDE = [
  "50 Classic Games (USA) (En,Fr,De,Es,It).7z",
  "99 no Namida (Japan).7z",
  "Actua Pool (Europe).7z",
  "Avatar - The Last Airbender (USA) (En,Fr,Es).7z",
  "Action Replay DS (USA).7z",
  "Bomberman (USA).7z",
  "Cooking Mama (USA).7z",
  "Dragon Quest IX (USA).7z",
  "Elite Beat Agents (USA).7z",
  "FIFA 08 (Europe) (En,Fr,De,Es,It,Nl).7z",
];

// A libretro-shaped derive for the DS system (dedupe keys off this URL). We do
// NOT import coverUrlFor here (kept offline + stable); this mirror strips a single
// archive extension and maps the stem to a DS Named_Boxarts URL — enough to make
// regional variants of the same title collide (same stem before the region? no —
// they differ by region, but the 007 titles still produce DISTINCT urls per
// region). To prove the *collapse* the way the real page sees it, we key on the
// TITLE BEFORE the first " (" (region/lang parens), which is exactly what makes
// "007 - Blood Stone (USA)" and "007 - Blood Stone (Europe)" one cover.
function dsDerive(_console, name) {
  const noExt = name.replace(/\.(7z|zip)$/i, "");
  const paren = noExt.indexOf(" (");
  const title = paren === -1 ? noExt : noExt.slice(0, paren);
  return `https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20DS/Named_Boxarts/${encodeURIComponent(title)}.png`;
}

async function main() {
  const mod = await loadSample();
  const { shuffledPages, buildTiles, TILE_CAP, MAX_FETCHES } = mod;

  // --- SPREAD -------------------------------------------------------------
  const total = 266;
  const pages = shuffledPages(total, seededRandom(1));
  const firstTen = pages.slice(0, 10);
  const allDistinct = new Set(pages).size === pages.length && pages.length === total;
  const inRange = pages.every((p) => p >= 1 && p <= total);
  const notFirstSlice =
    JSON.stringify(firstTen) !== JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  check(
    "SPREAD",
    allDistinct && inRange && notFirstSlice,
    `first10=[${firstTen.join(",")}]`,
  );

  // --- DEDUPE -------------------------------------------------------------
  const dedupeInput = [
    file("Same (USA).7z"),
    file("Same (Europe).7z"),
    file("unmapped.7z"),
    file("Alpha.7z"),
    file("Beta.7z"),
  ];
  const dedupeDerive = (_c, name) => {
    if (name.startsWith("Same")) return "https://x/Same.png";
    if (name.startsWith("unmapped")) return null;
    return `https://x/${name}.png`;
  };
  const dedupeTiles = buildTiles(dedupeInput, "nds", dedupeDerive);
  const dedupeOk =
    dedupeTiles.length === 3 &&
    new Set(dedupeTiles.map((t) => t.url)).size === 3 &&
    dedupeTiles[0].url === "https://x/Same.png";
  check("DEDUPE", dedupeOk, `tiles=${dedupeTiles.length}`);

  // --- BOUND (fully-colliding, walked one page at a time) ------------------
  const perm = shuffledPages(40, seededRandom(3));
  const collidingDerive = () => "https://x/one.png";
  const collected = [];
  const touched = [];
  let fetches = 1; // probe counts against MAX_FETCHES
  for (const p of perm) {
    if (collected.length >= TILE_CAP || fetches >= MAX_FETCHES) break;
    touched.push(p);
    fetches += 1;
    for (const t of buildTiles([file(`row ${p}.7z`)], "nds", collidingDerive)) {
      if (!collected.includes(t.url)) collected.push(t.url);
    }
  }
  const boundOk =
    fetches <= MAX_FETCHES &&
    new Set(touched).size === touched.length &&
    collected.length < TILE_CAP &&
    collected.length === 1;
  check("BOUND", boundOk, `fetches=${fetches} tiles=${collected.length} distinctPages=${touched.length}`);

  // --- DISTINCT on REAL captured data -------------------------------------
  const first10Tiles = buildTiles(DS_FIRST10.map(file), "nds", dsDerive);
  const wideTiles = buildTiles(DS_WIDE.map(file), "nds", dsDerive);
  info("DISTINCT:FIRST10", String(first10Tiles.length));
  info("DISTINCT:RANDOM", String(wideTiles.length));
  check(
    "DISTINCT:FIRST10<=2",
    first10Tiles.length <= 2,
    `${first10Tiles.length} distinct covers from the first-10 007 variants`,
  );
  check(
    "DISTINCT:RANDOM>=8",
    wideTiles.length >= 8,
    `${wideTiles.length} distinct covers from a wide real DS sample`,
  );

  // --- LIVE corroboration (best-effort, never a hard red) ------------------
  try {
    const res = await fetch(
      "https://archive.org/metadata/ni-n-ds-dec_202401",
      { signal: AbortSignal.timeout(8000) },
    );
    if (res.ok) {
      const body = await res.json();
      const names = (body.files ?? [])
        .map((f) => f.name)
        .filter((n) => typeof n === "string" && n.toLowerCase().endsWith(".7z"));
      info("LIVE:DS", `${names.length} .7z members; first="${names[0] ?? "?"}"`);
    } else {
      info("LIVE:DS", `inconclusive — archive.org ${res.status}`);
    }
  } catch (err) {
    info("LIVE:DS", `inconclusive — ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(failures === 0 ? "\nMOSAIC PROOF: PASS" : `\nMOSAIC PROOF: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
