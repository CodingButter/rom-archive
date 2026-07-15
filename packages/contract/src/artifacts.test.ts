import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CONSOLES } from "./console.js";
import { buildContractFields } from "../scripts/generate-schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const schemaDir = join(pkgRoot, "schema");

function read(name: string): string {
  return readFileSync(join(schemaDir, name), "utf8");
}

describe("generated schema artifacts", () => {
  it("emits a JSON Schema file for every wire type with md5 required where present", () => {
    for (const name of [
      "CatalogEntry",
      "CatalogResponse",
      "ItemDetailFile",
      "ItemDetailResponse",
      "DownloadPlanRequest",
      "DownloadPlanResponse",
      "ScanPointer",
      "ResolvedFile",
      "ResolveResponse",
    ]) {
      const schema = JSON.parse(read(`${name}.schema.json`)) as {
        $schema: string;
      };
      expect(schema.$schema).toContain("json-schema.org");
    }
    const itemFile = JSON.parse(read("ItemDetailFile.schema.json")) as {
      required: string[];
    };
    expect(itemFile.required).toContain("md5");
  });

  it("contract-fields.json lists the mirrored struct fields derived from the schemas", () => {
    const emitted = JSON.parse(read("contract-fields.json")) as Record<
      string,
      string[]
    >;
    expect(emitted).toEqual(buildContractFields());
    // sanity: the mirrored types are present
    expect(Object.keys(emitted).sort()).toEqual([
      "CatalogEntry",
      "DownloadPlanRequest",
      "DownloadPlanResponse",
      "ItemDetailFile",
      "ResolveResponse",
      "ResolvedFile",
      "ScanPointer",
    ]);
  });

  it("console-dirs.json contains exactly the frozen console set", () => {
    const emitted = JSON.parse(read("console-dirs.json")) as Record<
      string,
      string
    >;
    expect(Object.keys(emitted).sort()).toEqual([...CONSOLES].sort());
  });

  it("generation is deterministic: re-running produces byte-identical artifacts", () => {
    const before = {
      dirs: read("console-dirs.json"),
      fields: read("contract-fields.json"),
      item: read("ItemDetailFile.schema.json"),
    };
    execFileSync("pnpm", ["run", "gen"], { cwd: pkgRoot, stdio: "ignore" });
    expect(read("console-dirs.json")).toBe(before.dirs);
    expect(read("contract-fields.json")).toBe(before.fields);
    expect(read("ItemDetailFile.schema.json")).toBe(before.item);
  });
});
