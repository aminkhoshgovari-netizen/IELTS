import React, { useState, useEffect, useMemo, useRef } from "react";
import { Menu, X, Sun, Moon, Volume2, Plus, ChevronDown, Trash2 } from "lucide-react";
import {
  TASK1_TYPES, TASK1_GT, TASK2_TYPES, TARGETS, CRITERIA, CATS, MODEL_BANDS, SAMPLE_Q, SAMPLE_ESSAY, DAILY,
  countWords, uid, fmtBand, roundIelts, avg, fmtDate, normQ, repeatedWords, speak, S, A, strs,
} from "./lib/constants.js";
import { store } from "./lib/storage.js";
import { analyzeIELTSWriting, api, describeError, diagnose, apiInfo } from "./services/aiService.js";

/* ----------------------------- shared components -------------------------- */
function Dial({ value, size = 96, stroke = 9, label }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(1, (value || 0) / 9));
  const col = value >= 7 ? "var(--good)" : value >= 6 ? "var(--acc)" : "var(--warn)";
  return (
    <span className="ic-dial" role="img" aria-label={label || `Band ${fmtBand(value)}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surf2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <b style={{ fontSize: size * 0.32 }}>{fmtBand(value)}</b>
    </span>
  );
}

function Section({ id, title, sub, children, open: initial = true, right }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="ic-acc" id={id}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <h2>{title}</h2>
        {sub && <span className="ic-sub" style={{ display: "none" }}>{sub}</span>}
        {right}
        <ChevronDown size={20} aria-hidden="true" />
      </button>
      {open && <div className="ic-acc-b">{sub && <p className="ic-sub" style={{ marginBottom: 14 }}>{sub}</p>}{children}</div>}
    </section>
  );
}

const StatusIcon = ({ s }) => <span className={"ic-ico " + s} aria-label={s === "ok" ? "Good" : s === "warn" ? "Needs work" : "Missing"}>{s === "ok" ? "✓" : s === "warn" ? "!" : "✕"}</span>;

function segment(text, errors) {
  const spans = [];
  errors.forEach((e, i) => {
    if (!e.original) return;
    let idx = text.indexOf(e.original);
    if (idx < 0) idx = text.toLowerCase().indexOf(e.original.toLowerCase());
    if (idx < 0) return;
    const end = idx + e.original.length;
    if (spans.some((s) => idx < s.end && end > s.start)) return;
    spans.push({ start: idx, end, i });
  });
  spans.sort((a, b) => a.start - b.start);
  const parts = []; let pos = 0;
  spans.forEach((s) => {
    if (s.start > pos) parts.push({ t: text.slice(pos, s.start) });
    parts.push({ t: text.slice(s.start, s.end), i: s.i });
    pos = s.end;
  });
  if (pos < text.length) parts.push({ t: text.slice(pos) });
  return { parts, matched: new Set(spans.map((s) => s.i)) };
}

function MarkedText({ text, errors, active, onPick, hidden = new Set(), className = "ic-essay" }) {
  const { parts } = useMemo(() => segment(text, errors), [text, errors]);
  return (
    <div className={className}>
      {parts.map((p, k) =>
        p.i == null || hidden.has(errors[p.i].category) ? (
          <span key={k}>{p.t}</span>
        ) : (
          <button key={k} type="button" className={`ic-mark ${errors[p.i].severity}${active === p.i ? " on" : ""}`} style={{ "--mc": CATS[errors[p.i].category].color }} onClick={() => onPick(p.i)} aria-label={`${CATS[errors[p.i].category].label} issue: ${p.t}. Open explanation`}>
            {p.t}
          </button>
        )
      )}
    </div>
  );
}

function LineChart({ series, labels, height = 190 }) {
  const W = 560, H = height, pad = { l: 34, r: 12, t: 12, b: 26 };
  const vals = series.flatMap((s) => s.values.filter((v) => v != null));
  if (!vals.length) return null;
  const lo = Math.floor(Math.min(...vals, 6) - 0.5), hi = Math.ceil(Math.max(...vals, 7) + 0.5);
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
  const ticks = []; for (let t = lo; t <= hi; t += 1) ticks.push(t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={"Line chart: " + series.map((s) => s.name + " " + s.values.map(fmtBand).join(", ")).join("; ")}>
      {ticks.map((t) => (<g key={t}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={pad.l - 6} y={y(t) + 4} fontSize="11" textAnchor="end" fill="var(--mut)">{t}</text></g>))}
      {labels && labels.map((l, i) => (n <= 8 || i % Math.ceil(n / 8) === 0) && <text key={i} x={x(i)} y={H - 6} fontSize="10.5" textAnchor="middle" fill="var(--mut)">{l}</text>)}
      {series.map((s) => (
        <g key={s.name}>
          <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" points={s.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(" ")} />
          {s.values.map((v, i) => v != null && <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill={s.color} />)}
        </g>
      ))}
    </svg>
  );
}

function VocabCard({ w, topic, saved, onAdd, compact }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ic-card flat" style={{ padding: 16 }}>
      <div className="ic-row">
        <h3 style={{ fontSize: 20 }}>{w.word}</h3>
        {w.ipa && <span className="ic-sub">{w.ipa}</span>}
        {w.pos && <span className="ic-pill">{w.pos}</span>}
        <span className="ic-sp" />
        <button type="button" className="ic-btn sm" onClick={() => (w.audio ? new Audio(w.audio).play().catch(() => speak(w.word)) : speak(w.word))} aria-label={`Listen to ${w.word}`}><Volume2 size={15} /> Listen</button>
        <button type="button" className="ic-btn sm pri" disabled={saved} onClick={() => onAdd({ ...w, topic })}>{saved ? "✓ Saved" : <><Plus size={15} /> Add to Vocabulary</>}</button>
      </div>
      <p style={{ marginTop: 8 }}>{w.meaning}</p>
      {w.example && <p className="ic-quote" style={{ marginTop: 8 }}>“{w.example}”</p>}
      {w.collocations?.length > 0 && <div className="ic-chips" style={{ marginTop: 10 }}>{w.collocations.map((c) => <span key={c} className="ic-pill acc">{c}</span>)}</div>}
      {!compact && (w.synonyms?.length > 0 || w.mistake || w.usefulness) && (
        <>
          <button type="button" className="ic-btn sm ghost" style={{ marginTop: 8 }} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide details" : "More details"}</button>
          {open && (
            <ul className="ic-list" style={{ marginTop: 8, fontSize: 14.5 }}>
              {w.synonyms?.length > 0 && <li><b>Synonyms:</b> {w.synonyms.join(", ")}</li>}
              {w.mistake && <li><b>Common mistake:</b> {w.mistake}</li>}
              {w.usefulness && <li><b>IELTS usefulness:</b> {w.usefulness}</li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Empty({ title, text, action, onAction }) {
  return (
    <div className="ic-card" style={{ textAlign: "center", padding: 40 }}>
      <h3 style={{ fontSize: 22 }}>{title}</h3>
      <p className="ic-sub" style={{ margin: "8px auto 18px", maxWidth: 420 }}>{text}</p>
      {action && <button type="button" className="ic-btn pri" onClick={onAction}>{action}</button>}
    </div>
  );
}

/* ------------------------------ result view ------------------------------- */
const CMP_CAT = { Vocabulary: "vocabulary", Grammar: "grammar", Development: "task", Cohesion: "cohesion", "Sentence structures": "structure" };

function ErrorPanel({ e, learn, onClose }) {
  const [attempt, setAttempt] = useState(e.original);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const show = !learn || revealed || res?.correct;
  const check = async () => {
    setBusy(true); setRes(null);
    try { const r = await api.check(e.original, attempt, e.rule, e.explanation); setRes({ correct: !!r.correct, feedback: S(r.feedback), best: S(r.bestVersion) }); }
    catch (err) { setRes({ error: true }); }
    setBusy(false);
  };
  const cat = CATS[e.category];
  return (
    <div className="ic-card flat" style={{ marginTop: 16, borderColor: cat.color, padding: 18 }} role="region" aria-label="Error explanation">
      <div className="ic-row" style={{ marginBottom: 10 }}>
        <span className="ic-pill" style={{ background: `color-mix(in srgb,${cat.color} 18%,transparent)`, color: "var(--ink)" }}><span className="ic-dot" style={{ "--mc": cat.color }} />{cat.label}</span>
        <span className="ic-pill">{e.rule}</span>
        <span className={"ic-pill " + (e.severity === "major" ? "bad" : e.severity === "precision" ? "acc" : "warn")}>{e.severity === "precision" ? "Could be more precise" : e.severity === "major" ? "Major" : "Minor"}</span>
        <span className="ic-sp" />
        <button type="button" className="ic-btn sm ghost" onClick={onClose} aria-label="Close explanation"><X size={15} /></button>
      </div>
      {learn && !show ? (
        <>
          <p className="ic-label">Find the mistake – rewrite this phrase</p>
          <p className="ic-note" style={{ marginBottom: 10 }}>Hint: <b>{cat.label}</b> · {e.rule}</p>
          <div className="ic-row">
            <input className="ic-input ic-sp" style={{ minWidth: 220 }} value={attempt} onChange={(ev) => setAttempt(ev.target.value)} aria-label="Your correction" />
            <button type="button" className="ic-btn pri" disabled={busy || !attempt.trim()} onClick={check}>{busy ? "Checking…" : "Check My Correction"}</button>
            <button type="button" className="ic-btn" onClick={() => setRevealed(true)}>Show answer</button>
          </div>
          {res?.error && <p className="ic-note bad" style={{ marginTop: 10 }}>Could not check your correction. Please try again.</p>}
          {res && !res.error && <p className={"ic-note " + (res.correct ? "good" : "warn")} style={{ marginTop: 10 }}>{res.correct ? "✓ Correct. " : "Not quite. "}{res.feedback}</p>}
        </>
      ) : (
        <div className="ic-grid" style={{ gap: 10 }}>
          <div><b>Original</b><p className="ic-quote">“{e.original}”</p></div>
          <div><b>Correction</b><p className="ic-quote" style={{ borderColor: "var(--good)" }}>“{e.correction}”</p></div>
          <div><b>Explanation</b><p>{e.explanation}</p></div>
          {e.impact && <div><b>IELTS impact</b><p>{e.impact}</p></div>}
        </div>
      )}
    </div>
  );
}

function AttemptsPanel({ attempts }) {
  const sorted = [...attempts].sort((a, b) => a.createdAt - b.createdAt);
  const first = sorted[0], last = sorted[sorted.length - 1];
  const deltas = CRITERIA.map((c) => ({ c, d: (last.scores[c.key] ?? 0) - (first.scores[c.key] ?? 0) }));
  const better = deltas.filter((x) => x.d > 0), worse = deltas.filter((x) => x.d < 0);
  return (
    <div>
      <div className="ic-row" style={{ fontFamily: "var(--serif)", fontSize: 24, marginBottom: 12 }}>
        {sorted.map((s, i) => <span key={s.id}>{i > 0 && "→ "}{fmtBand(s.scores.overall)}</span>)}
      </div>
      <div className="ic-grid ic-g3">
        {sorted.map((s, i) => (
          <div key={s.id} className="ic-card flat" style={{ padding: 14 }}>
            <b>Attempt {i + 1}</b> <span className="ic-sub">· {fmtDate(s.createdAt)}</span>
            <p className="ic-sub">{s.wordCount} words{s.demo ? " · demo" : ""}</p>
            <p style={{ marginTop: 6, fontSize: 14 }}>TR {fmtBand(s.scores.tr)} · CC {fmtBand(s.scores.cc)} · LR {fmtBand(s.scores.lr)} · GRA {fmtBand(s.scores.gra)}</p>
          </div>
        ))}
      </div>
      {sorted.length > 1 && (
        <div className="ic-note acc" style={{ marginTop: 12 }}>
          {better.length ? <>Improved since attempt 1: {better.map((x) => `${x.c.short} (+${x.d})`).join(", ")}. </> : <>No criterion has improved yet. </>}
          {worse.length ? <>Dropped: {worse.map((x) => `${x.c.short} (${x.d})`).join(", ")}. </> : null}
          Word count changed from {first.wordCount} to {last.wordCount}.
        </div>
      )}
    </div>
  );
}

function ResultView({ rec, settings, essays, vocab, onAddVocab, onSave, onExtras, onNew, onRetry, onGoEssays }) {
  const a = rec.analysis;
  const mobile = typeof window !== "undefined" && window.innerWidth < 700;
  const [sel, setSel] = useState(null);
  const [activeErr, setActiveErr] = useState(null);
  const [hidden, setHidden] = useState(new Set());
  const [learn, setLearn] = useState(!!settings.learning);
  const [modelBand, setModelBand] = useState(null);
  const [models, setModels] = useState(rec.extras?.models || {});
  const [mBusy, setMBusy] = useState(false);
  const [mErr, setMErr] = useState("");
  const [cmp, setCmp] = useState(rec.extras?.cmp || {});
  const [cBusy, setCBusy] = useState(false);
  const [cPick, setCPick] = useState(null);
  const [cTab, setCTab] = useState("mine");
  const [showCmp, setShowCmp] = useState(false);
  const [improved, setImproved] = useState(rec.extras?.improved || null);
  const [iBusy, setIBusy] = useState(false);
  const [iErr, setIErr] = useState("");
  const [rv, setRv] = useState(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } if (rec.saved) onExtras({ models, cmp, improved }); }, [models, cmp, improved]); // eslint-disable-line

  const errors = a.errors || [];
  const cats = [...new Set(errors.map((e) => e.category))];
  const matched = useMemo(() => segment(rec.essay, errors).matched, [rec.essay, errors]);
  const unmatched = errors.map((e, i) => i).filter((i) => !matched.has(i));
  const overall = a.scores.overall;
  const target = settings.target;
  const gap = Math.round((target - overall) * 2) / 2;
  const below = CRITERIA.filter((c) => a.scores[c.key] < target);
  const nextBand = Math.min(9, overall + 0.5);
  const below_min = a.meta.wordCount < a.meta.min;
  const attempts = essays.filter((e) => normQ(e.question) === normQ(rec.question) && e.id !== rec.id);
  const reps = useMemo(() => repeatedWords(rec.essay), [rec.essay]);
  const sv = (k) => (mobile ? false : true);
  const savedWords = new Set(vocab.map((v) => v.word.toLowerCase()));
  const counts = { major: errors.filter((e) => e.severity === "major").length, minor: errors.filter((e) => e.severity === "minor").length, precision: errors.filter((e) => e.severity === "precision").length };

  const genModel = async (b) => {
    setModelBand(b); setShowCmp(false); setMErr("");
    if (models[b]) return;
    setMBusy(true);
    try {
      const r = await api.model({ question: rec.question, task: a.meta.task, qtype: a.meta.qtype }, b);
      const ans = S(r.answer);
      if (ans.length < 80) throw new Error("short");
      setModels((m) => ({ ...m, [b]: { answer: ans, why: strs(r.why, 5) } }));
    } catch (e) { setMErr("The model answer could not be generated. Please try again."); }
    setMBusy(false);
  };
  const genCmp = async () => {
    setCBusy(true);
    try {
      const r = await api.compare({ question: rec.question, essay: rec.essay }, models[modelBand].answer, modelBand);
      const pts = A(r.points).slice(0, 5).map((p) => ({ category: CMP_CAT[p.category] ? p.category : "Vocabulary", yours: S(p.yours), model: S(p.model), why: S(p.why) })).filter((p) => p.why);
      setCmp((c) => ({ ...c, [modelBand]: pts }));
    } catch (e) { setMErr("The comparison could not be generated. Please try again."); }
    setCBusy(false);
  };
  const genImprove = async () => {
    setIBusy(true); setIErr("");
    try {
      const r = await api.improve({ task: a.meta.task, module: a.meta.module, qtype: a.meta.qtype, min: a.meta.min, target, question: rec.question, essay: rec.essay, wc: a.meta.wordCount });
      const text = S(r.improved);
      if (text.length < 60) throw new Error("short");
      setImproved({ text, changes: A(r.changes).slice(0, 6).map((c) => ({ from: S(c.from), to: S(c.to), reason: S(c.reason) })).filter((c) => c.to) });
    } catch (e) { setIErr("The improved version could not be generated. Please try again."); }
    setIBusy(false);
  };
  const save = async () => { await onSave({ models, cmp, improved }); };

  const curModel = modelBand && models[modelBand];
  const curCmp = modelBand && cmp[modelBand];
  const mineErrs = (curCmp || []).map((p) => ({ original: p.yours, category: CMP_CAT[p.category], severity: "precision" }));
  const modelErrs = (curCmp || []).map((p) => ({ original: p.model, category: CMP_CAT[p.category], severity: "precision" }));

  return (
    <div className="ic-page">
      <div className="ic-wrap">
        <div className="ic-row" style={{ marginBottom: 14 }}>
          <div>
            <p className="ic-sub">IELTS Writing Analysis</p>
            <h1 style={{ fontSize: 32 }}>{a.meta.task === 1 ? `Task 1 · ${a.meta.module === "gt" ? "General Training" : "Academic"}` : "Task 2"} · {a.meta.qtype}</h1>
          </div>
          <span className="ic-sp" />
          {rec.demo && <span className="ic-pill warn">Demo entry</span>}
          <button type="button" className="ic-btn" onClick={onNew}>New essay</button>
          <button type="button" className="ic-btn pri" onClick={save} disabled={rec.saved && !rec.dirty}>{rec.saved ? "✓ Saved" : "Save Essay"}</button>
        </div>

        {a.missing?.length > 0 && (
          <div className="ic-note warn" style={{ marginBottom: 16 }}>
            Some sections could not be generated: {a.missing.join(", ")}. Your scores are still valid. <button type="button" className="ic-btn sm" onClick={onRetry} style={{ marginLeft: 8 }}>Re-run analysis</button>
            {a.missingDetail?.length > 0 && <details style={{ marginTop: 8 }}><summary>Technical details</summary>{a.missingDetail.map((m, i) => <p key={i} style={{ marginTop: 6 }}><b>{m.name}</b>: {m.kind}{m.status ? " " + m.status : ""} – {m.message}{m.body ? " – " + m.body.slice(0, 200) : ""}</p>)}</details>}
          </div>
        )}

        {/* Score dashboard */}
        <div className="ic-card" style={{ marginBottom: 16 }}>
          <div className="ic-grid" style={{ gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <Dial value={overall} size={132} stroke={11} label={`Estimated overall band ${fmtBand(overall)}`} />
              <p style={{ fontWeight: 600, marginTop: 6 }}>Estimated band</p>
            </div>
            <div>
              <div className="ic-grid ic-g2" style={{ gap: 10 }}>
                {CRITERIA.map((c) => (
                  <button key={c.key} type="button" className="ic-score" aria-pressed={sel === c.key} onClick={() => setSel(sel === c.key ? null : c.key)}>
                    <Dial value={a.scores[c.key]} size={52} stroke={6} />
                    <span><strong>{c.short}</strong><small>Tap for detail</small></span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="ic-row" style={{ marginTop: 16 }}>
            <span className={"ic-pill " + (below_min ? "bad" : "good")}>Word count: {a.meta.wordCount}</span>
            <span className="ic-sub">Minimum: {a.meta.min} words</span>
          </div>
          {below_min && <p className="ic-note bad" style={{ marginTop: 10 }}>Your answer is under the {a.meta.min}-word minimum. This is penalised under {a.meta.task === 1 ? "Task Achievement" : "Task Response"}, regardless of language quality.</p>}
          {a.criteria.lengthNote && <p className="ic-note" style={{ marginTop: 10 }}>{a.criteria.lengthNote}</p>}
          {gap > 0 ? (
            <p className="ic-note acc" style={{ marginTop: 10 }}>You are approximately {gap === 0.5 ? "half a band" : `${gap} bands`} below your target of {fmtBand(target)}. The criteria holding you back: {below.map((c) => `${c.short} (${fmtBand(a.scores[c.key])})`).join(", ")}.</p>
          ) : (
            <p className="ic-note good" style={{ marginTop: 10 }}>This estimate is at or above your target of {fmtBand(target)}. Consistency matters – aim to repeat this level across several essays.</p>
          )}
          <p className="ic-sub" style={{ marginTop: 10, fontSize: 13 }}>This is an AI estimate based on the IELTS band descriptors. It is not an official IELTS score, and real examiners may score differently.</p>

          {sel && (() => {
            const c = CRITERIA.find((x) => x.key === sel), d = a.detail[sel];
            return (
              <div className="ic-card flat" style={{ marginTop: 16 }} role="region" aria-label={c.long + " detail"}>
                <div className="ic-row"><h3 style={{ fontSize: 20 }}>{c.long}</h3><span className="ic-pill acc">Band {fmtBand(a.scores[sel])}</span></div>
                <p style={{ margin: "8px 0 12px" }}>{a.criteria[sel].rationale}</p>
                {d.positives.length > 0 && <><b>What works</b><ul className="ic-list" style={{ margin: "6px 0 12px" }}>{d.positives.map((p, i) => <li key={i}><StatusIcon s="ok" />{p}</li>)}</ul></>}
                {d.issues.length > 0 && <><b>What is reducing the score</b><ul className="ic-list" style={{ margin: "6px 0 0" }}>{d.issues.map((p, i) => <li key={i}><StatusIcon s="warn" /><span>{p.problem}<br /><span className="ic-sub">How to improve: {p.fix}</span></span></li>)}</ul></>}
              </div>
            );
          })()}
        </div>

        {attempts.length > 0 && (
          <Section title="Compare attempts" sub={`You have answered this question ${attempts.length + 1} times.`} open={!mobile}>
            <AttemptsPanel attempts={[...attempts, { ...rec, scores: a.scores, wordCount: a.meta.wordCount, createdAt: rec.createdAt || Date.now() }]} />
          </Section>
        )}

        {/* Question analysis */}
        {a.question ? (
          <Section title="What is the question asking?" open={sv()}>
            <div className="ic-grid ic-g2">
              <div>
                <p className="ic-sub">Topic</p><p style={{ fontWeight: 600, marginBottom: 10 }}>{a.question.topic}</p>
                <p className="ic-sub">Question type</p><p style={{ fontWeight: 600, marginBottom: 10 }}>{a.question.questionType}</p>
                <p className="ic-sub">Required position</p><p>{a.question.requiredPosition}</p>
              </div>
              <div>
                <b>You need to</b>
                <ul className="ic-list" style={{ margin: "6px 0 10px" }}>{a.question.mustAddress.map((t, i) => <li key={i}><span className="ic-ico pend">{i + 1}</span>{t}</li>)}</ul>
                {a.question.strongAnswerCovers.length > 0 && <><b>A strong answer covers</b><ul className="ic-list" style={{ margin: "6px 0 10px" }}>{a.question.strongAnswerCovers.map((t, i) => <li key={i}><StatusIcon s="ok" />{t}</li>)}</ul></>}
                {a.question.pitfalls.length > 0 && <><b>Common traps</b><ul className="ic-list" style={{ margin: "6px 0 0" }}>{a.question.pitfalls.map((t, i) => <li key={i}><StatusIcon s="warn" />{t}</li>)}</ul></>}
              </div>
            </div>
          </Section>
        ) : null}

        {/* Strengths / weaknesses */}
        <div className="ic-grid ic-g2" style={{ marginBottom: 16 }}>
          <div className="ic-card"><h2 className="ic-h">What you did well</h2><ul className="ic-list" style={{ marginTop: 10 }}>{a.criteria.strengths.map((s, i) => <li key={i}><StatusIcon s="ok" />{s}</li>)}</ul></div>
          <div className="ic-card"><h2 className="ic-h">What is holding you back</h2><ul className="ic-list" style={{ marginTop: 10 }}>{a.criteria.weaknesses.map((s, i) => <li key={i}><StatusIcon s="warn" />{s}</li>)}</ul></div>
        </div>

        {/* Structure */}
        {a.structure && (
          <Section title="Essay structure" sub="How the essay works as a whole, paragraph by paragraph." open={sv()}>
            <div className="ic-grid ic-g2">
              {a.structure.paragraphs.map((p, i) => (
                <div key={i} className="ic-card flat" style={{ padding: 16 }}>
                  <b>{p.label}</b>
                  <ul className="ic-list" style={{ marginTop: 8 }}>{p.checks.map((c, j) => <li key={j}><StatusIcon s={c.status} />{c.text}</li>)}</ul>
                </div>
              ))}
            </div>
            {a.structure.taskChecks.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <b>{a.meta.task === 1 ? "Task 1 checklist" : "Task 2 checklist"}</b>
                <ul className="ic-list" style={{ marginTop: 8 }}>{a.structure.taskChecks.map((c, j) => <li key={j}><StatusIcon s={c.status} />{c.text}</li>)}</ul>
              </div>
            )}
            {a.structure.relevance.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <b>Relevance check</b>
                {a.structure.relevance.map((r, i) => (
                  <div key={i} className="ic-note warn" style={{ marginTop: 8 }}>
                    <span className="ic-pill warn" style={{ background: "transparent", padding: 0 }}>⚠ Partially relevant</span>
                    <p className="ic-quote" style={{ margin: "6px 0" }}>“{r.quote}”</p>{r.note}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Errors */}
        <Section title="Your essay, marked" sub="Select a highlighted phrase to see the correction, explanation and IELTS impact." open={true}
          right={<span className="ic-pill">{errors.length} flagged</span>}>
          {errors.length === 0 ? <p className="ic-note good">No specific errors were flagged. Check the criteria above for band-level feedback.</p> : (
            <>
              <div className="ic-row" style={{ marginBottom: 12 }}>
                <div className="ic-chips" style={{ flex: 1 }}>
                  {cats.map((c) => (
                    <button key={c} type="button" className="ic-chip" aria-pressed={!hidden.has(c)} style={{ display: "inline-flex", alignItems: "center" }}
                      onClick={() => { const n = new Set(hidden); n.has(c) ? n.delete(c) : n.add(c); setHidden(n); }}>
                      <span className="ic-dot" style={{ "--mc": CATS[c].color, background: CATS[c].color }} />{CATS[c].label} ({errors.filter((e) => e.category === c).length})
                    </button>
                  ))}
                </div>
                <button type="button" className="ic-chip" aria-pressed={learn} onClick={() => { setLearn(!learn); setActiveErr(null); }}>Learning Mode {learn ? "on" : "off"}</button>
              </div>
              <p className="ic-sub" style={{ marginBottom: 12, fontSize: 13.5 }}>
                Underline style: solid = {counts.major} major · dotted = {counts.minor} minor · dashed = {counts.precision} correct but could be more precise.
                {learn && " Learning Mode: pick a highlight and fix it yourself before the answer is shown."}
              </p>
              <MarkedText text={rec.essay} errors={errors} active={activeErr} hidden={hidden} onPick={(i) => setActiveErr(i)} />
              {activeErr != null && <ErrorPanel key={activeErr + (learn ? "l" : "s")} e={errors[activeErr]} learn={learn} onClose={() => setActiveErr(null)} />}
              {unmatched.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <b>Other notes</b>
                  <p className="ic-sub" style={{ fontSize: 13.5 }}>These could not be located exactly in your text.</p>
                  {unmatched.map((i) => <div key={i} style={{ marginTop: 8 }}><ErrorPanel e={errors[i]} learn={false} onClose={() => {}} /></div>)}
                </div>
              )}
            </>
          )}
        </Section>

        {/* Naturalness & repetition */}
        <Section title="Naturalness and repetition" open={sv()}>
          <div className="ic-grid ic-g2">
            <div>
              <b>Naturalness check</b>
              <p className="ic-sub" style={{ fontSize: 13.5, margin: "2px 0 8px" }}>Potentially formulaic language is not wrong, but it adds little meaning. This is a style check, not a detector of AI or copied writing.</p>
              {a.structure?.naturalness.length ? a.structure.naturalness.map((n, i) => (
                <div key={i} className="ic-card flat" style={{ padding: 14, marginBottom: 8 }}>
                  <p className="ic-quote">“{n.phrase}”</p><p style={{ margin: "6px 0" }}>{n.note}</p>
                  {n.alternative && <p><b>More direct:</b> {n.alternative}</p>}
                </div>
              )) : <p className="ic-note good">No memorised or formulaic phrasing stood out.</p>}
            </div>
            <div>
              <b>Repetition</b>
              {reps.length > 0 && <div className="ic-chips" style={{ margin: "8px 0" }}>{reps.map(([w, c]) => <span key={w} className="ic-pill warn">“{w}” × {c}</span>)}</div>}
              {a.structure?.repetition.map((n, i) => (
                <div key={i} className="ic-card flat" style={{ padding: 14, marginBottom: 8 }}>
                  <p><b>{n.item}</b></p><p>{n.note}</p>
                  {n.alternatives.length > 0 && <p className="ic-sub">Options that fit: {n.alternatives.join(", ")}</p>}
                </div>
              ))}
              {!reps.length && !a.structure?.repetition.length && <p className="ic-note good" style={{ marginTop: 8 }}>No distracting repetition found.</p>}
            </div>
          </div>
        </Section>

        {/* Plan */}
        <Section title={`How to reach Band ${fmtBand(nextBand)}`} sub={`Current estimate: ${fmtBand(overall)}. These steps come from your own essay.`} open={true}>
          <ol className="ic-list">{a.plan.map((p, i) => <li key={i}><span className="ic-ico pend">{i + 1}</span><span>{p.area && <b>{p.area}: </b>}{p.action}</span></li>)}</ol>
        </Section>

        {/* Model answers */}
        <Section title="Generate a model answer" sub="Model answers for this exact question, written to reflect each band's descriptors." open={true}>
          <div className="ic-chips" role="group" aria-label="Choose model band">
            {MODEL_BANDS.map((b) => <button key={b} type="button" className="ic-chip" aria-pressed={modelBand === b} onClick={() => genModel(b)}>Band {b}</button>)}
          </div>
          {mBusy && <p className="ic-note" style={{ marginTop: 14 }} role="status"><span className="ic-spin" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 10, width: 16, height: 16 }} />Writing a Band {modelBand} model answer…</p>}
          {mErr && <p className="ic-note bad" style={{ marginTop: 14 }}>{mErr}</p>}
          {curModel && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 20, marginBottom: 8 }}>Model Band {modelBand} answer</h3>
              <p className="ic-paper" style={{ whiteSpace: "pre-wrap" }}>{curModel.answer}</p>
              <p className="ic-sub" style={{ marginTop: 6 }}>{countWords(curModel.answer)} words</p>
              <h3 style={{ fontSize: 18, margin: "16px 0 8px" }}>Why this is approximately Band {modelBand}</h3>
              <ul className="ic-list">{curModel.why.map((w, i) => <li key={i}><StatusIcon s="ok" />{w}</li>)}</ul>
              <div className="ic-row" style={{ marginTop: 16 }}>
                <button type="button" className="ic-btn pri" onClick={() => setShowCmp(!showCmp)}>{showCmp ? "Hide comparison" : "Compare your writing"}</button>
              </div>
            </div>
          )}
          {curModel && showCmp && (
            <div style={{ marginTop: 16 }}>
              <div className="ic-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={cTab === "mine"} className="ic-chip" aria-pressed={cTab === "mine"} onClick={() => setCTab("mine")}>My Answer</button>
                <button type="button" role="tab" aria-selected={cTab === "model"} className="ic-chip" aria-pressed={cTab === "model"} onClick={() => setCTab("model")}>Model Answer</button>
              </div>
              <div className="ic-cmp">
                <div className={cTab === "mine" ? "" : "hide-m"}>
                  <p className="ic-label">My Answer</p>
                  <div className="ic-card flat"><MarkedText className="ic-paper" text={rec.essay} errors={mineErrs} active={cPick} onPick={setCPick} /></div>
                </div>
                <div className={cTab === "model" ? "" : "hide-m"}>
                  <p className="ic-label">Model Band {modelBand}</p>
                  <div className="ic-card flat"><MarkedText className="ic-paper" text={curModel.answer} errors={modelErrs} active={cPick} onPick={setCPick} /></div>
                </div>
              </div>
              {!curCmp && <div style={{ marginTop: 14 }}><button type="button" className="ic-btn" disabled={cBusy} onClick={genCmp}>{cBusy ? "Comparing…" : "Explain the differences"}</button></div>}
              {curCmp && curCmp.length > 0 && (
                <div className="ic-grid" style={{ marginTop: 14 }}>
                  {curCmp.map((p, i) => (
                    <div key={i} className="ic-card flat" style={{ padding: 16, borderColor: cPick === i ? CATS[CMP_CAT[p.category]].color : undefined }}>
                      <span className="ic-pill" style={{ background: `color-mix(in srgb,${CATS[CMP_CAT[p.category]].color} 18%,transparent)`, color: "var(--ink)" }}>{p.category}</span>
                      <div className="ic-grid ic-g2" style={{ marginTop: 8 }}>
                        <div><p className="ic-sub">Yours</p><p className="ic-quote">“{p.yours}”</p></div>
                        <div><p className="ic-sub">Model</p><p className="ic-quote" style={{ borderColor: "var(--good)" }}>“{p.model}”</p></div>
                      </div>
                      <p style={{ marginTop: 8 }}>{p.why}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Improve */}
        <Section title="Improve my essay" sub="Keeps your ideas, position and meaning. Improves grammar, vocabulary, cohesion and development." open={true}>
          {!improved && <button type="button" className="ic-btn pri" disabled={iBusy} onClick={genImprove}>{iBusy ? "Improving your essay…" : "Generate Improved Version"}</button>}
          {iErr && <p className="ic-note bad" style={{ marginTop: 12 }}>{iErr}</p>}
          {improved && (
            <>
              <div className="ic-tabs"><button type="button" className="ic-chip" aria-pressed={rv !== "imp"} onClick={() => setRv("orig")}>My Original</button><button type="button" className="ic-chip" aria-pressed={rv === "imp"} onClick={() => setRv("imp")}>Improved Version</button></div>
              <div className="ic-cmp">
                <div className={rv === "imp" ? "hide-m" : ""}><p className="ic-label">My Original</p><div className="ic-card flat"><p className="ic-paper" style={{ whiteSpace: "pre-wrap" }}>{rec.essay}</p></div></div>
                <div className={rv === "imp" ? "" : "hide-m"}><p className="ic-label">Improved Version</p><div className="ic-card flat"><p className="ic-paper" style={{ whiteSpace: "pre-wrap" }}>{improved.text}</p></div></div>
              </div>
              {improved.changes.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <b>Major changes</b>
                  <div className="ic-grid" style={{ marginTop: 8, gap: 10 }}>
                    {improved.changes.map((c, i) => (
                      <div key={i} className="ic-card flat ic-diff" style={{ padding: 14 }}>
                        {c.from && <span className="old">{c.from}</span>} → <span className="new">{c.to}</span>
                        <p className="ic-sub" style={{ marginTop: 6 }}>{c.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button type="button" className="ic-btn" style={{ marginTop: 14 }} onClick={() => { setImproved(null); }}>Regenerate</button>
            </>
          )}
        </Section>

        {/* Vocabulary */}
        {a.vocab && (
          <Section title="Topic vocabulary" sub={`Topic: ${a.vocab.topic || a.question?.topic || ""}`} open={sv()}>
            <div className="ic-grid ic-g2">
              {a.vocab.words.map((w) => <VocabCard key={w.word} w={w} topic={a.vocab.topic} saved={savedWords.has(w.word.toLowerCase())} onAdd={onAddVocab} />)}
            </div>
            {a.vocab.collocations.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <b>Topic-specific collocations</b>
                <div className="ic-chips" style={{ marginTop: 8 }}>{a.vocab.collocations.map((c) => <span key={c} className="ic-pill acc">{c}</span>)}</div>
              </div>
            )}
          </Section>
        )}

        <div className="ic-card" style={{ textAlign: "center" }}>
          <h2 className="ic-h">Save this analysis</h2>
          <p className="ic-sub" style={{ marginBottom: 14 }}>Saving adds it to My Essays, updates Progress, and feeds your personal error bank.</p>
          <button type="button" className="ic-btn pri lg" onClick={save} disabled={rec.saved && !rec.dirty}>{rec.saved ? "✓ Saved to My Essays" : "Save Essay"}</button>
          {rec.saved && <div style={{ marginTop: 10 }}><button type="button" className="ic-btn ghost" onClick={onGoEssays}>View My Essays</button></div>}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- pages ---------------------------------- */
const SAMPLE_SNIP = {
  text: "Many people thinks that online learning is more convenient. It save time, but students often feel isolated from their classmates.",
  errors: [
    { original: "people thinks", correction: "people think", category: "grammar", rule: "Subject-verb agreement", severity: "major", explanation: "“People” is plural, so it takes the plural verb “think”.", impact: "Repeated agreement errors reduce Grammatical Range & Accuracy." },
    { original: "It save", correction: "It saves", category: "grammar", rule: "Subject-verb agreement", severity: "minor", explanation: "A singular subject needs the third-person -s in the present simple.", impact: "Small slips like this are tolerable once, but frequent ones cap the grammar band." },
    { original: "more convenient", correction: "more convenient for working adults", category: "task", rule: "Underdeveloped idea", severity: "precision", explanation: "The claim is acceptable but general. Say who benefits and why.", impact: "Specific support is what lifts Task Response above Band 6." },
  ],
};


function Diagnostics({ auto = false }) {
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState(null);
  const runIt = async () => { setBusy(true); setR(null); const out = await diagnose(); console.info("[IELTS-AI] diagnostics", out); setR(out); setBusy(false); };
  useEffect(() => { if (auto) runIt(); }, []); // eslint-disable-line
  const text = r ? JSON.stringify(r, null, 2) : "";
  return (
    <div>
      <div className="ic-row">
        <button type="button" className="ic-btn" onClick={runIt} disabled={busy}>{busy ? "Testing…" : "Test AI connection"}</button>
        {r && <button type="button" className="ic-btn ghost" onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}>Copy report</button>}
      </div>
      {r && (
        <div style={{ marginTop: 12 }} role="status">
          <p className={"ic-note " + (r.ok ? "good" : "bad")}>{r.ok ? `Backend reachable (${r.ms} ms). API key configured on server: ${r.health.keyConfigured ? "yes" : "NO"}. Model: ${r.health.model}. Anthropic test request: ${r.health.ping?.ok ? "OK (" + r.health.ping.ms + " ms)" : "not run"}.` : `Connection test failed: ${r.error.kind}${r.error.status ? " " + r.error.status : ""}. ${r.error.hint}`}</p>
          {r.ok && !r.health.keyConfigured && <p className="ic-note warn" style={{ marginTop: 8 }}>The backend is running but ANTHROPIC_API_KEY is not set. Add it in your environment variables and redeploy.</p>}
          <pre style={{ marginTop: 10, padding: 12, background: "var(--surf2)", borderRadius: 12, fontSize: 12.5, overflow: "auto", maxHeight: 320, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</pre>
        </div>
      )}
    </div>
  );
}

function ErrorDetails({ info }) {
  const rows = [["Failed step", info.stage], ["Error type", info.kind], ["HTTP status", info.status], ["Message", info.message], ["Mode", info.mode], ["Endpoint", info.endpoint], ["Model stop reason", info.stopReason]].filter(([, v]) => v !== "" && v != null);
  return (
    <div style={{ marginTop: 14 }}>
      <p className="ic-note warn">{info.hint}</p>
      <table className="ic-table" style={{ marginTop: 10 }}><tbody>{rows.map(([k, v]) => <tr key={k}><td style={{ width: 150, color: "var(--mut)", fontWeight: 600 }}>{k}</td><td style={{ overflowWrap: "anywhere" }}>{String(v)}</td></tr>)}</tbody></table>
      {info.body && <><p className="ic-label" style={{ marginTop: 10 }}>Raw response</p><pre style={{ padding: 12, background: "var(--surf2)", borderRadius: 12, fontSize: 12.5, overflow: "auto", maxHeight: 220, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{info.body}</pre></>}
    </div>
  );
}

function Landing({ go, onSample }) {
  const [pick, setPick] = useState(0);
  const features = [
    ["AI Band Estimation", "Understand your estimated IELTS Writing band, criterion by criterion."],
    ["Deep Essay Analysis", "Analyze Task Response, Coherence, Vocabulary and Grammar."],
    ["Personal Error Tracking", "Find the mistakes you repeatedly make."],
    ["Band 7–9 Models", "Study realistic model answers at different levels."],
    ["Topic Vocabulary", "Learn relevant vocabulary and collocations for every topic."],
  ];
  return (
    <div>
      <div className="ic-wrap ic-hero">
        <div>
          <h1>Write Better. Understand Your Mistakes. Reach Your Target Band.</h1>
          <p className="lede">AI-powered IELTS Writing feedback based on the IELTS assessment criteria.</p>
          <div className="ic-row">
            <button type="button" className="ic-btn pri lg" onClick={() => go("practice")}>Start Writing</button>
            <button type="button" className="ic-btn lg" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>Explore Features</button>
          </div>
        </div>
        <div className="ic-card" aria-label="Sample feedback preview">
          <div className="ic-row" style={{ marginBottom: 12 }}>
            <Dial value={6.5} size={64} stroke={7} label="Sample band 6.5" />
            <div><b>Sample feedback</b><p className="ic-sub">Select a marked phrase.</p></div>
          </div>
          <MarkedText className="ic-paper" text={SAMPLE_SNIP.text} errors={SAMPLE_SNIP.errors} active={pick} onPick={setPick} />
          <ErrorPanel key={pick} e={SAMPLE_SNIP.errors[pick]} learn={false} onClose={() => {}} />
        </div>
      </div>
      <div className="ic-wrap" id="features" style={{ paddingBottom: 48 }}>
        <div className="ic-grid ic-g3">
          {features.map(([t, d]) => (<div key={t} className="ic-card"><h3 style={{ fontSize: 20, marginBottom: 6 }}>{t}</h3><p className="ic-sub">{d}</p></div>))}
          <div className="ic-card" style={{ background: "var(--accsoft)" }}>
            <h3 style={{ fontSize: 20, marginBottom: 6 }}>Try it with a sample essay</h3>
            <p className="ic-sub" style={{ marginBottom: 12 }}>No account needed. Load a Task 2 question and essay with typical errors.</p>
            <button type="button" className="ic-btn pri" onClick={onSample}>Load sample</button>
          </div>
        </div>
        <p className="ic-sub" style={{ marginTop: 24, fontSize: 13.5 }}>Estimated bands are AI estimates, not official IELTS scores. This tool is not affiliated with or endorsed by IELTS.</p>
      </div>
    </div>
  );
}

function Practice({ draft, setDraft, settings, onAnalyze, onDaily, dailyBusy, formError }) {
  const { task, module, qtype, question, essay } = draft;
  const min = task === 1 ? 150 : 250;
  const wc = countWords(essay);
  const types = task === 2 ? TASK2_TYPES : module === "gt" ? TASK1_GT : TASK1_TYPES;
  const set = (p) => setDraft({ ...draft, ...p });
  const ready = question.trim().length > 15 && wc >= 20;
  return (
    <div className="ic-page">
      <div className="ic-wrap">
        <h1>Practice</h1>
        <p className="ic-sub" style={{ marginBottom: 22 }}>Enter an IELTS Writing question and your answer. Your text is kept on this device until the analysis succeeds.</p>
        <div className="ic-card" style={{ marginBottom: 16 }}>
          <div className="ic-grid ic-g2" style={{ gap: 22 }}>
            <div>
              <span className="ic-label" id="l-task">IELTS Writing task</span>
              <div className="ic-chips" role="radiogroup" aria-labelledby="l-task">
                {[1, 2].map((t) => <button key={t} type="button" role="radio" aria-checked={task === t} className="ic-chip" onClick={() => set({ task: t, qtype: t === 2 ? TASK2_TYPES[0] : module === "gt" ? TASK1_GT[0] : TASK1_TYPES[0] })}>Task {t}</button>)}
              </div>
              {task === 1 && (
                <div style={{ marginTop: 14 }}>
                  <span className="ic-label" id="l-mod">Test type</span>
                  <div className="ic-chips" role="radiogroup" aria-labelledby="l-mod">
                    {[["academic", "Academic"], ["gt", "General Training"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={module === k} className="ic-chip" onClick={() => set({ module: k, qtype: k === "gt" ? TASK1_GT[0] : TASK1_TYPES[0] })}>{l}</button>)}
                  </div>
                </div>
              )}
            </div>
            <div>
              <span className="ic-label" id="l-type">{task === 1 ? (module === "gt" ? "Letter type" : "Visual / data type") : "Question type"}</span>
              <div className="ic-chips" role="radiogroup" aria-labelledby="l-type">
                {types.map((t) => <button key={t} type="button" role="radio" aria-checked={qtype === t} className="ic-chip" onClick={() => set({ qtype: t })}>{t}</button>)}
              </div>
            </div>
          </div>
        </div>

        <div className="ic-card" style={{ marginBottom: 16 }}>
          <div className="ic-row" style={{ marginBottom: 8 }}>
            <label className="ic-label" htmlFor="q" style={{ margin: 0 }}>Question / Topic</label>
            <span className="ic-sp" />
            <button type="button" className="ic-btn sm" onClick={() => onDaily(1)} disabled={dailyBusy}>Daily Task 1</button>
            <button type="button" className="ic-btn sm" onClick={() => onDaily(2)} disabled={dailyBusy}>Daily Task 2</button>
          </div>
          <textarea id="q" className="ic-ta q" value={question} onChange={(e) => set({ question: e.target.value })} placeholder="Paste your IELTS question here…" />
          {task === 1 && <p className="ic-sub" style={{ marginTop: 8, fontSize: 13.5 }}>Charts and images cannot be uploaded. Paste the key data or a description of the visual into the question box so the data can be checked.</p>}
        </div>

        <div className="ic-card" style={{ marginBottom: 16 }}>
          <label className="ic-label" htmlFor="essay">Your Answer</label>
          <textarea id="essay" className="ic-ta essay" value={essay} onChange={(e) => set({ essay: e.target.value })} placeholder="Write or paste your answer here…" />
          <div className="ic-row" style={{ marginTop: 10 }} aria-live="polite">
            <span className={"ic-pill " + (wc === 0 ? "" : wc < min ? "bad" : "good")}>Word Count: {wc}</span>
            <span className="ic-sub">Minimum: {min} words</span>
            {wc > 0 && wc < min && <span className="ic-note bad" style={{ padding: "4px 10px" }}>{min - wc} words below the minimum</span>}
            {wc > min * 1.6 && <span className="ic-note warn" style={{ padding: "4px 10px" }}>Long answer – extra length does not raise the band</span>}
          </div>
        </div>

        {formError && <p className="ic-note bad" style={{ marginBottom: 16 }} role="alert">{formError}</p>}
        <div className="ic-row">
          <button type="button" className="ic-btn pri lg" disabled={!ready} onClick={onAnalyze}>Analyze My Writing</button>
          <button type="button" className="ic-btn" onClick={() => setDraft({ task: 2, module: "academic", qtype: TASK2_TYPES[0], question: SAMPLE_Q, essay: SAMPLE_ESSAY })}>Load sample essay</button>
          {(question || essay) && <button type="button" className="ic-btn ghost" onClick={() => setDraft({ ...draft, question: "", essay: "" })}>Clear</button>}
          {!ready && <span className="ic-sub">Add a question and at least 20 words to begin.</span>}
        </div>
        <p className="ic-sub" style={{ marginTop: 14, fontSize: 13.5 }}>Your target band is {fmtBand(settings.target)}. Change it in Settings.</p>
      </div>
    </div>
  );
}

const STEPS = [["task", "Reading the task"], ["response", "Checking task response and estimating bands"], ["structure", "Analyzing paragraph structure"], ["language", "Checking grammar, vocabulary and cohesion"], ["vocab", "Building topic vocabulary"]];
function Loading({ done }) {
  return (
    <div className="ic-page"><div className="ic-wrap" style={{ maxWidth: 560 }}>
      <div className="ic-card" role="status" aria-live="polite">
        <h1 style={{ fontSize: 28, marginBottom: 6 }}>Analyzing your writing…</h1>
        <p className="ic-sub" style={{ marginBottom: 16 }}>This usually takes 15–40 seconds.</p>
        {STEPS.map(([k, l]) => (
          <div className="ic-step" key={k}>
            {done.includes(k) ? <span className="ic-ico ok" style={{ width: 22, height: 22 }}>✓</span> : <span className="ic-spin" />}
            <span style={{ color: done.includes(k) ? "var(--ink)" : "var(--mut)" }}>{l}</span>
          </div>
        ))}
        <div className="ic-bar" style={{ marginTop: 14 }}><i style={{ width: `${(done.length / STEPS.length) * 100}%`, transition: "width .3s" }} /></div>
      </div>
    </div></div>
  );
}

function Essays({ essays, onView, onDelete, go }) {
  const [confirm, setConfirm] = useState(null);
  const [cmpKey, setCmpKey] = useState(null);
  const sorted = [...essays].sort((a, b) => b.createdAt - a.createdAt);
  const groups = {};
  essays.forEach((e) => { const k = normQ(e.question); (groups[k] = groups[k] || []).push(e); });
  return (
    <div className="ic-page"><div className="ic-wrap">
      <h1>My Essays</h1>
      <p className="ic-sub" style={{ marginBottom: 20 }}>Every saved analysis. Open one to see the full feedback.</p>
      {!sorted.length ? <Empty title="No saved essays yet" text="Analyze an essay and select Save Essay to build your history." action="Start practice" onAction={() => go("practice")} /> : (
        <div className="ic-card" style={{ padding: 8 }}>
          <table className="ic-table resp">
            <thead><tr><th>Date</th><th>Task</th><th>Topic</th><th>Words</th><th>Band</th><th /></tr></thead>
            <tbody>
              {sorted.map((e) => {
                const g = groups[normQ(e.question)];
                return (
                  <tr key={e.id}>
                    <td data-l="Date">{fmtDate(e.createdAt)}</td>
                    <td data-l="Task">Task {e.task}{e.demo && " · demo"}</td>
                    <td data-l="Topic" style={{ maxWidth: 320 }}>{e.analysis?.question?.topic || e.question.slice(0, 70) + (e.question.length > 70 ? "…" : "")}</td>
                    <td data-l="Words">{e.wordCount}</td>
                    <td data-l="Band"><b>{fmtBand(e.scores.overall)}</b></td>
                    <td><div className="ic-row" style={{ justifyContent: "flex-end" }}>
                      <button type="button" className="ic-btn sm" disabled={!e.analysis} onClick={() => onView(e)} title={e.analysis ? "" : "Demo entries contain scores only"}>View</button>
                      {g.length > 1 && <button type="button" className="ic-btn sm" onClick={() => setCmpKey(cmpKey === normQ(e.question) ? null : normQ(e.question))}>Compare attempts</button>}
                      {confirm === e.id ? <button type="button" className="ic-btn sm danger" onClick={() => { onDelete(e); setConfirm(null); }}>Confirm delete</button> : <button type="button" className="ic-btn sm ghost danger" aria-label="Delete essay" onClick={() => setConfirm(e.id)}><Trash2 size={15} /></button>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {cmpKey && groups[cmpKey] && <div className="ic-card" style={{ marginTop: 16 }}><h2 className="ic-h" style={{ marginBottom: 12 }}>Compare attempts</h2><AttemptsPanel attempts={groups[cmpKey]} /></div>}
    </div></div>
  );
}

function Vocabulary({ vocab, setVocab }) {
  const [topic, setTopic] = useState("all");
  const [q, setQ] = useState("");
  const [look, setLook] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const topics = [...new Set(vocab.map((v) => v.topic).filter(Boolean))];
  const shown = vocab.filter((v) => topic === "all" || v.topic === topic);
  const lookup = async () => {
    const w = q.trim(); if (!w) return;
    setBusy(true); setMsg(""); setLook(null);
    try {
      const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(w));
      if (!r.ok) throw new Error("nf");
      const e = (await r.json())[0], m = e.meanings?.[0], d = m?.definitions?.[0];
      setLook({ word: e.word, pos: m?.partOfSpeech || "", ipa: (e.phonetics || []).find((p) => p.text)?.text || e.phonetic || "", audio: (e.phonetics || []).find((p) => p.audio)?.audio, meaning: d?.definition || "", example: d?.example || "", collocations: [], synonyms: (m?.synonyms || []).slice(0, 3), mistake: "", usefulness: "" });
      setMsg("Source: Free Dictionary API (dictionaryapi.dev).");
    } catch (err) {
      try { const d = await api.define(w); setLook({ word: S(d.word) || w, pos: S(d.pos), ipa: S(d.ipa), meaning: S(d.meaning), example: S(d.example), collocations: strs(d.collocations, 4), synonyms: strs(d.synonyms, 3), mistake: S(d.mistake), usefulness: S(d.usefulness) }); setMsg("Dictionary service unavailable – showing an AI-generated entry. Check important details in a dictionary."); }
      catch (e2) { setMsg("This word could not be looked up. Check the spelling or your connection."); }
    }
    setBusy(false);
  };
  const add = (w) => { if (!vocab.some((v) => v.word.toLowerCase() === w.word.toLowerCase())) setVocab([{ id: uid(), added: Date.now(), topic: w.topic || "Lookup", ...w }, ...vocab]); };
  return (
    <div className="ic-page"><div className="ic-wrap">
      <h1>Vocabulary</h1>
      <p className="ic-sub" style={{ marginBottom: 20 }}>Look up any word, and keep the words you want to learn.</p>
      <div className="ic-card" style={{ marginBottom: 16 }}>
        <label className="ic-label" htmlFor="lk">Look up a word</label>
        <div className="ic-row">
          <input id="lk" className="ic-input ic-sp" style={{ minWidth: 200 }} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} placeholder="e.g. substantial" />
          <button type="button" className="ic-btn pri" onClick={lookup} disabled={busy || !q.trim()}>{busy ? "Looking up…" : "Look up"}</button>
        </div>
        {msg && <p className="ic-sub" style={{ marginTop: 10, fontSize: 13.5 }}>{msg}</p>}
        {look && <div style={{ marginTop: 14 }}><VocabCard w={look} topic="Lookup" saved={vocab.some((v) => v.word.toLowerCase() === look.word.toLowerCase())} onAdd={add} /></div>}
      </div>
      <div className="ic-row" style={{ marginBottom: 12 }}>
        <h2 className="ic-h" style={{ margin: 0 }}>My vocabulary ({vocab.length})</h2><span className="ic-sp" />
        {topics.length > 0 && <select className="ic-select" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Filter by topic"><option value="all">All topics</option>{topics.map((t) => <option key={t}>{t}</option>)}</select>}
      </div>
      {!shown.length ? <Empty title="Your vocabulary bank is empty" text="Add words from the topic vocabulary after an analysis, or look one up above." /> : (
        <div className="ic-grid ic-g2">
          {shown.map((w) => (
            <div key={w.id}>
              <VocabCard w={w} topic={w.topic} saved onAdd={() => {}} />
              <div className="ic-row" style={{ padding: "6px 4px" }}>
                <span className="ic-sub" style={{ fontSize: 13 }}>{w.topic} · added {fmtDate(w.added)}</span><span className="ic-sp" />
                <button type="button" className="ic-btn sm ghost danger" onClick={() => setVocab(vocab.filter((v) => v.id !== w.id))} aria-label={"Remove " + w.word}><Trash2 size={14} /> Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div></div>
  );
}

function Errors({ essays, go }) {
  const groups = useMemo(() => {
    const m = {};
    [...essays].sort((a, b) => a.createdAt - b.createdAt).forEach((e) => (e.analysis?.errors || []).forEach((er) => {
      const k = er.category + "|" + er.rule.toLowerCase();
      m[k] = m[k] || { category: er.category, rule: er.rule, count: 0, last: null };
      m[k].count++; m[k].last = er;
    }));
    const byCat = {};
    Object.values(m).forEach((g) => (byCat[g.category] = byCat[g.category] || []).push(g));
    Object.values(byCat).forEach((l) => l.sort((a, b) => b.count - a.count));
    return byCat;
  }, [essays]);
  const cats = Object.keys(groups);
  return (
    <div className="ic-page"><div className="ic-wrap">
      <h1>My Errors</h1>
      <p className="ic-sub" style={{ marginBottom: 20 }}>Patterns across your saved essays. Fix the most frequent ones first.</p>
      {!cats.length ? <Empty title="No error patterns yet" text="Save analyzed essays and your recurring mistakes will appear here." action="Start practice" onAction={() => go("practice")} /> : (
        <div className="ic-grid ic-g2">
          {cats.map((c) => (
            <div key={c} className="ic-card">
              <h2 className="ic-h"><span className="ic-dot" style={{ "--mc": CATS[c].color, background: CATS[c].color }} />{CATS[c].label}</h2>
              <ul className="ic-list" style={{ marginTop: 12, gap: 14 }}>
                {groups[c].map((g) => (
                  <li key={g.rule} style={{ display: "block" }}>
                    <div className="ic-row"><b>{g.rule}</b><span className="ic-sp" /><span className={"ic-pill " + (g.count >= 5 ? "bad" : g.count >= 3 ? "warn" : "")}>{g.count}×</span></div>
                    <p className="ic-sub" style={{ fontSize: 13.5 }}>You have made this error {g.count} time{g.count > 1 ? "s" : ""}.</p>
                    <p className="ic-diff" style={{ marginTop: 4 }}><span className="old">{g.last.original}</span> → <span className="new">{g.last.correction}</span></p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div></div>
  );
}

const CCOL = { tr: "#3B82E0", cc: "#1FA3A3", lr: "#8B6CF0", gra: "#E0524D" };
function Progress({ essays, go }) {
  const list = useMemo(() => [...essays].sort((a, b) => a.createdAt - b.createdAt), [essays]);
  if (!list.length) return <div className="ic-page"><div className="ic-wrap"><h1>Progress</h1><div style={{ height: 16 }} /><Empty title="No progress data yet" text="Save your first analyzed essay to start tracking your estimated band." action="Start practice" onAction={() => go("practice")} /></div></div>;
  const n = list.length, overall = list.map((e) => e.scores.overall);
  const t1 = list.filter((e) => e.task === 1).map((e) => e.scores.overall), t2 = list.filter((e) => e.task === 2).map((e) => e.scores.overall);
  const half = Math.max(1, Math.floor(n / 2));
  const deltas = CRITERIA.map((c) => ({ c, d: n < 2 ? 0 : avg(list.slice(-half).map((e) => e.scores[c.key])) - avg(list.slice(0, half).map((e) => e.scores[c.key])) }));
  const best = [...deltas].sort((a, b) => b.d - a.d)[0];
  const recent = list.slice(-3);
  const focus = [...CRITERIA].sort((a, b) => avg(recent.map((e) => e.scores[a.key])) - avg(recent.map((e) => e.scores[b.key])))[0];
  const labels = list.map((_, i) => "#" + (i + 1));
  const Stat = ({ l, v }) => <div className="ic-card"><p className="ic-sub">{l}</p><p className="ic-stat">{v}</p></div>;
  return (
    <div className="ic-page"><div className="ic-wrap">
      <h1>Progress</h1>
      {list.some((e) => e.demo) && <p className="ic-note warn" style={{ margin: "10px 0" }}>Charts include demo data. Remove it in Settings.</p>}
      <div className="ic-grid ic-g4" style={{ margin: "16px 0" }}>
        <Stat l="Essays analyzed" v={n} /><Stat l="Average band" v={fmtBand(roundIelts(avg(overall)))} /><Stat l="Latest band" v={fmtBand(overall[n - 1])} /><Stat l="Best band" v={fmtBand(Math.max(...overall))} />
        <Stat l="Average Task 1" v={t1.length ? fmtBand(roundIelts(avg(t1))) : "–"} /><Stat l="Average Task 2" v={t2.length ? fmtBand(roundIelts(avg(t2))) : "–"} />
        <div className="ic-card"><p className="ic-sub">Most improved</p><p className="ic-stat" style={{ fontSize: 22 }}>{best.d > 0 ? best.c.short : "Not yet"}</p></div>
        <div className="ic-card"><p className="ic-sub">Area to focus on</p><p className="ic-stat" style={{ fontSize: 22 }}>{focus.short}</p></div>
      </div>
      <div className="ic-card" style={{ marginBottom: 16 }}>
        <h2 className="ic-h">Band progress</h2>
        <p style={{ fontFamily: "var(--serif)", fontSize: 22, margin: "6px 0 10px", overflowWrap: "anywhere" }}>{overall.slice(-8).map(fmtBand).join(" → ")}</p>
        <LineChart series={[{ name: "Overall", values: overall, color: "var(--acc)" }]} labels={labels} />
      </div>
      <div className="ic-card">
        <h2 className="ic-h">Criteria trends</h2>
        <div className="ic-chips" style={{ margin: "8px 0" }}>{CRITERIA.map((c) => <span key={c.key} className="ic-pill"><span className="ic-dot" style={{ background: CCOL[c.key] }} />{c.short}</span>)}</div>
        <LineChart series={CRITERIA.map((c) => ({ name: c.short, values: list.map((e) => e.scores[c.key]), color: CCOL[c.key] }))} labels={labels} height={230} />
      </div>
    </div></div>
  );
}

function SettingsPage({ settings, setSettings, essays, onDemo, onClearDemo, onClearAll }) {
  const [sure, setSure] = useState(false);
  const hasDemo = essays.some((e) => e.demo);
  return (
    <div className="ic-page"><div className="ic-wrap" style={{ maxWidth: 760 }}>
      <h1>Settings</h1>
      <div className="ic-card" style={{ margin: "16px 0" }}>
        <span className="ic-label" id="l-tb">My Target Band</span>
        <div className="ic-chips" role="radiogroup" aria-labelledby="l-tb">{TARGETS.map((t) => <button key={t} type="button" role="radio" aria-checked={settings.target === t} className="ic-chip" onClick={() => setSettings({ ...settings, target: t })}>{fmtBand(t)}</button>)}</div>
        <p className="ic-sub" style={{ marginTop: 8, fontSize: 13.5 }}>Feedback shows how far you are from this band and which criteria hold you back.</p>
      </div>
      <div className="ic-card" style={{ marginBottom: 16 }}>
        <div className="ic-row"><div className="ic-sp"><b>Appearance</b><p className="ic-sub">Light or dark theme.</p></div>
          <button type="button" className="ic-btn" onClick={() => setSettings({ ...settings, theme: settings.theme === "dark" ? "light" : "dark" })}>{settings.theme === "dark" ? <><Sun size={16} /> Light</> : <><Moon size={16} /> Dark</>}</button></div>
        <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "16px 0" }} />
        <div className="ic-row"><div className="ic-sp"><b>Learning Mode by default</b><p className="ic-sub">Fix highlighted mistakes yourself before corrections are shown.</p></div>
          <button type="button" className="ic-chip" aria-pressed={settings.learning} onClick={() => setSettings({ ...settings, learning: !settings.learning })}>{settings.learning ? "On" : "Off"}</button></div>
      </div>
      <div className="ic-card" style={{ marginBottom: 16 }}>
        <b>AI connection</b>
        <p className="ic-sub" style={{ margin: "4px 0 12px" }}>Analysis requests go to your backend at <b>{apiInfo().analyze}</b>. The Anthropic API key exists only on the server (ANTHROPIC_API_KEY) and is never sent to the browser. This test checks the backend, the key and the model, using one tiny request with no essay.</p>
        <Diagnostics />
      </div>
      <div className="ic-card" style={{ marginBottom: 16 }}>
        <b>Demo data</b>
        <p className="ic-sub" style={{ margin: "4px 0 12px" }}>Adds five clearly labelled sample entries (scores only) so you can preview Progress charts. They are never mixed up with real essays and can be removed any time.</p>
        <div className="ic-row"><button type="button" className="ic-btn" onClick={onDemo} disabled={hasDemo}>Load demo data</button><button type="button" className="ic-btn" onClick={onClearDemo} disabled={!hasDemo}>Remove demo data</button></div>
      </div>
      <div className="ic-card">
        <b>Your data</b>
        <p className="ic-sub" style={{ margin: "4px 0 12px" }}>Essays, vocabulary and settings are stored privately for you in this app. No account is required. In a deployed version this layer maps to Firebase Authentication and per-user Firestore documents.</p>
        {sure ? <div className="ic-row"><span>Delete all essays and vocabulary?</span><button type="button" className="ic-btn danger" onClick={() => { onClearAll(); setSure(false); }}>Yes, delete everything</button><button type="button" className="ic-btn" onClick={() => setSure(false)}>Cancel</button></div> : <button type="button" className="ic-btn danger" onClick={() => setSure(true)}>Delete all my data</button>}
      </div>
    </div></div>
  );
}

/* ----------------------------------- app ---------------------------------- */
const NAV = [["practice", "Practice"], ["essays", "My Essays"], ["vocab", "Vocabulary"], ["errors", "My Errors"], ["progress", "Progress"], ["settings", "Settings"]];
const EMPTY_DRAFT = { task: 2, module: "academic", qtype: TASK2_TYPES[0], question: "", essay: "" };

export default function App() {
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("home");
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState({ theme: "light", target: 7, learning: false });
  const [essays, setEssays] = useState([]);
  const [vocab, setVocabState] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [phase, setPhase] = useState("form"); // form | loading | error | result
  const [done, setDone] = useState([]);
  const [rec, setRec] = useState(null);
  const [formError, setFormError] = useState("");
  const [errInfo, setErrInfo] = useState(null);
  const [dailyBusy, setDailyBusy] = useState(false);
  const lastInput = useRef(null);

  useEffect(() => {
    (async () => {
      const [s, v, d, keys] = await Promise.all([store.get("settings"), store.get("vocab"), store.get("draft"), store.list("essay:")]);
      if (s) setSettings((x) => ({ ...x, ...s }));
      if (v) setVocabState(v);
      if (d) setDraft({ ...EMPTY_DRAFT, ...d });
      const list = (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean);
      setEssays(list);
      setReady(true);
    })();
  }, []);
  useEffect(() => { if (ready) store.set("settings", settings); }, [settings, ready]);
  useEffect(() => { if (!ready) return; const t = setTimeout(() => store.set("draft", draft), 600); return () => clearTimeout(t); }, [draft, ready]);
  const setVocab = (v) => { setVocabState(v); store.set("vocab", v); };
  const addVocab = (w) => { if (!vocab.some((x) => x.word.toLowerCase() === w.word.toLowerCase())) setVocab([{ id: uid(), added: Date.now(), ...w }, ...vocab]); };

  const go = (p) => { setPage(p); setMenu(false); if (p === "practice" && phase === "result") { /* keep result visible until user starts new */ } window.scrollTo?.(0, 0); };

  const run = async (input) => {
    lastInput.current = input; setPhase("loading"); setDone([]); setFormError(""); setPage("practice");
    try {
      const { analysis } = await analyzeIELTSWriting(input, (k) => setDone((d) => (d.includes(k) ? d : [...d, k])));
      setRec({ id: uid(), createdAt: Date.now(), task: input.task, module: input.module, qtype: input.qtype, question: input.question, essay: input.essay, wordCount: input.wc, scores: analysis.scores, analysis, extras: {}, saved: false });
      setPhase("result");
      setDraft(EMPTY_DRAFT);
    } catch (e) {
      console.error("[IELTS-AI] analysis failed", e, e?.body || "");
      setErrInfo(describeError(e));
      setPhase("error");
    }
  };
  const analyzeNow = () => {
    const wc = countWords(draft.essay);
    run({ task: draft.task, module: draft.module, qtype: draft.qtype, question: draft.question.trim(), essay: draft.essay.trim(), wc, min: draft.task === 1 ? 150 : 250, target: settings.target });
  };
  const toRecord = (r, extras) => ({ id: r.id, createdAt: r.createdAt, task: r.task, module: r.module, qtype: r.qtype, question: r.question, essay: r.essay, wordCount: r.wordCount, scores: r.scores, analysis: r.analysis, extras: extras || r.extras || {} });
  const save = async (extras) => {
    const record = toRecord(rec, extras);
    await store.set("essay:" + record.id, record);
    setEssays((l) => [...l.filter((e) => e.id !== record.id), record]);
    setRec((r) => ({ ...r, extras: record.extras, saved: true }));
  };
  const onExtras = async (extras) => { const record = toRecord(rec, extras); await store.set("essay:" + record.id, record); setEssays((l) => l.map((e) => (e.id === record.id ? record : e))); };
  const del = async (e) => { await store.del("essay:" + e.id); setEssays((l) => l.filter((x) => x.id !== e.id)); };
  const view = (e) => { setRec({ ...e, saved: true }); setPhase("result"); setPage("practice"); window.scrollTo?.(0, 0); };
  const startPractice = () => { setPage("practice"); setMenu(false); if (phase !== "loading") { setPhase("form"); setRec(null); } window.scrollTo?.(0, 0); };
  const newEssay = () => { setPhase("form"); setRec(null); setDraft(EMPTY_DRAFT); setPage("practice"); window.scrollTo?.(0, 0); };
  const daily = async (task) => {
    const pool = DAILY[task], pick = pool[Math.floor(Math.random() * pool.length)];
    setDraft({ ...draft, task, module: "academic", qtype: pick[0], question: pick[1], essay: "" });
    setDailyBusy(true);
    try { // optional: replace the sample with a freshly generated question
      const r = await api.daily(task);
      if (S(r.question).length > 30) setDraft((d) => ({ ...d, task, qtype: S(r.type) && (task === 1 ? TASK1_TYPES : TASK2_TYPES).includes(S(r.type)) ? S(r.type) : d.qtype, question: S(r.question) }));
    } catch (e) { /* keep the sample question */ }
    setDailyBusy(false);
  };
  const demo = async () => {
    const base = Date.now() - 5 * 7 * 864e5, pat = [[6, 6, 5.5, 5.5], [6, 6.5, 6, 5.5], [6.5, 6.5, 6, 6], [6.5, 7, 6.5, 6], [7, 7, 6.5, 6.5]];
    const items = pat.map((p, i) => {
      const sc = { tr: p[0], cc: p[1], lr: p[2], gra: p[3] }; sc.overall = roundIelts(avg(p));
      return { id: "demo" + i, demo: true, createdAt: base + i * 7 * 864e5, task: i % 3 === 1 ? 1 : 2, module: "academic", qtype: "Demo", question: "Demo entry " + (i + 1), essay: "", wordCount: 240 + i * 10, scores: sc, analysis: null, extras: {} };
    });
    for (const it of items) await store.set("essay:" + it.id, it);
    setEssays((l) => [...l, ...items]);
  };
  const clearDemo = async () => { for (const e of essays.filter((x) => x.demo)) await store.del("essay:" + e.id); setEssays((l) => l.filter((e) => !e.demo)); };
  const clearAll = async () => { for (const e of essays) await store.del("essay:" + e.id); setEssays([]); setVocab([]); };

  const dark = settings.theme === "dark";
  let body;
  if (!ready) body = <div className="ic-page"><div className="ic-wrap"><p className="ic-sub" role="status">Loading…</p></div></div>;
  else if (page === "home") body = <Landing go={go} onSample={() => { setDraft({ task: 2, module: "academic", qtype: TASK2_TYPES[0], question: SAMPLE_Q, essay: SAMPLE_ESSAY }); setPhase("form"); go("practice"); }} />;
  else if (page === "practice") {
    if (phase === "loading") body = <Loading done={done} />;
    else if (phase === "error") body = (
      <div className="ic-page"><div className="ic-wrap" style={{ maxWidth: 760 }}><div className="ic-card" role="alert">
        <h1 style={{ fontSize: 26, marginBottom: 8 }}>Analysis not completed</h1>
        <p className="ic-note bad">Your analysis could not be completed. The technical cause is shown below.</p>
        <p className="ic-sub" style={{ margin: "12px 0" }}>Your question and essay have not been lost.</p>
        {errInfo && <ErrorDetails info={errInfo} />}
        <div className="ic-row" style={{ margin: "16px 0" }}><button type="button" className="ic-btn pri" onClick={() => run(lastInput.current)}>Try again</button><button type="button" className="ic-btn" onClick={() => setPhase("form")}>Back to my essay</button></div>
        <h2 className="ic-h" style={{ fontSize: 18 }}>Connection test</h2>
        <p className="ic-sub" style={{ margin: "2px 0 10px" }}>Sends one tiny request, with no essay, to see whether this runtime can reach the AI at all.</p>
        <Diagnostics />
      </div></div></div>
    );
    else if (phase === "result" && rec) body = <ResultView key={rec.id} rec={rec} settings={settings} essays={essays} vocab={vocab} onAddVocab={addVocab} onSave={save} onExtras={onExtras} onNew={newEssay} onRetry={() => run({ task: rec.task, module: rec.module, qtype: rec.qtype, question: rec.question, essay: rec.essay, wc: rec.wordCount, min: rec.analysis.meta.min, target: settings.target })} onGoEssays={() => go("essays")} />;
    else body = <Practice draft={draft} setDraft={setDraft} settings={settings} onAnalyze={analyzeNow} onDaily={daily} dailyBusy={dailyBusy} formError={formError} />;
  }
  else if (page === "essays") body = <Essays essays={essays} onView={view} onDelete={del} go={go} />;
  else if (page === "vocab") body = <Vocabulary vocab={vocab} setVocab={setVocab} />;
  else if (page === "errors") body = <Errors essays={essays} go={go} />;
  else if (page === "progress") body = <Progress essays={essays} go={go} />;
  else body = <SettingsPage settings={settings} setSettings={setSettings} essays={essays} onDemo={demo} onClearDemo={clearDemo} onClearAll={clearAll} />;

  return (
    <div className="ic" data-theme={settings.theme}>
      <header className="ic-nav">
        <div className="ic-wrap ic-nav-in">
          <button type="button" className="ic-logo" onClick={() => go("home")} aria-label="IELTS Writing AI Coach – home">
            <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect width="30" height="30" rx="8" fill="var(--ink)" /><path d="M7 21 q2-3 4 0 t4 0 t4 0" stroke="#E0524D" strokeWidth="2.2" fill="none" strokeLinecap="round" /><path d="M8 12h14M8 16h9" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" /></svg>
            IELTS Writing AI Coach
          </button>
          <nav className="ic-links" aria-label="Main">{NAV.map(([k, l]) => <button key={k} type="button" className="ic-link" aria-current={page === k ? "page" : undefined} onClick={() => { if (k === "practice" && phase === "result") {} go(k); }}>{l}</button>)}</nav>
          <span className="ic-sp" />
          <button type="button" className="ic-btn sm ghost" onClick={() => setSettings({ ...settings, theme: dark ? "light" : "dark" })} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button type="button" className="ic-btn pri desk" onClick={startPractice}>Analyze Writing</button>
          <button type="button" className="ic-btn sm ic-burger" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Menu">{menu ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
        {menu && <div className="ic-menu">{NAV.map(([k, l]) => <button key={k} type="button" className="ic-link" onClick={() => go(k)}>{l}</button>)}<button type="button" className="ic-btn pri" onClick={startPractice}>Analyze Writing</button></div>}
      </header>
      <main>{body}</main>
      <footer className="ic-foot"><div className="ic-wrap">Estimated bands are AI estimates based on the IELTS band descriptors and are not official IELTS scores.</div></footer>
    </div>
  );
}
