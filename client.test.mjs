// Frontend <-> backend contract test. Runs the real aiService against the real API handlers,
// with a local stand-in for Anthropic (test fixtures only). Not a proof that your real key works.
import http from "node:http";
import assert from "node:assert/strict";

let mode = "ok";
const ESSAY = "Many people thinks that online learning is more convenient. It save time, but students often feel isolated from their classmates. In conclusion, online learning has both advantages and disadvantages.";
const QUESTION = "Some people believe online learning is better than classroom learning. To what extent do you agree or disagree?";
const F = {
  question: { topic: "Online learning", questionType: "Opinion", requiredPosition: "State a position", mustAddress: ["Give an opinion"], strongAnswerCovers: ["Flexibility"], pitfalls: [] },
  scores: { tr: { score: 6, rationale: "R1" }, cc: { score: 7, rationale: "R2" }, lr: { score: 6.5, rationale: "R3" }, gra: { score: 6, rationale: "R4" }, strengths: ["S1"], weaknesses: ["W1"], lengthNote: "short" },
  detail: { detail: { tr: { positives: ["p"], issues: [{ problem: "a", fix: "b" }] }, cc: { positives: [], issues: [] }, lr: { positives: [], issues: [] }, gra: { positives: [], issues: [] } }, plan: [{ area: "Grammar", action: "Fix agreement" }] },
  structure: { paragraphs: [{ label: "Introduction", checks: [{ status: "ok", text: "ok" }] }], taskChecks: [{ status: "warn", text: "t" }], naturalness: [{ phrase: "In this day", note: "n", alternative: "a" }], repetition: [], relevance: [{ quote: "q", note: "n" }] },
  errors: { errors: [{ original: "people thinks", correction: "people think", category: "grammar", rule: "Subject-verb agreement", severity: "major", explanation: "e", impact: "i" }] },
  vocab: { topic: "Online learning", words: [{ word: "flexible", pos: "adj", ipa: "/f/", meaning: "m", example: "e", collocations: ["c"], synonyms: [], mistake: "", usefulness: "" }], collocations: ["distance learning"] },
  model: { answer: "M".repeat(150), why: ["w"] },
};
const which = (u) => u.includes("Analyse the QUESTION only") ? "question" : u.includes("Score the essay") ? "scores" : u.includes("You have already scored it") ? "detail" : u.includes("Analyse the essay as a whole") ? "structure" : u.includes("List the most important") ? "errors" : u.includes("Build topic vocabulary") ? "vocab" : u.includes("Write a model answer") ? "model" : "ping";
const upstream = http.createServer((req, res) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
  const k = which(JSON.parse(raw).messages[0].content); res.setHeader("content-type", "application/json");
  if (mode === "401") { res.statusCode = 401; return res.end(JSON.stringify({ error: { type: "authentication_error", message: "invalid x-api-key" } })); }
  res.end(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(k === "ping" ? { ok: true } : F[k]) }], stop_reason: "end_turn" }));
}); });
await new Promise((r) => upstream.listen(0, r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${upstream.address().port}`; process.env.ANTHROPIC_API_KEY = "k"; process.env.RATE_LIMIT_MAX = "1000";
const { createServer } = await import("../server/dev.mjs");
const app = createServer(); await new Promise((r) => app.listen(0, r));
const base = `http://127.0.0.1:${app.address().port}`;
const realFetch = globalThis.fetch; globalThis.fetch = (u, i) => realFetch(String(u).startsWith("/") ? base + u : u, i);
globalThis.window = { location: { origin: base, protocol: "http:" } }; Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
const { analyzeIELTSWriting, api, describeError, diagnose } = await import("../src/services/aiService.js");
const input = { task: 2, module: "academic", qtype: "Opinion / Agree or Disagree", question: QUESTION, essay: ESSAY, target: 7.5 };
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log("  ✓", name); };

await t("analyzeIELTSWriting returns the UI shape with real progress steps", async () => {
  const steps = []; const { analysis: a, response } = await analyzeIELTSWriting(input, (s) => steps.push(s));
  assert.deepEqual([...steps].sort(), ["language", "response", "structure", "task", "vocab"]);
  assert.deepEqual([a.scores.tr, a.scores.cc, a.scores.lr, a.scores.gra, a.scores.overall], [6, 7, 6.5, 6, 6.5]);
  assert.equal(a.criteria.tr.rationale, "R1"); assert.deepEqual(a.criteria.strengths, ["S1"]);
  assert.equal(a.detail.tr.issues[0].fix, "b"); assert.equal(a.plan[0].area, "Grammar");
  assert.equal(a.structure.paragraphs[0].label, "Introduction"); assert.equal(a.structure.taskChecks[0].text, "t"); assert.equal(a.structure.relevance.length, 1);
  assert.equal(a.errors[0].original, "people thinks"); assert.equal(a.vocab.collocations[0], "distance learning"); assert.equal(a.question.topic, "Online learning");
  assert.equal(a.meta.min, 250); assert.equal(a.missing.length, 0); assert.equal(response.taskType, "Task 2");
});
await t("api.model / api.define-style generation calls work", async () => {
  const m = await api.model({ question: QUESTION, task: 2, qtype: "Opinion" }, 8); assert.ok(m.answer.length > 100);
});
await t("backend error reaches the UI with code, hint and upstream detail", async () => {
  mode = "401";
  try { await analyzeIELTSWriting(input); assert.fail("should throw"); }
  catch (e) { const d = describeError(e); assert.equal(d.kind, "anthropic_auth"); assert.match(d.hint, /ANTHROPIC_API_KEY/); assert.match(d.body, /invalid x-api-key/); }
  mode = "ok";
});
await t("diagnose reports key configured + ping", async () => {
  const d = await diagnose(); assert.equal(d.ok, true); assert.equal(d.health.keyConfigured, true); assert.equal(d.health.ping.ok, true);
});
await t("unreachable backend -> network error kind", async () => {
  globalThis.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
  try { await analyzeIELTSWriting(input); assert.fail(); } catch (e) { assert.equal(describeError(e).kind, "network"); }
  globalThis.fetch = (u, i) => realFetch(String(u).startsWith("/") ? base + u : u, i);
});
await t("missing /api route -> endpoint_not_found with local-dev hint", async () => {
  globalThis.fetch = () => Promise.resolve(new Response("<html>Not found</html>", { status: 404 }));
  try { await analyzeIELTSWriting(input); assert.fail(); } catch (e) { const d = describeError(e); assert.equal(d.kind, "endpoint_not_found"); assert.match(d.hint, /dev:api|vercel dev/); }
});
console.log(`\n${n} client contract tests passed`); app.close(); upstream.close();
