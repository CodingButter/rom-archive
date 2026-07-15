import { describe, expect, it } from "vitest";
import { CONSOLES } from "@rom-archive/contract";
import { coverUrlFor as clientCoverUrlFor, scanPointerValue } from "./cover";
import { coverUrlFor as serverCoverUrlFor } from "../server/cover";

/**
 * The web page derives cover thumbnails client-side (lib/cover.ts) while the
 * resolve/plan path derives them server-side (server/cover.ts). They are
 * intentionally duplicated (server code can't ship to the client bundle), so
 * this test is the guard that keeps them byte-identical: a future edit to the
 * libretro system map or illegal-char rule on one side will fail here.
 */
describe("client cover derivation mirrors the server", () => {
  const sampleNames = [
    "Metroid Fusion (USA).gba",
    "Pokemon - Ruby Version (USA, Europe).gba",
    "Legend of Zelda, The - A Link to the Past (USA).sfc",
    "Sonic & Knuckles (World).md",
    "Some/Weird:Name*With?Illegal<Chars>.nds",
    "already.compressed.zip",
    "homebrew.7z",
    "NoExtensionRom",
  ];

  for (const console of CONSOLES) {
    for (const name of sampleNames) {
      it(`agrees for ${console} / ${name}`, () => {
        expect(clientCoverUrlFor(console, name)).toBe(
          serverCoverUrlFor(console, name),
        );
      });
    }
  }
});

describe("scanPointerValue encodes the exact ScanPointer wire JSON", () => {
  it("bundle pointer omits file, key order v→id", () => {
    expect(scanPointerValue("gbahomebrew")).toBe('{"v":1,"id":"gbahomebrew"}');
  });

  it("single-file pointer carries file, key order v→id→file", () => {
    expect(scanPointerValue("gbahomebrew", "Metroid Fusion (USA).gba")).toBe(
      '{"v":1,"id":"gbahomebrew","file":"Metroid Fusion (USA).gba"}',
    );
  });
});
