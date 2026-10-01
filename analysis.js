// Orchestrates the full IELTS analysis on the server. Five focused model calls run in
// parallel (scores -> detail is chained). Only "scores" is required: if another section
// fails, the response is still returned with that section reported in meta.partial.
import { askJson, getModel } from "./anthropic.js";
import { ApiError, errorBody } from "./http.js";
import { prompts } from "./prompts.js";
import { vQuestion, vScores, vDetail, vStructure, vErrors, vVocab, vModel, vImprove, locateSegments, roundIelts, avg } from "./validate.js";

const SECTION = { question: "Question analysis", detail: "Criterion detail and improvement plan", structure: "Structure analysis", errors: "Error analysis", vocab: "Topic vocabulary" };

export function taskTypeLabel(i) {
  return i.task === 2 ? "Task 2" : i.module === "gt" ? "Task 1 General Training" : "Task 1 Academic";
}

export async function runAnalysis(input, onStep = () => {}, { budgetMs = 55000 } = {}) {
  const deadline = Date.now() + budgetMs;
  const step = (k) => (v) => { onStep(k); return v; };
  const stepFail = (k) => (e) => { onStep(k); throw e; };

  const scoresP = askJson(prompts.scores(input), vScores, deadline);
  const questionP = askJson(prompts.question(input), vQuestion, deadline).then(step("task"), stepFail("task"));
  const detailP = scoresP.then((sc) => askJson(prompts.detail(input, sc), vDetail, deadline)).then(step("response"), stepFail("response"));
  const structureP = askJson(prompts.structure(input), vStructure, deadline).then(step("structure"), stepFail("structure"));
  const errorsP = askJson(prompts.errors(input), vErrors, deadline).then(step("language"), stepFail("language"));
  const vocabP = askJson(prompts.vocab(input), vVocab, deadline).then(step("vocab"), stepFail("vocab"));

  const [sc, q, det, st, er, vo] = await Promise.allSettled([scoresP, questionP, detailP, structureP, errorsP, vocabP]);
  if (sc.status !== "fulfilled") throw sc.reason; // required: without scores there is no analysis

  const partial = [];
  const take = (r, key) => {
    if (r.status === "fulfilled") return r.value;
    const b = errorBody(r.reason);
    partial.push({ section: SECTION[key], code: b.code, message: b.message, hint: b.hint, stage: b.stage, snippet: b.snippet });
    return null;
  };
  const question = take(q, "question"), detail = take(det, "detail"), structure = take(st, "structure"), errors = take(er, "errors") || [], vocab = take(vo, "vocab");
  const s = sc.value;
  const scores = { taskResponse: s.tr.score, coherenceCohesion: s.cc.score, lexicalResource: s.lr.score, grammaticalRangeAccuracy: s.gra.score };
  scores.overall = roundIelts(avg(Object.values(scores)));
  const d = (k) => ({ positives: detail?.detail?.[k]?.positives || [], issues: detail?.detail?.[k]?.issues || [] });

  const out = {
    taskType: taskTypeLabel(input),
    questionType: question?.questionType || input.qtype,
    wordCount: input.wc,
    minimumWordCount: input.min,
    meetsMinimum: input.wc >= input.min,
    targetBand: input.target,
    scores,
    scoreRationale: { taskResponse: s.tr.rationale, coherenceCohesion: s.cc.rationale, lexicalResource: s.lr.rationale, grammaticalRangeAccuracy: s.gra.rationale },
    questionAnalysis: question,
    taskAnalysis: { ...d("tr"), checks: structure?.taskChecks || [], relevance: structure?.relevance || [] },
    coherenceAnalysis: { ...d("cc"), paragraphs: structure?.paragraphs || [], naturalness: structure?.naturalness || [], repetition: structure?.repetition || [] },
    vocabularyAnalysis: d("lr"),
    grammarAnalysis: d("gra"),
    errors,
    highlightedSegments: locateSegments(input.essay, errors),
    strengths: s.strengths,
    weaknesses: s.weaknesses,
    lengthNote: s.lengthNote,
    improvementPlan: detail?.plan || [],
    topicVocabulary: vocab ? { topic: vocab.topic, words: vocab.words } : null,
    collocations: vocab?.collocations || [],
    modelAnswers: {},
    improvedEssay: null,
    meta: {
      model: getModel(), generatedAt: new Date().toISOString(), partial,
      sections: { question: !!question, detail: !!detail, structure: !!structure, errors: !!er && er.status === "fulfilled", vocabulary: !!vocab },
    },
  };

  // Optional extras (off by default; the UI requests them on demand through /api/generate).
  const extras = [];
  for (const band of input.include?.modelBands || []) {
    extras.push(askJson(prompts.model(input, band), vModel, deadline).then((m) => { out.modelAnswers[String(band)] = m; }, (e) => { const b = errorBody(e); out.meta.partial.push({ section: `Model answer (Band ${band})`, code: b.code, message: b.message, hint: b.hint, stage: b.stage, snippet: b.snippet }); }));
  }
  if (input.include?.improvedEssay) {
    extras.push(askJson(prompts.improve(input), vImprove, deadline).then((m) => { out.improvedEssay = m; }, (e) => { const b = errorBody(e); out.meta.partial.push({ section: "Improved essay", code: b.code, message: b.message, hint: b.hint, stage: b.stage, snippet: b.snippet }); }));
  }
  await Promise.all(extras);
  return out;
}
