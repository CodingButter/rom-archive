import { describe, expect, it } from "vitest";
import { CONSOLES } from "@rom-archive/contract";
import {
  coverUrlFor as clientCoverUrlFor,
  scanPointerValue,
  stripArchiveExtension,
} from "./cover";
import { coverUrlFor as serverCoverUrlFor } from "../server/cover";

/**
 * The web page derives cover thumbnails client-side (lib/cover.ts) while the
 * resolve/plan path derives them server-side (server/cover.ts). The two are
 * intentionally duplicated (server code can't ship to the client bundle). This
 * test is the drift guard for the SHARED surface — the libretro system map and
 * illegal-character rule — which must stay byte-identical on both sides.
 *
 * The one place they DELIBERATELY differ is per-game archive names (`.zip`/`.7z`).
 * The full-set catalog stores every ROM as an archive, so the client must derive
 * a cover from the inner title stem. The server still gates archives to null,
 * because its output feeds `coverTargetPathFor` which keys the on-device `.png`
 * filename off the routed archive basename (`Game.zip` → `Game.zip.png`) — and
 * TWiLight matches box art against the extracted inner ROM name (`Game.nes`), so
 * a naive server-side change would write a mismatched `.png` to real hardware.
 * That on-device fix is deferred to a separate CIA-side plan. The archive block
 * below encodes this divergence explicitly AND still pins the shared derivation
 * on the path that actually ships, so the guard is not gutted.
 */
describe("client cover derivation mirrors the server (non-archive names)", () => {
  const nonArchiveNames = [
    "Metroid Fusion (USA).gba",
    "Pokemon - Ruby Version (USA, Europe).gba",
    "Legend of Zelda, The - A Link to the Past (USA).sfc",
    "Sonic & Knuckles (World).md",
    "Some/Weird:Name*With?Illegal<Chars>.nds",
    "NoExtensionRom",
  ];

  for (const console of CONSOLES) {
    for (const name of nonArchiveNames) {
      it(`agrees for ${console} / ${name}`, () => {
        expect(clientCoverUrlFor(console, name)).toBe(
          serverCoverUrlFor(console, name),
        );
      });
    }
  }
});

describe("archive names: intentional client/server divergence", () => {
  // The FINAL-gate divergence holds for ANY archive name (dotted or not).
  const allArchiveNames = [
    "already.compressed.zip",
    "homebrew.7z",
    "Super Mario Bros. (World).zip",
  ];

  // The SHARED-derivation pin compares the client's archive output against the
  // server fed the archive-stripped stem. This isolates the console map +
  // illegal-char rule — but only when that stem has NO interior dot, because the
  // server's own `stripExtension` would double-strip a dotted stem (`already` from
  // `already.compressed`). Dotted stems are still covered by the direct-URL
  // assertions below (which prove the client does NOT double-strip); here we pin
  // the shared surface with dot-free stems so the comparison is apples-to-apples.
  const dotFreeArchiveNames = [
    "homebrew.7z",
    "Metroid Fusion (USA).zip",
    "Weird_Name (USA).7z",
  ];

  for (const console of CONSOLES) {
    for (const name of dotFreeArchiveNames) {
      // (a) The SHARED derivation agrees: the client's derived URL equals what the
      // server produces from the archive-stripped stem — proving the console map +
      // illegal-char rule remain byte-identical on the archive path that ships.
      it(`shared derivation agrees for ${console} / ${name}`, () => {
        expect(clientCoverUrlFor(console, name)).toBe(
          serverCoverUrlFor(console, stripArchiveExtension(name)),
        );
      });
    }

    for (const name of allArchiveNames) {
      // (b) The FINAL gate diverges: raw server derivation still returns null for
      // archive names (deferred CIA-side .png-naming concern), while the client
      // derives a real URL for libretro-mapped consoles.
      it(`final gate diverges for ${console} / ${name}`, () => {
        expect(serverCoverUrlFor(console, name)).toBeNull();
        // Every one of our consoles is libretro-mapped, so the client derives a
        // non-null URL for all of them.
        expect(clientCoverUrlFor(console, name)).not.toBeNull();
      });
    }
  }
});

describe("client cover derivation for per-game archives", () => {
  it("strips a single archive ext without double-stripping dotted titles", () => {
    // The `.` after `Bros` must survive — a second stripExtension would cut it.
    expect(clientCoverUrlFor("nes", "Super Mario Bros. (World).zip")).toBe(
      "https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/Named_Boxarts/Super%20Mario%20Bros.%20(World).png",
    );
  });

  it("keeps version dots in the stem (Game.v1.2, not Game.v1)", () => {
    expect(stripArchiveExtension("Game.v1.2.zip")).toBe("Game.v1.2");
    expect(clientCoverUrlFor("nes", "Game.v1.2.zip")).toContain(
      "Named_Boxarts/Game.v1.2.png",
    );
  });

  it("derives the GBA system path for a .7z name", () => {
    expect(clientCoverUrlFor("gba", "Metroid Fusion (USA).7z")).toBe(
      "https://thumbnails.libretro.com/Nintendo%20-%20Game%20Boy%20Advance/Named_Boxarts/Metroid%20Fusion%20(USA).png",
    );
  });

  it("leaves a plain .gba name byte-unchanged from prior behavior", () => {
    expect(clientCoverUrlFor("gba", "Metroid Fusion (USA).gba")).toBe(
      serverCoverUrlFor("gba", "Metroid Fusion (USA).gba"),
    );
  });

  it("replaces illegal characters with _ on an archive stem", () => {
    expect(clientCoverUrlFor("nds", "Weird:Name*Illegal?.7z")).toContain(
      "Named_Boxarts/Weird_Name_Illegal_.png",
    );
  });

  it("strips the archive extension case-insensitively (.ZIP)", () => {
    expect(clientCoverUrlFor("nes", "Game (USA).ZIP")).not.toBeNull();
    expect(clientCoverUrlFor("nes", "Game (USA).ZIP")).toContain(
      "Named_Boxarts/Game%20(USA).png",
    );
  });
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
