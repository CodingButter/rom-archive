#!/usr/bin/env node
// check_contract.mjs — fail-closed guard against drift between the TypeScript
// wire contract and its hand-written C++ mirror.
//
// It reads the two canonical artifacts emitted by the contract package
// (schema/console-dirs.json and schema/contract-fields.json) and compares them,
// two-way, against sentinel-delimited blocks parsed out of the C++ core:
//   * the console -> dir map, from src/contract.cpp
//       // @contract:console-dirs:begin ... {Console::X, "id", "dir"}, ... :end
//   * each mirrored struct's field-name set, from include/rom_archive/contract.hpp
//       // @contract:fields:<TypeName>:begin ... <type> <name>; ... :end
//
// Any difference in either direction (missing member, extra member, wrong dir)
// exits non-zero with a diagnostic. Field *types* are not compared here — those
// are covered by the JSON-parse fixture tests.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = resolve(here, "..");
const repoRoot = resolve(coreDir, "..", "..", "..");
const schemaDir = resolve(repoRoot, "packages", "contract", "schema");

const errors = [];
function fail(msg) {
  errors.push(msg);
}

// --- Console id -> the enum id we expect on the C++ side. The C++ rows carry
// the wire id string directly, so we compare dir maps keyed by that id. ---

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function extractBlock(source, beginMarker, endMarker) {
  const begin = source.indexOf(beginMarker);
  const end = source.indexOf(endMarker);
  if (begin === -1 || end === -1 || end < begin) return null;
  return source.slice(begin + beginMarker.length, end);
}

function setsEqual(label, expected, actual) {
  const exp = new Set(expected);
  const act = new Set(actual);
  for (const k of exp) {
    if (!act.has(k)) fail(`${label}: C++ is missing '${k}' (present in contract)`);
  }
  for (const k of act) {
    if (!exp.has(k)) fail(`${label}: C++ has extra '${k}' (not in contract)`);
  }
}

// --- 1. Console -> dir map ---

const consoleDirs = loadJson(resolve(schemaDir, "console-dirs.json"));
const contractCpp = readFileSync(resolve(coreDir, "src", "contract.cpp"), "utf8");

const consoleBlock = extractBlock(
  contractCpp,
  "// @contract:console-dirs:begin",
  "// @contract:console-dirs:end",
);
if (consoleBlock === null) {
  fail("could not find the console-dirs sentinel block in src/contract.cpp");
} else {
  // Each row: {Console::Xxx, "id", "dir"},
  const rowRe = /\{\s*Console::\w+\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\}/g;
  const cppMap = {};
  let m;
  while ((m = rowRe.exec(consoleBlock)) !== null) {
    cppMap[m[1]] = m[2];
  }
  setsEqual("console ids", Object.keys(consoleDirs), Object.keys(cppMap));
  for (const [id, dir] of Object.entries(consoleDirs)) {
    if (cppMap[id] !== undefined && cppMap[id] !== dir) {
      fail(`console dir mismatch for '${id}': contract='${dir}' C++='${cppMap[id]}'`);
    }
  }
}

// --- 2. Struct field name sets ---

const contractFields = loadJson(resolve(schemaDir, "contract-fields.json"));
const contractHpp = readFileSync(
  resolve(coreDir, "include", "rom_archive", "contract.hpp"),
  "utf8",
);

for (const [typeName, fields] of Object.entries(contractFields)) {
  const block = extractBlock(
    contractHpp,
    `// @contract:fields:${typeName}:begin`,
    `// @contract:fields:${typeName}:end`,
  );
  if (block === null) {
    fail(`could not find the fields sentinel block for '${typeName}' in contract.hpp`);
    continue;
  }
  // Each declaration ends in `;`; the field name is the last identifier before
  // it (ignoring trailing comments). e.g. "std::optional<std::int64_t> approxSizeBytes;"
  const cppFields = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    if (!line.endsWith(";")) continue;
    const decl = line.slice(0, -1).trim();
    const nameMatch = decl.match(/([A-Za-z_]\w*)\s*$/);
    if (nameMatch) cppFields.push(nameMatch[1]);
  }
  setsEqual(`fields of ${typeName}`, fields, cppFields);
}

// --- Verdict ---

if (errors.length > 0) {
  console.error("contract drift detected:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log("contract check OK: console map and struct fields match the TypeScript contract.");
