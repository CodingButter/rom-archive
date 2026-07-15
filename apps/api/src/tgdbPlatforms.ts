import type { Console } from "@rom-archive/contract";

/**
 * Maps our console ids to TheGamesDB (TGDB) platform ids, used as the
 * `filter[platform]` argument to `/v1/Games/ByGameName` so a name search is
 * scoped to the right system. A `null` value means TGDB has no suitable
 * platform for that console ⇒ TGDB is skipped and the libretro fallback applies.
 *
 * Every id here is verified against a captured `/v1/Platforms` response
 * (`fixtures/tgdb.platforms.json`); see `tgdbPlatforms.test.ts`. Never guess an
 * id — a wrong id silently returns wrong-console matches.
 *
 * Notes on the ambiguous mappings:
 *  - `md` (our Genesis/Mega Drive console, ROM dir `gen`): TGDB splits these
 *    into Genesis (18) and Mega Drive (36). We use Genesis (18), matching our
 *    US-facing `gen` directory convention and TGDB's more populated entry.
 *  - `pce` (TurboGrafx-16, ROM dir `tg16`): TurboGrafx 16 (34), not the CD
 *    variant (4955).
 */
export const CONSOLE_TO_TGDB_PLATFORM: Readonly<Record<Console, number | null>> =
  {
    nds: 8,
    gba: 5,
    gb: 4,
    gbc: 41,
    snes: 6,
    nes: 7,
    gg: 20,
    sms: 35,
    md: 18,
    pce: 34,
  };
