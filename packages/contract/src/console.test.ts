import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CONSOLES,
  CONSOLE_TO_ROMS_DIR,
  ConsoleSchema,
  consoleToRomsDir,
  type Console,
} from "./console.js";

const here = dirname(fileURLToPath(import.meta.url));
const consoleDirsPath = join(here, "..", "schema", "console-dirs.json");

describe("Console enum + routing map", () => {
  it("the enum accepts every frozen console and rejects unknowns", () => {
    for (const c of CONSOLES) {
      expect(ConsoleSchema.parse(c)).toBe(c);
    }
    expect(ConsoleSchema.safeParse("ps1").success).toBe(false);
    expect(ConsoleSchema.safeParse("").success).toBe(false);
  });

  it("CONSOLE_TO_ROMS_DIR covers every console with no extras (both directions)", () => {
    const mapKeys = Object.keys(CONSOLE_TO_ROMS_DIR).sort();
    const enumValues = [...CONSOLES].sort();
    // every enum value has a mapping
    expect(mapKeys).toEqual(enumValues);
    // and every mapping key is a valid enum value (no extras)
    for (const key of mapKeys) {
      expect(ConsoleSchema.safeParse(key).success).toBe(true);
    }
  });

  it("maps every console to a non-empty directory", () => {
    for (const c of CONSOLES) {
      const dir = CONSOLE_TO_ROMS_DIR[c];
      expect(dir.length).toBeGreaterThan(0);
      expect(consoleToRomsDir(c)).toBe(`roms/${dir}`);
    }
  });

  it("assigns distinct directories (no two consoles share a folder)", () => {
    const dirs = Object.values(CONSOLE_TO_ROMS_DIR);
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it("console-dirs.json is emitted and equals the TS map exactly", () => {
    const emitted = JSON.parse(readFileSync(consoleDirsPath, "utf8")) as Record<
      Console,
      string
    >;
    expect(emitted).toEqual(CONSOLE_TO_ROMS_DIR);
  });
});
