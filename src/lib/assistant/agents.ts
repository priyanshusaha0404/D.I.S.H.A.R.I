"use client";
/** The specialist agents. Each one acts on the live website (map, smart trip, reports, data) and answers with text,
 *  facts, lists, charts and buttons. The router (router.ts) decides which agents take part in a request. */
import type { IndexRow } from "../data/search";
import { getEntity, nearest, loadVillages, loadAdmin, loadPoints, whatIsHere, type Entity } from "../data/entities";
import { hexStore, aggregate, type HexStore } from "../data/hex";
import { getWeather, getSeaLevel, wmo } from "../data/weather";
import { loadCatalog, loadSources, varLabel, varUnit } from "../data/catalog";
import { saveJourney, savePlace } from "../data/storage";
import { buildProfile, popEstimate, type Cells } from "../profile";
import { fitBounds, flyTo, getMap, getState, HOME_BOUNDS, isMapLoaded, mapPadding, setState, showResult, showVariable } from "../map/store";
import { BASEMAPS } from "../map/basemaps";
import { composeMap, downloadBlob, safeName } from "../map/export";
import { planRoute } from "../routing/client";
import { addStop, clearTrip, getTrip, launch3d, removeStop, replan, setSettings, setStops, stopId } from "../trip/store";
import { nextQuarter, type TripPlan, type TripSettings, type TripStop } from "../trip/plan";
import { googleMapsUrl, shareUrl, tripGeoJSON, tripGpx } from "../trip/export";
import { clock, dayLabel, legEnd, SOS_NUMBERS, tideName, tw, vesselName, type TripWord } from "../trip/text";
import { metres, type LL } from "../trip/geo";
import { fmt, fmtDuration, fmtKm } from "../format";
import { translate, type Lang, type TKey } from "../i18n";
import type { Format } from "../report/model";
import type { Action, AgentId, Chip, Part } from "./store";
import type { Fmt, Theme } from "./nlu";
import { ZONE_META, type Zone } from "../zones";
import { findSpots, kmBetween, STAY, ZONE_WORD, type Spot } from "./mission";

/* ================================================================== the team */
export const AGENTS: Record<AgentId, { en: string; bn: string; colour: string; icon: string; role: [string, string] }> = {
  router: { en: "Coordinator", bn: "সমন্বয়ক", colour: "#123D32", icon: "spark", role: ["Understands the request and hands each part to the right agent", "অনুরোধ বুঝে প্রতিটি অংশ ঠিক এজেন্টকে দেয়"] },
  map: { en: "Map agent", bn: "মানচিত্র এজেন্ট", colour: "#2a78d6", icon: "map", role: ["Finds and shows places, changes the base map, language and light or dark", "জায়গা খুঁজে দেখায়, ভিত্তি মানচিত্র, ভাষা ও লাইট-ডার্ক বদলায়"] },
  place: { en: "Place agent", bn: "জায়গা এজেন্ট", colour: "#97703f", icon: "pin", role: ["Facts about any village, block, island or ghat, what is nearest, distances", "যেকোনো গ্রাম, ব্লক, দ্বীপ বা ঘাটের তথ্য, নিকটতম জায়গা, দূরত্ব"] },
  trip: { en: "Trip agent", bn: "যাত্রা এজেন্ট", colour: "#1c5aa6", icon: "boat", role: ["Plans smart trips by boat and on foot and starts the live 3D trip", "নৌকা ও হেঁটে স্মার্ট ট্রিপ পরিকল্পনা করে ও লাইভ ৩ডি যাত্রা চালু করে"] },
  report: { en: "Report agent", bn: "রিপোর্ট এজেন্ট", colour: "#9c2724", icon: "file", role: ["Trip and block reports in PDF, Word and Excel, lists of villages and ghats, map pictures", "যাত্রা ও ব্লকের PDF, Word ও Excel রিপোর্ট, গ্রাম ও ঘাটের তালিকা, মানচিত্রের ছবি"] },
  decision: { en: "Decision agent", bn: "সিদ্ধান্ত এজেন্ট", colour: "#eb6834", icon: "target", role: ["Best tide and time to leave, and whether a place needs a forest permit", "রওনার সেরা জোয়ার-ভাটা ও সময়, আর কোথায় বনের অনুমতি লাগে"] },
  data: { en: "Data agent", bn: "তথ্য এজেন্ট", colour: "#6250d6", icon: "chart", role: ["Statistics, totals and rankings of villages, blocks and islands", "গ্রাম, ব্লক ও দ্বীপের পরিসংখ্যান, মোট ও ক্রম"] },
  weather: { en: "Weather agent", bn: "আবহাওয়া এজেন্ট", colour: "#0e8a8a", icon: "cloud", role: ["Weather now, the next hours and the tide times", "এখনকার আবহাওয়া, পরের কয়েক ঘণ্টা ও জোয়ার-ভাটার সময়"] },
  help: { en: "Help agent", bn: "সহায়তা এজেন্ট", colour: "#3c3b37", icon: "help", role: ["Explains terms and data, shows how to use the site, emergency numbers", "শব্দ ও তথ্য বোঝায়, সাইট ব্যবহারের নিয়ম, জরুরি নম্বর"] },
  ai: { en: "D.I.S.H.A.R.I AI", bn: "D.I.S.H.A.R.I এআই", colour: "#7a3fb8", icon: "spark", role: ["Understands any wording and photos, and uses the same agents", "যেকোনো ভাষা ও ছবি বুঝে একই এজেন্টদের কাজে লাগায়"] },
};

/* ================================================================== environment, memory */
export interface Env {
  lang: Lang;
  theme: "light" | "dark";
  setLang: (l: Lang) => void;
  setTheme: (t: "light" | "dark") => void;
  go: (path: string) => Promise<void>;
  path: () => string;
}
export interface Out { parts?: Part[]; actions?: Action[]; chips?: Chip[]; fail?: string; note?: string; ask?: { q: string; chips: Chip[]; pending: Pending }; agent?: AgentId }
export const isOut = (r: unknown): r is Out => !!r && typeof r === "object" && ("parts" in r || "fail" in r || "ask" in r);
export type Pending = { kind: "tripStart"; job: TripPlanJob } | { kind: "missionStart"; job: MissionJob } | { kind: "place"; job: Job; field: string };
/** what the team remembers during the conversation: the last place talked about (for "there", "its report"), the last
 *  layer and theme, a question waiting for an answer, and the turn counter */
export const mem: { mission: MissionJob | null; place: IndexRow | null; area: IndexRow | null; theme: Theme | null; varKey: string | null; pending: Pending | null; here: LL | null; findTitle: string | null;
  lastFile: string | null; turn: number; placeTurn: number } =
  { mission: null, place: null, area: null, theme: null, varKey: null, pending: null, here: null, findTitle: null, lastFile: null, turn: 0, placeTurn: -9 };

export const L = (lang: Lang) => (en: string, bn: string) => (lang === "bn" ? bn : en);
const T = (lang: Lang) => (k: TKey) => translate(lang, k);
const AREA_TYPES = new Set(["block", "district", "island"]);
const isMapPage = (p: string) => /^\/($|explore|tiger|fish|crab|honey|environment|route|place)/.test(p.replace(/\/?$/, "/").replace(/^\/\//, "/")) || p === "/";
async function mapReady(ms = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (isMapLoaded()) return true; await new Promise((r) => setTimeout(r, 120)); }
  return !!getMap();
}
/** be on a map page; the trip and place pages have their own overlays, so layer work moves to `prefer` unless `keep` */
async function ensureMap(env: Env, prefer = "/explore/", keep = false) {
  const p = env.path();
  if (!isMapPage(p) || (!keep && /^\/(route|place)/.test(p))) await env.go(prefer);
  await mapReady();
}
/** open a theme page (its layers and legend) unless it is already open */
async function ensurePage(env: Env, path: string) { if (!env.path().startsWith(path.replace(/\/$/, ""))) await env.go(path); await mapReady(); }
export async function myLocation(): Promise<LL | null> {
  if (mem.here) return mem.here;
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((ok) => {
    const t = setTimeout(() => ok(null), 15000);          // a permission prompt nobody answers must not stall the chat
    navigator.geolocation.getCurrentPosition((p) => { clearTimeout(t); mem.here = [p.coords.longitude, p.coords.latitude]; setState({ me: mem.here }); ok(mem.here); },
      () => { clearTimeout(t); ok(null); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}
const typeName = (type: string, lang: Lang) => translate(lang, `ent.${type}` as TKey) || type;
const where = (r: IndexRow) => r.context.split(" · ").slice(1).filter((x) => !/OSM|verified/i.test(x)).join(", ");
export const placeLabel = (r: IndexRow, lang: Lang) => `${r.name} (${typeName(r.type, lang).toLowerCase()}${where(r) ? `, ${where(r)}` : ""})`;

/** go to a place: fit its outline, outline it and open its card */
async function focus(r: IndexRow) {
  const e = await getEntity(r.type, r.id).catch(() => null);
  if (r.bbox && (AREA_TYPES.has(r.type) || r.type === "village" || r.type === "town" || r.type === "river" || r.type === "canal" || r.type === "forest_unit" || r.type === "protected_area")) fitBounds(r.bbox, r.type === "village" ? 14 : 12.5);
  else flyTo(r.lon, r.lat, 14);
  // areas get their outline (their facts are in the chat); points, villages and towns also get the place card
  const big = AREA_TYPES.has(r.type) || ["river", "canal", "creek", "forest_unit", "protected_area"].includes(r.type);
  setState({ selection: big && r.type !== "block" ? null : { lon: r.lon, lat: r.lat, entity: { type: r.type, id: r.id } }, highlight: e?.geom ? { layer: e.geom.layer, ids: e.geom.ids } : null });
  return e;
}

/* ================================================================== jobs */
export interface TripPlanJob { a: "trip"; kind: "plan"; stops: { row: IndexRow | null; ll?: LL; name?: string; stay: number | null }[]; leaveAt: number | null;
  mode: TripSettings["mode"] | null; vessel: TripSettings["vessel"] | null; tide: TripSettings["tide"] | null; back: boolean; best: boolean; each: number | null; fromMe?: boolean }
/** a livelihood trip from the models: where to go for honey / fish / crab / tiger, and what to do on the way back */
export interface MissionJob { a: "decision"; kind: "mission"; out: Zone[]; back: Zone[]; nearest: boolean; start: IndexRow | null; fromMe: boolean; plan: boolean; leaveAt: number | null }
export type Job =
  | MissionJob
  | { a: "help"; kind: "hello" | "thanks" | "capab" | "howto" | "explain" | "sos" | "about" | "fallback"; topic?: string; place?: IndexRow | null }
  | { a: "map"; kind: "goto"; place: IndexRow; alts: IndexRow[] }
  | { a: "map"; kind: "layer"; varKey?: string; theme?: Theme }
  | { a: "map"; kind: "basemap"; id: string }
  | { a: "map"; kind: "view3d"; on: boolean }
  | { a: "map"; kind: "compare"; left: string; right: string; label: string }
  | { a: "map"; kind: "look"; dark?: boolean; lang?: Lang; labels?: boolean }
  | { a: "map"; kind: "reset" } | { a: "map"; kind: "locate" } | { a: "map"; kind: "page"; path: string; label: string }
  | { a: "place"; kind: "about"; place: IndexRow; alts: IndexRow[] }
  | { a: "place"; kind: "nearest"; cat: string; place: IndexRow | null }
  | { a: "place"; kind: "distance"; from: IndexRow; to: IndexRow }
  | { a: "place"; kind: "compare"; places: IndexRow[] }
  | TripPlanJob
  | { a: "trip"; kind: "add" | "remove"; place: IndexRow }
  | { a: "trip"; kind: "clear" }
  | { a: "trip"; kind: "start3d"; live: boolean }
  | { a: "trip"; kind: "tweak"; mode: TripSettings["mode"] | null; vessel: TripSettings["vessel"] | null; tide: TripSettings["tide"] | null; leaveAt: number | null; back: boolean | null; best: boolean | null }
  | { a: "trip"; kind: "export"; fmt: Fmt }
  | { a: "trip"; kind: "save" }
  | { a: "report"; kind: "trip" | "place" | "area" | "theme" | "dataset" | "map"; fmt: Fmt; place?: IndexRow | null; theme?: Theme | null; dataset?: string }
  | { a: "decision"; kind: "find"; theme: Theme; place: IndexRow | null; radius: number | null }
  | { a: "decision"; kind: "risk"; place: IndexRow }
  | { a: "decision"; kind: "besttime"; from: IndexRow; to: IndexRow }
  | { a: "data"; kind: "rank"; metric: string; level: "block" | "village" | "island" | "district"; n: number; low: boolean; within: IndexRow | null }
  | { a: "data"; kind: "value"; metric: string; place: IndexRow | null }
  | { a: "data"; kind: "count"; what: "village" | "jetty" | "poi" | "island"; within: IndexRow | null }
  | { a: "weather"; kind: "now"; place: IndexRow | null; tide: boolean };

/** what each job is called while it runs (the step line in the chat) */
export function jobLabel(j: Job, lang: Lang): string {
  const l = L(lang);
  switch (j.a) {
    case "help": return j.kind === "sos" ? l("Emergency help", "জরুরি সহায়তা") : j.kind === "explain" ? l(`Explaining ${j.topic || ""}`, `${j.topic || ""} বোঝানো হচ্ছে`) : l("Helping", "সহায়তা");
    case "map": return j.kind === "goto" ? l(`Showing ${j.place.name}`, `${j.place.name} দেখানো হচ্ছে`) : j.kind === "layer" ? l("Putting the layer on the map", "মানচিত্রে স্তর দেখানো হচ্ছে")
      : j.kind === "basemap" ? l("Changing the basemap", "ভিত্তি মানচিত্র বদল") : j.kind === "view3d" ? l(j.on ? "Turning on 3D" : "Back to 2D", j.on ? "৩ডি চালু" : "২ডি-তে ফেরা")
        : j.kind === "compare" ? l("Setting up the swipe compare", "সোয়াইপ তুলনা") : j.kind === "page" ? l(`Opening ${j.label}`, `${j.label} খোলা হচ্ছে`) : l("Updating the map", "মানচিত্র হালনাগাদ");
    case "place": return j.kind === "about" ? l(`Facts about ${j.place.name}`, `${j.place.name}-এর তথ্য`) : j.kind === "nearest" ? l("Finding what is nearest", "নিকটতম খোঁজা হচ্ছে")
      : j.kind === "distance" ? l(`${j.from.name} to ${j.to.name}`, `${j.from.name} থেকে ${j.to.name}`) : l("Comparing places", "জায়গার তুলনা");
    case "trip": return j.kind === "plan" ? l("Planning the trip (tide for every hop)", "যাত্রা পরিকল্পনা (প্রতিটি যাত্রাংশের জোয়ার-ভাটা)") : j.kind === "start3d" ? l(j.live ? "Starting live 3D tracking" : "Starting the 3D trip", j.live ? "লাইভ ৩ডি ট্র্যাকিং চালু" : "৩ডি যাত্রা চালু")
      : j.kind === "export" ? l("Preparing the trip file", "যাত্রার ফাইল তৈরি") : j.kind === "tweak" ? l("Updating the trip", "যাত্রা হালনাগাদ") : l("Updating the trip", "যাত্রা হালনাগাদ");
    case "report": return j.kind === "dataset" ? l("Preparing the dataset", "ডেটাসেট তৈরি হচ্ছে") : j.kind === "map" ? l("Exporting the map", "মানচিত্র রপ্তানি") : l(`Making the ${fmtName(j.fmt, lang)} report`, `${fmtName(j.fmt, lang)} রিপোর্ট তৈরি হচ্ছে`);
    case "decision": return j.kind === "mission" ? (j.plan ? l("Choosing spots from the model and planning the boat trip", "মডেল থেকে জায়গা বেছে নৌকাযাত্রা পরিকল্পনা") : l("Finding spots from the model", "মডেল থেকে জায়গা খোঁজা হচ্ছে")) : j.kind === "find" ? l(`Finding the best ${themeName(j.theme, "en")} areas`, `সেরা ${themeName(j.theme, "bn")} এলাকা খোঁজা হচ্ছে`) : j.kind === "risk" ? l(`Checking ${j.place.name}`, `${j.place.name} যাচাই`) : l("Comparing low and high tide", "ভাটা ও জোয়ারের তুলনা");
    case "data": return l("Computing from the data", "তথ্য থেকে হিসাব");
    case "weather": return l("Weather and tide", "আবহাওয়া ও জোয়ার-ভাটা");
  }
}
const fmtName = (f: Fmt, lang: Lang) => ({ pdf: "PDF", docx: "Word", xlsx: "Excel", csv: "CSV", geojson: "GeoJSON", gpx: "GPX", png: "PNG", gmaps: "Google Maps", link: lang === "bn" ? "লিঙ্ক" : "link" })[f];
export const themeName = (t: Theme, lang: Lang) => ({ tiger: ["tiger", "বাঘ"], fish: ["fishing", "মাছ ধরার"], crab: ["crab", "কাঁকড়া"], honey: ["honey", "মধু"], environment: ["environment", "পরিবেশ"] })[t][lang === "bn" ? 1 : 0];

/* ================================================================== HELP */
export const STARTERS = (lang: Lang): Chip[] => (lang === "bn" ? [
  { label: "নৌকায় যাত্রা পরিকল্পনা", send: "কাল সকাল ৮টায় Canning থেকে Basanti হয়ে Jharkhali নৌকায় যাব" },
  { label: "যাত্রা + PDF + লাইভ ট্র্যাকিং", send: "Canning থেকে Gosaba নৌকায় যাব, PDF দাও আর লাইভ ট্র্যাকিং চালু করো" },
  { label: "Gosaba ব্লকের সব তথ্য", send: "Gosaba ব্লক দেখাও" },
  { label: "কাছের হাসপাতাল", send: "Gosaba-র কাছে হাসপাতাল" },
  { label: "আবহাওয়া ও জোয়ার", send: "Canning-এ আবহাওয়া আর জোয়ার কখন" },
  { label: "জনসংখ্যায় সেরা ৫ গ্রাম", send: "Basanti ব্লকে জনসংখ্যায় সেরা ৫টি গ্রাম" },
] : [
  { label: "Plan a boat trip", send: "Plan a boat trip from Canning via Basanti to Jharkhali tomorrow at 8 am" },
  { label: "Trip + PDF + live tracking", send: "Boat trip from Canning to Gosaba, then the PDF and start live tracking" },
  { label: "Everything about Gosaba block", send: "Show Gosaba block" },
  { label: "Nearest hospital", send: "Nearest hospital to Gosaba" },
  { label: "Weather and tide", send: "Weather and tide at Canning" },
  { label: "Top 5 villages by population", send: "Top 5 villages by population in Basanti block" },
]);

const GLOSSARY: Record<string, [string, string, string]> = {
  legal: ["legal status|protection|permit|gate|core|anumoti|অনুমতি|আইনি", "Every place is in one of three zones: Open (no permit), Protected forest (entry with a Forest Department permit) and National Park core (no entry). Touch any place on the map to see its zone.", "প্রতিটি জায়গা তিনটি এলাকার একটিতে পড়ে: উন্মুক্ত (অনুমতি লাগে না), সংরক্ষিত বন (বন দপ্তরের অনুমতি নিয়ে প্রবেশ) আর জাতীয় উদ্যানের কোর (প্রবেশ নিষেধ)। মানচিত্রে যেকোনো জায়গায় ছুঁলে তার এলাকা দেখা যাবে।"],
  navigable: ["navigable|nouchalachal|নৌচলাচল|boat water", "Boat routes use only water a boat can pass at low and at high tide, and never cross the National Park core.", "নৌপথ শুধু সেই জল দিয়ে যায় যেখানে ভাটা ও জোয়ারে নৌকা চলে, আর জাতীয় উদ্যানের কোর পার হয় না।"],
  tide: ["tide|jowar|bhata|জোয়ার|ভাটা|sea level", "The tide changes which creeks a boat can use. The Smart trip reads the sea-level forecast for the place and time you leave each hop: above the 48-hour median is high tide.", "জোয়ার-ভাটায় নৌকা চলার খাঁড়ি বদলায়। স্মার্ট ট্রিপ প্রতিটি যাত্রাংশের রওনার জায়গা ও সময়ের সমুদ্রতলের পূর্বাভাস পড়ে: ৪৮ ঘণ্টার মধ্যমার উপরে হলে জোয়ার।"],
  smarttrip: ["smart trip|trip planner|smart|স্মার্ট", "Smart trip plans a journey through many places by boat, on foot or both: stays, leaving time, the tide for every hop, the ghats where you change and the rivers on the way, then a live 3D trip and reports.", "স্মার্ট ট্রিপ নৌকা, হেঁটে বা দুটো মিলিয়ে অনেক জায়গার যাত্রা পরিকল্পনা করে: থাকার সময়, রওনার সময়, প্রতিটি যাত্রাংশের জোয়ার-ভাটা, বদলের ঘাট ও নদী, তারপর লাইভ ৩ডি যাত্রা ও রিপোর্ট।"],
  live3d: ["3d trip|live tracking|live|tracking|লাইভ", "The live 3D trip follows your plan on a 3D map. Turn on Live GPS and it follows your real position, tells you when you leave the route and can plan again from where you are.", "লাইভ ৩ডি যাত্রা ৩ডি মানচিত্রে পরিকল্পনা অনুসরণ করে। লাইভ জিপিএস চালু করলে আপনার আসল অবস্থান ধরে চলে, পথ থেকে সরলে জানায় আর যেখানে আছেন সেখান থেকে আবার পরিকল্পনা করতে পারে।"],
  offline: ["offline|internet|net chara|ইন্টারনেট", "After the first visit the site and its data are stored in this browser, so the map, trip planning, block details, reports and this assistant work without internet. Online base maps and live weather need a connection.", "প্রথমবার দেখার পর সাইট ও তথ্য এই ব্রাউজারে থেকে যায়, তাই মানচিত্র, যাত্রা পরিকল্পনা, ব্লকের তথ্য, রিপোর্ট আর এই সহায়ক ইন্টারনেট ছাড়াই চলে। অনলাইন ভিত্তি মানচিত্র ও সরাসরি আবহাওয়ার জন্য সংযোগ লাগে।"],
};

const HOWTO: [RegExp, [string, string][], (env: Env) => Action | null][] = [
  [/(report|download|pdf|word|excel|রিপোর্ট|ডাউনলোড)/i, [["Touch a block on the map: its card has PDF, Word and Excel buttons for the block report.", "মানচিত্রে একটি ব্লকে ছুঁয়ে দিন: কার্ডে ব্লকের রিপোর্টের PDF, Word ও Excel বোতাম আছে।"],
    ["For a trip, plan it and use the report buttons in the Trip drawer.", "যাত্রার জন্য পরিকল্পনা করে ‘যাত্রা’ ড্রয়ারের রিপোর্ট বোতাম চাপুন।"], ["The dashboard downloads all blocks side by side.", "ড্যাশবোর্ড থেকে সব ব্লকের তুলনা ডাউনলোড হয়।"],
    ["Or just ask me: “Gosaba report PDF”, “trip report Word”.", "বা আমাকে বলুন: “Gosaba রিপোর্ট PDF”, “যাত্রার রিপোর্ট Word”।"]], (env) => ({ label: env.lang === "bn" ? "ড্যাশবোর্ড খুলুন" : "Open the dashboard", run: () => env.go("/dashboard/"), primary: true })],
  [/(trip|plan|route|jabo|যাত্রা|পথ)/i, [["Open Trip on the rail (or just tell me the places).", "রেল থেকে ‘যাত্রা’ খুলুন (বা আমাকে জায়গাগুলি বলুন)।"], ["Add places by search, by touching the map or with your location; set how long you stay.", "খুঁজে, মানচিত্রে ছুঁয়ে বা নিজের অবস্থান দিয়ে জায়গা যোগ করুন; কতক্ষণ থাকবেন ঠিক করুন।"],
    ["Choose boat, walking or both, the leaving time and the tide (Auto reads the forecast).", "নৌকা, হাঁটা বা দুটো, রওনার সময় ও জোয়ার-ভাটা বাছুন (স্বয়ংক্রিয় পূর্বাভাস পড়ে)।"], ["Press Plan trip, then Start 3D trip or download the report.", "যাত্রা পরিকল্পনা চাপুন, তারপর ৩ডি যাত্রা শুরু বা রিপোর্ট ডাউনলোড করুন।"]],
    (env) => ({ label: env.lang === "bn" ? "যাত্রা খুলুন" : "Open Trip", run: () => env.go("/route/"), primary: true })],
  [/(offline|internet|ইন্টারনেট)/i, [["Open the site once with internet.", "একবার ইন্টারনেটসহ সাইট খুলুন।"], ["After that the map, trips, block details, reports and this assistant work offline.", "তারপর মানচিত্র, যাত্রা, ব্লকের তথ্য, রিপোর্ট আর এই সহায়ক অফলাইনে চলবে।"],
    ["On a phone, add the site to the home screen to open it like an app.", "ফোনে সাইটটি হোম স্ক্রিনে যোগ করলে অ্যাপের মতো খোলা যাবে।"]], () => null],
  [/(basemap|base map|satellite|map style|ভিত্তি|উপগ্রহ)/i, [["Press the layers button at the top right of the map.", "মানচিত্রের উপরে ডানদিকের স্তর বোতাম চাপুন।"], ["Pick Dark, Light, OSM or an Esri map (streets, satellite, topo).", "ডার্ক, লাইট, OSM বা Esri মানচিত্র (রাস্তা, উপগ্রহ, টোপো) বাছুন।"],
    ["Or ask me: “satellite map”, “dark map”, “OSM”.", "বা আমাকে বলুন: “স্যাটেলাইট ম্যাপ”, “ডার্ক ম্যাপ”, “OSM”।"]], (env) => ({ label: env.lang === "bn" ? "উপগ্রহ মানচিত্র দাও" : "Use satellite imagery", run: async () => { await ensureMap(env, "/", true); setState({ basemap: "esri_imagery" }); } })],
  [/(block|details|tottho|তথ্য|ব্লক)/i, [["Touch anywhere on the map.", "মানচিত্রের যেকোনো জায়গায় ছুঁয়ে দিন।"], ["The card shows that block in full: people, villages, ghats, services, permit zones, weather and tide.", "কার্ডে সেই ব্লকের সব তথ্য আসে: মানুষ, গ্রাম, ঘাট, পরিষেবা, অনুমতি এলাকা, আবহাওয়া ও জোয়ার-ভাটা।"],
    ["Use its buttons to plan a trip there or download the block report.", "বোতাম দিয়ে সেখানে যাত্রা পরিকল্পনা বা ব্লকের রিপোর্ট ডাউনলোড করুন।"]], () => null],
  [/(save|bookmark|my data|সংরক্ষণ|রাখ)/i, [["Touch a place and press Save, or save a trip from the Trip drawer.", "জায়গায় ছুঁয়ে ‘রাখুন’ চাপুন, বা ‘যাত্রা’ ড্রয়ার থেকে যাত্রা রাখুন।"], ["Everything is kept in this browser; open Saved on the rail to see it.", "সব এই ব্রাউজারে থাকে; দেখতে রেলের ‘রাখা’ খুলুন।"]],
    (env) => ({ label: env.lang === "bn" ? "রাখা তথ্য খুলুন" : "Open Saved", run: () => env.go("/my/") })],
];

export async function help(env: Env, j: Extract<Job, { a: "help" }>): Promise<Out> {
  const l = L(env.lang);
  if (j.kind === "hello") return { parts: [{ k: "text", text: l("Hello! I am the D.I.S.H.A.R.I assistant — a team of agents that work this site for you. Tell me what you want in English, বাংলা or Banglish: plan a trip, show a block or a place, download a report, find the nearest hospital or ghat, check the weather and tide.",
    "নমস্কার! আমি D.I.S.H.A.R.I সহায়ক — কয়েকটি এজেন্টের একটি দল, যারা আপনার হয়ে এই সাইট চালায়। বাংলা, ইংরেজি বা বাংলিশে বলুন কী চান: যাত্রা পরিকল্পনা, ব্লক বা জায়গা দেখা, রিপোর্ট ডাউনলোড, কাছের হাসপাতাল বা ঘাট, আবহাওয়া ও জোয়ার-ভাটা।") }], chips: STARTERS(env.lang) };
  if (j.kind === "thanks") return { parts: [{ k: "text", text: l("You're welcome! Anything else?", "আপনাকেও ধন্যবাদ! আর কিছু?") }], chips: STARTERS(env.lang).slice(0, 3) };
  if (j.kind === "capab") {
    const ids: AgentId[] = ["map", "place", "trip", "report", "decision", "data", "weather", "help"];
    return { parts: [{ k: "text", text: l("I am a team. The coordinator reads your message and hands each part to the right agent — several can work on one request (for example: plan a trip, then make its PDF, then start the 3D trip).",
      "আমি একটি দল। সমন্বয়ক আপনার বার্তা পড়ে প্রতিটি অংশ ঠিক এজেন্টকে দেয় — একটি অনুরোধে কয়েকজন কাজ করতে পারে (যেমন: যাত্রা পরিকল্পনা, তারপর তার PDF, তারপর ৩ডি যাত্রা)।") },
      { k: "list", items: ids.map((id) => ({ title: env.lang === "bn" ? AGENTS[id].bn : AGENTS[id].en, sub: AGENTS[id].role[env.lang === "bn" ? 1 : 0], colour: AGENTS[id].colour })) }], chips: STARTERS(env.lang) };
  }
  if (j.kind === "sos") {
    const ref: LL | null = j.place ? [j.place.lon, j.place.lat] : await myLocation();
    const parts: Part[] = [{ k: "list", title: tw(env.lang, "sosTitle"), items: SOS_NUMBERS.map((n) => ({ title: n, sub: tw(env.lang, `n${n}` as TripWord), colour: "#e34948", act: { label: l("Call", "ফোন"), run: () => { window.location.href = `tel:${n}`; }, href: `tel:${n}` } })) }];
    if (ref) {
      const pts = await loadPoints();
      const near = pts.poi.filter((s) => ["health", "emergency", "shelter"].includes(s.category || "")).map((s) => ({ s, d: metres(ref, [s.lon, s.lat]) })).sort((a, b) => a.d - b.d).slice(0, 4);
      parts.push({ k: "list", title: `${tw(env.lang, "sosNear")}${j.place ? ` · ${j.place.name}` : ""}`, items: near.map(({ s, d }) => ({ title: s.name || s.category || "", sub: (s.amenity || s.category || "").replace(/_/g, " "), right: fmtKm(d, env.lang), colour: "#e34948",
        act: { label: l("Show", "দেখাও"), run: async () => { await ensureMap(env, "/", true); flyTo(s.lon, s.lat, 15); setState({ selection: { lon: s.lon, lat: s.lat, entity: { type: "poi", id: String(s.id) } } }); } } })) });
    } else parts.push({ k: "note", text: l("Tell me a place (or allow your location) and I will list the nearest hospitals and help points.", "একটি জায়গা বলুন (বা অবস্থানের অনুমতি দিন), আমি নিকটতম হাসপাতাল ও সহায়তা কেন্দ্র জানাব।") });
    return { parts };
  }
  if (j.kind === "about") return { parts: [{ k: "text", text: l("Everything ships with the site: villages, towns and blocks from the Census of India 2011, ghats, services and place names from OpenStreetMap, the forest permit zones of the Sundarban Tiger Reserve and reserve forest, and a river network for boat routes. Weather and tides come live from Open-Meteo.",
    "সব তথ্য সাইটের সঙ্গেই আছে: ভারতের জনগণনা ২০১১-র গ্রাম, শহর ও ব্লক, ওপেনস্ট্রিটম্যাপের ঘাট, পরিষেবা ও জায়গার নাম, সুন্দরবন ব্যাঘ্র প্রকল্প ও সংরক্ষিত বনের অনুমতি এলাকা, আর নৌপথের জন্য নদীর জাল। আবহাওয়া ও জোয়ার-ভাটা সরাসরি ওপেন-মিটিও থেকে আসে।") }] };
  if (j.kind === "explain") {
    const topic = (j.topic || "").toLowerCase();
    for (const [, [re, en, bn]] of Object.entries(GLOSSARY)) if (new RegExp(re, "i").test(topic)) return { parts: [{ k: "text", text: l(en, bn) }] };
    return { parts: [{ k: "text", text: l("I can explain: forest permit zones, the tide, boat water, the Smart trip, live 3D tracking and offline use.", "আমি বোঝাতে পারি: বনের অনুমতি এলাকা, জোয়ার-ভাটা, নৌকা চলার জল, স্মার্ট ট্রিপ, লাইভ ৩ডি ট্র্যাকিং আর অফলাইন ব্যবহার।") }] };
  }
  if (j.kind === "howto") {
    const topic = j.topic || "";
    for (const [re, steps, act] of HOWTO) if (re.test(topic)) {
      const a = act(env);
      return { parts: [{ k: "steps", items: steps.map((s) => l(s[0], s[1])) }], actions: a ? [a] : [] };
    }
    return help(env, { a: "help", kind: "capab" });
  }
  return { parts: [{ k: "text", text: l("I could not work out what to do with that. Here are some things I can do — or rephrase with a place name and what you want.", "এটা দিয়ে কী করব বুঝতে পারিনি। আমি যা করতে পারি তার কয়েকটি নিচে — বা জায়গার নাম আর কী চান তা দিয়ে আবার লিখুন।") }], chips: STARTERS(env.lang) };
}

/* ================================================================== MAP */
const BASEMAP_WORDS: [RegExp, string][] = [
  [/(satellite|imagery|উপগ্রহ|স্যাটেলাইট|sat map|chobi map)/i, "esri_imagery"], [/(topo|topographic|terrain|ভূসংস্থান)/i, "esri_topo"], [/(openstreetmap|\bosm\b)/i, "osm"],
  [/(street|rasta|রাস্তা|esri)/i, "esri_streets"], [/(dark map|dark basemap|night map|kalo map|ডার্ক ম্যাপ|ডার্ক মানচিত্র)/i, "delta_dark"], [/(light map|light basemap|sada map|লাইট ম্যাপ|offline map)/i, "delta"],
];
export const basemapIn = (f: string) => BASEMAP_WORDS.find(([re]) => re.test(f))?.[1] ?? null;
const PAIRS: { re: RegExp; left: string; right: string; en: string; bn: string }[] = [
  { re: /(mangrove|ম্যানগ্রোভ|bada|jongol)/i, left: "mangrove_2016", right: "mangrove_2025", en: "Mangrove 2016 ↔ 2025", bn: "ম্যানগ্রোভ ২০১৬ ↔ ২০২৫" },
  { re: /(ndvi|green|sobuj|সবুজ)/i, left: "ndvi_2017", right: "ndvi_2025", en: "Greenness 2017 ↔ 2025", bn: "সবুজতা ২০১৭ ↔ ২০২৫" },
  { re: /(shore|erosion|bhangon|ভাঙন|coast)/i, left: "shoreline_change_2005_2015", right: "shoreline_change_2015_2025", en: "Shoreline 2005–15 ↔ 2015–25", bn: "উপকূলরেখা ২০০৫–১৫ ↔ ২০১৫–২৫" },
  { re: /(false|true)/i, left: "landsat_truecolor_2025", right: "landsat_falsecolor_2025", en: "True ↔ false colour 2025", bn: "প্রকৃত ↔ ফলস কালার ২০২৫" },
  { re: /./, left: "landsat_truecolor_2010", right: "landsat_truecolor_2025", en: "Landsat 2010 ↔ 2025", bn: "ল্যান্ডস্যাট ২০১০ ↔ ২০২৫" },
];
export const comparePairIn = (f: string) => PAIRS.find((p) => p.re.test(f))!;
const THEME_PAGE: Record<Theme, string> = { tiger: "/tiger/", fish: "/fish/", crab: "/crab/", honey: "/honey/", environment: "/environment/" };

export async function mapAgent(env: Env, j: Extract<Job, { a: "map" }>): Promise<Out> {
  const l = L(env.lang);
  switch (j.kind) {
    case "goto": {
      await ensureMap(env, "/", true);
      const e = await focus(j.place);
      mem.place = j.place; if (AREA_TYPES.has(j.place.type)) mem.area = j.place;
      const facts = e ? await quickFacts(e, env.lang) : [];
      return { parts: [{ k: "text", text: l(`Here is **${j.place.name}** — ${typeName(j.place.type, "en").toLowerCase()}${where(j.place) ? `, ${where(j.place)}` : ""}.`, `এই যে **${j.place.name}** — ${typeName(j.place.type, "bn")}${where(j.place) ? `, ${where(j.place)}` : ""}।`) },
        ...(facts.length ? [{ k: "facts", rows: facts } as Part] : [])], actions: placeActions(env, j.place), chips: altChips(j.alts, env.lang, "show") };
    }
    case "layer": {
      if (j.theme && !j.varKey) {
        await env.go(THEME_PAGE[j.theme]); await mapReady();
        mem.theme = j.theme;
        const chips: Chip[] = [{ label: l("Show it in 3D", "৩ডি-তে দেখাও"), send: l("3D view on", "৩ডি দেখাও") }];
        if (j.theme !== "environment") chips.unshift({ label: l(`Best ${themeName(j.theme, "en")} areas near Gosaba`, `Gosaba-র কাছে সেরা ${themeName(j.theme, "bn")} এলাকা`), send: l(`best ${themeName(j.theme, "en")} areas near Gosaba`, `Gosaba-র কাছে সেরা ${themeName(j.theme, "bn")} জায়গা কোথায়`) });
        return { parts: [{ k: "text", text: l(`Opened the ${themeName(j.theme, "en")} page with its layers on the map.`, `${themeName(j.theme, "bn")} পাতা খোলা হয়েছে, স্তরগুলি মানচিত্রে।`) }], chips };
      }
      const cat = await loadCatalog();
      const v = cat.variables.find((x) => x.key === j.varKey);
      if (!v) return { fail: l("I could not find that layer.", "এই স্তরটি পাইনি।") };
      await ensureMap(env);
      showVariable(v.key);
      mem.varKey = v.key;
      // show where the layer has data (some cover only the water or only the land); a place asked for next moves the camera on
      const hx = await hexStore();
      const vals = hx.get(v.key);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < hx.n; i++) if (!Number.isNaN(vals[i])) { const x = hx.meta.lon[i], y = hx.meta.lat[i]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 > x0) fitBounds([x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02], 11);
      if (!/^\/route/.test(env.path())) setState({ pins: [] });
      const desc = env.lang === "bn" ? v.desc_bn || v.desc : v.desc;
      return { parts: [{ k: "text", text: l(`Showing **${varLabel(v, "en")}** on the map${v.period ? ` (${v.period})` : ""}.`, `মানচিত্রে **${varLabel(v, "bn")}** দেখানো হচ্ছে${v.period ? ` (${v.period})` : ""}।`) },
        ...(desc ? [{ k: "note", text: desc } as Part] : []),
        ...(v.kind === "cont" ? [{ k: "facts", rows: [[l("Lowest", "সর্বনিম্ন"), `${fmt(v.min, env.lang, v.digits)} ${varUnit(v, env.lang)}`], [l("Average", "গড়"), `${fmt(v.mean, env.lang, v.digits)} ${varUnit(v, env.lang)}`], [l("Highest", "সর্বোচ্চ"), `${fmt(v.max, env.lang, v.digits)} ${varUnit(v, env.lang)}`]] } as Part] : [])],
        chips: [{ label: l("Show it in 3D", "৩ডি-তে দেখাও"), send: l("3D view on", "৩ডি দেখাও") }, { label: l("Which block is highest?", "কোন ব্লকে সবচেয়ে বেশি?"), send: l(`which block has the highest ${varLabel(v, "en")}`, `কোন ব্লকে সবচেয়ে বেশি ${varLabel(v, "en")}`) }] };
    }
    case "basemap": {
      await ensureMap(env, "/", true);
      setState({ basemap: j.id });
      const b = BASEMAPS.find((x) => x.id === j.id);
      return { parts: [{ k: "text", text: l(`Basemap changed to **${b?.en || j.id}**${b && !b.offline ? " (needs internet; the offline delta stays underneath)" : ""}.`, `ভিত্তি মানচিত্র এখন **${b?.bn || j.id}**${b && !b.offline ? " (ইন্টারনেট লাগে; নিচে অফলাইন ব-দ্বীপ থাকে)" : ""}।`) }] };
    }
    case "view3d": {
      await ensureMap(env, "/explore/", true);
      setState({ view3d: j.on });
      getMap()?.easeTo({ pitch: j.on ? 55 : 0, duration: 600 });
      return { parts: [{ k: "text", text: j.on ? l("The map is tilted — drag with the right mouse button or two fingers to turn it.", "মানচিত্র কাত করা হয়েছে — ডান মাউস বা দুই আঙুলে টেনে ঘোরান।") : l("Back to the flat map.", "সমতল মানচিত্রে ফেরা হলো।") }] };
    }
    case "compare": {
      await ensureMap(env, "/environment/", true);
      setState({ compare: { left: j.left, right: j.right, pos: 0.5 } });
      fitBounds(HOME_BOUNDS);
      return { parts: [{ k: "text", text: l(`Swipe compare: **${j.label}**. Drag the divider on the map.`, `সোয়াইপ তুলনা: **${j.label}**। মানচিত্রের বিভাজক টানুন।`) }] };
    }
    case "look": {
      const done: string[] = [];
      if (j.dark !== undefined) { env.setTheme(j.dark ? "dark" : "light"); done.push(j.dark ? l("dark theme", "ডার্ক থিম") : l("light theme", "লাইট থিম")); }
      if (j.lang) { env.setLang(j.lang); done.push(j.lang === "bn" ? "বাংলা" : "English"); }
      if (j.labels !== undefined) { setState({ labels: j.labels }); done.push(j.labels ? l("labels on", "নাম দেখানো") : l("labels off", "নাম লুকানো")); }
      return { parts: [{ k: "text", text: l(`Done: ${done.join(", ")}.`, `হয়ে গেছে: ${done.join(", ")}।`) }] };
    }
    case "reset": { await ensureMap(env, "/", true); setState({ view3d: false, compare: null, selection: null, highlight: null }); fitBounds(HOME_BOUNDS); return { parts: [{ k: "text", text: l("Showing the whole delta.", "পুরো ব-দ্বীপ দেখানো হচ্ছে।") }] }; }
    case "locate": {
      mem.here = null;
      const me = await myLocation();
      if (!me) return { fail: l("Your location is not available — allow location for this site.", "আপনার অবস্থান পাওয়া যাচ্ছে না — এই সাইটে অবস্থানের অনুমতি দিন।") };
      await ensureMap(env, "/", true);
      flyTo(me[0], me[1], 14);
      return { parts: [{ k: "text", text: l(`You are at ${me[1].toFixed(5)}, ${me[0].toFixed(5)}.`, `আপনি আছেন ${me[1].toFixed(5)}, ${me[0].toFixed(5)}-এ।`) }], chips: [{ label: l("What is around me?", "আমার আশেপাশে কী আছে?"), send: l("nearest hospital and ghat near me", "আমার কাছে হাসপাতাল আর ঘাট") }] };
    }
    case "page": await env.go(j.path); return { parts: [{ k: "text", text: l(`Opened ${j.label}.`, `${j.label} খোলা হয়েছে।`) }] };
  }
}
function altChips(alts: IndexRow[], lang: Lang, verb: "show" | "about"): Chip[] {
  return alts.slice(0, 3).map((r) => ({ label: placeLabel(r, lang), send: `${verb === "show" ? (lang === "bn" ? "দেখাও" : "show") : (lang === "bn" ? "তথ্য" : "about")} ${r.name} ${typeName(r.type, "en").split(" ")[0].toLowerCase()}` }));
}
function placeActions(env: Env, r: IndexRow): Action[] {
  const l = L(env.lang);
  return [
    { label: l("Add to trip", "যাত্রায় যোগ"), run: () => runJob(env, { a: "trip", kind: "add", place: r }) },
    { label: l("Report (PDF)", "রিপোর্ট (PDF)"), run: () => runJob(env, { a: "report", kind: AREA_TYPES.has(r.type) ? "area" : "place", fmt: "pdf", place: r }) },
    { label: l("Save place", "জায়গা রাখুন"), run: () => savePlace({ type: r.type, ref: r.id, name: r.name, lon: r.lon, lat: r.lat }) },
  ];
}

/* ================================================================== PLACE */
async function quickFacts(e: Entity, lang: Lang): Promise<[string, string][]> {
  const t = T(lang);
  const hx = await hexStore();
  const rows: [string, string][] = [];
  const a = e.attrs as Record<string, number | string | null>;
  if (typeof a.population === "number") rows.push([t("stat.population"), `${fmt(a.population, lang, 0)} (${lang === "bn" ? "২০১১" : "2011"})`]);
  else if (e.cells.length) { const p = popEstimate(hx, e.cells); if (p > 50) rows.push([t("stat.population"), `≈ ${fmt(Math.round(p / 10) * 10, lang, 0)} (WorldPop 2020)`]); }
  if (typeof a.households === "number") rows.push([t("stat.households"), fmt(a.households, lang, 0)]);
  if (typeof a.villages === "number") rows.push([t("stat.villages"), fmt(a.villages, lang, 0)]);
  const area = e.cells.reduce((s, c) => s + c[1], 0);
  if (area > 0 && e.type !== "river" && e.type !== "canal") rows.push([t("loc.area"), `${fmt(area, lang, area < 10 ? 2 : 0)} ${lang === "bn" ? "বর্গকিমি" : "km²"}`]);
  if (e.cells.length) {
    const prof = buildProfile(hx, e.cells, lang).flatMap((s) => s.rows);
    for (const k of ["protection", "land_share", "boat_low"]) {
      const r = prof.find((x) => x.key === k);
      if (r) rows.push([r.label, r.value]);
    }
  }
  if (e.admin.block && e.type !== "block") rows.push([t("ent.block"), e.admin.block]);
  if (e.admin.district && e.type !== "district") rows.push([t("ent.district"), e.admin.district]);
  return rows.slice(0, 10);
}
const NEAR_CATS: Record<string, { cats?: string[]; kind: "jetty" | "poi" | "village" | "place"; en: string; bn: string; colour: string }> = {
  health: { cats: ["health"], kind: "poi", en: "Health", bn: "স্বাস্থ্য", colour: "#e34948" }, police: { cats: ["emergency"], kind: "poi", en: "Police and emergency", bn: "পুলিশ ও জরুরি", colour: "#e34948" },
  shelter: { cats: ["shelter"], kind: "poi", en: "Cyclone shelters", bn: "আশ্রয়কেন্দ্র", colour: "#eb6834" }, ghat: { kind: "jetty", en: "Ghats and jetties", bn: "ঘাট ও জেটি", colour: "#256abf" },
  bank: { cats: ["finance"], kind: "poi", en: "Banks and post offices", bn: "ব্যাংক ও ডাকঘর", colour: "#6250d6" }, market: { cats: ["market"], kind: "poi", en: "Markets", bn: "বাজার", colour: "#97703f" },
  school: { cats: ["education"], kind: "poi", en: "Schools", bn: "স্কুল", colour: "#1baf7a" }, temple: { cats: ["religious"], kind: "poi", en: "Temples and mosques", bn: "মন্দির ও মসজিদ", colour: "#c98a00" },
  village: { kind: "village", en: "Villages", bn: "গ্রাম", colour: "#97703f" }, any: { kind: "poi", en: "Services", bn: "পরিষেবা", colour: "#6250d6" },
};
export function nearCatOf(f: string): string {
  if (/(hospital|health|doctor|daktar|haspatal|clinic|medicine|oshudh|হাসপাতাল|ডাক্তার|স্বাস্থ্য|ওষুধ)/i.test(f)) return "health";
  if (/(police|thana|পুলিশ|থানা|fire|domkol)/i.test(f)) return "police";
  if (/(shelter|ashroy|আশ্রয়|cyclone centre)/i.test(f)) return "shelter";
  if (/(ghat|jetty|ferry|ঘাট|জেটি|pier)/i.test(f)) return "ghat";
  if (/(bank|atm|post office|টাকা|ব্যাংক|ডাকঘর)/i.test(f)) return "bank";
  if (/(market|bazar|haat|হাট|বাজার|shop|dokan)/i.test(f)) return "market";
  if (/(school|college|স্কুল|কলেজ)/i.test(f)) return "school";
  if (/(temple|mandir|mosque|masjid|church|মন্দির|মসজিদ)/i.test(f)) return "temple";
  if (/(village|gram|গ্রাম)/i.test(f)) return "village";
  return "any";
}

export async function placeAgent(env: Env, j: Extract<Job, { a: "place" }>): Promise<Out> {
  const l = L(env.lang);
  if (j.kind === "about") {
    const e = await getEntity(j.place.type, j.place.id);
    mem.place = j.place; if (AREA_TYPES.has(j.place.type)) mem.area = j.place;
    if (!e) return { fail: l("No data for that place.", "এই জায়গার তথ্য নেই।") };
    if (isMapPage(env.path())) await focus(j.place);
    const facts = await quickFacts(e, env.lang);
    return { parts: [{ k: "text", text: `**${j.place.name}** — ${typeName(j.place.type, env.lang)}${where(j.place) ? `, ${where(j.place)}` : ""}` }, { k: "facts", rows: facts }],
      actions: [{ label: l("Show on map", "মানচিত্রে দেখাও"), run: async () => { await ensureMap(env, "/", true); await focus(j.place); } }, ...placeActions(env, j.place)], chips: altChips(j.alts, env.lang, "about") };
  }
  if (j.kind === "nearest") {
    const ref: LL | null = j.place ? [j.place.lon, j.place.lat] : await myLocation();
    if (!ref) return { ask: { q: l("Near which place? Name a village, ghat or block — or allow your location.", "কোন জায়গার কাছে? একটি গ্রাম, ঘাট বা ব্লকের নাম বলুন — বা অবস্থানের অনুমতি দিন।"), chips: [], pending: { kind: "place", job: j, field: "place" } } };
    const c = NEAR_CATS[j.cat] || NEAR_CATS.any;
    let items: { name: string; sub: string; lon: number; lat: number; d: number; type: string; id: string }[] = [];
    if (c.kind === "village") items = (await nearest("village", ref[0], ref[1], 6)).map((x) => ({ name: x.rec.name, sub: `${fmt(x.rec.population || 0, env.lang, 0)} ${l("people", "জন")}`, lon: x.rec.lon, lat: x.rec.lat, d: x.km * 1000, type: x.rec.type === "Urban" ? "town" : "village", id: String(x.rec.id) }));
    else {
      const pts = await loadPoints();
      const src = c.kind === "jetty" ? pts.jetty : pts.poi.filter((p) => !c.cats || c.cats.includes(p.category || ""));
      items = src.map((p) => ({ name: p.name || (c.kind === "jetty" ? (p.nearest_village ? l(`Ghat near ${p.nearest_village}`, `${p.nearest_village}-এর কাছের ঘাট`) : l("Ghat", "ঘাট")) : p.amenity || ""), sub: (p.kind || p.amenity || p.category || "").replace(/_/g, " "),
        lon: p.lon, lat: p.lat, d: metres(ref, [p.lon, p.lat]), type: c.kind === "jetty" ? "jetty" : "poi", id: String(p.id) })).sort((a, b) => a.d - b.d).slice(0, 6);
    }
    await ensureMap(env, "/", true);
    setState({ pins: items.map((x, k) => ({ lon: x.lon, lat: x.lat, colour: c.colour, inner: { text: String(k + 1) }, size: 28, title: x.name })) });
    const lons = [ref[0], ...items.map((x) => x.lon)], lats = [ref[1], ...items.map((x) => x.lat)];
    fitBounds([Math.min(...lons) - 0.01, Math.min(...lats) - 0.01, Math.max(...lons) + 0.01, Math.max(...lats) + 0.01], 14);
    return { parts: [{ k: "list", title: `${l(c.en, c.bn)} · ${j.place ? j.place.name : l("near you", "আপনার কাছে")}`, items: items.map((x, k) => ({ title: `${fmt(k + 1, env.lang, 0)}. ${x.name}`, sub: x.sub, right: fmtKm(x.d, env.lang), colour: c.colour,
      act: { label: l("Go", "যান"), run: () => { const from = j.place ? { row: j.place, stay: 0 } : { row: null, ll: ref, name: l("My location", "আমার অবস্থান"), stay: 0 }; return runJob(env, { a: "trip", kind: "plan", stops: [from, { row: null, ll: [x.lon, x.lat], name: x.name, stay: null }], leaveAt: null, mode: x.d < 3000 ? "walk" : null, vessel: null, tide: null, back: false, best: false, each: null }); } } })) }],
      note: l("Numbered pins are on the map.", "নম্বর দেওয়া পিন মানচিত্রে।") };
  }
  if (j.kind === "distance") {
    const d = metres([j.from.lon, j.from.lat], [j.to.lon, j.to.lat]);
    const r = await planRoute({ origin: [j.from.lon, j.from.lat], dest: [j.to.lon, j.to.lat], mode: "multimodal", tide: "low", vessel: "motor_boat", prefer: "safe", alternatives: false }).catch(() => null);
    const rows: [string, string][] = [[l("Straight line", "সরলরেখায়"), fmtKm(d, env.lang)]];
    if (r?.status === "ok" && r.routes[0]) rows.push([l("By boat and on foot (low tide)", "নৌকা ও হেঁটে (ভাটা)"), `${fmtKm(r.routes[0].km * 1000, env.lang)} · ${fmtDuration(r.routes[0].min, env.lang)}`]);
    return { parts: [{ k: "text", text: `**${j.from.name} → ${j.to.name}**` }, { k: "facts", rows }],
      actions: [{ label: l("Plan this trip", "এই যাত্রা পরিকল্পনা"), primary: true, run: () => runJob(env, { a: "trip", kind: "plan", stops: [{ row: j.from, stay: 0 }, { row: j.to, stay: null }], leaveAt: null, mode: null, vessel: null, tide: null, back: false, best: false, each: null }) }] };
  }
  // compare two or more places side by side
  const ents = (await Promise.all(j.places.slice(0, 3).map((p) => getEntity(p.type, p.id)))).filter((e): e is Entity => !!e);
  const facts = await Promise.all(ents.map((e) => quickFacts(e, env.lang)));
  const keys = [...new Set(facts.flatMap((f) => f.map((r) => r[0])))].filter((k) => k !== translate(env.lang, "ent.block") && k !== translate(env.lang, "ent.district"));
  return { parts: [{ k: "text", text: l(`Comparing ${ents.map((e) => `**${e.name}**`).join(" and ")}:`, `${ents.map((e) => `**${e.name}**`).join(" ও ")}-এর তুলনা:`) },
    ...keys.map((k) => ({ k: "facts", title: k, rows: ents.map((e, i) => [e.name, facts[i].find((r) => r[0] === k)?.[1] || "—"]) } as Part))] };
}

/* ================================================================== TRIP */
const pinName = (lang: Lang) => L(lang)("My location", "আমার অবস্থান");
export async function tripAgent(env: Env, j: Extract<Job, { a: "trip" }>): Promise<Out> {
  const l = L(env.lang);
  if (j.kind === "plan") {
    if (j.fromMe || j.stops.length < 2) {
      const me = j.fromMe || mem.here ? await myLocation() : null;
      if (me && j.stops.length >= 1) j.stops.unshift({ row: null, ll: me, name: pinName(env.lang), stay: 0 });
      else if (j.fromMe && j.stops.length >= 1) return { fail: L(env.lang)("Your location is not available — allow location for this site, or tell me where you start.", "আপনার অবস্থান পাওয়া যাচ্ছে না — এই সাইটে অবস্থানের অনুমতি দিন, বা কোথা থেকে শুরু করবেন বলুন।"), chips: [{ label: "Canning", send: "Canning" }, { label: "Gosaba", send: "Gosaba" }] };
      else {
        const chips: Chip[] = [{ label: pinName(env.lang), send: env.lang === "bn" ? "আমার অবস্থান থেকে" : "from my location" }];
        if (mem.place && j.stops[0]?.row?.key !== mem.place.key) chips.push({ label: mem.place.name, send: mem.place.name });
        ["Canning", "Gosaba", "Sonakhali Ferry Ghat"].forEach((n) => { if (!chips.some((c) => c.label === n)) chips.push({ label: n, send: n }); });
        return { ask: { q: l(`Where do you start${j.stops[0] ? ` for ${j.stops[0].row?.name || j.stops[0].name}` : ""}?`, `${j.stops[0] ? `${j.stops[0].row?.name || j.stops[0].name} যাওয়ার জন্য ` : ""}কোথা থেকে শুরু করবেন?`), chips: chips.slice(0, 5), pending: { kind: "tripStart", job: j } } };
      }
    }
    const stops: TripStop[] = j.stops.map((s, i) => ({ id: stopId(), name: s.row?.name || s.name || "—", lon: s.row?.lon ?? s.ll![0], lat: s.row?.lat ?? s.ll![1], type: s.row?.type || "point", ref: s.row?.id,
      stay: i === 0 ? 0 : s.stay ?? j.each ?? 30 }));
    const cur = getTrip().settings;
    const settings: Partial<TripSettings> = { leaveAt: j.leaveAt ?? nextQuarter(), bestOrder: j.best && stops.length >= 4, returnToStart: j.back };
    if (j.mode) settings.mode = j.mode; else settings.mode = cur.mode || "multimodal";
    if (j.vessel) settings.vessel = j.vessel;
    if (j.tide) settings.tide = j.tide; else settings.tide = "auto";
    if (!isTripPage(env.path())) await env.go("/route/");
    j.fromMe = false;
    setStops(stops); setSettings(settings);
    let p = await replan();
    // a river trip that does not connect on foot + boat: try by boat
    if ((!p || p.failed) && settings.mode === "multimodal") { setSettings({ mode: "boat" }); p = await replan(); }
    if (p && !p.failed) void fitTrip(p);
    if (!p || p.failed) {
      const f = p?.failed;
      return { fail: l(`No connected route${f ? ` between ${p!.stops[f.hop]?.name} and ${p!.stops[f.hop + 1]?.name}` : ""}.${f?.reason ? " " + translate(env.lang, `route.reason.${f.reason}` as TKey) : ""}`,
        `কোনো সংযুক্ত পথ পাওয়া যায়নি${f ? ` (${p!.stops[f.hop]?.name} ও ${p!.stops[f.hop + 1]?.name}-এর মধ্যে)` : ""}।${f?.reason ? " " + translate(env.lang, `route.reason.${f.reason}` as TKey) : ""}`),
        chips: [{ label: l("Try by boat at high tide", "জোয়ারে নৌকায় চেষ্টা"), send: l("make it by boat at high tide", "জোয়ারে নৌকায় করো") }] };
    }
    return tripSummary(env, p);
  }
  if (j.kind === "add") { addStop({ name: j.place.name, lon: j.place.lon, lat: j.place.lat, type: j.place.type, ref: j.place.id }); if (getTrip().stops.length >= 2 && isTripPage(env.path())) { const p = await replan(); if (p && !p.failed) void fitTrip(p); if (p && !p.failed) return tripSummary(env, p, l(`Added ${j.place.name}.`, `${j.place.name} যোগ হয়েছে।`)); } return { parts: [{ k: "text", text: l(`Added **${j.place.name}** to your trip (${getTrip().stops.length} places).`, `**${j.place.name}** যাত্রায় যোগ হয়েছে (${fmt(getTrip().stops.length, "bn", 0)}টি জায়গা)।`) }], chips: [{ label: l("Plan it", "পরিকল্পনা করো"), send: l("plan my trip", "আমার যাত্রা পরিকল্পনা করো") }] }; }
  if (j.kind === "remove") {
    const i = getTrip().stops.findIndex((s) => s.ref === j.place.id || s.name === j.place.name);
    if (i < 0) return { fail: l(`${j.place.name} is not in your trip.`, `${j.place.name} যাত্রায় নেই।`) };
    removeStop(i);
    return { parts: [{ k: "text", text: l(`Removed **${j.place.name}**.`, `**${j.place.name}** বাদ দেওয়া হয়েছে।`) }], chips: [{ label: l("Plan again", "আবার পরিকল্পনা"), send: l("plan my trip", "আমার যাত্রা পরিকল্পনা করো") }] };
  }
  if (j.kind === "clear") { clearTrip(); setState({ pins: [], spots: [], routes: null }); return { parts: [{ k: "text", text: l("Your trip is cleared.", "যাত্রা মুছে দেওয়া হয়েছে।") }] }; }
  if (j.kind === "tweak") {
    const st = getTrip();
    if (st.stops.length < 2) return { fail: l("There is no trip yet — tell me where you want to go.", "এখনও কোনো যাত্রা নেই — কোথায় যেতে চান বলুন।") };
    const p: Partial<TripSettings> = {};
    if (j.mode) p.mode = j.mode; if (j.vessel) p.vessel = j.vessel; if (j.tide) p.tide = j.tide; if (j.leaveAt) p.leaveAt = j.leaveAt; if (j.back !== null) p.returnToStart = j.back; if (j.best !== null) p.bestOrder = j.best;
    setSettings(p);
    if (!isTripPage(env.path())) await env.go("/route/");
    const plan = await replan();
    if (!plan || plan.failed) return { fail: l("With that change the trip does not connect.", "এই পরিবর্তনে যাত্রা সংযুক্ত হয় না।") };
    void fitTrip(plan);
    return tripSummary(env, plan, l("Trip updated.", "যাত্রা হালনাগাদ হয়েছে।"));
  }
  const plan = await ensurePlan(env);
  if (!plan) return { fail: l("There is no planned trip yet — tell me the places first.", "এখনও কোনো পরিকল্পিত যাত্রা নেই — আগে জায়গাগুলি বলুন।"), chips: STARTERS(env.lang).slice(0, 1) };
  if (j.kind === "start3d") {
    if (!isTripPage(env.path())) await env.go("/route/");
    await new Promise((r) => setTimeout(r, 400));
    launch3d(j.live);
    return { parts: [{ k: "text", text: j.live ? l("Live 3D tracking is starting — allow your location when asked. The map follows you, tells you when you leave the route and can plan again from where you are.", "লাইভ ৩ডি ট্র্যাকিং চালু হচ্ছে — অনুমতি চাইলে অবস্থান দিন। মানচিত্র আপনাকে অনুসরণ করবে, পথ থেকে সরলে জানাবে, আর যেখানে আছেন সেখান থেকে আবার পরিকল্পনা করতে পারবে।")
      : l("The 3D trip is starting. Pause it to see help points, ghats and villages around, drag the strip to jump in time, or switch to Live GPS.", "৩ডি যাত্রা শুরু হচ্ছে। থামিয়ে আশেপাশের সহায়তা কেন্দ্র, ঘাট ও গ্রাম দেখুন, নিচের দাগ টেনে সময়ে এগোন-পিছোন, বা লাইভ জিপিএস চালু করুন।") }] };
  }
  if (j.kind === "save") {
    const title = `${plan.stops[0].name} → ${plan.stops[plan.stops.length - 1].name}`;
    saveJourney({ name: title, mode: plan.settings.mode, tide: plan.settings.tide, km: plan.totals.km, min: plan.totals.min, from: plan.stops[0].name, to: plan.stops[plan.stops.length - 1].name,
      geometry: plan.hops.flatMap((h) => h.legs.map((x) => x.coords)), trip: shareUrl(getTrip().stops, getTrip().settings).split("trip=")[1], stops: getTrip().stops.length });
    return { parts: [{ k: "text", text: l("Saved to My data.", "‘আমার তথ্য’-তে রাখা হয়েছে।") }], actions: [{ label: l("Open My data", "আমার তথ্য খুলুন"), run: () => env.go("/my/") }] };
  }
  if (j.kind !== "export") return { fail: l("I could not do that with the trip.", "যাত্রায় এটা করা গেল না।") };
  const title = `${plan.stops[0].name} → ${plan.stops[plan.stops.length - 1].name}`;
  if (j.fmt === "gpx") { downloadBlob(new Blob([tripGpx(plan, title)], { type: "application/gpx+xml" }), `${safeName(`DISHARI_trip_${title}`)}.gpx`); return { parts: [{ k: "file", name: `DISHARI_trip_${safeName(title)}.gpx`, format: "GPX" }] }; }
  if (j.fmt === "geojson") { downloadBlob(new Blob([JSON.stringify(tripGeoJSON(plan))], { type: "application/geo+json" }), `${safeName(`DISHARI_trip_${title}`)}.geojson`); return { parts: [{ k: "file", name: `DISHARI_trip_${safeName(title)}.geojson`, format: "GeoJSON" }] }; }
  if (j.fmt === "gmaps") { const u = googleMapsUrl(plan.stops); window.open(u, "_blank", "noopener"); return { parts: [{ k: "text", text: l("Opened the places in Google Maps.", "জায়গাগুলি গুগল ম্যাপে খোলা হয়েছে।") }], actions: [{ label: "Google Maps", run: () => { window.open(u, "_blank", "noopener"); }, href: u }] }; }
  const u = shareUrl(getTrip().stops, getTrip().settings);
  try { await navigator.clipboard.writeText(u); } catch { /* clipboard blocked */ }
  return { parts: [{ k: "text", text: l("Share link copied — anyone who opens it gets the same trip:", "শেয়ার লিঙ্ক কপি হয়েছে — যে খুলবে সে একই যাত্রা পাবে:") }, { k: "note", text: u }] };
}
const isTripPage = (p: string) => /^\/route\/?/.test(p);
/** frame the whole planned route (room for the trip bar at the bottom and the chat on the side) */
async function fitTrip(p: TripPlan) {
  await mapReady();
  const m = getMap();
  if (!m) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const h of p.hops) for (const leg of h.legs) for (const c of leg.coords as LL[]) take(c[0], c[1]);
  for (const s of p.stops) take(s.lon, s.lat);
  if (!(x1 >= x0)) return;
  const small = window.matchMedia("(max-width: 767px)").matches;
  try { m.fitBounds([[x0 - 0.006, y0 - 0.006], [x1 + 0.006, y1 + 0.006]], { padding: mapPadding(small ? 0 : 170), maxZoom: 14, duration: 900 }); } catch { /* the window is too small to frame it */ }
}
async function ensurePlan(env: Env): Promise<TripPlan | null> {
  const st = getTrip();
  if (st.plan && !st.stale && !st.plan.failed) return st.plan;
  if (st.stops.length >= 2) { if (!isTripPage(env.path())) await env.go("/route/"); const p = await replan(); return p && !p.failed ? p : null; }
  return null;
}
function tripSummary(env: Env, p: TripPlan, lead?: string): Out {
  const l = L(env.lang), lang = env.lang;
  const n = p.stops.length - 1;
  const parts: Part[] = [];
  if (lead) parts.push({ k: "text", text: lead });
  parts.push({ k: "text", text: l(`**${p.stops[0].name} → ${p.stops[n].name}** · ${dayLabel(p.start, "en")} · leave ${clock(p.start, "en")}, arrive ${clock(p.end, "en")}.`,
    `**${p.stops[0].name} → ${p.stops[n].name}** · ${dayLabel(p.start, "bn")} · রওনা ${clock(p.start, "bn")}, পৌঁছানো ${clock(p.end, "bn")}।`) });
  parts.push({ k: "kpis", items: [{ label: tw(lang, "k_total"), value: fmtDuration(p.totals.min, lang) }, { label: tw(lang, "k_dist"), value: fmtKm(p.totals.km * 1000, lang) },
    { label: tw(lang, "k_boat"), value: fmtKm(p.totals.boatKm * 1000, lang) }, { label: tw(lang, "k_walk"), value: fmtKm(p.totals.walkKm * 1000, lang) }] });
  parts.push({ k: "list", items: p.hops.map((h, i) => {
    const boat = h.legs.some((x) => x.mode === "boat");
    const rivers = [...new Set(h.legs.flatMap((x) => x.rivers))];
    return { title: `${fmt(i + 1, lang, 0)}. ${p.stops[h.from].name} → ${p.stops[h.to].name}`, colour: boat ? "#2a78d6" : "#3c3b37",
      sub: [h.legs.map((x) => (x.mode === "boat" ? vesselName(p.settings.vessel, lang) : tw(lang, "s_walk"))).join(" + "), rivers.length ? tw(lang, "via", { r: rivers.join(", ") }) : "", boat ? tideName(h.tide, lang) : "",
        h.legs.length > 1 ? tw(lang, "changeAt", { g: legEnd(h.legs[1], "from", lang) }) : ""].filter(Boolean).join(" · "),
      right: `${clock(h.depart, lang)}–${clock(h.arrive, lang)}` };
  }) });
  if (p.reordered) parts.push({ k: "note", text: tw(lang, "reordered") });
  return { parts, actions: [
    { label: tw(lang, "start3d"), primary: true, run: async () => { if (!isTripPage(env.path())) await env.go("/route/"); launch3d(false); } },
    { label: "PDF", run: () => runJob(env, { a: "report", kind: "trip", fmt: "pdf" }) },
    { label: "Word", run: () => runJob(env, { a: "report", kind: "trip", fmt: "docx" }) },
    { label: "GPX", run: () => runJob(env, { a: "trip", kind: "export", fmt: "gpx" }) },
    { label: l("Live tracking", "লাইভ ট্র্যাকিং"), run: async () => { if (!isTripPage(env.path())) await env.go("/route/"); launch3d(true); } },
  ], chips: [{ label: l("Make it high tide", "জোয়ারে করো"), send: l("make it high tide", "জোয়ারে করো") }, { label: l("Trip report PDF", "যাত্রার রিপোর্ট PDF"), send: l("trip report pdf", "যাত্রার রিপোর্ট PDF দাও") }, { label: l("Weather on the way", "পথে আবহাওয়া"), send: l(`weather at ${p.stops[0].name}`, `${p.stops[0].name}-এ আবহাওয়া`) }] };
}

/* ================================================================== REPORT */
export async function makeReport(env: Env, kind: Extract<Job, { a: "report" }>["kind"], fmtIn: Fmt, place: IndexRow | null, theme?: Theme | null, ds?: string): Promise<Out> {
  const l = L(env.lang);
  const { exportReport } = await import("../report");
  const format: Format = fmtIn === "docx" ? "docx" : fmtIn === "xlsx" ? "xlsx" : "pdf";
  if (kind === "trip") {
    const plan = await ensurePlan(env);
    if (!plan) return { fail: l("There is no planned trip yet.", "এখনও কোনো পরিকল্পিত যাত্রা নেই।") };
    const { tripReport } = await import("../trip/report");
    const doc = await tripReport(plan, env.lang);
    await exportReport(doc, format);
    return { parts: [{ k: "file", name: `${safeName(doc.fileBase)}.${format}`, format: fmtName(fmtIn === "xlsx" ? "xlsx" : format, env.lang) }] };
  }
  if (kind === "dataset") {
    const { dataset, DATASETS } = await import("../report/datasets");
    const key = ds || "villages";
    const d = DATASETS.find((x) => x.key === key)!;
    const f = (d.formats as string[]).includes(fmtIn) ? (fmtIn as "csv" | "xlsx" | "geojson") : d.formats[0];
    await dataset(key, f);
    return { parts: [{ k: "file", name: `DISHARI_${key}.${f}`, format: f.toUpperCase() }, { k: "note", text: env.lang === "bn" ? d.bn : d.en }] };
  }
  if (kind === "map") {
    await ensureMap(env, "/", true);
    await new Promise((r) => setTimeout(r, 900));
    const title = l("Sundarbans — map", "সুন্দরবন — মানচিত্র");
    const c = await composeMap({ title, legend: true, lang: env.lang });
    if (fmtIn === "png") { const blob: Blob = await new Promise((ok) => c.toBlob((b) => ok(b!), "image/png")); downloadBlob(blob, `${safeName(title)}.png`); return { parts: [{ k: "file", name: `${safeName(title)}.png`, format: "PNG" }] }; }
    const { mapSheetPdf } = await import("../report/pdf");
    downloadBlob(await mapSheetPdf(c.toDataURL("image/png"), c.width, c.height, title, "A4"), `${safeName(title)}.pdf`);
    return { parts: [{ k: "file", name: `${safeName(title)}.pdf`, format: "PDF" }] };
  }
  // one block (the place's own block for a village or ghat), or all blocks side by side
  const lean = await import("../report/lean");
  const { blockByName, blockById, pointInfo } = await import("../blockinfo");
  void theme;
  let doc;
  if (place && place.type === "block") { const b = (await blockById(place.id)) || (await blockByName(place.name)); doc = b ? lean.blockReport(b, env.lang) : null; }
  else if (place && place.type !== "district") { const pi = await pointInfo(place.lon, place.lat); doc = pi.block ? lean.blockReport(pi.block, env.lang) : null; }
  else doc = await lean.overviewReport(env.lang);
  if (!doc) return { fail: l("No data for that place.", "এই জায়গার তথ্য নেই।") };
  await exportReport(doc, format);
  mem.lastFile = doc.fileBase;
  return { parts: [{ k: "file", name: `${safeName(doc.fileBase)}.${format}`, format: fmtName(format === "xlsx" ? "xlsx" : format, env.lang) }, { k: "note", text: doc.title }] };
}
export async function reportAgent(env: Env, j: Extract<Job, { a: "report" }>): Promise<Out> {
  if (j.fmt === "gpx" || j.fmt === "geojson" && j.kind === "trip" || j.fmt === "gmaps" || j.fmt === "link") return tripAgent(env, { a: "trip", kind: "export", fmt: j.fmt });
  const out = await makeReport(env, j.kind, j.fmt, j.place || null, j.theme, j.dataset);
  const l = L(env.lang);
  if (!out.fail) out.chips = [{ label: l("Also in Word", "Word-এও দাও"), send: l("same report in word", "একই রিপোর্ট Word-এ দাও") }, { label: l("Open the dashboard", "ড্যাশবোর্ড খোলো"), send: l("open dashboard", "ড্যাশবোর্ড খোলো") }];
  return out;
}

/* ================================================================== DECISION */
interface Rule { key: string; dir: 1 | -1; min?: number; max?: number; w: number }
const FIND: Record<Exclude<Theme, "environment">, { rules: Rule[]; en: string; bn: string; why: [string, string] }> = {
  fish: { rules: [{ key: "channel_main", dir: 1, min: 20, w: 2 }, { key: "chl", dir: 1, w: 1 }, { key: "water_perm", dir: 1, w: 1 }, { key: "boat_low", dir: -1, max: 12, w: 1.5 }],
    en: "fishing", bn: "মাছ ধরার", why: ["main river channel, chlorophyll, permanent water and boat access from a ghat at low tide", "প্রধান নদীখাত, ক্লোরোফিল, স্থায়ী জল আর ভাটায় ঘাট থেকে নৌকায় পৌঁছানো"] },
  crab: { rules: [{ key: "creek_network", dir: 1, min: 8, w: 2 }, { key: "mangrove_2025", dir: 1, min: 30, w: 1.5 }, { key: "water_tidal", dir: 1, w: 1 }, { key: "boat_low", dir: -1, max: 15, w: 1 }],
    en: "crab", bn: "কাঁকড়া", why: ["creeks inside mangrove, tidal water and boat access at low tide", "ম্যানগ্রোভের ভিতরে খাঁড়ি, জোয়ারের জল আর ভাটায় নৌকায় পৌঁছানো"] },
  honey: { rules: [{ key: "mangrove_2025", dir: 1, min: 50, w: 2 }, { key: "ndvi_s2_2025", dir: 1, min: 0.4, w: 1.5 }, { key: "lc_mangrove", dir: 1, w: 1 }, { key: "boat_low", dir: -1, max: 15, w: 1 }],
    en: "honey", bn: "মধু", why: ["dense, green mangrove (flowering shrubs) reachable by boat", "ঘন, সবুজ ম্যানগ্রোভ (ফুলের গুল্ম) নৌকায় পৌঁছানো যায়"] },
  tiger: { rules: [{ key: "tiger_suit", dir: 1, min: 0.45, w: 2 }, { key: "prey_suit", dir: 1, w: 1 }, { key: "boat_high", dir: -1, max: 12, w: 1 }],
    en: "tiger-habitat", bn: "বাঘের আবাস", why: ["high tiger and prey habitat suitability outside the National Park core, reachable by boat", "জাতীয় উদ্যানের কোরের বাইরে বাঘ ও শিকার প্রাণীর উচ্চ আবাস উপযোগিতা, নৌকায় পৌঁছানো যায়"] },
};
async function protectionLabel(hx: HexStore, i: number, lang: Lang) {
  const v = hx.value("protection", i);
  return Number.isNaN(v) ? "—" : translate(lang, `gate.${Math.round(v)}` as TKey);
}
export async function decisionAgent(env: Env, j: Extract<Job, { a: "decision" }>): Promise<Out> {
  const l = L(env.lang);
  const hx = await hexStore();
  if (j.kind === "mission") return missionAgent(env, j);
  if (j.kind === "find" && j.theme !== "environment") return missionAgent(env, { a: "decision", kind: "mission", out: [j.theme as Zone], back: [], nearest: false, start: j.place, fromMe: false, plan: false, leaveAt: null });
  if (j.kind === "find") {
    if (j.theme === "environment") return dataAgent(env, { a: "data", kind: "rank", metric: "erosion_1525", level: "block", n: 5, low: false, within: null });
    const spec = FIND[j.theme];
    const ref: LL | null = j.place ? [j.place.lon, j.place.lat] : mem.place ? [mem.place.lon, mem.place.lat] : await myLocation();
    const centre: LL = ref || (() => { const m = getMap()?.getCenter(); return m ? [m.lng, m.lat] as LL : [88.75, 22.05] as LL; })();
    const radius = j.radius ?? 15;
    const cols = spec.rules.map((r) => ({ r, v: hx.get(r.key), def: hx.def(r.key)! }));
    const prot = hx.get("protection");
    const kx = Math.cos((centre[1] * Math.PI) / 180);
    const cand: { i: number; km: number; s: number }[] = [];
    for (let i = 0; i < hx.n; i++) {
      if (Math.round(prot[i]) === 3) continue;                       // never inside the National Park core
      const km = Math.hypot((hx.meta.lon[i] - centre[0]) * kx, hx.meta.lat[i] - centre[1]) * 111.2;
      if (km > radius) continue;
      let ok = true, s = 0;
      for (const c of cols) {
        const v = c.v[i];
        if (Number.isNaN(v)) { if (c.r.min !== undefined || c.r.max !== undefined) { ok = false; break; } continue; }
        if (c.r.min !== undefined && v < c.r.min) { ok = false; break; }
        if (c.r.max !== undefined && v > c.r.max) { ok = false; break; }
        const span = (c.def.max - c.def.min) || 1;
        s += c.r.w * (c.r.dir > 0 ? (v - c.def.min) / span : (c.def.max - v) / span);
      }
      if (ok) cand.push({ i, km, s: s - km * 0.02 });
    }
    cand.sort((a, b) => b.s - a.s);
    if (!cand.length) return { fail: l(`No hexagon within ${fmt(radius, "en", 0)} km meets the ${spec.en} conditions. Try a larger distance.`, `${fmt(radius, "bn", 0)} কিমির মধ্যে কোনো ষড়ভুজ ${spec.bn} শর্ত পূরণ করে না। দূরত্ব বাড়িয়ে দেখুন।`),
      chips: [{ label: l("Within 30 km", "৩০ কিমির মধ্যে"), send: l(`best ${spec.en} areas within 30 km of ${j.place?.name || mem.place?.name || "Gosaba"}`, `${j.place?.name || mem.place?.name || "Gosaba"}-র ৩০ কিমির মধ্যে সেরা ${spec.bn} জায়গা`) }] };
    await ensurePage(env, THEME_PAGE[j.theme]);
    const vals = new Float32Array(hx.n).fill(NaN);
    cand.forEach((c) => { vals[c.i] = 1; });
    const top = cand.slice(0, 5);
    top.forEach((c) => { vals[c.i] = 2; });
    const title = l(`Best ${spec.en} areas`, `সেরা ${spec.bn} এলাকা`);
    showResult(title, vals, [{ v: 2, colour: "#c0302f", label: l("Top 5", "সেরা ৫") }, { v: 1, colour: "#eda100", label: l("Meets the conditions", "শর্ত পূরণ করে") }]);
    setState({ pins: top.map((c, k) => ({ lon: hx.meta.lon[c.i], lat: hx.meta.lat[c.i], colour: "#c0302f", inner: { text: String(k + 1) }, size: 30, title: hx.meta.id[c.i] })) });
    const lons = [centre[0], ...top.map((c) => hx.meta.lon[c.i])], lats = [centre[1], ...top.map((c) => hx.meta.lat[c.i])];
    fitBounds([Math.min(...lons) - 0.03, Math.min(...lats) - 0.03, Math.max(...lons) + 0.03, Math.max(...lats) + 0.03], 12.5);
    mem.findTitle = title; mem.theme = j.theme;
    const items = await Promise.all(top.map(async (c, k) => {
      const blk = hx.meta.blocks[hx.meta.block[c.i]] || "";
      const v0 = cols[0];
      return { title: `${fmt(k + 1, env.lang, 0)}. ${hx.meta.id[c.i]}${blk ? ` · ${blk}` : ""}`, colour: "#c0302f",
        sub: `${varLabel(v0.def, env.lang)}: ${fmt(v0.v[c.i], env.lang, v0.def.digits)} ${varUnit(v0.def, env.lang)} · ${await protectionLabel(hx, c.i, env.lang)}`, right: fmtKm(c.km * 1000, env.lang),
        act: { label: l("Go", "যান"), run: () => runJob(env, { a: "trip", kind: "plan", stops: [j.place ? { row: j.place, stay: 0 } : { row: null, ll: centre, name: ref ? pinName(env.lang) : l("Map centre", "মানচিত্রের কেন্দ্র"), stay: 0 }, { row: null, ll: [hx.meta.lon[c.i], hx.meta.lat[c.i]], name: `${hx.meta.id[c.i]} (${spec.en})`, stay: null }], leaveAt: null, mode: "boat", vessel: null, tide: null, back: true, best: false, each: 120 }) } };
    }));
    const area = cand.length * 1.6;
    return { parts: [{ k: "text", text: l(`**${fmt(cand.length, "en", 0)} hexagons (≈ ${fmt(area, "en", 0)} km²)** within ${fmt(radius, "en", 0)} km of ${j.place?.name || (ref ? "you" : "the map centre")} meet the ${spec.en} conditions — ${spec.why[0]}. The best five:`,
      `${j.place ? `${j.place.name}-র` : ref ? "আপনার" : "মানচিত্রের কেন্দ্রের"} ${fmt(radius, "bn", 0)} কিমির মধ্যে **${fmt(cand.length, "bn", 0)}টি ষড়ভুজ (≈ ${fmt(area, "bn", 0)} বর্গকিমি)** ${spec.bn} শর্ত পূরণ করে — ${spec.why[1]}। সেরা পাঁচটি:`) },
      { k: "list", items }, { k: "note", text: l("The National Park core is left out; areas marked “Protected area — permit” need a Forest Department permit.", "জাতীয় উদ্যানের কোর বাদ রাখা হয়েছে; ‘সংরক্ষিত এলাকা — অনুমতি’ লেখা জায়গায় বন দপ্তরের অনুমতি লাগে।") }],
      actions: [{ label: l("Download the list (CSV)", "তালিকা ডাউনলোড (CSV)"), run: async () => { const { exportTable } = await import("../report"); await exportTable(`DISHARI_best_${j.theme}_areas`, ["rank", "hexagon", "block", "distance_km", ...cols.map((c) => c.r.key), "legal_status"], await Promise.all(cand.slice(0, 200).map(async (c, k) => [k + 1, hx.meta.id[c.i], hx.meta.blocks[hx.meta.block[c.i]] || "", +c.km.toFixed(2), ...cols.map((x) => (Number.isNaN(x.v[c.i]) ? null : +x.v[c.i].toFixed(3))), await protectionLabel(hx, c.i, "en")])), "csv"); } }],
      chips: [{ label: l("Weather there", "সেখানে আবহাওয়া"), send: l(`weather at ${j.place?.name || "Gosaba"}`, `${j.place?.name || "Gosaba"}-এ আবহাওয়া`) }, { label: l("Show in 3D", "৩ডি-তে দেখাও"), send: l("3D view on", "৩ডি দেখাও") }] };
  }
  if (j.kind === "risk") {
    const e = await getEntity(j.place.type, j.place.id);
    const cells: Cells = e?.cells?.length ? e.cells : (() => { const i = hx.at(j.place.lon, j.place.lat); return i === null || i === undefined ? [] : [[i, 1]] as Cells; })();
    if (!cells.length) return { fail: l("That place is outside the study area.", "জায়গাটি সমীক্ষা এলাকার বাইরে।") };
    const prof = buildProfile(hx, cells, env.lang).flatMap((s) => s.rows);
    const get = (k: string) => prof.find((r) => r.key === k);
    const rows: [string, string][] = [];
    for (const k of ["protection", "dist_np", "boat_low"]) { const r = get(k); if (r) rows.push([r.label, r.value]); }
    const pz = get("protection"), tz = get("tiger_zone");
    const gateMain = pz?.classes ? [...pz.classes].sort((a, b) => b.km2 - a.km2)[0]?.v : NaN;
    const tzTop = tz?.classes ? [...tz.classes].sort((a, b) => b.km2 - a.km2)[0] : null;
    const decide = gateMain === 3 ? l("Entry is not allowed — this is the National Park core.", "প্রবেশ নিষেধ — এটি জাতীয় উদ্যানের কোর।")
      : gateMain === 2 ? l("Entry needs a Forest Department permit (protected forest).", "প্রবেশের জন্য বন দপ্তরের অনুমতি লাগে (সংরক্ষিত বন)।") : l("Open area — no permit is needed to visit.", "উন্মুক্ত এলাকা — যেতে অনুমতি লাগে না।");
    const tline = tzTop ? l(`Tiger habitat here is mostly **${tzTop.label}** (${fmt(tzTop.pct, "en", 0)}% of the area).`, `এখানে বাঘের আবাস বেশিরভাগ **${tzTop.label}** (এলাকার ${fmt(tzTop.pct, "bn", 0)}%)।`) : "";
    // protected forest touching this spot, and how far the National Park is
    const here = await whatIsHere(j.place.lon, j.place.lat).catch(() => null);
    const pas = [...new Set((here?.pas || []).map((x) => x.kind === "core" ? l("the National Park core", "জাতীয় উদ্যানের কোর") : x.name))].slice(0, 3);
    const dnp = cells.length ? aggregate(hx.get("dist_np"), cells).mean : NaN;
    const near: string[] = [];
    if (gateMain !== 3 && pas.length) near.push(l(`Protected forest is right here (${pas.join(", ")}) — going into the forest needs a permit.`, `সংরক্ষিত বন এখানেই (${pas.join(", ")}) — বনে ঢুকতে অনুমতি লাগে।`));
    else if (gateMain !== 3 && dnp >= 0 && dnp <= 2) near.push(l(`The National Park is only ${fmt(dnp, "en", 1)} km away — going into the forest needs a permit.`, `জাতীয় উদ্যান মাত্র ${fmt(dnp, "bn", 1)} কিমি দূরে — বনে ঢুকতে অনুমতি লাগে।`));
    await ensureMap(env, "/", true);
    await focus(j.place);
    return { parts: [{ k: "text", text: `**${j.place.name}**: ${decide}${near.length ? ` ${near.join(" ")}` : ""}` }, { k: "facts", rows }],
      actions: [{ label: l("Nearest help points", "নিকটতম সহায়তা কেন্দ্র"), run: () => runJob(env, { a: "place", kind: "nearest", cat: "health", place: j.place }) }] };
  }
  // best time: compare low and high tide for a boat trip and read the next tides from the forecast
  const [low, high] = await Promise.all((["low", "high"] as const).map((tide) => planRoute({ origin: [j.from.lon, j.from.lat], dest: [j.to.lon, j.to.lat], mode: "boat", tide, vessel: "motor_boat", prefer: "safe", alternatives: false }).catch(() => null)));
  const lr = low?.status === "ok" ? low.routes[0] : null, hr = high?.status === "ok" ? high.routes[0] : null;
  const rows: [string, string][] = [[tideName("low", env.lang), lr ? `${fmtDuration(lr.min, env.lang)} · ${fmtKm(lr.km * 1000, env.lang)}` : l("no boat route", "নৌপথ নেই")],
    [tideName("high", env.lang), hr ? `${fmtDuration(hr.min, env.lang)} · ${fmtKm(hr.km * 1000, env.lang)}` : l("no boat route", "নৌপথ নেই")]];
  const better: "low" | "high" | null = lr && hr ? (hr.min < lr.min - 5 ? "high" : lr.min < hr.min - 5 ? "low" : null) : hr ? "high" : lr ? "low" : null;
  const sea = (await getSeaLevel(j.from.lat, j.from.lon).catch(() => ({ data: null }))).data;
  const next = sea?.extremes.filter((x) => new Date(x.time.length <= 16 ? `${x.time}:00+05:30` : x.time).getTime() > Date.now()) || [];
  const nextBest = better ? next.find((x) => x.type === better) : null;
  const when = nextBest ? new Date(nextBest.time.length <= 16 ? `${nextBest.time}:00+05:30` : nextBest.time).getTime() : null;
  const leave = when ? when - 60 * 60000 : null;
  const text = !better ? l(`The tide makes little difference between ${j.from.name} and ${j.to.name}${lr ? ` — about ${fmtDuration(lr.min, "en")} by motor boat` : ""}. Go when it suits you.`, `${j.from.name} আর ${j.to.name}-এর মধ্যে জোয়ার-ভাটায় তেমন পার্থক্য নেই${lr ? ` — মোটর নৌকায় প্রায় ${fmtDuration(lr.min, "bn")}` : ""}। সুবিধামতো যান।`)
    : l(`Go at **${tideName(better, "en").toLowerCase()}** — it is quicker${lr && hr ? ` (${fmtDuration(Math.abs(lr.min - hr.min), "en")} saved)` : " (the other tide has no connected route)"}.${leave ? ` The next ${tideName(better, "en").toLowerCase()} near ${j.from.name} is about ${clock(when!, "en")}, so leave around **${clock(leave, "en")}**.` : ""}`,
      `**${tideName(better, "bn")}**-এ যান — দ্রুত হবে${lr && hr ? ` (${fmtDuration(Math.abs(lr.min - hr.min), "bn")} বাঁচবে)` : " (অন্য সময়ে সংযুক্ত পথ নেই)"}।${leave ? ` ${j.from.name}-এর কাছে পরের ${tideName(better, "bn")} প্রায় ${clock(when!, "bn")}-এ, তাই **${clock(leave, "bn")}** নাগাদ রওনা দিন।` : ""}`);
  return { parts: [{ k: "text", text }, { k: "facts", title: l("Motor boat, by tide", "মোটর নৌকা, জোয়ার-ভাটা অনুযায়ী"), rows }],
    actions: leave ? [{ label: l(`Plan it for ${clock(leave, "en")}`, `${clock(leave, "bn")}-এর জন্য পরিকল্পনা`), primary: true, run: () => runJob(env, { a: "trip", kind: "plan", stops: [{ row: j.from, stay: 0 }, { row: j.to, stay: null }], leaveAt: leave, mode: "boat", vessel: null, tide: "auto", back: false, best: false, each: null }) }] : [] };
}

/* ================================================================== MISSION: livelihood trips from the models */
const spotName = (s: Spot, k: number, lang: Lang) => `${ZONE_WORD[s.zone][lang === "bn" ? 1 : 0]} ${lang === "bn" ? "স্থান" : "spot"} ${fmt(k + 1, lang, 0)}${s.block ? ` · ${s.block}` : ""}`;
const gateWord = (g: number, lang: Lang) => translate(lang, `gate.${g === 2 ? 2 : 1}` as TKey);
function spotRow(s: Spot, name: string): IndexRow {
  return { key: `spot:${s.hex}`, id: s.hex, type: "point", name, lon: s.lon, lat: s.lat, context: name } as unknown as IndexRow;
}
async function missionAgent(env: Env, j: MissionJob): Promise<Out> {
  const l = L(env.lang), lang = env.lang;
  const zonesAll = [...new Set([...j.out, ...j.back])];
  if (!zonesAll.length) return { fail: l("Tell me what you are going for — honey, fish, crab or to see tigers.", "কী জন্য যাচ্ছেন বলুন — মধু, মাছ, কাঁকড়া না বাঘ দেখা।") };
  // where from
  let start: { ll: LL; name: string; row: IndexRow | null } | null = j.start ? { ll: [j.start.lon, j.start.lat], name: j.start.name, row: j.start } : null;
  if (!start && (j.fromMe || mem.here)) { const me = await myLocation(); if (me) start = { ll: me, name: pinName(lang), row: null }; }
  if (!start && j.plan) {
    const chips: Chip[] = [{ label: pinName(lang), send: lang === "bn" ? "আমার অবস্থান থেকে" : "from my location" }];
    if (mem.place) chips.push({ label: mem.place.name, send: mem.place.name });
    ["Gosaba", "Canning", "Sonakhali Ferry Ghat", "Jharkhali"].forEach((n) => { if (!chips.some((c) => c.label === n)) chips.push({ label: n, send: n }); });
    return { ask: { q: l("Where will you start from?", "কোথা থেকে রওনা দেবেন?"), chips: chips.slice(0, 5), pending: { kind: "missionStart", job: j } } };
  }
  const centre: LL = start?.ll ?? (mem.place ? [mem.place.lon, mem.place.lat] : (() => { const m = getMap()?.getCenter(); return m ? [m.lng, m.lat] as LL : [88.75, 22.05] as LL; })());
  const fromName = start?.name ?? mem.place?.name ?? l("the map centre", "মানচিত্রের কেন্দ্র");

  // spots from the model: the way out, then the way back
  const lists: { zone: Zone; back: boolean; spots: Spot[] }[] = [];
  const chosen: Spot[] = [];
  for (const z of j.out) {
    const spots = await findSpots(z, centre, { nearest: j.nearest, n: j.plan ? 4 : 6, avoid: chosen.map((c) => [c.lon, c.lat] as LL) });
    lists.push({ zone: z, back: false, spots });
    if (spots[0]) chosen.push(spots[0]);
  }
  for (const z of j.back) {
    const from: LL = chosen.length ? [chosen[chosen.length - 1].lon, chosen[chosen.length - 1].lat] : centre;
    const spots = await findSpots(z, centre, { nearest: j.nearest, n: 4, via: chosen.length ? [from, centre] : undefined, avoid: chosen.map((c) => [c.lon, c.lat] as LL) });
    lists.push({ zone: z, back: true, spots });
    if (spots[0]) chosen.push(spots[0]);
  }
  if (!chosen.length) return { fail: l("The model finds no good spot within reach by boat from there — try another start.", "সেখান থেকে নৌকায় পৌঁছানোর মধ্যে মডেল কোনো ভালো জায়গা পায়নি — অন্য জায়গা থেকে চেষ্টা করুন।") };

  // the map: density zones on, every suggested spot pinned (tap a pin to add it to the trip)
  setState({ zones: [...new Set([...getState().zones, ...zonesAll])] });
  const addSpot = (s: Spot, name: string) => async () => {
    addStop({ name, lon: s.lon, lat: s.lat, type: "point", ref: s.hex, stay: STAY[s.zone] });
    let out: Out = { parts: [{ k: "text", text: l(`Added **${name}** to your trip (${getTrip().stops.length} places).`, `**${name}** যাত্রায় যোগ হয়েছে (${fmt(getTrip().stops.length, "bn", 0)}টি জায়গা)।`) }] };
    if (getTrip().stops.length >= 2) {
      if (!isTripPage(env.path())) await env.go("/route/");
      const p = await replan();
      if (p && !p.failed) { void fitTrip(p); out = tripSummary(env, p, l(`Added ${name}.`, `${name} যোগ হয়েছে।`)); }
    }
    return out;
  };
  const pins: ReturnType<typeof getState>["spots"] = [];
  const names = new Map<Spot, string>();
  for (const li of lists) li.spots.forEach((s, k) => {
    const nm = spotName(s, k, lang);
    names.set(s, nm);
    const run = addSpot(s, nm);
    pins.push({ lon: s.lon, lat: s.lat, colour: ZONE_META[s.zone].colour, inner: { text: String(k + 1) }, size: chosen.includes(s) ? 36 : 28,
      title: `${nm} — ${l("tap to add to the trip", "যাত্রায় যোগ করতে চাপুন")}`,
      onClick: () => { void run().then(async (o) => { const { postOut } = await import("./run"); postOut(nm, o, lang); }); } });
  });
  setState({ spots: pins });
  const all = lists.flatMap((x) => x.spots);
  const lons = [centre[0], ...all.map((s) => s.lon)], lats = [centre[1], ...all.map((s) => s.lat)];
  await mapReady();
  fitBounds([Math.min(...lons) - 0.02, Math.min(...lats) - 0.02, Math.max(...lons) + 0.02, Math.max(...lats) + 0.02], 12.5);
  mem.mission = { ...j, plan: true };
  mem.theme = zonesAll[0] as Theme;

  const listParts: Part[] = lists.filter((x) => x.spots.length).map((li) => ({ k: "list" as const,
    title: `${li.back ? l("On the way back — ", "ফেরার পথে — ") : ""}${lang === "bn" ? ZONE_META[li.zone].bn : ZONE_META[li.zone].en}`,
    items: li.spots.map((s) => ({ title: names.get(s)!, colour: ZONE_META[s.zone].colour,
      sub: `${l("Model", "মডেল")} ${fmt(s.idx * 100, lang, 0)}% · ${gateWord(s.gate, lang)}`, right: fmtKm(s.km * 1000, lang),
      act: { label: chosen.includes(s) && j.plan ? "✓" : l("Add", "যোগ"), run: addSpot(s, names.get(s)!) } })) }));
  const what = zonesAll.map((z) => ZONE_WORD[z][lang === "bn" ? 1 : 0].toLowerCase()).join(lang === "bn" ? " ও " : " and ");

  if (!j.plan || !start) {
    const best = chosen[0];
    return { parts: [{ k: "text", text: l(`The model marked the best **${what}** spots near ${fromName} on the map (numbered pins). Tap a pin or **Add** to put it in your trip — or let me plan the whole boat trip.`,
      `${fromName}-এর কাছে সেরা **${what}**-র জায়গা মডেল মানচিত্রে চিহ্নিত করেছে (নম্বর দেওয়া পিন)। পিনে বা **যোগ**-এ চাপ দিয়ে যাত্রায় রাখুন — অথবা পুরো নৌকাযাত্রা আমি পরিকল্পনা করে দিই।`) }, ...listParts],
      actions: [{ label: l("Plan the boat trip", "নৌকাযাত্রা পরিকল্পনা করো"), primary: true, run: () => missionAgent(env, { ...j, plan: true, start: j.start }) },
        ...(best ? [{ label: l("Nearest ones", "কাছেরগুলো"), run: () => missionAgent(env, { ...j, nearest: true, plan: true }) }] : [])],
      chips: [{ label: l("Go to the nearest", "কাছেরগুলোতে যাব"), send: l("take me to the nearest ones", "আমার কাছেরগুলোতে যাব") },
        { label: l("Fish on the way back", "ফেরার পথে মাছ"), send: l("on the way back I will also catch fish", "ফেরার পথে মাছও ধরব") }] };
  }

  // plan the boat trip: start → spots out → spots on the way back → start (safest channels)
  const build = (pick: Spot[]): TripPlanJob => ({ a: "trip", kind: "plan", stops: [start!.row ? { row: start!.row, stay: 0 } : { row: null, ll: start!.ll, name: start!.name, stay: 0 },
    ...pick.map((s) => ({ row: null, ll: [s.lon, s.lat] as LL, name: names.get(s)!, stay: STAY[s.zone] }))], leaveAt: j.leaveAt, mode: "boat", vessel: null, tide: "auto", back: true, best: false, each: null });
  const trip = await tripAgent(env, build(chosen));
  if (trip.fail || trip.ask) return trip;
  // other spots can be swapped in
  for (const lp of listParts) if (lp.k === "list") lp.items.forEach((it, k) => {
    const li = lists.filter((x) => x.spots.length)[listParts.indexOf(lp)];
    const s = li.spots[k];
    if (chosen.includes(s)) { it.act = undefined; it.right = `✓ ${it.right}`; return; }
    it.act = { label: l("Use this", "এটা নাও"), run: async () => {
      const cur = chosen.find((c) => c.zone === s.zone && lists.find((x) => x.spots.includes(c))?.back === li.back);
      const pick = chosen.map((c) => (c === cur ? s : c));
      return tripAgent(env, build(pick));
    } };
  });
  const lead = l(`From the model: ${chosen.map((s) => `**${names.get(s)}**`).join(" → ")}, then back to ${start.name}. The boat keeps to the safest wide channels.`,
    `মডেল অনুযায়ী: ${chosen.map((s) => `**${names.get(s)}**`).join(" → ")}, তারপর ${start.name}-এ ফেরা। নৌকা সবচেয়ে নিরাপদ চওড়া নদীপথে চলবে।`);
  return { ...trip, parts: [{ k: "text", text: lead }, ...(trip.parts || []), ...listParts],
    chips: [...(j.back.length ? [] : [{ label: l("Fish on the way back", "ফেরার পথে মাছ"), send: l("on the way back I will also catch fish", "ফেরার পথে মাছও ধরব") }]),
      ...(j.nearest ? [] : [{ label: l("Nearest ones only", "শুধু কাছেরগুলো"), send: l("take me to the nearest ones", "আমার কাছেরগুলোতে যাব") }]),
      { label: l("Trip report PDF", "যাত্রার রিপোর্ট PDF"), send: l("trip report pdf", "যাত্রার রিপোর্ট PDF দাও") }] };
}

/* ================================================================== DATA */
const METRIC_POP = "population";
async function areaRows(level: "block" | "village" | "island" | "district", within: IndexRow | null) {
  const hx = await hexStore();
  if (level === "village") {
    let v = await loadVillages();
    if (within?.type === "block") v = v.filter((x) => x.block === within.name);
    else if (within?.type === "district") v = v.filter((x) => x.district === within.name);
    return v.map((x) => ({ name: x.name, sub: x.block, cells: x.cells, pop: x.population, area: x.area_km2, lon: x.lon, lat: x.lat }));
  }
  if (level === "block" || level === "district") {
    const a = await loadAdmin();
    let rows = level === "block" ? a.blocks : a.districts;
    if (level === "block" && within?.type === "district") rows = rows.filter((x) => x.district === within.name);
    return rows.map((x) => ({ name: x.name, sub: level === "block" ? x.district || "" : "", cells: x.cells, pop: x.population, area: x.area_km2, lon: x.lon, lat: x.lat }));
  }
  const { loadIslands } = await import("../data/entities");
  const isl = (await loadIslands()).filter((x) => x.name);
  void hx;
  return isl.map((x) => ({ name: x.name || "", sub: x.category || "", cells: x.cells, pop: null as number | null, area: x.area_km2, lon: x.lon, lat: x.lat }));
}
function metricValue(hx: HexStore, metric: string, r: { cells: Cells; pop: number | null; area: number }): number {
  if (metric === METRIC_POP) return r.pop ?? popEstimate(hx, r.cells);
  if (metric === "area") return r.area;
  if (metric === "density") return r.pop && r.area ? r.pop / r.area : NaN;
  const def = hx.def(metric);
  if (!def) return NaN;
  const v = hx.get(metric);
  if (def.unit === "%" && /^(mangrove_20|lc_|water_|forest_share|np_share)/.test(metric)) { let s = 0, n = 0; for (const [i, w] of r.cells) if (!Number.isNaN(v[i])) { s += (v[i] / 100) * w; n++; } return n ? s : NaN; }
  const a = aggregate(v, r.cells);
  return a.n ? a.mean : NaN;
}
function metricName(hx: HexStore, metric: string, lang: Lang) {
  if (metric === METRIC_POP) return translate(lang, "stat.population");
  if (metric === "area") return translate(lang, "loc.area");
  if (metric === "density") return translate(lang, "stat.density");
  const d = hx.def(metric)!;
  const asArea = d.unit === "%" && /^(mangrove_20|lc_|water_|forest_share|np_share)/.test(metric);
  return `${varLabel(d, lang)}${asArea ? (lang === "bn" ? " (ক্ষেত্রফল)" : " (area)") : ""}`;
}
function metricFmt(hx: HexStore, metric: string, v: number, lang: Lang) {
  if (Number.isNaN(v)) return "—";
  if (metric === METRIC_POP) return fmt(Math.round(v), lang, 0);
  if (metric === "area") return `${fmt(v, lang, 1)} ${lang === "bn" ? "বর্গকিমি" : "km²"}`;
  if (metric === "density") return `${fmt(v, lang, 0)} ${lang === "bn" ? "জন/বর্গকিমি" : "/km²"}`;
  const d = hx.def(metric)!;
  if (d.unit === "%" && /^(mangrove_20|lc_|water_|forest_share|np_share)/.test(metric)) return `${fmt(v, lang, 1)} ${lang === "bn" ? "বর্গকিমি" : "km²"}`;
  return `${fmt(v, lang, d.digits)} ${varUnit(d, lang)}`.trim();
}
export async function dataAgent(env: Env, j: Extract<Job, { a: "data" }>): Promise<Out> {
  const l = L(env.lang), lang = env.lang;
  const hx = await hexStore();
  if (j.kind === "count") {
    if (j.what === "village") {
      let v = await loadVillages();
      if (j.within?.type === "block") v = v.filter((x) => x.block === j.within!.name);
      if (j.within?.type === "district") v = v.filter((x) => x.district === j.within!.name);
      const towns = v.filter((x) => x.type === "Urban").length;
      const pop = v.reduce((s, x) => s + (x.population || 0), 0);
      return { parts: [{ k: "text", text: l(`**${fmt(v.length - towns, "en", 0)} villages and ${fmt(towns, "en", 0)} towns**${j.within ? ` in ${j.within.name}` : " in the study area"} — ${fmt(pop, "en", 0)} people (Census 2011).`,
        `${j.within ? `${j.within.name}-এ` : "সমীক্ষা এলাকায়"} **${fmt(v.length - towns, "bn", 0)}টি গ্রাম ও ${fmt(towns, "bn", 0)}টি শহর** — ${fmt(pop, "bn", 0)} জন (জনগণনা ২০১১)।`) }],
        chips: [{ label: l("Top 5 by population", "জনসংখ্যায় সেরা ৫"), send: l(`top 5 villages by population${j.within ? ` in ${j.within.name}` : ""}`, `${j.within ? `${j.within.name}-এ ` : ""}জনসংখ্যায় সেরা ৫টি গ্রাম`) }] };
    }
    const pts = await loadPoints();
    const list = j.what === "jetty" ? pts.jetty : pts.poi;
    const inBlock = (b: string | undefined) => !j.within || j.within.type !== "block" || (b || "").toLowerCase() === j.within.name.toLowerCase();
    const n = list.filter((p) => inBlock(p.block_name)).length;
    return { parts: [{ k: "text", text: l(`${fmt(n, "en", 0)} ${j.what === "jetty" ? "ghats and jetties" : "service points"} are mapped${j.within ? ` in ${j.within.name}` : ""}.`, `${j.within ? `${j.within.name}-এ ` : ""}${fmt(n, "bn", 0)}টি ${j.what === "jetty" ? "ঘাট ও জেটি" : "পরিষেবা কেন্দ্র"} মানচিত্রে আছে।`) }] };
  }
  if (j.kind === "value") {
    const p = j.place;
    if (!p) {
      const all: Cells = hx.meta.area.map((a, i) => [i, a]);
      const a = await loadAdmin();
      const v = metricValue(hx, j.metric, { cells: all, pop: j.metric === METRIC_POP ? a.districts.reduce((s, d) => s + (d.population || 0), 0) : null, area: all.reduce((s, c) => s + c[1], 0) });
      return { parts: [{ k: "facts", title: l("Whole study area", "পুরো সমীক্ষা এলাকা"), rows: [[metricName(hx, j.metric, lang), metricFmt(hx, j.metric, v, lang)]] }] };
    }
    const e = await getEntity(p.type, p.id);
    if (!e) return { fail: l("No data for that place.", "এই জায়গার তথ্য নেই।") };
    const pop = typeof (e.attrs as { population?: number }).population === "number" ? (e.attrs as { population: number }).population : null;
    const v = metricValue(hx, j.metric, { cells: e.cells, pop, area: e.cells.reduce((s, c) => s + c[1], 0) });
    mem.place = p;
    return { parts: [{ k: "facts", title: `${p.name} · ${typeName(p.type, lang)}`, rows: [[metricName(hx, j.metric, lang), metricFmt(hx, j.metric, v, lang)]] }],
      actions: [{ label: l("Show on map", "মানচিত্রে দেখাও"), run: async () => { await ensureMap(env, hx.def(j.metric) ? "/explore/" : "/", !hx.def(j.metric)); if (hx.def(j.metric)) showVariable(j.metric); await focus(p); } }] };
  }
  // rank
  const rows = await areaRows(j.level, j.within);
  const scored = rows.map((r) => ({ ...r, v: metricValue(hx, j.metric, r) })).filter((r) => !Number.isNaN(r.v) && (j.metric !== METRIC_POP || r.v > 0));
  scored.sort((a, b) => (j.low ? a.v - b.v : b.v - a.v));
  const top = scored.slice(0, j.n);
  const lvl = { block: l("blocks", "ব্লক"), village: l("villages", "গ্রাম"), island: l("islands", "দ্বীপ"), district: l("districts", "জেলা") }[j.level];
  const title = l(`${j.low ? "Lowest" : "Top"} ${j.n} ${lvl} by ${metricName(hx, j.metric, "en").toLowerCase()}${j.within ? ` in ${j.within.name}` : ""}`,
    `${j.within ? `${j.within.name}-এ ` : ""}${metricName(hx, j.metric, "bn")} অনুযায়ী ${j.low ? "সবচেয়ে কম" : "শীর্ষ"} ${fmt(j.n, "bn", 0)}টি ${lvl}`);
  if (hx.def(j.metric) && isMapPage(env.path()) && !/^\/(route|place)/.test(env.path())) showVariable(j.metric);
  return { parts: [{ k: "bars", title, colour: "#6250d6", items: top.map((r) => ({ label: r.name, value: r.v, display: metricFmt(hx, j.metric, r.v, lang) })) },
    { k: "note", text: j.metric === METRIC_POP ? l("Population: Census of India 2011 (WorldPop 2020 estimate where the census has no figure).", "জনসংখ্যা: ভারতের জনগণনা ২০১১ (জনগণনায় না থাকলে WorldPop ২০২০ অনুমান)।") : l("Computed over the 1.6 km² hexagons of each area (area-weighted).", "প্রতিটি এলাকার ১.৬ বর্গকিমি ষড়ভুজের উপর হিসাব (ক্ষেত্রফল-ভারিত)।") }],
    actions: [
      ...(top[0] ? [{ label: l(`Show ${top[0].name}`, `${top[0].name} দেখাও`), primary: true, run: async () => { await ensureMap(env, "/explore/"); flyTo(top[0].lon, top[0].lat, j.level === "village" ? 14 : 11); if (hx.def(j.metric)) showVariable(j.metric); } } as Action] : []),
      { label: l("Download table (Excel)", "সারণি ডাউনলোড (Excel)"), run: async () => { const { exportTable } = await import("../report"); await exportTable(`DISHARI_${j.level}_${j.metric}`, ["rank", "name", "in", metricName(hx, j.metric, "en")], scored.map((r, k) => [k + 1, r.name, r.sub, +r.v.toFixed(3)]), "xlsx"); } },
      { label: l("Open the dashboard", "ড্যাশবোর্ড খুলুন"), run: () => env.go("/dashboard/") }] };
}

/* ================================================================== WEATHER */
export async function weatherAgent(env: Env, j: Extract<Job, { a: "weather" }>): Promise<Out> {
  const l = L(env.lang), lang = env.lang;
  const ref: LL | null = j.place ? [j.place.lon, j.place.lat] : mem.place ? [mem.place.lon, mem.place.lat] : await myLocation();
  const at: LL = ref || [88.75, 22.15];
  const name = j.place?.name || mem.place?.name || (ref ? l("your location", "আপনার অবস্থান") : "Gosaba");
  const [w, s] = await Promise.all([getWeather(at[1], at[0]).catch(() => ({ data: null, cached: false })), getSeaLevel(at[1], at[0]).catch(() => ({ data: null, cached: false }))]);
  const parts: Part[] = [];
  if (w.data) {
    const c = w.data.current;
    const next = w.data.hours.filter((h) => new Date(h.time).getTime() > Date.now()).slice(0, 12);
    const maxP = Math.max(0, ...next.map((h) => h.prob)), maxG = Math.max(c.gust, ...next.map((h) => h.gust));
    parts.push({ k: "text", text: l(`**${name}** now: ${wmo(c.code, "en").toLowerCase()}, ${fmt(c.temp, "en", 0)}°C, wind ${fmt(c.wind, "en", 0)} km/h. Next 12 hours: rain chance up to ${fmt(maxP, "en", 0)}%, gusts up to ${fmt(maxG, "en", 0)} km/h.${w.cached ? " (last saved forecast — offline)" : ""}`,
      `**${name}**-এ এখন: ${wmo(c.code, "bn")}, ${fmt(c.temp, "bn", 0)}°সে, হাওয়া ঘণ্টায় ${fmt(c.wind, "bn", 0)} কিমি। পরের ১২ ঘণ্টায় বৃষ্টির সম্ভাবনা সর্বোচ্চ ${fmt(maxP, "bn", 0)}%, দমকা হাওয়া ঘণ্টায় ${fmt(maxG, "bn", 0)} কিমি পর্যন্ত।${w.cached ? " (শেষ রাখা পূর্বাভাস — অফলাইন)" : ""}`) });
    const d = w.data.days[0];
    if (d) parts.push({ k: "kpis", items: [{ label: l("Today", "আজ"), value: `${fmt(d.tmin, lang, 0)}–${fmt(d.tmax, lang, 0)}°` }, { label: l("Rain", "বৃষ্টি"), value: `${fmt(d.rain, lang, 1)} mm` }, { label: l("Gusts", "দমকা"), value: `${fmt(d.gust, lang, 0)} km/h` }, { label: l("Sunset", "সূর্যাস্ত"), value: clock(new Date(d.sunset).getTime(), lang) }] });
  } else parts.push({ k: "note", text: l("The weather forecast needs internet (none saved for this place yet).", "আবহাওয়ার পূর্বাভাসের জন্য ইন্টারনেট লাগে (এই জায়গার জন্য আগে রাখা নেই)।") });
  if (s.data?.extremes.length) {
    const ex = s.data.extremes.map((x) => ({ ...x, ms: new Date(x.time.length <= 16 ? `${x.time}:00+05:30` : x.time).getTime() })).filter((x) => x.ms > Date.now() - 30 * 60000).slice(0, 4);
    parts.push({ k: "list", title: l(`Tide near ${name} (sea-level forecast)`, `${name}-এর কাছে জোয়ার-ভাটা (সমুদ্রতলের পূর্বাভাস)`), items: ex.map((x) => ({ title: tideName(x.type, lang), sub: `${fmt(x.h, lang, 2)} ${l("m", "মি")}`, right: `${dayLabel(x.ms, lang)} ${clock(x.ms, lang)}`, colour: x.type === "high" ? "#2a78d6" : "#eda100" })) });
  } else if (j.tide) parts.push({ k: "note", text: l("Tide times need internet (none saved for this place yet).", "জোয়ার-ভাটার সময়ের জন্য ইন্টারনেট লাগে (এই জায়গার জন্য আগে রাখা নেই)।") });
  return { parts, chips: [{ label: l("Best time for a boat trip", "নৌকায় যাওয়ার সেরা সময়"), send: l(`best time to go from ${name} to Gosaba`, `${name} থেকে Gosaba কখন যাব`) }] };
}

export async function runJob(env: Env, j: Job): Promise<Out> {
  const out = await (() => {
    switch (j.a) {
      case "help": return help(env, j);
      case "map": return mapAgent(env, j);
      case "place": return placeAgent(env, j);
      case "trip": return tripAgent(env, j);
      case "report": return reportAgent(env, j);
      case "decision": return decisionAgent(env, j);
      case "data": return dataAgent(env, j);
      case "weather": return weatherAgent(env, j);
    }
  })();
  return { ...out, agent: j.a };
}
export { nearest };
