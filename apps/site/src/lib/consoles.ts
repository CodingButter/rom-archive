import { CONSOLES, type Console } from "@rom-archive/contract";

/**
 * Human-readable names for the frozen console set. Keyed by the contract's
 * `Console` ids so this stays exhaustive: if a console is added to the contract,
 * TypeScript flags the missing label here.
 */
const CONSOLE_LABELS: Record<Console, string> = {
  nds: "Nintendo DS",
  gba: "Game Boy Advance",
  gb: "Game Boy",
  gbc: "Game Boy Color",
  snes: "Super Nintendo",
  nes: "Nintendo Entertainment System",
  gg: "Game Gear",
  sms: "Sega Master System",
  md: "Sega Genesis / Mega Drive",
  pce: "TurboGrafx-16 / PC Engine",
};

export interface ConsoleInfo {
  id: Console;
  label: string;
}

/** The console list, in contract order, with display labels. */
export const CONSOLE_LIST: ConsoleInfo[] = CONSOLES.map((id) => ({
  id,
  label: CONSOLE_LABELS[id],
}));
