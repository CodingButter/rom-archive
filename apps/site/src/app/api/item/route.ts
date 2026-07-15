import { handleItem } from "@/server/handlers";
import type { PaginateOptions } from "@/server/paginate";
import { realFetch } from "@/server/realFetch";

/** Parse a positive-integer query param, or undefined when absent/invalid. */
function intParam(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const id = params.get("id") ?? undefined;

  // Pagination is opt-in: only build options when at least one param is present,
  // so an id-only request preserves the full-list (unpaginated) response shape.
  const page = intParam(params.get("page"));
  const pageSize = intParam(params.get("pageSize"));
  const q = params.get("q") ?? undefined;
  const pagination: PaginateOptions | undefined =
    page !== undefined || pageSize !== undefined || q !== undefined
      ? { page, pageSize, q }
      : undefined;

  const { status, body } = await handleItem(id, realFetch, pagination);
  return Response.json(body, { status });
}
