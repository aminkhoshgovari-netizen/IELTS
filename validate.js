// Validation and normalisation of every model response and every client input.
// Nothing reaches the frontend without passing through these.
const CATS = Object.fromEntries(["grammar", "vocabulary", "spelling", "punctuation", "cohesion", "task", "structure", "wordchoice"].map((k) => [k, true]));
const CRITERIA = ["tr", "cc", "lr", "gra"].map((key) => ({ key }));
export const countWords = (t) => (t || "").trim().split(/\s+/).filter(Boolean).length;
export const roundIelts = (x) => Math.round(x * 2) / 2; // .25 -> .5, .75 -> 1.0 (IELTS averaging rule)
export const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
/* --------------------------- validation helpers --------------------------- */
export const S = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
export const A = (v) => (Array.isArray(v) ? v : []);
export const bandOf = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? Math.min(9, Math.max(1, Math.round(n * 2) / 2)) : null; };
export const strs = (v, n = 6) => A(v).map(S).filter(Boolean).slice(0, n);
export const STATUS = (v) => (["ok", "warn", "miss"].includes(v) ? v : "warn");


// Validates + normalises every AI response before the UI sees it.
export function vQuestion(r) {
  return { topic: S(r.topic), questionType: S(r.questionType), requiredPosition: S(r.requiredPosition), mustAddress: strs(r.mustAddress, 4), strongAnswerCovers: strs(r.strongAnswerCovers, 4), pitfalls: strs(r.pitfalls, 2) };
}
export function vScores(r) {
  const out = { strengths: strs(r.strengths, 3), weaknesses: strs(r.weaknesses, 4), lengthNote: S(r.lengthNote) };
  CRITERIA.forEach(({ key }) => {
    const b = bandOf(r?.[key]?.score);
    if (b == null) throw new Error("Invalid score for " + key);
    out[key] = { score: b, rationale: S(r[key].rationale) };
  });
  return out;
}
export function vDetail(r) {
  const d = {};
  CRITERIA.forEach(({ key }) => {
    const x = r?.detail?.[key] || {};
    d[key] = { positives: strs(x.positives, 2), issues: A(x.issues).slice(0, 2).map((y) => ({ problem: S(y.problem), fix: S(y.fix) })).filter((y) => y.problem) };
  });
  return { detail: d, plan: A(r.plan).slice(0, 5).map((p) => ({ area: S(p.area), action: S(p.action) })).filter((p) => p.action) };
}
export function vStructure(r) {
  return {
    paragraphs: A(r.paragraphs).slice(0, 5).map((p) => ({ label: S(p.label), checks: A(p.checks).slice(0, 3).map((c) => ({ status: STATUS(c.status), text: S(c.text) })).filter((c) => c.text) })).filter((p) => p.label),
    taskChecks: A(r.taskChecks).slice(0, 6).map((c) => ({ status: STATUS(c.status), text: S(c.text) })).filter((c) => c.text),
    naturalness: A(r.naturalness).slice(0, 3).map((n) => ({ phrase: S(n.phrase), note: S(n.note), alternative: S(n.alternative) })).filter((n) => n.phrase),
    repetition: A(r.repetition).slice(0, 3).map((n) => ({ item: S(n.item), note: S(n.note), alternatives: strs(n.alternatives, 4) })).filter((n) => n.item),
    relevance: A(r.relevance).slice(0, 2).map((n) => ({ quote: S(n.quote), note: S(n.note) })).filter((n) => n.quote),
  };
}
export function vErrors(r) {
  return A(r.errors).slice(0, 10).map((e) => ({
    original: S(e.original), correction: S(e.correction),
    category: CATS[e.category] ? e.category : "grammar", rule: S(e.rule) || "General",
    severity: ["major", "minor", "precision"].includes(e.severity) ? e.severity : "minor",
    explanation: S(e.explanation), impact: S(e.impact),
  })).filter((e) => e.original && e.correction);
}
export function vVocab(r) {
  return {
    topic: S(r.topic),
    words: A(r.words).slice(0, 8).map((w) => ({ word: S(w.word), pos: S(w.pos), ipa: S(w.ipa), meaning: S(w.meaning), example: S(w.example), collocations: strs(w.collocations, 4), synonyms: strs(w.synonyms, 3), mistake: S(w.mistake), usefulness: S(w.usefulness) })).filter((w) => w.word),
    collocations: strs(r.collocations, 10),
  };
}


/* ---------------------------- request validation --------------------------- */
const TARGETS = [6, 6.5, 7, 7.5, 8, 8.5, 9];
export const LIMITS = { question: 4000, essay: 9000, model: 7000, word: 60 };

export function parseAnalyzeInput(b, ApiError) {
  const bad = (m) => new ApiError("bad_request", 400, m);
  if (!b || typeof b !== "object") throw bad("Request body must be a JSON object.");
  const task = Number(b.task);
  if (![1, 2].includes(task)) throw bad("task must be 1 or 2.");
  const question = S(b.question), essay = S(b.essay);
  if (question.length < 15) throw bad("question is too short (minimum 15 characters).");
  if (question.length > LIMITS.question) throw bad(`question is too long (maximum ${LIMITS.question} characters).`);
  if (essay.length < 20) throw bad("essay is too short (minimum 20 characters).");
  if (essay.length > LIMITS.essay) throw bad(`essay is too long (maximum ${LIMITS.essay} characters).`);
  const target = TARGETS.includes(Number(b.target)) ? Number(b.target) : 7;
  const inc = b.include && typeof b.include === "object" ? b.include : {};
  return {
    task, module: b.module === "gt" ? "gt" : "academic", qtype: S(b.qtype).slice(0, 120) || (task === 1 ? "Other" : "Mixed / Other"),
    question, essay, target,
    wc: countWords(essay), min: task === 1 ? 150 : 250, // computed server-side, never trusted from the client
    include: { modelBands: A(inc.modelBands).map(Number).filter((n) => [7, 7.5, 8, 8.5, 9].includes(n)).slice(0, 2), improvedEssay: !!inc.improvedEssay },
  };
}

// Locates each flagged phrase in the essay so the UI can highlight exact character ranges.
export function locateSegments(essay, errors) {
  const spans = [];
  errors.forEach((e, errorIndex) => {
    let idx = essay.indexOf(e.original);
    if (idx < 0) idx = essay.toLowerCase().indexOf(e.original.toLowerCase());
    if (idx < 0) return;
    const end = idx + e.original.length;
    if (spans.some((s) => idx < s.end && end > s.start)) return;
    spans.push({ start: idx, end, text: essay.slice(idx, end), category: e.category, severity: e.severity, errorIndex });
  });
  return spans.sort((a, b) => a.start - b.start);
}

/* -------------------------- generated-content validators ------------------- */
export function vModel(r) {
  const answer = S(r.answer);
  if (answer.length < 80) throw new Error("model answer missing or too short");
  return { answer, why: strs(r.why, 5) };
}
export function vImprove(r) {
  const improved = S(r.improved);
  if (improved.length < 60) throw new Error("improved essay missing or too short");
  return { improved, changes: A(r.changes).slice(0, 6).map((c) => ({ from: S(c.from), to: S(c.to), reason: S(c.reason) })).filter((c) => c.to) };
}
const CMP = ["Vocabulary", "Grammar", "Development", "Cohesion", "Sentence structures"];
export function vCompare(r) {
  return { points: A(r.points).slice(0, 5).map((p) => ({ category: CMP.includes(p.category) ? p.category : "Vocabulary", yours: S(p.yours), model: S(p.model), why: S(p.why) })).filter((p) => p.why) };
}
export function vCheck(r) {
  return { correct: r.correct === true, feedback: S(r.feedback), bestVersion: S(r.bestVersion) };
}
export function vDefine(r, word) {
  const out = { word: S(r.word) || word, pos: S(r.pos), ipa: S(r.ipa), meaning: S(r.meaning), example: S(r.example), collocations: strs(r.collocations, 4), synonyms: strs(r.synonyms, 3), mistake: S(r.mistake), usefulness: S(r.usefulness) };
  if (!out.meaning) throw new Error("definition missing");
  return out;
}
export function vDaily(r) {
  const question = S(r.question);
  if (question.length < 30) throw new Error("question missing or too short");
  return { type: S(r.type), question };
}
