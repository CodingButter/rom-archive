import type { Console, ScanPointer } from "@rom-archive/contract";

/**
 * Web-side mirror of the API's libretro cover-URL derivation (apps/api/src/cover.ts).
 * The item page derives box-art thumbnails directly from ROM filenames so it can
 * render a cover mosaic without a dedicated cover endpoint. Kept in sync with the
 * API by convention — both map our console ids to libretro's system folders and
 * apply the same illegal-character rule.
 */
const LIBRETRO_SYSTEM: Readonly<Record<Console, string | null>> = {
  nds: "Nintendo - Nintendo DS",
  gba: "Nintendo - Game Boy Advance",
  gb: "Nintendo - Game Boy",
  gbc: "Nintendo - Game Boy Color",
  snes: "Nintendo - Super Nintendo Entertainment System",
  nes: "Nintendo - Nintendo Entertainment System",
  gg: "Sega - Game Gear",
  sms: "Sega - Master System - Mark III",
  md: "Sega - Mega Drive - Genesis",
  pce: "NEC - PC Engine - TurboGrafx 16",
};

/** Extensions that are archives, not single playable ROMs — no cover derived. */
const ARCHIVE_EXTENSIONS = new Set(["zip", "7z"]);

/** Libretro replaces these filename-illegal characters with `_` in thumbnail names. */
const LIBRETRO_ILLEGAL = /[&*/:`<>?\\|"]/g;

const THUMBNAILS_BASE = "https://thumbnails.libretro.com";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}

/**
 * Derive the libretro Named_Boxarts thumbnail URL for a ROM filename, or null
 * when the console has no libretro system or the file is an archive. The URL is
 * NOT verified to exist; render with an onError fallback.
 */
export function coverUrlFor(console: Console, romFileName: string): string | null {
  const system = LIBRETRO_SYSTEM[console] ?? null;
  if (system === null) return null;
  if (ARCHIVE_EXTENSIONS.has(extensionOf(romFileName))) return null;

  const title = stripExtension(romFileName).replace(LIBRETRO_ILLEGAL, "_");
  const encodedSystem = encodeURIComponent(system);
  const encodedName = encodeURIComponent(`${title}.png`);
  return `${THUMBNAILS_BASE}/${encodedSystem}/Named_Boxarts/${encodedName}`;
}

/**
 * The JSON string a "Send to 3DS" QR carries: a versioned {@link ScanPointer}.
 * Omitting `file` points at the whole bundle; naming a file points at one ROM.
 * The console re-parses this against `ScanPointerSchema`, then resolves it
 * server-side (console is derived from the catalog, never carried here).
 */
export function scanPointerValue(id: string, file?: string): string {
  const pointer: ScanPointer = file ? { v: 1, id, file } : { v: 1, id };
  return JSON.stringify(pointer);
}
