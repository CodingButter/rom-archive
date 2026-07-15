/**
 * Emits the contract's build artifacts into packages/contract/schema/:
 *   - <Type>.schema.json   — JSON Schema for each wire type (via Zod's native
 *                            z.toJSONSchema).
 *   - console-dirs.json    — the canonical { console: dir } routing map. This
 *                            file, NOT the TS export, is what the C++ drift-check
 *                            (check_contract.mjs) reads. Source of truth.
 *   - contract-fields.json — the canonical { TypeName: [field, ...] } manifest
 *                            for the hand-mirrored C++ structs, DERIVED from the
 *                            zod schemas' shapes so it can never drift from them.
 *
 * Deterministic: object keys are sorted so repeated runs produce byte-identical
 * output (asserted by the test suite).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z, type ZodObject } from "zod";

import { CONSOLE_TO_ROMS_DIR } from "../src/console.js";
import {
  CatalogEntrySchema,
  CatalogResponseSchema,
  ItemDetailFileSchema,
  ItemDetailResponseSchema,
  DownloadPlanRequestSchema,
  DownloadPlanResponseSchema,
  ScanPointerSchema,
  ResolvedFileSchema,
  ResolveResponseSchema,
} from "../src/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, "..", "schema");

/** Stable stringify with sorted keys for deterministic, diff-friendly output. */
function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  const sort = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) throw new Error("cycle in schema output");
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(sort);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v as Record<string, unknown>).sort()) {
      out[key] = sort((v as Record<string, unknown>)[key]);
    }
    return out;
  };
  return JSON.stringify(sort(value), null, 2) + "\n";
}

const jsonSchemaTargets = {
  CatalogEntry: CatalogEntrySchema,
  CatalogResponse: CatalogResponseSchema,
  ItemDetailFile: ItemDetailFileSchema,
  ItemDetailResponse: ItemDetailResponseSchema,
  DownloadPlanRequest: DownloadPlanRequestSchema,
  DownloadPlanResponse: DownloadPlanResponseSchema,
  ScanPointer: ScanPointerSchema,
  ResolvedFile: ResolvedFileSchema,
  ResolveResponse: ResolveResponseSchema,
} as const;

/**
 * The types hand-mirrored into C++ structs. Their field lists are read straight
 * off the zod object shapes, so the manifest tracks the schema automatically.
 */
const mirroredTypes: Record<string, ZodObject> = {
  CatalogEntry: CatalogEntrySchema,
  ItemDetailFile: ItemDetailFileSchema,
  DownloadPlanRequest: DownloadPlanRequestSchema,
  DownloadPlanResponse: DownloadPlanResponseSchema,
  ScanPointer: ScanPointerSchema,
  ResolvedFile: ResolvedFileSchema,
  ResolveResponse: ResolveResponseSchema,
};

export function buildContractFields(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, schema] of Object.entries(mirroredTypes)) {
    out[name] = Object.keys(schema.shape).sort();
  }
  return out;
}

function main(): void {
  mkdirSync(schemaDir, { recursive: true });

  for (const [name, schema] of Object.entries(jsonSchemaTargets)) {
    const json = z.toJSONSchema(schema, { target: "draft-2020-12" });
    writeFileSync(join(schemaDir, `${name}.schema.json`), stableStringify(json));
  }

  writeFileSync(
    join(schemaDir, "console-dirs.json"),
    stableStringify(CONSOLE_TO_ROMS_DIR),
  );
  writeFileSync(
    join(schemaDir, "contract-fields.json"),
    stableStringify(buildContractFields()),
  );

  console.log(`contract: wrote schema artifacts to ${schemaDir}`);
}

// Only generate when run directly (via `tsx`/`node`), not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
