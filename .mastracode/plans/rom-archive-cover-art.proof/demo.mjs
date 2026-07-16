#!/usr/bin/env node
// Live proof for the cover-art fix: drives the REAL client `coverUrlFor`
// (apps/site/src/lib/cover.ts) against LIVE archive.org filenames and LIVE
// libretro, proving:
//
//   Deterministic / offline (the real gate — no network needed):
//     DERIVE:ZIP           a `.zip` name yields a non-null libretro URL
//     DERIVE:7Z            a `.7z`  name yields a non-null libretro URL
//     FALLBACK:NULL-FREE   no full-set archive name on a libretro-mapped
//                          console returns null from the client fn
//     NO-DOUBLE-STRIP      `Super Mario Bros. (World).zip` keeps the dot after
//                          `Bros` (the exact libretro stem), `Game.v1.2.zip`
//                          keeps `Game.v1.2`
//
//   Best-effort / network (informational, never a hard red):
//     HITRATE:NES <n>/<m>  live HEADs against libretro for a No-Intro_NES sample
//     HITRATE:GBA <n>/<m>  live HEADs against libretro for a No-Intro_GBA sample
//
// The `coverUrlFor` under test is the ACTUAL source module, transpiled on the
// fly (it has no runtime deps — only a type-only contract import). Pass
// COVER_MODULE to point at a different build (used by run.sh for the base-commit
// `without.txt`).
//
// Usage:
//   node demo.mjs                 # branch source, live network when reachable
//   COVER_MODULE=/abs/cover.mjs node demo.mjs   # a specific transpiled module

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const COVER_TS = join(repoRoot, "apps/site/src/lib/cover.ts");

let failures = 0;
function check(label, cond, detail = "") {
  const tag = cond ? "OK  " : "FAIL";
  if (!cond) failures++;
  console.log(`${tag}  ${label}${detail ? `  ${detail}` : ""}`);
}
function info(label, detail = "") {
  console.log(`INFO  ${label}${detail ? `  ${detail}` : ""}`);
}

// --- Load the real coverUrlFor (transpile the TS source to ESM) ------------
async function loadCover() {
  // A path to raw TS source to load (branch source by default; run.sh points
  // COVER_MODULE at the base-commit source for without.txt). Node 22.6+/25
  // strips the types natively, so we drop the type-only import and import the
  // `.ts` directly — no build step, the REAL source runs.
  const tsPath = process.env.COVER_MODULE ?? COVER_TS;
  const src = readFileSync(tsPath, "utf8");
  const stripped = src.replace(/^import type .*$/m, "");
  const { writeFileSync } = await import("node:fs");
  const tmpTs = join(tmpdir(), `cover-proof-${process.pid}-${Math.random().toString(36).slice(2)}.ts`);
  writeFileSync(tmpTs, stripped);
  return import(pathToFileURL(tmpTs).href);
}

// --- Live archive.org filename pull -----------------------------------------
async function archiveFiles(id, ext, limit) {
  const res = await fetch(`https://archive.org/metadata/${id}`);
  if (!res.ok) throw new Error(`archive.org ${id} → ${res.status}`);
  const body = await res.json();
  const files = (body.files ?? [])
    .map((f) => f.name)
    .filter((n) => typeof n === "string" && n.toLowerCase().endsWith(`.${ext}`));
  // Prefer canonical (USA) titles — libretro coverage is richest there.
  const usa = files.filter((n) => n.includes("(USA)"));
  return (usa.length >= limit ? usa : files).slice(0, limit);
}

async function hitrate(label, console, id, ext, sampleSize, coverUrlFor) {
  let names;
  try {
    names = await archiveFiles(id, ext, sampleSize);
  } catch (e) {
    info(`HITRATE:${label}`, `inconclusive — archive.org unreachable (${e.message})`);
    return;
  }
  if (names.length === 0) {
    info(`HITRATE:${label}`, "inconclusive — no filenames returned");
    return;
  }
  let ok = 0;
  let networkError = 0;
  for (const name of names) {
    const url = coverUrlFor(console, name);
    if (!url) continue;
    try {
      const r = await fetch(url, { method: "HEAD" });
      if (r.status === 200) ok++;
      else if (r.status >= 500) networkError++;
    } catch {
      networkError++;
    }
  }
  if (networkError > names.length / 2) {
    info(`HITRATE:${label}`, `inconclusive — libretro availability errors (${networkError}/${names.length})`);
    return;
  }
  const rate = ok / names.length;
  info(`HITRATE:${label}`, `${ok}/${names.length} (${(rate * 100).toFixed(0)}%)`);
  if (rate < 0.6) {
    info(`HITRATE:${label}`, `below 60% bar — corroboration only, not a hard red`);
  }
}

async function main() {
  const { coverUrlFor } = await loadCover();

  console.log("=== Deterministic markers (offline — the real gate) ===");

  const zipUrl = coverUrlFor("nes", "Contra (USA).zip");
  check("DERIVE:ZIP", zipUrl !== null, zipUrl ?? "null");

  const sevenZUrl = coverUrlFor("gba", "Metroid Fusion (USA).7z");
  check("DERIVE:7Z", sevenZUrl !== null, sevenZUrl ?? "null");

  // FALLBACK:NULL-FREE — no full-set-style archive name on a mapped console
  // returns null. (Unmapped consoles legitimately return null by design.)
  const mappedArchiveNames = [
    ["nes", "Super Mario Bros. (World).zip"],
    ["snes", "Chrono Trigger (USA).zip"],
    ["gba", "Golden Sun (USA).7z"],
    ["gb", "Tetris (World).7z"],
    ["gbc", "Pokemon - Crystal Version (USA).7z"],
    ["md", "Sonic The Hedgehog (USA, Europe).zip"],
    ["pce", "Bonk's Adventure (USA).zip"],
    ["gg", "Sonic The Hedgehog (USA, Europe).7z"],
    ["sms", "Alex Kidd in Miracle World (USA, Europe).7z"],
  ];
  const nullFree = mappedArchiveNames.every(([c, n]) => coverUrlFor(c, n) !== null);
  check("FALLBACK:NULL-FREE", nullFree, `${mappedArchiveNames.length} mapped-console archive names`);

  // NO-DOUBLE-STRIP — the dotted-title regression the plan called out.
  const smb = coverUrlFor("nes", "Super Mario Bros. (World).zip");
  const smbOk = smb ===
    "https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Super%20Mario%20Bros.%20(World).png";
  check("NO-DOUBLE-STRIP (dotted title)", smbOk, smb ?? "null");

  const vers = coverUrlFor("nes", "Game.v1.2.zip");
  const versOk = typeof vers === "string" && vers.includes("Game.v1.2.png");
  check("NO-DOUBLE-STRIP (Game.v1.2)", versOk, vers ?? "null");

  console.log("\n=== Best-effort hit-rate (live network — corroboration) ===");
  await hitrate("NES", "nes", "No-Intro_NES", "zip", 40, coverUrlFor);
  await hitrate("GBA", "gba", "No-Intro_GBA", "7z", 40, coverUrlFor);

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} deterministic failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
