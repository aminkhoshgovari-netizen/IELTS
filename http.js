// Small HTTP helpers that work on Vercel, on the local dev server and in tests
// (plain Node req/res – no framework-specific helpers).
export class ApiError extends Error {
  constructor(code, status, message, extra = {}) { super(message); this.name = "ApiError"; this.code = code; this.status = status; Object.assign(this, extra); }
}
const HINTS = {
  bad_request: "Fix the request and try again.",
  method_not_allowed: "Use POST for this endpoint.",
  payload_too_large: "Shorten the question or essay.",
  rate_limited: "Too many requests from this address. Wait a few minutes and try again.",
  missing_api_key: "The server has no ANTHROPIC_API_KEY. In Vercel: Project > Settings > Environment Variables, add ANTHROPIC_API_KEY, then redeploy.",
  anthropic_auth: "Anthropic rejected the API key (401). Create a new key at console.anthropic.com > API Keys and update ANTHROPIC_API_KEY, then redeploy.",
  anthropic_permission: "Anthropic denied access (403). The key or workspace may not have access to this model or feature.",
  anthropic_billing: "Your Anthropic account has no usable credit. Add credits or a payment method in console.anthropic.com > Plans & Billing.",
  anthropic_model: "Anthropic could not find the model. Set ANTHROPIC_MODEL to a model your account can use (see the model list in the Anthropic docs).",
  anthropic_rate_limited: "Anthropic rate-limited this request (429). Wait a moment and retry; raise your usage tier if it keeps happening.",
  anthropic_overloaded: "Anthropic is temporarily overloaded (529/503). Retry in a minute.",
  anthropic_bad_request: "Anthropic rejected the request (400). See the upstream message.",
  anthropic_error: "Anthropic returned a server error. Retry; check status.anthropic.com if it persists.",
  upstream_timeout: "The AI did not answer in time. Retry, or shorten the essay.",
  upstream_network: "The server could not reach api.anthropic.com. Check the deployment region/network and ANTHROPIC_BASE_URL.",
  invalid_model_json: "The model replied, but not with valid JSON. Retry; if it repeats, send the raw snippet.",
  invalid_model_output: "The model returned JSON with missing or invalid fields. Retry.",
  internal_error: "Unexpected server error. Check the Vercel function logs.",
};
export const hintFor = (code) => HINTS[code] || "";
export function errorBody(e) {
  if (e instanceof ApiError) return { code: e.code, message: e.message, hint: e.hint || hintFor(e.code), stage: e.stage || "", upstream: e.upstream || null, snippet: e.snippet || "", stopReason: e.stopReason || "" };
  return { code: "internal_error", message: e?.message || String(e), hint: HINTS.internal_error, stage: "", upstream: null, snippet: "", stopReason: "" };
}
export function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
export function sendError(res, e) {
  const status = e instanceof ApiError ? e.status : 500;
  if (!(e instanceof ApiError) || status >= 500) console.error("[api]", e?.code || "", e?.message, e?.upstream ? JSON.stringify(e.upstream) : "");
  sendJson(res, status, { error: errorBody(e) });
}
// Same-origin requests need no CORS. Set ALLOWED_ORIGINS only if the frontend is hosted elsewhere.
export function applyCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin || "";
  if (origin && allowed.includes(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
export async function readJson(req, limit = 120_000) {
  let raw;
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
  } else {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > limit) throw new ApiError("payload_too_large", 413, "Request body too large."); chunks.push(c); }
    raw = Buffer.concat(chunks).toString("utf8");
  }
  if (raw.length > limit) throw new ApiError("payload_too_large", 413, "Request body too large.");
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { throw new ApiError("bad_request", 400, "Request body is not valid JSON."); }
}
// Best-effort per-IP limiter. Serverless instances do not share memory, so this only
// blunts accidental loops. For real abuse protection use Vercel Firewall / Upstash / auth.
const hits = new Map();
export function rateLimit(req) {
  const max = Number(process.env.RATE_LIMIT_MAX || 30), windowMs = 10 * 60 * 1000, now = Date.now();
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new ApiError("rate_limited", 429, `Rate limit reached (${max} requests per 10 minutes).`);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
}
export function requireMethod(req, method) {
  if (req.method !== method) throw new ApiError("method_not_allowed", 405, `Use ${method}.`);
}
