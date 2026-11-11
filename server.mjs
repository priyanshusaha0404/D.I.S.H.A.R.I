// D.I.S.H.A.R.I — one small server, no extra packages: serves the built site (out/) and the AI assistant (/api/ai).
// The AI key lives ONLY here, in the .env file (or the host's environment) — the browser never sees it.
//   GEMINI_API_KEY=...            (Google AI Studio key)        GEMINI_MODEL=gemini-flash-latest
//   or OPENAI_API_KEY=... OPENAI_MODEL=gpt-4.1-mini OPENAI_BASE=https://api.openai.com/v1   (any OpenAI-compatible service)
//   AI_PROVIDER=gemini|openai (optional)   PORT=3100
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "out");

// ------------------------------------------------------------------ .env
for (const f of [".env", ".env.local"]) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined || process.env[m[1]] === "") process.env[m[1]] = v;
  }
}
const ENV = process.env;
const PORT = Number(ENV.PORT || 3100);
// many keys: GEMINI_API_KEYS=key1,key2,key3 (and/or GEMINI_API_KEY, GEMINI_API_KEY_2 … _20) — when one hits its limit the next is used
const GEMINI_KEYS = [...new Set([ENV.GEMINI_API_KEYS, ENV.GEMINI_API_KEY, ENV.GOOGLE_API_KEY, ...Array.from({ length: 20 }, (_, i) => ENV[`GEMINI_API_KEY_${i + 1}`])]
  .flatMap((k) => String(k || "").split(/[,;\s]+/)).map((k) => k.trim()).filter(Boolean))];
const GEMINI_KEY = GEMINI_KEYS[0] || "";
let keyAt = 0;
const cool = new Map();   // key -> time it can be used again
const OPENAI_KEY = ENV.OPENAI_API_KEY || "";
const PROVIDER = (ENV.AI_PROVIDER || (GEMINI_KEY ? "gemini" : OPENAI_KEY || ENV.OPENAI_BASE ? "openai" : "")).toLowerCase();
const GEMINI_MODELS = [...new Set([ENV.GEMINI_MODEL || "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"])];
const OPENAI_BASE = (ENV.OPENAI_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_MODEL = ENV.OPENAI_MODEL || "gpt-4.1-mini";
const ALLOW = (ENV.ALLOW_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------------ static files
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".geojson": "application/geo+json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".pbf": "application/x-protobuf",
  ".bin": "application/octet-stream", ".txt": "text/plain; charset=utf-8", ".pdf": "application/pdf", ".mp3": "audio/mpeg", ".wasm": "application/wasm" };
const ZIP = new Set([".html", ".js", ".mjs", ".css", ".json", ".geojson", ".svg", ".webmanifest", ".txt", ".bin", ".pbf"]);
const gzCache = new Map();

function fileFor(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  p = normalize(p).replace(/^(\.\.[/\\])+/, "");
  let f = join(OUT, p);
  if (!f.startsWith(OUT)) return null;
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f) && !extname(f)) f = join(OUT, p, "index.html");
  return existsSync(f) && statSync(f).isFile() ? f : null;
}
function serveStatic(req, res) {
  const url = req.url || "/";
  let f = fileFor(url);
  let status = 200;
  if (!f) { f = join(OUT, "404.html"); status = 404; if (!existsSync(f)) { res.writeHead(404); return res.end("Not found"); } }
  const ext = extname(f).toLowerCase();
  const st = statSync(f);
  const headers = { "Content-Type": MIME[ext] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" };
  if (url.startsWith("/_next/static/")) headers["Cache-Control"] = "public, max-age=31536000, immutable";
  else if (url.startsWith("/data/")) headers["Cache-Control"] = "public, max-age=3600";
  else headers["Cache-Control"] = "no-cache";
  const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
  headers.ETag = etag;
  if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end(); }
  if (ZIP.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "") && st.size > 1024) {
    let hit = gzCache.get(f);
    if (!hit || hit.m !== st.mtimeMs) { hit = { m: st.mtimeMs, b: gzipSync(readFileSync(f), { level: 6 }) }; if (st.size < 30e6) gzCache.set(f, hit); }
    res.writeHead(status, { ...headers, "Content-Encoding": "gzip", "Content-Length": hit.b.length, Vary: "Accept-Encoding" });
    return res.end(req.method === "HEAD" ? undefined : hit.b);
  }
  res.writeHead(status, { ...headers, "Content-Length": st.size });
  if (req.method === "HEAD") return res.end();
  createReadStream(f).pipe(res);
}

// ------------------------------------------------------------------ AI
const hits = new Map();   // simple per-IP rate limit: 30 requests / 5 minutes
function limited(ip) {
  const now = Date.now(), w = (hits.get(ip) || []).filter((t) => now - t < 300000);
  w.push(now); hits.set(ip, w);
  if (hits.size > 5000) hits.clear();
  return w.length > 30;
}
function readBody(req, max = 12e6) {
  return new Promise((ok, bad) => {
    let n = 0; const chunks = [];
    req.on("data", (c) => { n += c.length; if (n > max) { bad(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", bad);
  });
}
async function post(url, headers, body, ms = 45000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: ac.signal });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch { /* not JSON */ }
    if (!r.ok) { const e = new Error(`${r.status}: ${(j && j.error && j.error.message) || txt.slice(0, 200)}`); e.status = r.status; throw e; }
    return j || {};
  } finally { clearTimeout(t); }
}
const clip = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");
async function askGemini({ system, history, text, images, tools }) {
  const contents = [...history.map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] })),
    { role: "user", parts: [...images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.data } })), { text: text || "(photo)" }] }];
  const body = { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.3 } };
  if (tools.length) { body.tools = [{ functionDeclarations: tools }]; body.toolConfig = { functionCallingConfig: { mode: "AUTO" } }; }
  let last;
  const now = Date.now();
  const order = GEMINI_KEYS.map((_, i) => GEMINI_KEYS[(keyAt + i) % GEMINI_KEYS.length]);
  const ready = order.filter((k) => !(cool.get(k) > now));
  for (const key of ready.length ? ready : order) {
    for (const model of GEMINI_MODELS) {
      try {
        const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": key }, body);
        keyAt = (GEMINI_KEYS.indexOf(key) + 1) % GEMINI_KEYS.length;   // spread the load over all keys
        const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        return { text: parts.map((p) => p.text || "").join("").trim(), calls: parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} })), model };
      } catch (e) {
        last = e;
        if (e.status === 404 || e.status === 400) continue;                                   // try the next model
        if (e.status === 429 || e.status === 403 || e.status === 401 || e.status >= 500) { cool.set(key, Date.now() + (e.status === 429 ? 60000 : 600000)); break; }   // next key
        throw e;
      }
    }
  }
  throw last;
}
async function askOpenAI({ system, history, text, images, tools }) {
  const user = images.length ? [{ type: "text", text: text || "(photo)" }, ...images.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.data}` } }))] : text;
  const body = { model: OPENAI_MODEL, temperature: 0.3, messages: [{ role: "system", content: system }, ...history.map((h) => ({ role: h.role, content: h.text })), { role: "user", content: user }] };
  if (tools.length) { body.tools = tools.map((t) => ({ type: "function", function: t })); body.tool_choice = "auto"; }
  const j = await post(`${OPENAI_BASE}/chat/completions`, OPENAI_KEY ? { Authorization: `Bearer ${OPENAI_KEY}` } : {}, body);
  const msg = j.choices && j.choices[0] && j.choices[0].message || {};
  const calls = (msg.tool_calls || []).map((c) => { let args = {}; try { args = JSON.parse(c.function.arguments || "{}"); } catch { /* bad JSON */ } return { name: c.function.name, args }; });
  return { text: (msg.content || "").trim(), calls, model: OPENAI_MODEL };
}
function send(res, status, obj, cors) {
  const b = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors });
  res.end(b);
}
async function api(req, res) {
  const origin = req.headers.origin || "";
  const cors = origin && (ALLOW.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", Vary: "Origin" } : {};
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.url.startsWith("/api/ai/health")) return send(res, 200, { ok: !!PROVIDER && (PROVIDER !== "gemini" || !!GEMINI_KEY), provider: PROVIDER || null, vision: true }, cors);
  if (req.url.split("?")[0] !== "/api/ai" || req.method !== "POST") return send(res, 404, { error: "not found" }, cors);
  if (!PROVIDER || (PROVIDER === "gemini" && !GEMINI_KEY)) return send(res, 503, { error: "AI is not set up on the server (add GEMINI_API_KEY to .env)" }, cors);
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return send(res, 429, { error: "Too many requests — try again in a few minutes" }, cors);
  let q;
  try { q = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: "bad request" }, cors); }
  const input = {
    system: clip(q.system, 9000), text: clip(q.text, 2000),
    history: (Array.isArray(q.history) ? q.history : []).slice(-10).map((h) => ({ role: h && h.role === "assistant" ? "assistant" : "user", text: clip(h && h.text, 1200) })).filter((h) => h.text),
    images: (Array.isArray(q.images) ? q.images : []).slice(0, 4).filter((im) => im && /^image\/(jpeg|png|webp)$/.test(im.mime) && typeof im.data === "string" && im.data.length < 3e6),
    tools: (Array.isArray(q.tools) ? q.tools : []).slice(0, 40),
  };
  if (!input.text && !input.images.length) return send(res, 400, { error: "empty" }, cors);
  try {
    const r = PROVIDER === "openai" ? await askOpenAI(input) : await askGemini(input);
    send(res, 200, r, cors);
  } catch (e) {
    console.warn("[ai]", e.message);
    send(res, 502, { error: String(e.message || e).slice(0, 300) }, cors);
  }
}

createServer((req, res) => {
  if ((req.url || "").startsWith("/api/")) return void api(req, res).catch((e) => { console.error(e); try { send(res, 500, { error: "server error" }, {}); } catch { /* closed */ } });
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  if (!existsSync(OUT)) { res.writeHead(503, { "Content-Type": "text/plain" }); return res.end("Build the site first: npm run build"); }
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`\n  D.I.S.H.A.R.I is running →  http://localhost:${PORT}\n  AI assistant: ${PROVIDER ? `${PROVIDER} (${PROVIDER === "gemini" ? GEMINI_KEYS.length : 1} key${GEMINI_KEYS.length > 1 ? "s" : ""} from .env)` : "built-in only — add GEMINI_API_KEY to .env for the AI model"}\n`);
});
