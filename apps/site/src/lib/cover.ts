import type { Console, ScanPointer } from "@rom-archive/contract";

/**
 * Web-side mirror of the API's libretro cover-URL derivation
 * (src/server/cover.ts). The item page derives box-art thumbnails directly from
 * ROM filenames so it can render a cover mosaic without a dedicated cover
 * endpoint. Kept in sync with the server by convention — both map our console
 * ids to libretro's system folders and apply the same illegal-character rule.
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

/**
 * Extensions that are per-game archives in the full-set catalog. No-Intro stores
 * every ROM as `<Title> (Region).zip` (NES/SNES/Genesis/PCE) or `.7z`
 * (GBA/GB/GBC/GG/SMS/DS) — a SINGLE archive extension over the exact inner ROM
 * title. The stem after stripping that one extension IS libretro's Named_Boxarts
 * name, so we derive covers for these instead of returning null.
 */
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
 * Remove a SINGLE trailing archive extension (`.zip`/`.7z`, case-insensitive)
 * from a filename, or return it unchanged when there is none. Unlike
 * {@link stripExtension} this cuts only the anchored archive suffix, so inner
 * titles with dots survive: `"Super Mario Bros. (World).zip"` →
 * `"Super Mario Bros. (World)"` (NOT `"Super Mario Bros"`), and
 * `"Game.v1.2.zip"` → `"Game.v1.2"`.
 */
export function stripArchiveExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name;
  const ext = name.slice(dot + 1).toLowerCase();
  return ARCHIVE_EXTENSIONS.has(ext) ? name.slice(0, dot) : name;
}

/**
 * Derive the libretro Named_Boxarts thumbnail URL for a ROM filename, or null
 * when the console has no libretro system. Per-game archive names (`.zip`/`.7z`,
 * the full-set catalog's storage format) have their single archive extension
 * stripped — the remaining stem IS the inner No-Intro title, which is exactly
 * libretro's thumbnail name — so covers derive for them too. The URL is NOT
 * verified to exist; render with an onError fallback.
 */
export function coverUrlFor(console: Console, romFileName: string): string | null {
  const system = LIBRETRO_SYSTEM[console] ?? null;
  if (system === null) return null;

  // Branch: for archive names the stem IS the full inner title — strip only the
  // archive extension, never a second time (stripExtension would cut a dot
  // inside the title, e.g. `Super Mario Bros.` → `Super Mario Bros`).
  const isArchive = ARCHIVE_EXTENSIONS.has(extensionOf(romFileName));
  const stem = isArchive
    ? stripArchiveExtension(romFileName)
    : stripExtension(romFileName);
  const title = stem.replace(LIBRETRO_ILLEGAL, "_");
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
