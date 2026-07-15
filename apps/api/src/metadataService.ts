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
 *  - CONFIRMED-NEGATIVE: TGDB answered and genuinely has no match for this
 *    game. That answer is as stable as a positive one, so it earns the SAME long
 *    shield — a no-match ROM (homebrew, region-tagged titles TGDB doesn't carry)
 *    must not re-probe TGDB every day. This is the population most likely to miss,
 *    so a short TTL here would be the biggest budget leak.
 *  - RETRY: we did NOT get a definitive answer (no key, allowance floored, or
 *    TGDB errored). Cache the libretro fallback only briefly so we recover — pick
 *    TGDB back up once a key is set, the monthly budget resets, or the outage ends.
 */
export const POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days
export const CONFIRMED_NEGATIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days
export const RETRY_TTL_MS = 6 * 60 * 60 * 1000; // ~6 hours

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
 * Upstream failures (TGDB non-OK ⇒ MetadataError) degrade to libretro rather than
 * propagating; only an unexpected programming error would surface, which the
 * handler layer catches to guarantee the page never errors.
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
      // TGDB definitively has no match: this answer is stable, so cache the
      // libretro fallback under the long confirmed-negative shield — we must not
      // re-probe TGDB for a genuine no-match every day.
      const fallback = fetchLibretroMetadata(console, name);
      await deps.cache.set(key, fallback, CONFIRMED_NEGATIVE_TTL_MS);
      return fallback;
    } catch (err) {
      if (!(err instanceof MetadataError)) throw err;
      // TGDB errored (rate limit, outage): fall through to the RETRY path below
      // so we pick TGDB back up shortly once it recovers.
    }
  }

  // No key, allowance floored, or TGDB errored — none of these is a definitive
  // "no match", so shield only briefly (RETRY_TTL) and recover next window.
  const libretro = fetchLibretroMetadata(console, name);
  await deps.cache.set(key, libretro, RETRY_TTL_MS);
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
