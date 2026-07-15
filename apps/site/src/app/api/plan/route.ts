import { handlePlan } from "@/server/handlers";
import { realFetch } from "@/server/realFetch";

export async function POST(req: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    // A malformed/empty JSON body is a bad request; the pure handler treats
    // any schema-invalid body as 400, so mirror that for unparseable input.
    parsed = undefined;
  }
  const { status, body } = await handlePlan(parsed, realFetch);
  return Response.json(body, { status });
}
