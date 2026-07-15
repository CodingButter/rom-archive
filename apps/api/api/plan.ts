import type { VercelRequest, VercelResponse } from "@vercel/node";

import { handlePlan } from "../src/handlers.js";
import { realFetch } from "./_fetch.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const { status, body } = await handlePlan(req.body, realFetch);
  res.status(status).json(body);
}
