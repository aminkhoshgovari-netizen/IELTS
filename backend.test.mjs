// Backend integration test. It starts a LOCAL STAND-IN for the Anthropic API (test fixtures
// only) and drives the real handlers over HTTP. It verifies routing, validation, response
// shape, streaming, partial failures and error mapping. It does NOT prove that your real
// Anthropic key works – use GET /api/health?ping=1 on the deployed site for that.
import http from "node:http";
import assert from "node:assert/strict";

let mode = "ok";
const calls = [];
const ESSAY = "Many people thinks that online learning is more convenient. It save time, but students often feel isolated from their classmates. In conclusion, online learning has both advantages and disadvantages for modern students.";
const QUESTION = "Some people believe online learning is better than classroom learning. To what extent do you agree or disagree?";
const J = (o) => JSON.stringify(o);
const fixtures = {
  question: { topic: "Online learning", questionType: "Opinion", requiredPosition: "State and justify a position", mustAddress: ["Give a clear opinion"], strongAnswerCovers: ["Flexibility"], pitfalls: ["Only describing"] },
  scores: { tr: { score: 6, rationale: "Position clear but thin." }, cc: { score: 6.5, rationale: "Logical." }, lr: { score: 6, rationale: "Adequate." }, gra: { score: 5.5, rationale: "Agreement errors." }, strengths: ["Clear position"], weaknesses: ["Agreement errors"], lengthNote: "" },
  detail: { detail: { tr: { positives: ["On topic"], issues: [{ problem: "Underdeveloped", fix: "Add example" }] }, cc: { positives: [], issues: [] }, lr: { positives: [], issues: [] }, gra: { positives: [], issues: [{ problem: "people thinks", fix: "people think" }] } }, plan: [{ area: "Grammar", action: "Fix subject-verb agreement" }] },
  structure: { paragraphs: [{ label: "Introduction", checks: [{ status: "ok", text: "Topic introduced" }] }], taskChecks: [{ status: "warn", text: "Example missing" }], naturalness: [], repetition: [], relevance: [] },
  errors: { errors: [{ original: "people thinks", correction: "people think", category: "grammar", rule: "Subject-verb agreement", severity: "major", explanation: "Plural subject.", impact: "Lowers GRA." }, { original: "NOT IN ESSAY", correction: "x", category: "grammar", rule: "x", severity: "minor", explanation: "x", impact: "x" }] },
  vocab: { topic: "Online learning", words: [{ word: "flexible", pos: "adjective", ipa: "/x/", meaning: "adaptable", example: "Flexible hours.", collocations: ["flexible schedule"], synonyms: [], mistake: "", usefulness: "" }], collocations: ["distance learning"] },
  model: { answer: "A".repeat(200), why: ["Clear development"] },
  improve: { improved: "B".repeat(200), changes: [{ from: "thinks", to: "think", reason: "agreement" }] },
};
function which(user) {
  if (user.includes("Analyse the QUESTION only")) return "question";
  if (user.includes("Score the essay")) return "scores";
  if (user.includes("You have already scored it")) return "detail";
  if (user.includes("Analyse the essay as a whole")) return "structure";
  if (user.includes("List the most important specific problems")) return "errors";
  if (user.includes("Build topic vocabulary")) return "vocab";
  if (user.includes("Write a model answer")) return "model";
  if (user.includes("Rewrite the candidate")) return "improve";
  return "ping";
}
const upstream = http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const body = JSON.parse(raw); const user = body.messages[0].content; const k = which(user);
    calls.push({ k, key: req.headers["x-api-key"], version: req.headers["anthropic-version"], max: body.max_tokens, model: body.model });
    const send = (status, o) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(J(o)); };
    if (mode === "401") return send(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    if (mode === "credit") return send(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } });
    if (mode === "404") return send(404, { type: "error", error: { type: "not_found_error", message: "model: nope" } });
    if (mode === "badjson") return send(200, { content: [{ type: "text", text: "Sorry, I cannot do that." }], stop_reason: "end_turn" });
    if (mode === "detail500" && k === "detail") return send(500, { type: "error", error: { type: "api_error", message: "boom" } });
    const payload = k === "ping" ? { ok: true } : fixtures[k];
    send(200, { content: [{ type: "text", text: "```json\n" + J(payload) + "\n```" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
  });
});
await new Promise((r) => upstream.listen(0, r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${upstream.address().port}`;
process.env.ANTHROPIC_API_KEY = "test-key-not-real";
process.env.RATE_LIMIT_MAX = "1000";
const { createServer } = await import("../server/dev.mjs");
const app = createServer(); await new Promise((r) => app.listen(0, r));
const base = `http://127.0.0.1:${app.address().port}`;
const post = (path, body) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: J(body) });
const input = { task: 2, module: "academic", qtype: "Opinion / Agree or Disagree", question: QUESTION, essay: ESSAY, target: 7 };
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log("  ✓", name); };

await t("health: reports key configured, never the key", async () => {
  const r = await (await fetch(base + "/api/health")).json();
  assert.equal(r.keyConfigured, true); assert.ok(!J(r).includes("test-key"));
});
await t("health ping reaches upstream with key + version headers", async () => {
  calls.length = 0; const r = await (await fetch(base + "/api/health?ping=1")).json();
  assert.equal(r.ping.ok, true); assert.equal(calls[0].key, "test-key-not-real"); assert.equal(calls[0].version, "2023-06-01");
});
await t("analyze: full structured response (non-stream)", async () => {
  calls.length = 0; mode = "ok";
  const res = await post("/api/analyze", input); assert.equal(res.status, 200);
  const r = await res.json();
  for (const k of ["taskType", "questionType", "wordCount", "minimumWordCount", "scores", "taskAnalysis", "coherenceAnalysis", "vocabularyAnalysis", "grammarAnalysis", "errors", "highlightedSegments", "strengths", "weaknesses", "improvementPlan", "topicVocabulary", "collocations", "modelAnswers", "improvedEssay"]) assert.ok(k in r, "missing " + k);
  assert.deepEqual(Object.keys(r.scores).sort(), ["coherenceCohesion", "grammaticalRangeAccuracy", "lexicalResource", "overall", "taskResponse"]);
  assert.equal(r.scores.overall, 6); // mean(6,6.5,6,5.5)=6.0
  assert.equal(r.taskType, "Task 2"); assert.equal(r.minimumWordCount, 250); assert.equal(r.meetsMinimum, false);
  assert.equal(r.wordCount, ESSAY.trim().split(/\s+/).length);
  assert.equal(r.highlightedSegments.length, 1); assert.equal(r.highlightedSegments[0].text, "people thinks");
  assert.equal(r.meta.partial.length, 0);
  assert.ok(calls.every((c) => c.max >= 500) && calls.some((c) => c.max > 1000), "server token budgets exceed the old 1000 cap");
  assert.equal(calls.length, 6);
});
await t("analyze: streaming emits real step events then result", async () => {
  const res = await post("/api/analyze?stream=1", input);
  assert.match(res.headers.get("content-type"), /ndjson/);
  const lines = (await res.text()).trim().split("\n").map(JSON.parse);
  const steps = lines.filter((l) => l.type === "step").map((l) => l.step).sort();
  assert.deepEqual(steps, ["language", "response", "structure", "task", "vocab"]);
  assert.equal(lines.at(-1).type, "result"); assert.equal(lines.at(-1).data.scores.overall, 6);
});
await t("analyze: optional include returns modelAnswers + improvedEssay", async () => {
  const r = await (await post("/api/analyze", { ...input, include: { modelBands: [7, 9], improvedEssay: true } })).json();
  assert.ok(r.modelAnswers["7"].answer && r.modelAnswers["9"].answer); assert.ok(r.improvedEssay.improved);
});
await t("analyze: non-core failure is reported as partial, scores kept", async () => {
  mode = "detail500"; const r = await (await post("/api/analyze", input)).json(); mode = "ok";
  assert.equal(r.scores.overall, 6); assert.equal(r.meta.partial.length, 1);
  assert.equal(r.meta.partial[0].code, "anthropic_error"); assert.equal(r.meta.sections.detail, false);
});
await t("errors: upstream 401 -> anthropic_auth with hint", async () => {
  mode = "401"; const res = await post("/api/analyze", input); const r = await res.json(); mode = "ok";
  assert.equal(res.status, 502); assert.equal(r.error.code, "anthropic_auth"); assert.equal(r.error.upstream.status, 401); assert.match(r.error.hint, /ANTHROPIC_API_KEY/);
});
await t("errors: billing, model-not-found, invalid JSON", async () => {
  mode = "credit"; let r = await (await post("/api/analyze", input)).json(); assert.equal(r.error.code, "anthropic_billing");
  mode = "404"; r = await (await post("/api/analyze", input)).json(); assert.equal(r.error.code, "anthropic_model");
  mode = "badjson"; r = await (await post("/api/analyze", input)).json(); assert.equal(r.error.code, "invalid_model_json"); assert.ok(r.error.snippet.includes("Sorry")); mode = "ok";
});
await t("errors: streaming surfaces the same error in-band", async () => {
  mode = "401"; const lines = (await (await post("/api/analyze?stream=1", input)).text()).trim().split("\n").map(JSON.parse); mode = "ok";
  assert.equal(lines.at(-1).type, "error"); assert.equal(lines.at(-1).error.code, "anthropic_auth");
});
await t("validation: bad input -> 400, wrong method -> 405, unknown route -> 404", async () => {
  let res = await post("/api/analyze", { ...input, essay: "short" }); assert.equal(res.status, 400); assert.equal((await res.json()).error.code, "bad_request");
  res = await post("/api/analyze", { ...input, task: 3 }); assert.equal(res.status, 400);
  res = await fetch(base + "/api/analyze"); assert.equal(res.status, 405);
  res = await fetch(base + "/api/nope"); assert.equal(res.status, 404);
});
await t("generate: model / improve validated; unknown action rejected", async () => {
  let r = await (await post("/api/generate", { action: "model", band: 8, task: 2, qtype: "Opinion", question: QUESTION })).json(); assert.ok(r.result.answer);
  r = await (await post("/api/generate", { action: "improve", ...input })).json(); assert.ok(r.result.improved);
  const res = await post("/api/generate", { action: "model", band: 6, question: QUESTION }); assert.equal(res.status, 400);
  assert.equal((await post("/api/generate", { action: "zzz" })).status, 400);
});
await t("missing key -> 500 missing_api_key", async () => {
  const k = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  const res = await post("/api/analyze", input); const r = await res.json(); process.env.ANTHROPIC_API_KEY = k;
  assert.equal(res.status, 500); assert.equal(r.error.code, "missing_api_key");
});
console.log(`\n${n} backend tests passed (against a local stand-in, not the real Anthropic API)`);
app.close(); upstream.close();
