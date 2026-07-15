import { handleMetadata } from "@/server/handlers";
import { InMemoryCache } from "@/server/metadataService";
import { realFetch } from "@/server/realFetch";

/**
 * A single cache instance shared across warm invocations of this route. It is
 * per-instance and cleared on cold start (see the plan's cache notes), which is
 * an acceptable floor; a shared runtime cache can replace it behind the same
 * MetadataCache interface without touching the handler.
 */
const cache = new InMemoryCache();

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const id = params.get("id") ?? undefined;
  const name = params.get("name") ?? undefined;

  const { status, body } = await handleMetadata(id, name, {
    cache,
    fetchImpl: realFetch,
    env: { TGDB_API_KEY: process.env.TGDB_API_KEY },
  });
  return Response.json(body, { status });
}
