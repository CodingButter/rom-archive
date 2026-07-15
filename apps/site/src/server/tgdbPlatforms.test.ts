import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CONSOLES } from "@rom-archive/contract";

import { CONSOLE_TO_TGDB_PLATFORM } from "./tgdbPlatforms";

const here = dirname(fileURLToPath(import.meta.url));

interface PlatformsResponse {
  data: { platforms: Record<string, { id: number; name: string }> };
}

const platforms = JSON.parse(
  readFileSync(join(here, "fixtures", "tgdb.platforms.json"), "utf8"),
) as PlatformsResponse;

const byId = platforms.data.platforms;

describe("CONSOLE_TO_TGDB_PLATFORM", () => {
  it("has an entry for every console (value may be null)", () => {
    const mapKeys = Object.keys(CONSOLE_TO_TGDB_PLATFORM).sort();
    expect(mapKeys).toEqual([...CONSOLES].sort());
  });

  it("backs every non-null platform id with the captured /v1/Platforms fixture", () => {
    for (const [console, platformId] of Object.entries(
      CONSOLE_TO_TGDB_PLATFORM,
    )) {
      if (platformId === null) continue;
      const entry = byId[String(platformId)];
      expect(entry, `${console} → ${platformId} must exist in fixture`).toBeDefined();
      expect(entry.id).toBe(platformId);
    }
  });

  it("maps md to Genesis (18) and pce to TurboGrafx 16 (34)", () => {
    expect(byId[String(CONSOLE_TO_TGDB_PLATFORM.md)].name).toMatch(/Genesis/i);
    expect(byId[String(CONSOLE_TO_TGDB_PLATFORM.pce)].name).toMatch(
      /TurboGrafx/i,
    );
  });
});
