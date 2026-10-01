// The ONLY module that talks to Anthropic. The API key is read from process.env on the
// server and is never sent to, logged for, or returned to the browser.
import { ApiError, hintFor } from "./http.js";

export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const getModel = () => process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mapUpstream(status, data, label) {
  const type = data?.error?.type || "", message = data?.error?.message || `HTTP ${status}`;
  let code = "anthropic_error", http = 502;
  if (status === 401) code = "anthropic_auth";
  else if (status === 403) code = "anthropic_permission";
  else if (status === 404 || type === "not_found_error") code = "anthropic_model";
  else if (status === 429) { code = "anthropic_rate_limited"; http = 429; }
  else if (status === 529 || status === 503) { code = "anthropic_overloaded"; http = 503; }
  else if (status === 400 || status === 413) code = /credit balance|billing|plans & billing/i.test(message) ? "anthropic_billing" : "anthropic_bad_request";
  return new ApiError(code, http, message, { stage: label, hint: hintFor(code), upstream: { status, type, message } });
}

// One Messages API call. Retries once on 429/5xx/529 and on network errors.
export async function callClaude({ label, system, user, maxTokens = 1500, deadline = Date.now() + 55000 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ApiError("missing_api_key", 500, "ANTHROPIC_API_KEY is not configured on the server.", { stage: label });
  const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  for (let attempt = 0; ; attempt++) {
    const timeoutMs = Math.min(45000, deadline - Date.now());
    if (timeoutMs < 3000) throw new ApiError("upstream_timeout", 504, "Not enough time left to complete the AI request.", { stage: label });
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res, raw;
    try {
      res = await fetch(base + "/v1/messages", {
        method: "POST", signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: getModel(), max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
      });
      raw = await res.text();
    } catch (e) {
      clearTimeout(timer);
      const err = e?.name === "AbortError" ? new ApiError("upstream_timeout", 504, `Anthropic did not respond within ${Math.round(timeoutMs / 1000)}s.`, { stage: label }) : new ApiError("upstream_network", 502, `Could not reach Anthropic: ${e?.message}`, { stage: label });
      if (attempt === 0 && err.code === "upstream_network") { await sleep(400); continue; }
      throw err;
    }
    clearTimeout(timer);
    let data = null; try { data = JSON.parse(raw); } catch (e) { /* non-JSON body */ }
    if (!res.ok) {
      const err = mapUpstream(res.status, data, label);
      if (!data) err.snippet = raw.slice(0, 300);
      if (attempt === 0 && (res.status === 429 || res.status >= 500)) { await sleep(Math.min(3000, Number(res.headers.get("retry-after") || 1) * 1000)); continue; }
      throw err;
    }
    const text = (data?.content || []).map((b) => (b.type === "text" ? b.text : "")).join("");
    return { text, stopReason: data?.stop_reason || "", usage: data?.usage || null };
  }
}

function repairJSON(s) {
  const stack = []; let inStr = false, esc = false, safe = -1, safeStack = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") { stack.pop(); safe = i + 1; safeStack = stack.slice(); }
  }
  if (safe < 0) throw new Error("unrepairable");
  return s.slice(0, safe) + safeStack.reverse().map((c) => (c === "{" ? "}" : "]")).join("");
}
export function parseJSON(text) {
  let t = text.replace(/```json|```/g, "").trim();
  const a = t.indexOf("{");
  if (a < 0) throw new Error("No JSON object found in reply");
  t = t.slice(a);
  try { return JSON.parse(t); } catch (e) { return JSON.parse(repairJSON(t)); }
}

// Call + parse JSON + validate. One retry if the reply is not usable JSON / fails validation.
export async function askJson(p, validate, deadline) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, stopReason } = await callClaude({ ...p, deadline });
    if (!text) { last = new ApiError("invalid_model_json", 502, "The model returned no text.", { stage: p.label, stopReason }); continue; }
    let obj;
    try { obj = parseJSON(text); } catch (e) { last = new ApiError("invalid_model_json", 502, "Model reply was not valid JSON: " + e.message, { stage: p.label, snippet: text.slice(0, 400), stopReason }); continue; }
    try { return validate ? validate(obj) : obj; } catch (e) { last = new ApiError("invalid_model_output", 502, "Model JSON failed validation: " + e.message, { stage: p.label, snippet: text.slice(0, 400), stopReason }); }
  }
  throw last;
}
