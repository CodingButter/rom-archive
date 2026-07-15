import genresFile from "./fixtures/tgdb.genres.json";

interface GenresFile {
  data: { genres: Record<string, { id: number; name: string }> };
}

let cached: Record<string, string> | null = null;

/**
 * Load TGDB's genre id→name reference table (id array → display names). Shipped
 * as a captured fixture and cached after first read — the table is small and
 * stable, so it does not spend the request budget. Used to resolve the numeric
 * `genres` ids TGDB returns on a game lookup.
 */
export function loadTgdbGenres(): Record<string, string> {
  if (cached) return cached;
  const raw = genresFile as GenresFile;
  const out: Record<string, string> = {};
  for (const [id, entry] of Object.entries(raw.data.genres)) {
    out[id] = entry.name;
  }
  cached = out;
  return out;
}
