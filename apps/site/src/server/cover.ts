import type { Console } from "@rom-archive/contract";

/**
 * Maps our console ids to the libretro thumbnails system-folder names. These are
 * libretro's canonical playlist/system directory names under
 * `https://thumbnails.libretro.com/`. A console with no known libretro folder
 * returns null ⇒ no cover is derived for it.
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

/**
 * Libretro replaces this set of filename-illegal characters with `_` when naming
 * thumbnail PNGs: & * / : ` < > ? \ | " — see the libretro thumbnail naming
 * convention. Applied to the title (No-Intro name minus extension).
 */
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

/** The libretro system folder for a console, or null if unmapped. */
export function libretroSystemFor(console: Console): string | null {
  return LIBRETRO_SYSTEM[console] ?? null;
}

/**
 * Derive the libretro Named_Boxarts thumbnail URL for a ROM filename, or null
 * when the console has no libretro system OR the file is an archive
 * (`.zip`/`.7z`) — `Game.zip.png` matches nothing. The title is the filename
 * with its extension stripped and libretro's illegal characters replaced by `_`.
 * The URL is NOT verified to exist; the console tolerates a 404.
 */
export function coverUrlFor(console: Console, romFileName: string): string | null {
  const system = libretroSystemFor(console);
  if (system === null) return null;
  if (ARCHIVE_EXTENSIONS.has(extensionOf(romFileName))) return null;

  const title = stripExtension(romFileName).replace(LIBRETRO_ILLEGAL, "_");
  const encodedSystem = encodeURIComponent(system);
  const encodedName = encodeURIComponent(`${title}.png`);
  return `${THUMBNAILS_BASE}/${encodedSystem}/Named_Boxarts/${encodedName}`;
}

/**
 * The TWiLight Menu++ box-art SD target path for a ROM, keyed to the ROM's FINAL
 * routed `targetPath` (post-collision). TWiLight matches box art by the full rom
 * filename, so the cover name must equal the routed basename — deriving it from
 * the raw archive name would mismatch whenever a collision disambiguated the ROM.
 * The routed path is already sanitized+disambiguated by the planner, so this does
 * NOT re-sanitize.
 */
export function coverTargetPathFor(routedTargetPath: string): string {
  const slash = routedTargetPath.lastIndexOf("/");
  const basename = slash === -1 ? routedTargetPath : routedTargetPath.slice(slash + 1);
  return `_nds/TWiLightMenu/boxart/${basename}.png`;
}
