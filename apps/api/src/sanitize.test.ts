import { describe, expect, it } from "vitest";

import { CONSOLES } from "@rom-archive/contract";
import { sanitizeFatName, sanitizeForPlan, targetPathFor } from "./sanitize.js";

describe("sanitizeFatName", () => {
  it("replaces illegal FAT32 characters with underscores", () => {
    expect(sanitizeFatName('a:b*c?d"e<f>g|h\\i/j.gba')).toBe(
      "a_b_c_d_e_f_g_h_i_j.gba",
    );
  });
  it("replaces control characters", () => {
    expect(sanitizeFatName("rom\u0000\u001f.gba")).toBe("rom__.gba");
  });
  it("trims trailing dots and spaces", () => {
    expect(sanitizeFatName("game.  ")).toBe("game");
    expect(sanitizeFatName("game...")).toBe("game");
  });
  it("never returns an empty string", () => {
    expect(sanitizeFatName("")).toBe("_");
    // trailing-dot/space trimming can empty a name; it falls back to "_"
    expect(sanitizeFatName("   ")).toBe("_");
    expect(sanitizeFatName("...")).toBe("_");
    // illegal chars become underscores (not collapsed) — a valid non-empty name
    expect(sanitizeFatName("///")).toBe("___");
  });
  it("caps length while preserving a short extension", () => {
    const long = "x".repeat(200) + ".gba";
    const out = sanitizeFatName(long);
    expect(out.length).toBeLessThanOrEqual(128);
    expect(out.endsWith(".gba")).toBe(true);
  });
});

describe("sanitizeForPlan collision disambiguation", () => {
  it("disambiguates names that sanitize to the same result", () => {
    const out = sanitizeForPlan(["a:b.gba", "a?b.gba", "a*b.gba"]);
    expect(out).toEqual(["a_b.gba", "a_b~1.gba", "a_b~2.gba"]);
    expect(new Set(out.map((n) => n.toLowerCase())).size).toBe(3);
  });
  it("is case-insensitive when detecting collisions (FAT is case-insensitive)", () => {
    const out = sanitizeForPlan(["ROM.gba", "rom.gba"]);
    expect(out[0]).toBe("ROM.gba");
    expect(out[1]).toBe("rom~1.gba");
  });
  it("leaves distinct names untouched and preserves input order", () => {
    expect(sanitizeForPlan(["b.gba", "a.gba"])).toEqual(["b.gba", "a.gba"]);
  });
});

describe("targetPathFor routes every console", () => {
  it("produces roms/<dir>/<name> for each frozen console", () => {
    for (const c of CONSOLES) {
      const path = targetPathFor(c, "demo.rom");
      expect(path).toMatch(/^roms\/[a-z0-9]+\/demo\.rom$/);
    }
  });
  it("uses the TWiLight folder names for md and pce", () => {
    expect(targetPathFor("md", "x.md")).toBe("roms/gen/x.md");
    expect(targetPathFor("pce", "x.pce")).toBe("roms/tg16/x.pce");
  });
});
