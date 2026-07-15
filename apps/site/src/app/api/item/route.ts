import { handleItem } from "@/server/handlers";
import type { PaginateOptions } from "@/server/paginate";
import { realFetch } from "@/server/realFetch";

/**
 * Coerce a query param to a finite number, or undefined when absent/blank.
 * Range enforcement (positivity, clamping) happens downstream in the paginator;
 * this only decides "did the caller supply a usable value?".
 */
function intParam(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** A blank param counts as absent, so `?q=` stays additive (full-list shape). */
function strParam(raw: string | null): string | undefined {
  return raw === null || raw.trim() === "" ? undefined : raw;
}

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const id = params.get("id") ?? undefined;

  // Pagination is opt-in: only build options when at least one param is present,
  // so an id-only request preserves the full-list (unpaginated) response shape.
  const page = intParam(params.get("page"));
  const pageSize = intParam(params.get("pageSize"));
  const q = strParam(params.get("q"));
  const pagination: PaginateOptions | undefined =
    page !== undefined || pageSize !== undefined || q !== undefined
      ? { page, pageSize, q }
      : undefined;

  const { status, body } = await handleItem(id, realFetch, pagination);
  return Response.json(body, { status });
}
