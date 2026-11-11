"use client";
/** The AI model behind the assistant. It runs on the site's own server (server.mjs, key in .env — users never enter a
 *  key). The model reads the message and any photos, answers, and calls the agent tools; the same agents then do the
 *  work on the site, so answers stay grounded in the site's own data and the D.I.S.H.A.R.I models. Without the server
 *  the built-in coordinator does everything. */
import type { Lang } from "../i18n";
import { loadCatalog } from "../data/catalog";
import { searchIndex, searchPlaces, type IndexRow } from "../data/search";
import { BASEMAPS } from "../map/basemaps";
import { getTrip } from "../trip/store";
import { basemapIn, comparePairIn, mem, type Job, type TripPlanJob } from "./agents";
import { placesIn, variableIn, type Fmt, type Theme } from "./nlu";
import type { Plan } from "./router";
import type { Img } from "./store";
import { ZONES, type Zone } from "../zones";

/* ------------------------------------------------------------------ the tools the model may call */
type Schema = Record<string, unknown>;
const S = (description: string, e: Schema = {}): Schema => ({ type: "string", description, ...e });
const N = (description: string): Schema => ({ type: "number", description });
const B = (description: string): Schema => ({ type: "boolean", description });
const O = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: "object", properties, required });
const THEMES = ["tiger", "fish", "crab", "honey", "environment"];
const PAGES = ["map", "trip", "pois", "nearby", "dashboard", "saved"];
const DATASETS = ["villages", "admin", "islands", "protected", "points", "waterways"];
const NEAR = ["health", "police", "shelter", "ghat", "bank", "market", "school", "temple", "village", "any"];
const PLACE = S("place name as the user wrote it (village, town, ghat, block, district, island, river, forest); 'here' for the user's location, 'there' for the last place talked about");

const ALL_TOOLS: { name: string; description: string; parameters: Schema }[] = [
  { name: "show_place", description: "Fly the map to a place, outline it and show its key facts", parameters: O({ place: PLACE }, ["place"]) },
  { name: "place_facts", description: "Facts and statistics about a place: population, area, mangrove, salinity, elevation, legal status, tiger habitat …", parameters: O({ place: PLACE }, ["place"]) },
  { name: "show_layer", description: "Show a map layer: one of the hexagon variables (by key) or a theme page", parameters: O({ variable: S("variable key from the list in the instructions"), theme: S("theme page", { enum: THEMES }) }) },
  { name: "set_basemap", description: "Change the basemap", parameters: O({ basemap: S("basemap id", { enum: ["esri_imagery", "osm", "esri_streets", "esri_topo"] }) }, ["basemap"]) },
  { name: "set_view", description: "3D/2D map, dark/light theme, site language, place labels", parameters: O({ view3d: B("true = tilted 3D map with hexagon columns"), dark: B("dark theme"), language: S("site language", { enum: ["en", "bn"] }), labels: B("place-name labels on the map") }) },
  { name: "compare_swipe", description: "Swipe-compare two dates on the map", parameters: O({ pair: S("what to compare", { enum: ["landsat_2010_2025", "mangrove_2016_2025", "greenness_2017_2025", "shoreline", "true_false_colour"] }) }, ["pair"]) },
  { name: "open_page", description: "Open a page of the site", parameters: O({ page: S("page", { enum: PAGES }) }, ["page"]) },
  { name: "plan_trip", description: "Plan a smart trip through places by boat, on foot or both, with stays, leaving time and tide (the tide is read from the forecast when not given)", parameters: O({
    stops: { type: "array", description: "places in visiting order, first = start", items: O({ place: PLACE, stay_minutes: N("minutes to stay there") }, ["place"]) },
    from_my_location: B("start from the user's current location"), leave_at: S("leaving time as local date-time YYYY-MM-DDTHH:MM (India time)"),
    mode: S("travel mode", { enum: ["boat", "walk", "multimodal"] }), vessel: S("boat type", { enum: ["motor_boat", "country_boat"] }), tide: S("tide", { enum: ["auto", "low", "high"] }),
    return_to_start: B("come back to the start"), best_order: B("reorder the middle places for the shortest trip"), stay_each_minutes: N("minutes to stay at every place") }, ["stops"]) },
  { name: "trip_action", description: "Act on the current trip: start the 3D trip, start live GPS tracking, download its report or files, save, share or clear it", parameters: O({ action: S("action", { enum: ["start_3d", "live_tracking", "report_pdf", "report_word", "report_excel", "gpx", "geojson", "google_maps", "share_link", "save", "clear"] }) }, ["action"]) },
  { name: "change_trip", description: "Change the current trip's settings and plan it again", parameters: O({ mode: S("travel mode", { enum: ["boat", "walk", "multimodal"] }), vessel: S("boat type", { enum: ["motor_boat", "country_boat"] }), tide: S("tide", { enum: ["auto", "low", "high"] }),
    leave_at: S("local date-time YYYY-MM-DDTHH:MM"), return_to_start: B("come back to the start"), best_order: B("best order") }) },
  { name: "add_to_trip", description: "Add a place to the current trip", parameters: O({ place: PLACE }, ["place"]) },
  { name: "remove_from_trip", description: "Remove a place from the current trip", parameters: O({ place: PLACE }, ["place"]) },
  { name: "make_report", description: "Download a report (PDF, Word or Excel) for a place, a district/block/island, a theme, the whole study area, or a picture of the current map", parameters: O({
    kind: S("what the report is about", { enum: ["place", "theme", "whole_area", "map"] }), place: PLACE, theme: S("theme", { enum: THEMES }), format: S("file format", { enum: ["pdf", "docx", "xlsx", "png"] }) }, ["kind"]) },
  { name: "download_dataset", description: "Download one of the site's datasets", parameters: O({ dataset: S("dataset", { enum: DATASETS }), format: S("format", { enum: ["csv", "xlsx", "geojson"] }) }, ["dataset"]) },
  { name: "find_best_areas", description: "Mark on the map the best spots the D.I.S.H.A.R.I models predict for honey, fishing, crab or seeing tigers near a place, so the user can pick some for a trip (National Park core left out)", parameters: O({ theme: S("livelihood or theme", { enum: ["fish", "crab", "honey", "tiger"] }), near_place: PLACE, nearest: B("closest good spots first"), radius_km: N("search radius in km (default 25)") }, ["theme"]) },
  { name: "plan_mission", description: "Plan a boat trip for a livelihood from the models' predictions: go for honey / fish / crab / tiger watching, optionally do something else on the way back, and return to the start. Use for messages like 'ami modhu ante jabo', 'ferar pothe mach o dhorbo', 'amar nearest gulo te jabo'.",
    parameters: O({ goals: { type: "array", description: "what to do on the way out, in order", items: S("goal", { enum: ZONES }) }, on_way_back: { type: "array", description: "what to do on the way back", items: S("goal", { enum: ZONES }) },
      nearest: B("prefer the nearest good spots"), start: PLACE, from_my_location: B("start from the user's location"), leave_at: S("leaving time YYYY-MM-DDTHH:MM (India time)") }, ["goals"]) },
  { name: "check_place", description: "Is a place open, permit-only or no-entry, and how much tiger habitat and exposure is there", parameters: O({ place: PLACE }, ["place"]) },
  { name: "best_time", description: "Best tide and time to go by boat between two places", parameters: O({ from: PLACE, to: PLACE }, ["from", "to"]) },
  { name: "rank_areas", description: "Rank blocks, villages, islands or districts by a metric", parameters: O({ metric: S("'population', 'area', 'density' or a variable key"), level: S("level", { enum: ["block", "village", "island", "district"] }), top_n: N("how many"), lowest: B("lowest first"), within_place: S("block or district to stay inside") }, ["metric", "level"]) },
  { name: "get_value", description: "One number for a place or the whole study area", parameters: O({ metric: S("'population', 'area', 'density' or a variable key"), place: PLACE }, ["metric"]) },
  { name: "count", description: "How many villages, ghats or service points there are", parameters: O({ what: S("what", { enum: ["village", "jetty", "poi"] }), within_place: S("block or district") }, ["what"]) },
  { name: "nearest", description: "Nearest hospitals, police, cyclone shelters, ghats, banks, markets, schools, temples or villages to a place or to the user", parameters: O({ category: S("category", { enum: NEAR }), near_place: PLACE }, ["category"]) },
  { name: "distance", description: "Distance and travel time between two places", parameters: O({ from: PLACE, to: PLACE }, ["from", "to"]) },
  { name: "weather", description: "Weather now, the next hours and the tide times at a place", parameters: O({ place: PLACE }) },
  { name: "emergency", description: "Emergency numbers and the nearest health and help points", parameters: O({ place: PLACE }) },
  { name: "explain", description: "Explain a term or a data layer of the site (hexagon, legal status, navigable water, tide, NDVI, ROC-AUC, Moran's I, a variable …)", parameters: O({ topic: S("the term") }, ["topic"]) },
  { name: "how_to", description: "Step-by-step help for using the site (reports, trips, offline, basemaps, compare, layers, saving, measuring)", parameters: O({ topic: S("the task") }, ["topic"]) },
];

export const TOOLS = ALL_TOOLS.filter((t) => !["show_layer", "compare_swipe"].includes(t.name));

/* ------------------------------------------------------------------ turning tool calls into agent jobs */
async function resolvePlace(name: unknown, pref: "trip" | "area" | "any" = "any"): Promise<IndexRow | null | "here"> {
  if (typeof name !== "string" || !name.trim()) return null;
  const n = name.trim();
  if (/^(here|me|my location|current location|near me|amar location|আমার অবস্থান|এখানে)$/i.test(n)) return "here";
  if (/^(there|it|that place|the last place|okhane|sekhane|ওখানে|সেখানে)$/i.test(n)) return mem.place;
  const hits = await placesIn(n, pref);
  if (hits[0]) return hits[0].row;
  const r = await searchPlaces(n, { limit: 1 });
  const top = r.results[0];
  if (!top || top.score < 0.9) return null;
  return (await searchIndex()).find((x) => x.type === top.type && x.id === top.id) || null;
}
const place = async (name: unknown, pref: "trip" | "area" | "any" = "area") => { const p = await resolvePlace(name, pref); return p === "here" ? null : p; };
function localTime(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}
const PAIR_WORD: Record<string, string> = { landsat_2010_2025: "landsat", mangrove_2016_2025: "mangrove", greenness_2017_2025: "ndvi", shoreline: "shoreline", true_false_colour: "false" };
const PAGE_PATH: Record<string, string> = { map: "/", trip: "/route/", pois: "/pois/", nearby: "/nearby/", dashboard: "/dashboard/", saved: "/my/" };

async function metricOf(x: unknown): Promise<string | null> {
  if (typeof x !== "string") return null;
  if (/^(population|area|density)$/i.test(x)) return x.toLowerCase();
  const cat = await loadCatalog();
  if (cat.variables.some((v) => v.key === x)) return x;
  return (await variableIn(x))?.key ?? null;
}
export async function toJobs(calls: { name: string; args: Record<string, unknown> }[], lang: Lang): Promise<{ jobs: Job[]; missing: string[] }> {
  const jobs: Job[] = [], missing: string[] = [];
  const need = async (name: unknown, pref: "trip" | "area" | "any" = "area") => { const p = await place(name, pref); if (!p && typeof name === "string" && !/^(here|me)$/i.test(name)) missing.push(name); return p; };
  const fmt = (x: unknown, ok: Fmt[], d: Fmt): Fmt => (ok.includes(x as Fmt) ? (x as Fmt) : d);
  for (const { name, args: a } of calls) {
    switch (name) {
      case "show_place": { const p = await need(a.place); if (p) jobs.push({ a: "map", kind: "goto", place: p, alts: [] }); break; }
      case "place_facts": { const p = await need(a.place); if (p) jobs.push({ a: "place", kind: "about", place: p, alts: [] }); break; }
      case "show_layer": {
        const k = await metricOf(a.variable);
        if (k && !/^(population|area|density)$/.test(k)) jobs.push({ a: "map", kind: "layer", varKey: k });
        else if (THEMES.includes(String(a.theme))) jobs.push({ a: "map", kind: "layer", theme: a.theme as Theme });
        break;
      }
      case "set_basemap": { const id = BASEMAPS.some((b) => b.id === a.basemap) ? String(a.basemap) : basemapIn(String(a.basemap || "")); if (id) jobs.push({ a: "map", kind: "basemap", id }); break; }
      case "set_view": {
        if (typeof a.dark === "boolean" || a.language === "en" || a.language === "bn" || typeof a.labels === "boolean")
          jobs.push({ a: "map", kind: "look", dark: typeof a.dark === "boolean" ? a.dark : undefined, lang: a.language === "en" || a.language === "bn" ? a.language : undefined, labels: typeof a.labels === "boolean" ? a.labels : undefined });
        if (typeof a.view3d === "boolean") jobs.push({ a: "map", kind: "view3d", on: a.view3d });
        break;
      }
      case "compare_swipe": { const p = comparePairIn(PAIR_WORD[String(a.pair)] || String(a.pair || "")); jobs.push({ a: "map", kind: "compare", left: p.left, right: p.right, label: lang === "bn" ? p.bn : p.en }); break; }
      case "open_page": { const path = PAGE_PATH[String(a.page)]; if (path) jobs.push({ a: "map", kind: "page", path, label: String(a.page) }); break; }
      case "plan_trip": {
        const list = Array.isArray(a.stops) ? (a.stops as { place?: unknown; stay_minutes?: unknown }[]) : [];
        const stops: TripPlanJob["stops"] = [];
        let fromMe = a.from_my_location === true;
        for (const [i, s] of list.entries()) {
          const p = await resolvePlace(s?.place, "trip");
          if (p === "here") { if (i === 0) fromMe = true; continue; }
          if (!p) { if (typeof s?.place === "string") missing.push(s.place); continue; }
          stops.push({ row: p, stay: typeof s.stay_minutes === "number" ? Math.max(0, Math.round(s.stay_minutes)) : null });
        }
        const md = ["boat", "walk", "multimodal"].includes(String(a.mode)) ? (a.mode as TripPlanJob["mode"]) : null;
        jobs.push({ a: "trip", kind: "plan", stops, fromMe, leaveAt: localTime(a.leave_at), mode: md, vessel: a.vessel === "motor_boat" || a.vessel === "country_boat" ? a.vessel : null,
          tide: a.tide === "low" || a.tide === "high" || a.tide === "auto" ? a.tide : null, back: a.return_to_start === true, best: a.best_order === true,
          each: typeof a.stay_each_minutes === "number" ? Math.round(a.stay_each_minutes) : null });
        break;
      }
      case "change_trip": jobs.push({ a: "trip", kind: "tweak", mode: ["boat", "walk", "multimodal"].includes(String(a.mode)) ? (a.mode as TripPlanJob["mode"]) : null,
        vessel: a.vessel === "motor_boat" || a.vessel === "country_boat" ? a.vessel : null, tide: a.tide === "low" || a.tide === "high" || a.tide === "auto" ? a.tide : null,
        leaveAt: localTime(a.leave_at), back: typeof a.return_to_start === "boolean" ? a.return_to_start : null, best: typeof a.best_order === "boolean" ? a.best_order : null }); break;
      case "add_to_trip": { const p = await need(a.place, "trip"); if (p) jobs.push({ a: "trip", kind: "add", place: p }); break; }
      case "remove_from_trip": { const p = await need(a.place, "trip"); if (p) jobs.push({ a: "trip", kind: "remove", place: p }); break; }
      case "trip_action": {
        const x = String(a.action);
        if (x === "start_3d" || x === "live_tracking") jobs.push({ a: "trip", kind: "start3d", live: x === "live_tracking" });
        else if (x.startsWith("report_")) jobs.push({ a: "report", kind: "trip", fmt: x === "report_word" ? "docx" : x === "report_excel" ? "xlsx" : "pdf" });
        else if (x === "save") jobs.push({ a: "trip", kind: "save" });
        else if (x === "clear") jobs.push({ a: "trip", kind: "clear" });
        else jobs.push({ a: "trip", kind: "export", fmt: x === "gpx" ? "gpx" : x === "geojson" ? "geojson" : x === "google_maps" ? "gmaps" : "link" });
        break;
      }
      case "make_report": {
        const f = fmt(a.format, ["pdf", "docx", "xlsx", "png"], "pdf");
        if (a.kind === "map") jobs.push({ a: "report", kind: "map", fmt: f === "png" ? "png" : "pdf" });
        else if (a.kind === "theme" && THEMES.includes(String(a.theme))) jobs.push({ a: "report", kind: "theme", fmt: f === "png" ? "pdf" : f, theme: a.theme as Theme });
        else if (a.kind === "place" && a.place) { const p = await need(a.place); if (p) jobs.push({ a: "report", kind: ["block", "district", "island"].includes(p.type) ? "area" : "place", fmt: f === "png" ? "pdf" : f, place: p }); }
        else jobs.push({ a: "report", kind: "area", fmt: f === "png" ? "pdf" : f, place: null });
        break;
      }
      case "download_dataset": if (DATASETS.includes(String(a.dataset))) jobs.push({ a: "report", kind: "dataset", fmt: fmt(a.format, ["csv", "xlsx", "geojson"], "csv"), dataset: String(a.dataset) }); break;
      case "find_best_areas": if (ZONES.includes(a.theme as Zone)) { const p = await resolvePlace(a.near_place, "trip"); jobs.push({ a: "decision", kind: "mission", out: [a.theme as Zone], back: [], nearest: a.nearest === true, start: p === "here" ? null : p, fromMe: p === "here", plan: false, leaveAt: null }); } break;
      case "plan_mission": {
        const zs = (x: unknown) => (Array.isArray(x) ? x : []).filter((z): z is Zone => ZONES.includes(z as Zone));
        const out = zs(a.goals), back = zs(a.on_way_back);
        if (!out.length && !back.length) break;
        const p = await resolvePlace(a.start, "trip");
        jobs.push({ a: "decision", kind: "mission", out: out.length ? out : back, back: out.length ? back : [], nearest: a.nearest === true, start: p === "here" ? null : p, fromMe: p === "here" || a.from_my_location === true, plan: true, leaveAt: localTime(a.leave_at) });
        break;
      }
      case "check_place": { const p = await need(a.place); if (p) jobs.push({ a: "decision", kind: "risk", place: p }); break; }
      case "best_time": { const f1 = await need(a.from, "trip"), t1 = await need(a.to, "trip"); if (f1 && t1) jobs.push({ a: "decision", kind: "besttime", from: f1, to: t1 }); break; }
      case "rank_areas": {
        const m = await metricOf(a.metric);
        const lv = ["block", "village", "island", "district"].includes(String(a.level)) ? (a.level as "block") : "block";
        if (m) jobs.push({ a: "data", kind: "rank", metric: m, level: lv, n: typeof a.top_n === "number" ? Math.max(1, Math.min(50, Math.round(a.top_n))) : 5, low: a.lowest === true, within: a.within_place ? await place(a.within_place) : null });
        break;
      }
      case "get_value": { const m = await metricOf(a.metric); if (m) jobs.push({ a: "data", kind: "value", metric: m, place: a.place ? await need(a.place) : null }); break; }
      case "count": jobs.push({ a: "data", kind: "count", what: a.what === "jetty" ? "jetty" : a.what === "poi" ? "poi" : "village", within: a.within_place ? await place(a.within_place) : null }); break;
      case "nearest": jobs.push({ a: "place", kind: "nearest", cat: NEAR.includes(String(a.category)) ? String(a.category) : "any", place: await place(a.near_place, "trip") }); break;
      case "distance": { const f1 = await need(a.from, "trip"), t1 = await need(a.to, "trip"); if (f1 && t1) jobs.push({ a: "place", kind: "distance", from: f1, to: t1 }); break; }
      case "weather": jobs.push({ a: "weather", kind: "now", place: await place(a.place), tide: true }); break;
      case "emergency": jobs.push({ a: "help", kind: "sos", place: await place(a.place) }); break;
      case "explain": jobs.push({ a: "help", kind: "explain", topic: String(a.topic || "") }); break;
      case "how_to": jobs.push({ a: "help", kind: "howto", topic: String(a.topic || "") }); break;
    }
  }
  return { jobs, missing };
}

/* ------------------------------------------------------------------ calling the model */
async function systemPrompt(lang: Lang, path: string) {
  const cat = await loadCatalog();
  const st = getTrip();
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return [
    "You are the coordinator of the D.I.S.H.A.R.I assistant: a team of agents that operate a WebGIS website about the Indian Sundarbans (South and North 24 Parganas, West Bengal, India).",
    "The site is a trip planner with its own data: villages and towns (Census 2011), blocks, districts, islands, rivers, ghats, services (POIs), forest permit zones, a boat-and-walk router with tides that keeps to the safest wide channels, weather, block and trip reports.",
    "It also has the D.I.S.H.A.R.I models: a tiger habitat model and indexes for fish, honey and crab zones on 1.6 km² hexagons. When someone wants to go for honey, fish, crab or to see tigers, use plan_mission (to plan the trip) or find_best_areas (to mark spots to choose from). Conditions like 'on the way back I will also fish' go in on_way_back.",
    "Users may send photos (a place, a boat, a plant, an animal, a snake, an injury, the sky, a document, a map …). Look carefully, say briefly what you see that matters, and help: what it is, what to do now, and act with the tools when useful (nearest health centre, emergency numbers, weather, a trip). Be calm and practical.",
    "Users write in English, Bengali or Banglish (Bengali in Latin letters). Work out what they want and call the tools that do it, several in order for compound requests (for example plan_trip, then trip_action report_pdf, then trip_action live_tracking).",
    "Use place names as the user wrote them; the site resolves spelling. For questions of general knowledge that need no site action, answer in 1–4 short sentences without tools.",
    `Write any text in ${lang === "bn" ? "Bengali (বাংলা script)" : "English"} (always this language, even when the user writes in another language or in Banglish), short and plain — the agents show the detailed results themselves. Never invent numbers; use the tools.`,
    `Local time now (India): ${local}. Current page: ${path}. Last place talked about: ${mem.place ? mem.place.name : "none"}. Current trip: ${st.stops.length ? st.stops.map((s) => s.name).join(" → ") : "none"}.`,
  ].join("\n");
}

export interface Turn { role: "user" | "assistant"; text: string }
/** where the AI server is: the same site by default, or NEXT_PUBLIC_AI_URL when the site is hosted apart from it */
const AI_URL = (process.env.NEXT_PUBLIC_AI_URL || "").replace(/\/+$/, "");
let health: Promise<boolean> | null = null, healthAt = 0;
/** is the AI server there (checked once a minute at most) */
export function aiAvailable(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve(false);
  if (health && Date.now() - healthAt < 60000) return health;
  healthAt = Date.now();
  health = (async () => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 4000);
    try { const r = await fetch(`${AI_URL}/api/ai/health`, { cache: "no-store", signal: ac.signal }); if (!r.ok) return false; const j = await r.json(); return !!j.ok; }
    catch { return false; } finally { clearTimeout(t); }
  })();
  return health;
}
export async function callModel(sys: string, history: Turn[], text: string, images: Img[] = []): Promise<{ text: string; calls: { name: string; args: Record<string, unknown> }[] }> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 50000);
  try {
    const r = await fetch(`${AI_URL}/api/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: ac.signal,
      body: JSON.stringify({ system: sys, history, text, images: images.map((im) => ({ mime: im.mime, data: im.data })), tools: TOOLS }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `${r.status}`);
    return { text: String(j.text || ""), calls: Array.isArray(j.calls) ? j.calls : [] };
  } finally { clearTimeout(t); }
}

/** ask the AI model what to do; returns the plan for the agents and any text it wrote */
export async function llmPlan(text: string, lang: Lang, history: Turn[], path: string, images: Img[] = []): Promise<{ plan: Plan; missing: string[] }> {
  const sys = await systemPrompt(lang, path);
  const r = await callModel(sys, history.slice(-8), text, images);
  const { jobs, missing } = await toJobs(r.calls, lang);
  const lng = jobs.find((j) => j.a === "map" && j.kind === "look" && j.lang) as Extract<Job, { kind: "look" }> | undefined;
  return { plan: { jobs, lang: lng?.lang ?? lang, say: r.text || undefined }, missing };
}
