import { describe, expect, it } from "vitest";

import { coverTargetPathFor, coverUrlFor, libretroSystemFor } from "./cover.js";

describe("libretroSystemFor", () => {
  it("maps known consoles to libretro system folders", () => {
    expect(libretroSystemFor("gba")).toBe("Nintendo - Game Boy Advance");
    expect(libretroSystemFor("nds")).toBe("Nintendo - Nintendo DS");
    expect(libretroSystemFor("snes")).toBe(
      "Nintendo - Super Nintendo Entertainment System",
    );
    expect(libretroSystemFor("md")).toBe("Sega - Mega Drive - Genesis");
  });
});

describe("coverUrlFor", () => {
  it("builds a Named_Boxarts thumbnail URL from a No-Intro filename", () => {
    const url = coverUrlFor("gba", "Anguna - Warriors of Virtue (USA) (Unl).gba");
    expect(url).toBe(
      "https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Advance/Named_Boxarts/" +
        encodeURIComponent("Anguna - Warriors of Virtue (USA) (Unl).png"),
    );
  });

  it("replaces libretro's illegal characters with underscores", () => {
    const url = coverUrlFor("gba", "A&B: C/D (USA).gba");
    // & : / all become _  →  "A_B_ C_D (USA).png"
    expect(url).toContain(encodeURIComponent("A_B_ C_D (USA).png"));
  });

  it("returns null for archive extensions (.zip/.7z)", () => {
    expect(coverUrlFor("gba", "Pack (USA).zip")).toBeNull();
    expect(coverUrlFor("gba", "Pack (USA).7z")).toBeNull();
  });
});

describe("coverTargetPathFor", () => {
  it("keys the box-art path to the routed basename", () => {
    expect(coverTargetPathFor("roms/gba/Anguna (USA) (Unl).gba")).toBe(
      "_nds/TWiLightMenu/boxart/Anguna (USA) (Unl).gba.png",
    );
  });

  it("preserves a collision-disambiguated basename", () => {
    expect(coverTargetPathFor("roms/gba/Game~1.gba")).toBe(
      "_nds/TWiLightMenu/boxart/Game~1.gba.png",
    );
  });
});
