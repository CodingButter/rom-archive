import type { VercelRequest, VercelResponse } from "@vercel/node";

import { handleItem } from "../src/handlers.js";
import { realFetch } from "./_fetch.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const { status, body } = await handleItem(id, realFetch);
  res.status(status).json(body);
}
