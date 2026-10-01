// POST /api/generate   Body: { action: "model"|"improve"|"compare"|"check"|"define"|"daily", ...fields }
// Returns { result: {...} } or { error: { code, message, hint, ... } }.
import { ApiError, applyCors, readJson, rateLimit, requireMethod, sendJson, sendError } from "../server/http.js";
import { runGenerate } from "../server/generate.js";

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  try {
    requireMethod(req, "POST");
    if (!process.env.ANTHROPIC_API_KEY) throw new ApiError("missing_api_key", 500, "ANTHROPIC_API_KEY is not configured on the server.");
    rateLimit(req);
    const body = await readJson(req);
    sendJson(res, 200, { result: await runGenerate(String(body.action || ""), body) });
  } catch (e) { sendError(res, e); }
}
