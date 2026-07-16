#!/usr/bin/env node
// Live proof: every curated catalog id returns >=1 md5-bearing ROM file from
// archive.org, using the EXACT filter logic of apps/site/src/server/archiveClient.ts
// (extractRomFiles). A dead/renamed upstream id fails here loudly — this script is
// the catalog canary.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(here, "..", "..", "..", "apps", "site", "src", "server", "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

// --- mirror of archiveClient.ts extractRomFiles predicate (kept byte-identical) ---
const ROM_EXTENSIONS = new Set([
  "nds", "gba", "gb", "gbc", "sfc", "smc", "snes", "nes",
  "gg", "sms", "md", "gen", "bin", "pce", "zip", "7z",
]);
const METADATA_NAME_PATTERNS = [
  /_meta\.xml$/i, /_files\.xml$/i, /_reviews\.xml$/i,
  /_meta\.sqlite$/i, /\.torrent$/i, /^__ia_thumb\.jpg$/i,
];
const extensionOf = (name) => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
};
const isMetadataFile = (name) => METADATA_NAME_PATTERNS.some((re) => re.test(name));
const isRomLike = (name) => ROM_EXTENSIONS.has(extensionOf(name));
const parseSize = (raw) => {
  if (raw === undefined || String(raw).trim() === "") return null;
  if (!/^\d+$/.test(String(raw).trim())) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
};
function extractRomFiles(files) {
  const out = [];
  for (const f of files) {
    if (isMetadataFile(f.name)) continue;
    if (!isRomLike(f.name)) continue;
    if (!f.md5) continue;
    if (parseSize(f.size) === null) continue;
    out.push(f);
  }
  return out;
}

const UA = { "User-Agent": "rom-archive-catalog-verify" };
let failures = 0;

console.log(`Verifying ${catalog.length} catalog ids against live archive.org...\n`);
for (const entry of catalog) {
  const { id, console: cons } = entry;
  try {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, { headers: UA });
    if (!res.ok) {
      console.log(`FAIL  ${cons.padEnd(4)} ${id}  HTTP ${res.status}`);
      failures++;
      continue;
    }
    const body = await res.json();
    const files = Array.isArray(body.files) ? body.files : [];
    const roms = extractRomFiles(files);
    if (roms.length < 1) {
      console.log(`FAIL  ${cons.padEnd(4)} ${id}  0 md5-bearing ROM files`);
      failures++;
      continue;
    }
    const sample = roms[0].name.slice(0, 48);
    console.log(`OK    ${cons.padEnd(4)} ${id}  roms=${roms.length}  e.g. "${sample}"`);
  } catch (err) {
    console.log(`FAIL  ${cons.padEnd(4)} ${id}  ${err.message}`);
    failures++;
  }
}

console.log("");
if (failures > 0) {
  console.log(`RESULT: ${failures} id(s) failed verification.`);
  process.exit(1);
}
console.log(`RESULT: all ${catalog.length} ids yield >=1 md5-bearing ROM file.`);
