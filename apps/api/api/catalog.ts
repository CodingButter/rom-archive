import type { VercelRequest, VercelResponse } from "@vercel/node";

import { handleCatalog } from "../src/handlers.js";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const { status, body } = handleCatalog();
  res.status(status).json(body);
}
