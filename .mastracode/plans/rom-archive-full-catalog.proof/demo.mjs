#!/usr/bin/env node
// Live proof for the full-catalog feature: drives the REAL built Next route
// handler (`GET /api/item`) against live archive.org for a genuine multi-thousand
// ROM No-Intro bundle, exercising:
//   1. the backward-compatible full-list shape (no pagination params),
//   2. page 1 of a bounded paginated page,
//   3. a name search (`q`) returning a filtered subset,
//   4. an out-of-range page (empty slice, correct total),
// and asserts a valid per-ROM ScanPointer and whole-bundle ScanPointer are
// produced. It talks to a running server over HTTP (no byte proxying anywhere).
//
// Usage:
//   DEMO_BASE_URL=http://localhost:3000 node demo.mjs   # against an already-running server
//   node demo.mjs                                        # spins up `next start` itself
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// A large, live No-Intro full set from the curated catalog (thousands of ROMs).
const ITEM_ID = "No-Intro_NES";
const PAGE_SIZE = 60;
const SEARCH = "Mario";

let failures = 0;
function check(label, cond, detail = "") {
  const tag = cond ? "OK  " : "FAIL";
  if (!cond) failures++;
  console.log(`${tag}  ${label}${detail ? `  ${detail}` : ""}`);
}

// Minimal mirror of scanPointerValue (apps/site/src/lib/cover.ts) — the exact
// QR wire string. Whole-bundle omits `file`; per-ROM includes it.
function scanPointerValue(id, file) {
  return file === undefined
    ? JSON.stringify({ v: 1, id })
    : JSON.stringify({ v: 1, id, file });
}

async function getJson(base, query) {
  const res = await fetch(`${base}/api/item?${query}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function run(base) {
  console.log(`\nDriving GET /api/item on ${base} for "${ITEM_ID}"...\n`);

  // 1. Backward-compatible full list (no pagination params).
  const full = await getJson(base, `id=${ITEM_ID}`);
  check("full-list 200", full.status === 200);
  const fullFiles = Array.isArray(full.body.files) ? full.body.files : [];
  check("full-list has thousands of ROMs", fullFiles.length > 1000, `files=${fullFiles.length}`);
  check("full-list has NO paging keys", !("total" in full.body) && !("page" in full.body));
  const totalRoms = fullFiles.length;

  // 2. Page 1, bounded.
  const p1 = await getJson(base, `id=${ITEM_ID}&page=1&pageSize=${PAGE_SIZE}`);
  check("page 1 status 200", p1.status === 200);
  check("page 1 bounded to pageSize", p1.body.files.length === PAGE_SIZE, `files=${p1.body.files?.length}`);
  check("page 1 total === full count", p1.body.total === totalRoms, `total=${p1.body.total}`);
  check("page 1 echoes page/pageSize", p1.body.page === 1 && p1.body.pageSize === PAGE_SIZE);

  // 3. Name search.
  const q = await getJson(base, `id=${ITEM_ID}&page=1&pageSize=${PAGE_SIZE}&q=${SEARCH}`);
  check("search 200", q.status === 200);
  check(`search "${SEARCH}" narrows the set`, q.body.total > 0 && q.body.total < totalRoms, `total=${q.body.total}`);
  const allMatch = q.body.files.every((f) => f.name.toLowerCase().includes(SEARCH.toLowerCase()));
  check("every returned file matches q (case-insensitive)", allMatch);

  // 4. Out-of-range page → empty slice, correct total.
  const farPage = Math.ceil(totalRoms / PAGE_SIZE) + 100;
  const oob = await getJson(base, `id=${ITEM_ID}&page=${farPage}&pageSize=${PAGE_SIZE}`);
  check("out-of-range page empty slice", oob.body.files.length === 0, `page=${farPage}`);
  check("out-of-range page keeps correct total", oob.body.total === totalRoms);

  // 5. ScanPointer wire values.
  const sample = p1.body.files[0];
  const perRom = scanPointerValue(ITEM_ID, sample.name);
  const bundle = scanPointerValue(ITEM_ID);
  const perRomOk = JSON.parse(perRom).v === 1 && JSON.parse(perRom).id === ITEM_ID && JSON.parse(perRom).file === sample.name;
  const bundleOk = JSON.parse(bundle).v === 1 && JSON.parse(bundle).id === ITEM_ID && !("file" in JSON.parse(bundle));
  check("per-ROM ScanPointer valid", perRomOk, perRom);
  check("whole-bundle ScanPointer valid (no file)", bundleOk, bundle);

  console.log("");
  console.log(failures === 0 ? `RESULT: all checks passed.` : `RESULT: ${failures} check(s) failed.`);
}

async function waitForServer(base, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${base}/api/catalog`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const provided = process.env.DEMO_BASE_URL;
if (provided) {
  await run(provided.replace(/\/$/, ""));
  process.exit(failures === 0 ? 0 : 1);
} else {
  const port = 3411;
  const base = `http://localhost:${port}`;
  console.log(`Starting \`next start\` on ${port} (expects a prior \`next build\`)...`);
  const server = spawn("pnpm", ["--filter", "@rom-archive/site", "exec", "next", "start", "-p", String(port)], {
    cwd: join(here, "..", "..", ".."),
    stdio: "ignore",
  });
  try {
    const up = await waitForServer(base);
    if (!up) {
      console.log("FAIL  server did not become ready");
      process.exit(1);
    }
    await run(base);
  } finally {
    server.kill("SIGTERM");
  }
  process.exit(failures === 0 ? 0 : 1);
}
