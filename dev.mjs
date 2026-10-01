// Local API server (mirrors the Vercel routes). Run:  npm run dev:api   (loads .env)
import http from "node:http";
import analyze from "../api/analyze.js";
import generate from "../api/generate.js";
import health from "../api/health.js";

const routes = { "/api/analyze": analyze, "/api/generate": generate, "/api/health": health };
export function createServer() {
  return http.createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    const h = routes[path];
    if (!h) { res.statusCode = 404; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: { code: "not_found", message: "No such API route: " + path } })); }
    h(req, res);
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.API_PORT || 8787);
  createServer().listen(port, () => console.log(`API listening on http://localhost:${port}  (key configured: ${!!process.env.ANTHROPIC_API_KEY})`));
}
