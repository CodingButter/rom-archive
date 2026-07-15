import { handleCatalog } from "@/server/handlers";

export function GET(): Response {
  const { status, body } = handleCatalog();
  return Response.json(body, { status });
}
