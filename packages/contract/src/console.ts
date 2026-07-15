import { z } from "zod";

/**
 * Frozen v1 console set. Adding a console here is a deliberate contract change:
 * it must be accompanied by a matching CONSOLE_TO_ROMS_DIR entry (enforced by
 * the round-trip coverage test) and a matching C++ mirror entry in the 3DS core
 * (enforced by scripts/check_contract.mjs against the emitted console-dirs.json).
 */
export const CONSOLES = [
  "nds",
  "gba",
  "gb",
  "gbc",
  "snes",
  "nes",
  "gg",
  "sms",
  "md",
  "pce",
] as const;

export const ConsoleSchema = z.enum(CONSOLES);

export type Console = z.infer<typeof ConsoleSchema>;

/**
 * Maps each console to its TWiLight Menu++ ROM directory, relative to the SD
 * root (the app writes to `sd:/roms/<dir>/`). This is the single source of
 * truth for path routing; it is serialized to schema/console-dirs.json at build
 * time and mirrored into the C++ core.
 *
 * The directory names follow the TWiLight Menu++ convention (mostly identical
 * to the console id; `md` -> `gen` and `pce` -> `tg16` where the folder name
 * differs from our internal id).
 */
export const CONSOLE_TO_ROMS_DIR: Readonly<Record<Console, string>> = {
  nds: "nds",
  gba: "gba",
  gb: "gb",
  gbc: "gbc",
  snes: "snes",
  nes: "nes",
  gg: "gg",
  sms: "sms",
  md: "gen",
  pce: "tg16",
};

/** The ROM directory for a console, e.g. `roms/gba`. */
export function consoleToRomsDir(console: Console): string {
  return `roms/${CONSOLE_TO_ROMS_DIR[console]}`;
}
