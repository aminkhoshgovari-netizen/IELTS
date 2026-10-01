# IELTS Writing AI Coach

React + Vite frontend, Vercel serverless backend. The Anthropic API key lives **only** on the server.

```
Browser (React)  ──POST /api/analyze──►  Vercel function  ──►  Anthropic Messages API
   src/services/aiService.js              api/*.js + server/*       (key from ANTHROPIC_API_KEY)
```

## Endpoints
| Route | Method | Purpose |
|---|---|---|
| `/api/analyze` | POST | Full IELTS analysis. `?stream=1` streams real progress events, then the result. |
| `/api/generate` | POST | `action`: `model`, `improve`, `compare`, `check`, `define`, `daily` |
| `/api/health` | GET | Reports whether the key is configured. `?ping=1` also makes one tiny Anthropic request. |

`POST /api/analyze` body: `{ task: 1|2, module?: "academic"|"gt", qtype?, question, essay, target?, include?: { modelBands?: number[], improvedEssay?: boolean } }`

Response fields: `taskType, questionType, wordCount, minimumWordCount, meetsMinimum, scores{taskResponse, coherenceCohesion, lexicalResource, grammaticalRangeAccuracy, overall}, scoreRationale, questionAnalysis, taskAnalysis, coherenceAnalysis, vocabularyAnalysis, grammarAnalysis, errors, highlightedSegments, strengths, weaknesses, improvementPlan, topicVocabulary, collocations, modelAnswers, improvedEssay, meta{model, partial[], sections}`.
`modelAnswers` / `improvedEssay` are empty unless requested via `include` (they are slow); the UI generates them on demand through `/api/generate`.

Errors: `{ "error": { "code", "message", "hint", "stage", "upstream", "snippet" } }` — e.g. `missing_api_key`, `anthropic_auth`, `anthropic_billing`, `anthropic_model`, `anthropic_rate_limited`, `anthropic_overloaded`, `upstream_timeout`, `invalid_model_json`, `bad_request`, `rate_limited`.

## Environment variables
Server (Vercel → Settings → Environment Variables): `ANTHROPIC_API_KEY` (required), `ANTHROPIC_MODEL` (optional), `RATE_LIMIT_MAX` (optional), `ALLOWED_ORIGINS` (only if the frontend is on another origin).
Frontend: `VITE_API_BASE_URL` (optional URL, only if the API is on another origin). Never put a key in a `VITE_*` variable.

## Run locally
```bash
npm install
cp .env.example .env        # put your real key in .env (it is git-ignored)
npm run dev:api             # terminal 1 – API on :8787 (Node 20+)
npm run dev                 # terminal 2 – frontend on :5173, proxies /api
npm test                    # backend + contract tests (local stand-in for Anthropic)
```

## Deploy (GitHub + Vercel)
1. `git init && git add . && git commit -m "IELTS Writing AI Coach"`; create an empty GitHub repo; `git remote add origin <url> && git push -u origin main`.
2. vercel.com → Add New → Project → import the repo. Framework preset: **Vite** (auto-detected). Leave build settings as default.
3. Before deploying, add environment variable `ANTHROPIC_API_KEY` (Production + Preview). Optionally `ANTHROPIC_MODEL`.
4. Deploy. Open `https://<your-app>.vercel.app/api/health` → expect `"keyConfigured": true`.
5. Open the app → Settings → AI connection → **Test AI connection**. It should report an Anthropic test request OK.
6. Run an essay. If it fails, the error screen shows the exact code and hint.
7. Changing env vars requires a redeploy.

`vercel.json` sets `maxDuration: 60` for the API functions. A full analysis takes roughly 20–50 s; check the maximum duration your Vercel plan allows.
