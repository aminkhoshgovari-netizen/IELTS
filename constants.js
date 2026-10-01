/* ------------------------------ 1. constants ------------------------------ */
export const TASK1_TYPES = ["Line graph", "Bar chart", "Pie chart", "Table", "Process", "Map", "Mixed charts", "Other"];
export const TASK1_GT = ["Formal letter", "Semi-formal letter", "Informal letter"];
export const TASK2_TYPES = [
  "Opinion / Agree or Disagree",
  "Discussion",
  "Advantages / Disadvantages",
  "Problem / Solution",
  "Two-part question",
  "Mixed / Other",
];
export const TARGETS = [6, 6.5, 7, 7.5, 8, 8.5, 9];
export const MODEL_BANDS = [7, 7.5, 8, 8.5, 9];
export const CRITERIA = [
  { key: "tr", short: "Task Response", long: "Task Response / Task Achievement" },
  { key: "cc", short: "Coherence & Cohesion", long: "Coherence & Cohesion" },
  { key: "lr", short: "Lexical Resource", long: "Lexical Resource" },
  { key: "gra", short: "Grammar", long: "Grammatical Range & Accuracy" },
];
export const CATS = {
  grammar: { label: "Grammar", color: "#E0524D" },
  vocabulary: { label: "Vocabulary", color: "#8B6CF0" },
  spelling: { label: "Spelling", color: "#E58A2B" },
  punctuation: { label: "Punctuation", color: "#1FA3A3" },
  cohesion: { label: "Cohesion", color: "#3B82E0" },
  task: { label: "Task relevance", color: "#D1479B" },
  structure: { label: "Sentence structure", color: "#7FA82E" },
  wordchoice: { label: "Word choice", color: "#C9A227" },
};
export const SEVERITY = {
  major: "Major error – affects meaning, accuracy or readability",
  minor: "Minor error – clarity is not seriously affected",
  precision: "Correct, but could be more precise",
};

export const SAMPLE_Q =
  "Some people believe that university students should be required to do unpaid community work as part of their degree. To what extent do you agree or disagree?";
export const SAMPLE_ESSAY = `In this day and age, it is an undeniable fact that universities are not only places for study. Some people think that students must do unpaid community work as a part of their degree. I partly agree with this opinion because it gives students useful experience, but it also have some problems.

Firstly, community work help students to develop skills that they can not learn in the classroom. For example, a student who volunteer at a local hospital learn how to communicate with different people and work under pressure. These skills is very important for their future career. Moreover, students become more responsible to their society, which is also important thing for a country.

However, I think that force students to work without payment is not fair. Many students have to pay for accommodation and food, so they needs to have a part-time job. If the university require them to do unpaid work, they will have less time for study and their grades may become worst. In addition, some students may do the work only because it is compulsory, so they will not get real benefit from it. Nowadays, social media is very popular among young people and it makes them spend too much time online.

In conclusion, unpaid community work is good for students, but it should not be compulsory for everyone. Universities should encourage students to join volunteering programs and offer some credit, then they can have motivation and balance their time.`;

// Sample/demo prompts for Daily Practice (clearly labelled as samples in the UI)
export const DAILY = {
  2: [
    ["Opinion / Agree or Disagree", "Some people think that governments should spend money on public transport rather than building new roads. To what extent do you agree or disagree?"],
    ["Discussion", "Some people believe that children should start learning a foreign language at primary school, while others think secondary school is a better time. Discuss both views and give your own opinion."],
    ["Advantages / Disadvantages", "More and more people are choosing to work from home. Do the advantages of this development outweigh the disadvantages?"],
    ["Problem / Solution", "In many cities, the amount of household waste is increasing rapidly. What problems does this cause, and what solutions can you suggest?"],
    ["Two-part question", "Many young people now spend several hours a day on social media. Why is this happening? Is it a positive or negative development?"],
    ["Opinion / Agree or Disagree", "Some people say that artificial intelligence will make teachers unnecessary in the future. To what extent do you agree or disagree?"],
  ],
  1: [
    ["Table", "The table below shows the percentage of households with internet access in four countries in 2000, 2010 and 2020.\n\nCountry | 2000 | 2010 | 2020\nSweden | 51% | 88% | 97%\nBrazil | 3% | 40% | 81%\nKenya | 1% | 10% | 42%\nJapan | 47% | 78% | 93%\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant."],
    ["Line graph", "The line graph shows the average number of cinema visits per person per year in three countries between 1990 and 2020 (data in text form).\n\nUSA: 1990 – 5.1, 2000 – 5.4, 2010 – 4.3, 2020 – 1.9\nFrance: 1990 – 2.2, 2000 – 2.9, 2010 – 3.3, 2020 – 1.4\nChina: 1990 – 0.8, 2000 – 0.9, 2010 – 1.6, 2020 – 1.1\n\nSummarise the information by selecting and reporting the main features, and make comparisons where relevant."],
    ["Process", "The diagram shows how plastic bottles are recycled into clothing fibre. Stages: 1) bottles are collected; 2) sorted by colour; 3) washed and shredded into flakes; 4) flakes melted and pushed through a spinneret into fibres; 5) fibres spun into yarn; 6) yarn woven into fabric.\n\nSummarise the information by selecting and reporting the main features."],
  ],
};

/* ------------------------------ utilities --------------------------------- */
export const countWords = (t) => (t || "").trim().split(/\s+/).filter(Boolean).length;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const fmtBand = (n) => (n == null || isNaN(n) ? "–" : Number(n).toFixed(1));
export const roundIelts = (x) => Math.round(x * 2) / 2; // .25 -> .5, .75 -> 1.0 (IELTS averaging rule)
export const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
export const normQ = (q) => (q || "").toLowerCase().replace(/\s+/g, " ").trim();
export const STOP = new Set("that this with have from they their them there which would could should about because while when where what will been were being also more most some such than then these those into over only other very just like people many much even each make made does doing its it's and the for are but not you your our can may might".split(" "));
export function repeatedWords(text) {
  const words = (text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).filter((w) => !STOP.has(w));
  const m = {};
  words.forEach((w) => (m[w] = (m[w] || 0) + 1));
  return Object.entries(m).filter(([, c]) => c >= 4).sort((a, b) => b[1] - a[1]).slice(0, 6);
}
export const speak = (text) => {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) { /* speech not supported */ }
};


/* ------------------------ small validation helpers ------------------------ */
export const S = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
export const A = (v) => (Array.isArray(v) ? v : []);
export const strs = (v, n = 6) => A(v).map(S).filter(Boolean).slice(0, n);
