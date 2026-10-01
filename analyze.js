// POST /api/analyze
// Body: { task: 1|2, module?: "academic"|"gt", qtype?: string, question: string, essay: string,
//         target?: number, include?: { modelBands?: number[], improvedEssay?: boolean } }
// Query: ?stream=1 streams newline-delimited JSON progress events, then the result:
//   {"type":"step","step":"task"} ... {"type":"result","data":{...}} | {"type":"error","error":{...}}
// Without ?stream=1 it returns the result JSON in one response.
import { ApiError, applyCors, readJson, rateLimit, requireMethod, sendJson, sendError, errorBody } from "../server/http.js";
import { parseAnalyzeInput } from "../server/validate.js";
import { runAnalysis } from "../server/analysis.js";

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  try {
    requireMethod(req, "POST");
    if (!process.env.ANTHROPIC_API_KEY) throw new ApiError("missing_api_key", 500, "ANTHROPIC_API_KEY is not configured on the server.");
    rateLimit(req);
    const input = parseAnalyzeInput(await readJson(req), ApiError);
    const stream = new URL(req.url, "http://localhost").searchParams.get("stream") === "1";
    if (!stream) return sendJson(res, 200, await runAnalysis(input));

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    const write = (o) => res.write(JSON.stringify(o) + "\n");
    try { write({ type: "result", data: await runAnalysis(input, (step) => write({ type: "step", step })) }); }
    catch (e) { console.error("[api/analyze]", e?.code, e?.message); write({ type: "error", error: errorBody(e) }); }
    res.end();
  } catch (e) { sendError(res, e); }
}
