// GET /api/health          -> { ok, keyConfigured, model }   (never returns the key)
// GET /api/health?ping=1   -> also sends one tiny request to Anthropic to verify key, model and network.
import { applyCors, requireMethod, rateLimit, sendJson, sendError } from "../server/http.js";
import { callClaude, getModel } from "../server/anthropic.js";

export default async function handler(req, res) {
  applyCors(req, res);
  try {
    requireMethod(req, "GET");
    const keyConfigured = !!process.env.ANTHROPIC_API_KEY;
    const out = { ok: true, keyConfigured, model: getModel(), time: new Date().toISOString() };
    if (new URL(req.url, "http://localhost").searchParams.get("ping") === "1") {
      rateLimit(req);
      const t0 = Date.now();
      await callClaude({ label: "health-ping", system: "Reply with JSON only.", user: 'Return exactly {"ok":true}', maxTokens: 30, deadline: Date.now() + 20000 });
      out.ping = { ok: true, ms: Date.now() - t0 };
    }
    sendJson(res, 200, out);
  } catch (e) { sendError(res, e); }
}
