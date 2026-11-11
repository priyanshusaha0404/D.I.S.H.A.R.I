/**
 * Generates out/sw.js after `next build`: the service worker that makes the whole site work offline.
 *  - app shell (pages, scripts, styles, fonts, glyphs, icons) is cached when the worker installs;
 *  - all data files (≈18 MB) are then cached in the background, with progress shown in the header;
 *  - basemap tiles you look at online are kept (up to a limit) so they also show offline.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../out/", import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(OUT).map((p) => "/" + relative(OUT, p).split(sep).join("/")).filter((u) => u !== "/sw.js");

const manifest = JSON.parse(readFileSync(join(OUT, "data/manifest.json"), "utf8"));
const DV = manifest.version;
const toUrl = (f) => (f.endsWith("/index.html") ? f.slice(0, -"index.html".length) : f);

const shell = [], data = [];
for (const f of files) {
  if (f.startsWith("/data/")) {
    if (/\/thumb_[^/]+\.jpg$/.test(f)) shell.push(f);
    else data.push(`${f}?v=${DV}`);
  } else if (f.endsWith(".map")) continue;
  else shell.push(toUrl(f));
}
const hash = createHash("sha1");
for (const f of files) hash.update(f + statSync(join(OUT, f.slice(1))).size + (f.startsWith("/_next/") ? "" : readFileSync(join(OUT, f.slice(1))).length));
const VERSION = hash.digest("hex").slice(0, 12);
const bytes = files.reduce((s, f) => s + statSync(join(OUT, f.slice(1))).size, 0);

const sw = `/* D.I.S.H.A.R.I service worker — generated ${new Date().toISOString()} */
const VERSION = ${JSON.stringify(VERSION)};
const SHELL_CACHE = "dishari-shell-" + VERSION;
const DATA_CACHE = "dishari-data-${DV}";
const TILE_CACHE = "dishari-tiles";
const SHELL = ${JSON.stringify(shell)};
const DATA = ${JSON.stringify(data)};
const TILE_HOSTS = /(arcgisonline\\.com|arcgis\\.com|tile\\.openstreetmap\\.(org|fr)|basemaps\\.cartocdn\\.com|opentopomap\\.org|tiles\\.maps\\.eox\\.at|gibs\\.earthdata\\.nasa\\.gov)$/;
const MAX_TILES = 6000;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    // cache in small batches so one slow file does not block the rest
    for (let i = 0; i < SHELL.length; i += 12) await Promise.all(SHELL.slice(i, i + 12).map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => undefined)));
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if ((k.startsWith("dishari-shell-") && k !== SHELL_CACHE) || (k.startsWith("dishari-data-") && k !== DATA_CACHE)) await caches.delete(k);
    await self.clients.claim();
  })());
});

let job = null;
async function status() {
  const c = await caches.open(DATA_CACHE);
  const have = new Set((await c.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search));
  const missing = DATA.filter((u) => !have.has(u));
  return { done: DATA.length - missing.length, total: DATA.length, missing };
}
async function broadcast(msg) { for (const cl of await self.clients.matchAll({ includeUncontrolled: true })) cl.postMessage(msg); }
async function precache() {
  if (job) return job;
  job = (async () => {
    const c = await caches.open(DATA_CACHE);
    let { done, total, missing } = await status();
    for (const u of missing) {
      try {
        const r = await fetch(u, { cache: "no-cache" });
        if (r.ok) { await c.put(u, r); done++; }
      } catch (err) { break; }
      await broadcast({ type: "progress", done, total });
    }
    if (done >= total) await broadcast({ type: "ready", total });
  })().finally(() => { job = null; });
  return job;
}

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "skipWaiting") self.skipWaiting();
  if (d.type === "status") e.waitUntil((async () => {
    const s = await status();
    e.source && e.source.postMessage({ type: "status", done: s.done, total: s.total, complete: s.done >= s.total });
    if (s.done < s.total) await precache();
  })());
});

async function trimTiles(c) {
  const keys = await c.keys();
  if (keys.length > MAX_TILES) for (const k of keys.slice(0, keys.length - MAX_TILES)) await c.delete(k);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    if (TILE_HOSTS.test(url.hostname)) e.respondWith((async () => {
      const c = await caches.open(TILE_CACHE);
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === "opaque") { c.put(req, r.clone()); if (Math.random() < 0.02) trimTiles(c); } return r; }).catch(() => hit || Response.error());
      return hit || net;
    })());
    return;
  }
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/data/")) {
    e.respondWith((async () => {
      const c = await caches.open(DATA_CACHE);
      const hit = (await c.match(req)) || (await caches.match(req));
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r.ok && url.searchParams.get("v") === ${JSON.stringify(DV)}) c.put(req, r.clone());
        return r;
      } catch (err) {
        return (await caches.match(req, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const path = url.pathname.endsWith("/") || url.pathname.includes(".") ? url.pathname : url.pathname + "/";
      const hit = await caches.match(path, { ignoreSearch: true });
      if (hit) return hit;
      try { return await fetch(req); } catch (err) { return (await caches.match("/", { ignoreSearch: true })) || Response.error(); }
    })());
    return;
  }
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: url.pathname.endsWith(".txt") || url.pathname.startsWith("/_next/") });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok && (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/glyphs/") || url.pathname.endsWith(".txt"))) (await caches.open(SHELL_CACHE)).put(req, r.clone());
      return r;
    } catch (err) {
      return Response.error();
    }
  })());
});
`;
writeFileSync(join(OUT, "sw.js"), sw);
console.log(`sw.js: ${shell.length} shell files, ${data.length} data files, ${(bytes / 1e6).toFixed(1)} MB in out/, version ${VERSION}`);
