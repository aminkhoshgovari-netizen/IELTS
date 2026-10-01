// aiService – the ONLY place the frontend talks to an AI backend.
// It calls YOUR server (/api/*). It never talks to Anthropic and never holds an API key.
// If the frontend is hosted on a different origin than the API, set VITE_API_BASE_URL
// (a URL only, e.g. https://your-api.vercel.app).
const API_BASE = ((typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) || "").replace(/\/$/, "");
export const apiInfo = () => ({ base: API_BASE || "(same origin)", analyze: (API_BASE || "") + "/api/analyze" });

/* ------------------------------ error handling ----------------------------- */
export class AIError extends Error {
  constructor(kind, message, extra = {}) { super(message); this.name = "AIError"; this.kind = kind; Object.assign(this, extra); }
}
const CLIENT_HINTS = {
  network: "The browser could not reach the backend at all (offline, blocked, wrong VITE_API_BASE_URL, or CORS if the API is on another origin).",
  endpoint_not_found: "The /api route was not found. Locally, run the API too (npm run dev:api in a second terminal) or use `vercel dev`. On Vercel, make sure the api/ folder is in the repository root.",
  gateway_timeout: "The server function was cut off before finishing. Check that vercel.json sets maxDuration for api/*.js and that your Vercel plan allows it.",
  stream_interrupted: "The connection closed before the analysis finished. This usually means the server function timed out. Check the Vercel function logs.",
  bad_response: "The backend answered with something that is not the expected JSON.",
};
export function describeError(e) {
  const kind = e?.kind || "unknown";
  return { kind, stage: e?.stage || e?.label || "", status: e?.status ?? null, message: e?.message || String(e), body: e?.body || "", stopReason: e?.stopReason || "", endpoint: e?.endpoint || "", mode: "", hint: e?.hint || CLIENT_HINTS[kind] || "Unexpected error. See the message and the browser console." };
}
const aiLog = [];
function logAI(entry) {
  aiLog.push({ t: new Date().toISOString().slice(11, 19), ...entry });
  if (aiLog.length > 30) aiLog.shift();
  (entry.ok ? console.info : console.error)("[IELTS-AI]", entry);
}
function fromErrorBody(b, label, status, url) {
  const detail = [b.upstream ? "Anthropic said: " + JSON.stringify(b.upstream) : "", b.snippet ? "Model reply: " + b.snippet : ""].filter(Boolean).join("\n");
  return new AIError(b.code || "server_error", b.message || "Server error", { label, status, endpoint: url, stage: b.stage || label, hint: b.hint, body: detail, stopReason: b.stopReason || "" });
}
async function request(label, path, init) {
  const url = API_BASE + path, t0 = Date.now();
  try {
    const res = await fetch(url, init);
    return { res, url, t0 };
  } catch (e) {
    const err = new AIError("network", `fetch() failed before any response: ${e.name}: ${e.message}`, { label, endpoint: url });
    logAI({ ok: false, label, kind: "network", msg: err.message, endpoint: url, ms: Date.now() - t0 });
    throw err;
  }
}
async function readError(res, label, url, t0) {
  const raw = await res.text().catch(() => "");
  let data = null; try { data = JSON.parse(raw); } catch (e) { /* not JSON */ }
  let err;
  if (data?.error) err = fromErrorBody(data.error, label, res.status, url);
  else if (res.status === 404) err = new AIError("endpoint_not_found", `HTTP 404 from ${url}`, { label, status: 404, endpoint: url, body: raw.slice(0, 300) });
  else if (res.status === 504 || res.status === 502) err = new AIError("gateway_timeout", `HTTP ${res.status} from ${url}`, { label, status: res.status, endpoint: url, body: raw.slice(0, 300) });
  else err = new AIError("bad_response", `HTTP ${res.status} with a non-JSON body`, { label, status: res.status, endpoint: url, body: raw.slice(0, 300) });
  logAI({ ok: false, label, kind: err.kind, status: res.status, ms: Date.now() - t0, msg: err.message });
  return err;
}

/* ------------------------------- analysis call ----------------------------- */
// input: { task, module, qtype, question, essay, target }
// onStep(stepKey) fires as the SERVER completes each section (real progress, not a timer).
export async function analyzeIELTSWriting(input, onStep = () => {}) {
  const label = "analyze";
  const { res, url, t0 } = await request(label, "/api/analyze?stream=1", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: input.task, module: input.module, qtype: input.qtype, question: input.question, essay: input.essay, target: input.target }),
  });
  if (!res.ok) throw await readError(res, label, url, t0);

  let result = null, errBody = null, buf = "";
  const handle = (line) => {
    if (!line.trim()) return;
    let m; try { m = JSON.parse(line); } catch (e) { throw new AIError("bad_response", "Unreadable progress line from server", { label, endpoint: url, body: line.slice(0, 300) }); }
    if (m.type === "step") onStep(m.step);
    else if (m.type === "result") result = m.data;
    else if (m.type === "error") errBody = m.error;
  };
  if (res.body?.getReader) {
    const reader = res.body.getReader(), dec = new TextDecoder();
    for (;;) {
      let chunk; try { chunk = await reader.read(); } catch (e) { throw new AIError("stream_interrupted", "Connection dropped while reading the analysis: " + e.message, { label, endpoint: url }); }
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      let i; while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    handle(buf + dec.decode());
  } else (await res.text()).split("\n").forEach(handle);

  if (errBody) { const e = fromErrorBody(errBody, label, res.status, url); logAI({ ok: false, label, kind: e.kind, msg: e.message }); throw e; }
  if (!result) throw new AIError("stream_interrupted", "The response ended without an analysis result.", { label, endpoint: url });
  assertResponse(result);
  logAI({ ok: true, label, ms: Date.now() - t0 });
  return { analysis: toUiAnalysis(result, input), response: result };
}

function assertResponse(r) {
  const ok = r && r.scores && ["taskResponse", "coherenceCohesion", "lexicalResource", "grammaticalRangeAccuracy", "overall"].every((k) => typeof r.scores[k] === "number") && r.scoreRationale && Array.isArray(r.errors) && r.meta && Array.isArray(r.meta.partial);
  if (!ok) throw new AIError("bad_response", "The analysis response is missing required fields.", { label: "analyze", body: JSON.stringify(r).slice(0, 300) });
}

// Maps the backend contract onto the shape the existing UI components render.
export function toUiAnalysis(r, input) {
  const map = [["tr", "taskResponse", "taskAnalysis"], ["cc", "coherenceCohesion", "coherenceAnalysis"], ["lr", "lexicalResource", "vocabularyAnalysis"], ["gra", "grammaticalRangeAccuracy", "grammarAnalysis"]];
  const scores = { overall: r.scores.overall }, criteria = { strengths: r.strengths || [], weaknesses: r.weaknesses || [], lengthNote: r.lengthNote || "" }, detail = {};
  map.forEach(([k, sk, ak]) => {
    scores[k] = r.scores[sk];
    criteria[k] = { score: r.scores[sk], rationale: r.scoreRationale[sk] || "" };
    detail[k] = { positives: r[ak]?.positives || [], issues: r[ak]?.issues || [] };
  });
  const sec = r.meta.sections || {};
  return {
    meta: { task: input.task, module: input.module, qtype: input.qtype, wordCount: r.wordCount, min: r.minimumWordCount, target: input.target },
    scores, criteria, detail, plan: r.improvementPlan || [],
    question: sec.question === false ? null : r.questionAnalysis,
    structure: sec.structure === false ? null : { paragraphs: r.coherenceAnalysis.paragraphs, taskChecks: r.taskAnalysis.checks, naturalness: r.coherenceAnalysis.naturalness, repetition: r.coherenceAnalysis.repetition, relevance: r.taskAnalysis.relevance },
    errors: r.errors || [],
    vocab: r.topicVocabulary ? { topic: r.topicVocabulary.topic, words: r.topicVocabulary.words, collocations: r.collocations || [] } : null,
    missing: r.meta.partial.map((p) => p.section),
    missingDetail: r.meta.partial.map((p) => ({ name: p.section, kind: p.code, status: null, message: p.message, body: [p.hint, p.snippet].filter(Boolean).join(" | "), hint: p.hint })),
    highlightedSegments: r.highlightedSegments || [], serverModel: r.meta.model,
  };
}

/* ------------------------ on-demand generation calls ----------------------- */
async function generate(label, body) {
  const { res, url, t0 } = await request(label, "/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw await readError(res, label, url, t0);
  const j = await res.json().catch(() => null);
  if (!j || !j.result) throw new AIError("bad_response", "Response had no result field.", { label, endpoint: url });
  logAI({ ok: true, label, ms: Date.now() - t0 });
  return j.result;
}
export const api = {
  model: (i, band) => generate("model", { action: "model", question: i.question, task: i.task, qtype: i.qtype, band }),
  improve: (i) => generate("improve", { action: "improve", task: i.task, module: i.module, qtype: i.qtype, question: i.question, essay: i.essay, target: i.target }),
  compare: (i, model, band) => generate("compare", { action: "compare", question: i.question, essay: i.essay, model, band }),
  check: (original, attempt, rule, explanation) => generate("check", { action: "check", original, attempt, rule, explanation }),
  define: (word) => generate("define", { action: "define", word }),
  daily: (task) => generate("daily", { action: "daily", task }),
};

/* -------------------------------- diagnostics ------------------------------ */
// One tiny request through the backend to Anthropic (no essay). Reports what is wrong, if anything.
export async function diagnose() {
  const t0 = Date.now(), loc = typeof window !== "undefined" ? window.location : {};
  const out = { env: { ...apiInfo(), origin: loc.origin, protocol: loc.protocol, online: navigator.onLine } };
  try {
    const { res, url } = await request("health", "/api/health?ping=1", { method: "GET" });
    if (!res.ok) throw await readError(res, "health", url, t0);
    out.health = await res.json(); out.ok = true;
  } catch (e) { out.ok = false; out.error = describeError(e); }
  out.ms = Date.now() - t0; out.log = aiLog.slice(-12);
  return out;
}
