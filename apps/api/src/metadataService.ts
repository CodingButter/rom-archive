import type { Console } from "@rom-archive/contract";

import type { FetchLike } from "./archiveClient.js";
import {
  MetadataError,
  deriveSearchTitle,
  fetchLibretroMetadata,
  fetchTgdbMetadata,
  type GameMetadata,
  type TgdbLookups,
} from "./metadata.js";

/**
 * A minimal async key/value cache with per-entry TTL. Kept deliberately small so
 * a Vercel runtime cache (`getCache` from `@vercel/functions`) or Upstash can be
 * dropped in behind it later without changing the service. `get` returns null on
 * miss OR expiry.
 */
export interface MetadataCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

/** Process-local cache for tests and single-instance/local runs. */
export class InMemoryCache implements MetadataCache {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.store.set(key, { value, expiresAt: this.now() + ttlMs });
  }
}

/**
 * TTLs, chosen to keep the ~1000 req/month TGDB budget intact:
 *  - POSITIVE: a found record is stable editorial data — cache it a long time so
 *    a game is fetched from TGDB at most once per month-ish window.
 *  - NEGATIVE: a "no match / unknown" result is cached briefly so a transient
 *    miss doesn't permanently hide a game, but long enough that a page refresh
 *    does not re-hit TGDB (the budget shield).
 *  - LIBRETRO: fallback records are cheap/keyless, medium TTL.
 */
export const POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days
export const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const LIBRETRO_TTL_MS = 7 * 24 * 60 * 60 * 1000; // ~7 days

/**
 * When TGDB's reported remaining monthly allowance drops to or below this floor,
 * stop spending it on new lookups and serve libretro instead — leaving headroom
 * for anything already in flight and avoiding a hard 0.
 */
export const ALLOWANCE_FLOOR = 20;

/** Cache key under which the last-known TGDB allowance is stored. */
const ALLOWANCE_KEY = "meta:v1:tgdb-allowance";
/** How long a remembered allowance is trusted before we probe TGDB again. */
const ALLOWANCE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function cacheKey(console: Console, title: string): string {
  return `meta:v1:${console}:${title.toLowerCase()}`;
}

export interface ResolveDeps {
  cache: MetadataCache;
  fetchImpl: FetchLike;
  env: { TGDB_API_KEY?: string | undefined };
  /** TGDB id→name lookups for genres/devs/pubs; optional. */
  lookups?: TgdbLookups;
}

/**
 * Resolve metadata for a single game, TGDB-first with a libretro fallback and an
 * "unknown" floor, cached so each distinct game triggers AT MOST ONE TGDB request
 * per positive/negative TTL window. Flow:
 *   1. Cache hit (positive OR negative) → return immediately, no fetch.
 *   2. Miss + key present + last-known allowance above floor → TGDB.
 *        found  → cache positive (long TTL), record allowance.
 *        miss   → cache negative (short TTL), then try libretro.
 *   3. No key / allowance floored / TGDB threw → libretro (cache medium TTL).
 *
 * libretro always yields at least a title-only record, so it is the effective
 * floor here; the handler layer maps a wholly-absent case to `unknownMetadata`.
 * Never throws to the caller: a broken metadata source degrades, it doesn't error.
 */
export async function resolveMetadata(
  console: Console,
  name: string,
  deps: ResolveDeps,
): Promise<GameMetadata> {
  const title = deriveSearchTitle(name);
  const key = cacheKey(console, title);

  const cached = await deps.cache.get<GameMetadata>(key);
  if (cached) return cached;

  const apiKey = deps.env.TGDB_API_KEY;
  const canUseTgdb = Boolean(apiKey) && (await allowanceAboveFloor(deps.cache));

  if (canUseTgdb && apiKey) {
    try {
      const { meta, remainingAllowance } = await fetchTgdbMetadata(
        console,
        title,
        apiKey,
        deps.fetchImpl,
        deps.lookups ?? {},
      );
      if (remainingAllowance !== null) {
        await rememberAllowance(deps.cache, remainingAllowance);
      }
      if (meta) {
        await deps.cache.set(key, meta, POSITIVE_TTL_MS);
        return meta;
      }
      // Zero results from TGDB: cache the negative so we don't re-hit TGDB for
      // this game within the negative window, then fall through to libretro.
      const fallback = fetchLibretroMetadata(console, name);
      await deps.cache.set(key, fallback, NEGATIVE_TTL_MS);
      return fallback;
    } catch (err) {
      if (!(err instanceof MetadataError)) throw err;
      // TGDB errored (rate limit, outage): fall through to libretro below.
    }
  }

  // No key, allowance floored, or TGDB errored → libretro floor.
  const libretro = fetchLibretroMetadata(console, name);
  await deps.cache.set(key, libretro, LIBRETRO_TTL_MS);
  return libretro;
}

async function allowanceAboveFloor(cache: MetadataCache): Promise<boolean> {
  const remembered = await cache.get<number>(ALLOWANCE_KEY);
  // Unknown allowance ⇒ optimistically allow one probe; TGDB's response then
  // records the real figure for subsequent calls.
  if (remembered === null) return true;
  return remembered > ALLOWANCE_FLOOR;
}

async function rememberAllowance(cache: MetadataCache, remaining: number): Promise<void> {
  await cache.set(ALLOWANCE_KEY, remaining, ALLOWANCE_TTL_MS);
}
