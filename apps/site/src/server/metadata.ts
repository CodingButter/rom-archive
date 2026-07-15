import type { Console } from "@rom-archive/contract";

import type { FetchLike } from "./archiveClient";
import { CONSOLE_TO_TGDB_PLATFORM } from "./tgdbPlatforms";

/**
 * Normalized game metadata, the single shape the web panel renders regardless of
 * which source produced it. All fields are plain strings/URLs — this client
 * never proxies image or ROM bytes (results are references only).
 */
export interface GameMetadata {
  title: string;
  platform: Console;
  releaseDate?: string;
  genres?: string[];
  overview?: string;
  developer?: string;
  publisher?: string;
  boxartUrl?: string;
  source: "tgdb" | "libretro" | "unknown";
}

/** Raised when an upstream metadata source returns a non-OK response. */
export class MetadataError extends Error {
  constructor(
    message: string,
    public readonly upstreamStatus: number,
  ) {
    super(message);
    this.name = "MetadataError";
  }
}

const TGDB_BYGAME_BASE = "https://api.thegamesdb.net/v1/Games/ByGameName";

/**
 * Reference tables mapping TGDB numeric ids to display names. TGDB returns
 * `genres`/`developers`/`publishers` as id arrays; the caller supplies these
 * lookups (shipped as fixtures / fetched-and-cached upstream) so this client
 * stays pure. Absent maps ⇒ those fields are dropped rather than showing ids.
 */
export interface TgdbLookups {
  genres?: Record<string, string>;
  developers?: Record<string, string>;
  publishers?: Record<string, string>;
}

/**
 * Derive the TGDB search title from a ROM/item name. Aligns with cover.ts title
 * handling: strip a trailing file extension so covers and metadata search on the
 * same title. Collapses whitespace; does not strip region/revision tags (TGDB's
 * fuzzy name search tolerates them and stripping risks false matches).
 */
export function deriveSearchTitle(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot <= 0 ? name : name.slice(0, dot);
  return base.replace(/\s+/g, " ").trim();
}

/** The minimal shape of a TGDB /v1/Games/ByGameName response we consume. */
interface TgdbGame {
  id: number;
  game_title: string;
  release_date?: string | null;
  platform?: number;
  overview?: string | null;
  developers?: number[] | null;
  publishers?: number[] | null;
  genres?: number[] | null;
}

interface TgdbBoxart {
  base_url?: Record<string, string>;
  data?: Record<string, Array<{ type?: string; side?: string; filename?: string }>>;
}

interface TgdbByGameResponse {
  code?: number;
  remaining_monthly_allowance?: number;
  data?: { count?: number; games?: TgdbGame[] };
  include?: { boxart?: TgdbBoxart };
}

function resolveNames(
  ids: number[] | null | undefined,
  table: Record<string, string> | undefined,
): string[] {
  if (!ids || !table) return [];
  const out: string[] = [];
  for (const id of ids) {
    const name = table[String(id)];
    if (name) out.push(name.trim());
  }
  return out;
}

/**
 * Build the front-boxart URL for a game from the TGDB `include.boxart` block, or
 * undefined when none is present. Returns a string URL only (no bytes fetched).
 */
function boxartUrlFor(
  gameId: number,
  boxart: TgdbBoxart | undefined,
): string | undefined {
  if (!boxart?.data || !boxart.base_url) return undefined;
  const entries = boxart.data[String(gameId)];
  if (!entries || entries.length === 0) return undefined;
  const front =
    entries.find((e) => e.type === "boxart" && e.side === "front") ?? entries[0];
  if (!front?.filename) return undefined;
  const base = boxart.base_url.original ?? Object.values(boxart.base_url)[0];
  if (!base) return undefined;
  return `${base}${front.filename}`;
}

/**
 * Query TGDB by game name, scoped to a platform, and map the first result to
 * `GameMetadata`. Returns the mapped metadata plus TGDB's reported remaining
 * monthly allowance so the caller can shield the budget. Zero results ⇒
 * `{ meta: null }`. A non-OK HTTP response throws `MetadataError`.
 *
 * `key` is passed in (read from env by the caller) and never hardcoded here.
 */
export async function fetchTgdbMetadata(
  console: Console,
  title: string,
  key: string,
  fetchImpl: FetchLike,
  lookups: TgdbLookups = {},
): Promise<{ meta: GameMetadata | null; remainingAllowance: number | null }> {
  const platformId = CONSOLE_TO_TGDB_PLATFORM[console];
  if (platformId === null) {
    // No TGDB platform for this console — nothing to query.
    return { meta: null, remainingAllowance: null };
  }

  const params = new URLSearchParams({
    apikey: key,
    name: title,
    "filter[platform]": String(platformId),
    fields: "players,publishers,genres,overview,rating,platform",
    include: "boxart",
  });
  const url = `${TGDB_BYGAME_BASE}?${params.toString()}`;

  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new MetadataError(`TGDB ByGameName request failed (${res.status})`, res.status);
  }
  const body = (await res.json()) as TgdbByGameResponse;
  const remainingAllowance =
    typeof body.remaining_monthly_allowance === "number"
      ? body.remaining_monthly_allowance
      : null;

  const games = body.data?.games ?? [];
  const g = games[0];
  if (!g) {
    return { meta: null, remainingAllowance };
  }

  const genres = resolveNames(g.genres, lookups.genres);
  const developer = resolveNames(g.developers, lookups.developers)[0];
  const publisher = resolveNames(g.publishers, lookups.publishers)[0];
  const overview = g.overview?.trim() || undefined;
  const releaseDate = g.release_date?.trim() || undefined;
  const boxartUrl = boxartUrlFor(g.id, body.include?.boxart);

  const meta: GameMetadata = {
    title: g.game_title,
    platform: console,
    source: "tgdb",
    ...(releaseDate ? { releaseDate } : {}),
    ...(genres.length > 0 ? { genres } : {}),
    ...(overview ? { overview } : {}),
    ...(developer ? { developer } : {}),
    ...(publisher ? { publisher } : {}),
    ...(boxartUrl ? { boxartUrl } : {}),
  };
  return { meta, remainingAllowance };
}

/**
 * Keyless libretro fallback. libretro's public thumbnail/database surface gives
 * reliable identification but no editorial fields over a simple keyless call, so
 * this returns a title-only record (derived title + console) with
 * `source: "libretro"`. It is the always-available floor when TGDB is unkeyed,
 * budget-exhausted, or errored. Enriching this (plot/genre) would require a
 * richer keyless source and is out of v1 scope.
 */
export function fetchLibretroMetadata(console: Console, name: string): GameMetadata {
  return {
    title: deriveSearchTitle(name),
    platform: console,
    source: "libretro",
  };
}

/** The graceful floor: a never-erroring "unknown" record for a name. */
export function unknownMetadata(console: Console, name: string): GameMetadata {
  return {
    title: deriveSearchTitle(name),
    platform: console,
    source: "unknown",
  };
}
