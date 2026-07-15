import type { VercelRequest, VercelResponse } from "@vercel/node";

import { handleMetadata } from "../src/handlers.js";
import { InMemoryCache } from "../src/metadataService.js";
import { realFetch } from "./_fetch.js";

/**
 * A single cache instance shared across warm invocations of this function. It is
 * per-instance and cleared on cold start (see the plan's cache notes), which is
 * an acceptable floor; a shared runtime cache can replace it behind the same
 * MetadataCache interface without touching the handler.
 */
const cache = new InMemoryCache();

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const rawName = req.query.name;
  const name = Array.isArray(rawName) ? rawName[0] : rawName;

  const { status, body } = await handleMetadata(id, name, {
    cache,
    fetchImpl: realFetch,
    env: { TGDB_API_KEY: process.env.TGDB_API_KEY },
  });
  res.status(status).json(body);
}
