import { handleItem } from "@/server/handlers";
import { realFetch } from "@/server/realFetch";

export async function GET(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id") ?? undefined;
  const { status, body } = await handleItem(id, realFetch);
  return Response.json(body, { status });
}
