"use client";
/** The coordinator: reads a message (English, বাংলা or Banglish), splits it into jobs for the specialist agents and puts
 *  them in a sensible order — "plan a trip from Canning via Basanti to Jharkhali tomorrow 8 am, make the PDF and start
 *  live tracking" becomes Trip agent → Report agent → Trip agent. Works offline. */
import { goWord, missionWords, nearestWord } from "./mission";
import type { IndexRow } from "../data/search";
import type { Lang } from "../i18n";
import { getTrip } from "../trip/store";
import { forms, formatsOf, intents, leaveTime, levelOf, modeOf, norm, placesIn, radiusKm, staysFor, themeOf, tideOf, topN, tripRoles, variableIn, vesselOf, wantsLowest,
  type Fmt, type PlaceHit } from "./nlu";
import { basemapIn, comparePairIn, L, mem, nearCatOf, type Job, type TripPlanJob } from "./agents";

const PRONOUN = /(okhane|okhan|sekhane|oikhane|oi jayga|oi jaygay|\bthere\b|that place|this place|\bits\b|\bota\b|\beta\b|\boita\b|\beita\b|otar|etar|ওখানে|সেখানে|ওই জায়গা|এটা|ওটা|এটার|ওটার|এর\b|ওর\b)/i;
const HERE = /(near me|around me|\bhere\b|ekhane|ekhanei|amar kache|amar kachhe|amar asepase|আমার কাছে|এখানে|আশেপাশে)/i;
const FROM_ME = /(from (my location|here|where i am)|amar location theke|amar obosthan theke|ekhan theke|ekhane theke|ami jekhane achi|আমার অবস্থান থেকে|এখান থেকে)/i;
const BACK = /(return|come back|back to (the )?start|round trip|fire asbo|fire ashbo|phire asbo|phire ashbo|ferot|firbo|phirbo|ফিরে আসব|ফিরব|ফেরত)/i;
const BEST_ORDER = /(best order|optimi[sz]e|shortest order|any order|valo order|bhalo order|ক্রম ঠিক|সেরা ক্রম)/i;
const TWEAK = /(make it|change|instead|switch to|use|koro|kore dao|korun|bodlao|bodle|বদলাও|করো|করুন|kore din|chai)/i;
const TRIP_WORD = /(trip|journey|jatra|jattra|যাত্রা|route|itinerary|bhromon|ভ্রমণ)/i;

const BANGLISH = new Set(("ami amar amake amra amader tumi tomar tomake apni apnar apnake koro korun kore korbo korte korcho dao din den dite dekhao dekhan dekhte dekhabe kothay kothai " +
  "theke jabo jete jaabo jabe jai chai chaai lagbe ache achhe acche nei koto koyta kon kivabe kibhabe kibabe bolo bolun bolte hobe hoy gulo guli niye diye hoye porjonto kalke " +
  "aaj ajke ekhon sokal bikel bikal sondhe valo bhalo sobcheye sabcheye beshi kom nouka hete gram jayga jaygay jaygar kache kachhe dhorbo dhorte pabo naki thik accha acha ekta " +
  "duto prottek moddhe modhye jonno tahole tarpor erpor ebong abong ki keno kemon kotodur khabor abohawa jowar bhata kakra modhu maach bagh dekhi chalao chalu bondho banao").split(" "));
const ENGLISH = new Set("the is are am show me what where how please can could would should my of in from to and with near which download plan want give tell find best open make get is it this that for".split(" "));
/** the language to answer in: Bengali script or Banglish → বাংলা, English → English, otherwise the site's language */
export function replyLang(text: string, ui: Lang): Lang {
  return ui;   // the chat always speaks the language chosen at the top (EN or বাং), whatever language the message is in
  if (/[ঀ-৿]/.test(text)) return "bn";
  let b = 0, e = 0;
  for (const w of norm(text).split(/[^a-z]+/)) { if (BANGLISH.has(w)) b++; if (ENGLISH.has(w)) e++; }
  if (b >= 1 && b >= e) return "bn";
  if (e >= 1) return "en";
  return ui;
}

const DATASET: [RegExp, string][] = [
  [/(village|gram|census|town|গ্রাম|জনগণনা|শহর)/i, "villages"], [/(block|district|admin|boundar|ব্লক|জেলা)/i, "admin"], [/(island|dwip|দ্বীপ)/i, "islands"],
  [/(protected|reserve|national park|sanctuary|permit|সংরক্ষিত|অনুমতি)/i, "protected"], [/(ghat|jetty|services|\bpoi\b|hospital|school|points|ঘাট|পরিষেবা)/i, "points"],
  [/(river|canal|creek|waterway|nodi|khal|নদী|খাল)/i, "waterways"],
];
const datasetOf = (f: string) => DATASET.find(([re]) => re.test(f))?.[1] ?? null;

export interface Plan { jobs: Job[]; lang: Lang; say?: string; chips?: { label: string; send: string }[] }
const ORDER: Record<string, number> = { look: 0, page: 1, basemap: 2, reset: 2, locate: 2, compare: 4, view3d: 5, report: 6, export: 7, save: 7, start3d: 8 };
const rankOf = (j: Job) => (j.a === "map" ? ORDER[j.kind] ?? 3 : j.a === "report" ? 6 : j.a === "trip" && (j.kind === "export" || j.kind === "save") ? 7 : j.a === "trip" && j.kind === "start3d" ? 8 : 3);

const PREFER_AREA = new Set(["block", "district", "island"]);
const first = (hits: PlaceHit[]) => hits[0]?.row ?? null;

export async function understand(text: string, ui: Lang): Promise<Plan> {
  const f = forms(text);
  const I = intents(f);
  let lang = replyLang(text, ui);
  const l = L(lang);
  const words = norm(text).split(" ").filter(Boolean).length;
  const jobs: Job[] = [];
  const add = (j: Job) => jobs.push(j);
  const done = (): Plan => ({ jobs: jobs.map((j, i) => ({ j, i })).sort((a, b) => rankOf(a.j) - rankOf(b.j) || a.i - b.i).map((x) => x.j), lang });

  /* ---------- an answer to the question asked last time */
  const pend = mem.pending; mem.pending = null;
  if (pend) {
    if (I.has("no")) return { jobs: [], lang, say: l("OK, cancelled. What else can I do?", "ঠিক আছে, বাতিল। আর কী করব?") };
    if (pend.kind === "tripStart") {
      if (FROM_ME.test(f) || I.has("locate") || /(my location|amar location|আমার অবস্থান)/i.test(f)) { pend.job.fromMe = true; return { jobs: [pend.job], lang }; }
      const hits = await placesIn(text, "trip");
      if (hits.length && words <= 6) { pend.job.stops.unshift({ row: hits[0].row, stay: 0 }); return { jobs: [pend.job], lang }; }
    }
    if (pend.kind === "missionStart") {
      if (FROM_ME.test(f) || I.has("locate") || /(my location|amar location|আমার অবস্থান)/i.test(f)) return { jobs: [{ ...pend.job, fromMe: true }], lang };
      const hits = await placesIn(text, "trip");
      if (hits.length && words <= 6) return { jobs: [{ ...pend.job, start: hits[0].row }], lang };
    }
    if (pend.kind === "place") {
      const hits = await placesIn(text, "any");
      if (hits.length && words <= 6) { (pend.job as unknown as Record<string, unknown>)[pend.field] = hits[0].row; return { jobs: [pend.job], lang }; }
    }
  }

  /* ---------- places in the message (trip wording prefers exact points, other wording prefers areas) */
  const tripCtxWords = I.has("trip") || modeOf(f) !== null;
  const hitsTrip = await placesIn(text, "trip");
  const hitsArea = await placesIn(text, "area");
  const hits = tripCtxWords ? hitsTrip : hitsArea;
  const recalled: IndexRow | null = PRONOUN.test(f) && mem.place ? mem.place : null;
  const place = first(hits) ?? recalled;
  const areaPlace = first(hitsArea) ?? recalled;
  const v = null as { key: string } | null;      // this site has no thematic layers
  const theme = null as import("./nlu").Theme | null;
  const fmts = formatsOf(f);
  const wantsReport = I.has("download") || I.has("report");

  /* ---------- explicit language: switches the site, or only the report when a report is asked for */
  if (I.has("toEn")) { lang = "en"; if (!wantsReport) add({ a: "map", kind: "look", lang: "en" }); }
  if (I.has("toBn")) { lang = "bn"; if (!wantsReport) add({ a: "map", kind: "look", lang: "bn" }); }
  const L2 = L(lang);

  /* ---------- small talk */
  if (I.has("greet") && words <= 4 && !hits.length) return { jobs: [{ a: "help", kind: "hello" }], lang };
  if (I.has("thanks") && words <= 6 && !hits.length) return { jobs: [{ a: "help", kind: "thanks" }], lang };
  if (I.has("capab") && !hits.length) return { jobs: [{ a: "help", kind: "capab" }], lang };
  if (I.has("about") && !hits.length && !wantsReport) return { jobs: [{ a: "help", kind: "about" }], lang };
  if (I.has("howto") && !hitsArea.length && !hitsTrip.length) return { jobs: [{ a: "help", kind: "howto", topic: f }], lang };

  /* ---------- look of the site */
  const bm = basemapIn(f);
  const mapWord = /(map|basemap|base map|view|imagery|ম্যাপ|মানচিত্র|layer)/i.test(f);
  if (bm && (I.has("basemap") || mapWord) && !I.has("compare")) add({ a: "map", kind: "basemap", id: bm });
  else {
    if (I.has("dark")) add({ a: "map", kind: "look", dark: true });
    if (I.has("light")) add({ a: "map", kind: "look", dark: false });
  }
  if (I.has("labels")) add({ a: "map", kind: "look", labels: !/(off|bondho|hide|লুকাও|বন্ধ)/i.test(f) });
  if (I.has("reset")) add({ a: "map", kind: "reset" });

  /* ---------- pages */
  if (I.has("pageDash") && !wantsReport) add({ a: "map", kind: "page", path: "/dashboard/", label: L2("the dashboard", "ড্যাশবোর্ড") });
  if (I.has("pageReports") || (/(reports?)\s*(page|section|pata)/i.test(f))) add({ a: "map", kind: "page", path: "/dashboard/", label: L2("the dashboard", "ড্যাশবোর্ড") });
  if (I.has("pageMy")) add({ a: "map", kind: "page", path: "/my/", label: L2("Saved", "রাখা তথ্য") });
  const pageOnly = jobs.length && jobs.every((j) => j.a === "map" && j.kind === "page") && !hits.length && !v && !theme;
  if (pageOnly) return done();

  /* ---------- emergencies */
  const emergency = /(emergency|\bsos\b|ambulance|help ?line|help number|bipode|bipod e|জরুরি|বিপদে|অ্যাম্বুলেন্স|\b(100|102|108|112)\b)/i.test(f);
  if (emergency && !I.has("nearest")) { add({ a: "help", kind: "sos", place }); return done(); }

  /* ---------- trip: add / remove / clear / tweak / plan / 3D */
  const st = getTrip();
  const trip3d = I.has("trip3d") && /(trip|jatra|যাত্রা|journey|track|navigat|live|লাইভ|ট্র্যাক|gps)/i.test(f);
  const tripRelated = TRIP_WORD.test(f) || trip3d;
  if (I.has("addStop") && hitsTrip.length && (tripRelated || st.stops.length)) {
    hitsTrip.forEach((h) => add({ a: "trip", kind: "add", place: h.row }));
    return done();
  }
  if (I.has("removeStop") && hitsTrip.length && (tripRelated || st.stops.length)) {
    hitsTrip.forEach((h) => add({ a: "trip", kind: "remove", place: h.row }));
    return done();
  }
  if (I.has("clearTrip") && !hitsTrip.length) { add({ a: "trip", kind: "clear" }); return done(); }

  /* ---------- livelihood trips from the models: "ami modhu ante jabo", "ferar pothe mach o dhorbo", "nearest gulo te jabo" */
  {
    const mw = missionWords(norm(text)) ?? missionWords(f);
    const zoneWord = (h: { text: string }) => missionWords(h.text) !== null;
    const startHit = hitsTrip.find((h) => !zoneWord(h))?.row ?? null;
    const fromMe = FROM_ME.test(f) || HERE.test(f);
    const leave = leaveTime(f);
    if (mw && mw.returnOnly && mem.mission) {
      add({ ...mem.mission, back: [...new Set([...mem.mission.back, ...mw.back])], nearest: mem.mission.nearest || mw.nearest, start: startHit ?? mem.mission.start, plan: true });
      return done();
    }
    if (mw && (mw.go || I.has("find") || /(kothay|kothai|where|কোথায়|best|sera|সেরা|bhalo|valo|good)/i.test(f)) && !I.has("stats") && !wantsReport) {
      const out = mw.out.length ? mw.out : mw.back;
      add({ a: "decision", kind: "mission", out, back: mw.out.length ? mw.back : [], nearest: mw.nearest, start: startHit, fromMe, plan: mw.go && !/(kothay|kothai|where|কোথায়)/i.test(f) || (mw.go && !!startHit), leaveAt: leave });
      return done();
    }
    if (!mw && mem.mission && nearestWord(f) && (goWord(f) || words <= 5)) {
      add({ ...mem.mission, nearest: true, plan: true, start: startHit ?? mem.mission.start, fromMe: mem.mission.fromMe || fromMe });
      return done();
    }
  }

  // best time between two places
  if (I.has("bestTime") && (hitsTrip.length >= 2 || (hitsTrip.length === 1 && mem.place && mem.place.key !== hitsTrip[0].row.key))) {
    const [a, b] = hitsTrip.length >= 2 ? [hitsTrip[0].row, hitsTrip[1].row] : [mem.place!, hitsTrip[0].row];
    add({ a: "decision", kind: "besttime", from: a, to: b });
    return done();
  }

  const leave = leaveTime(f);
  const mode = modeOf(f), vessel = vesselOf(f), tide = tideOf(f), back = BACK.test(f), best = BEST_ORDER.test(f), fromMe = FROM_ME.test(f);
  const tripIntent = (I.has("trip") && (hitsTrip.length >= 1 || fromMe)) || (mode !== null && hitsTrip.length >= 2) || (trip3d && hitsTrip.length >= 1);
  let tripPlanned = false;
  if (tripIntent && !I.has("distance")) {
    const roles = tripRoles(text, hitsTrip);
    const stays = staysFor(text, roles);
    // a place named again is its stay ("… Gosaba hoye Pakhiralay, Gosaba te 1 ghonta thakbo") or the way back to the start
    const stops: TripPlanJob["stops"] = [];
    const seen = new Map<string, number>();
    let home = back;
    roles.forEach((h, k) => {
      const prev = seen.get(h.row.key);
      const stay = stays.per.get(h) ?? null;
      if (prev !== undefined) {
        if (stay !== null) { stops[prev].stay = stay; return; }
        if (k === roles.length - 1 && prev === 0 && stops.length > 1) { home = true; return; }
        if (prev === stops.length - 1) return;
      }
      seen.set(h.row.key, stops.length);
      stops.push({ row: h.row, stay });
    });
    const job: TripPlanJob = { a: "trip", kind: "plan", stops, leaveAt: leave, mode, vessel, tide, back: home, best, each: stays.each, fromMe };
    add(job);
    tripPlanned = true;
  } else if (st.stops.length >= 2 && !hitsTrip.length && (mode || vessel || tide || leave || back || best) && (TWEAK.test(f) || tripRelated || words <= 5)) {
    add({ a: "trip", kind: "tweak", mode, vessel, tide, leaveAt: leave, back: back ? true : null, best: best ? true : null });
    tripPlanned = true;
  } else if (I.has("trip") && TRIP_WORD.test(f) && !hitsTrip.length && !wantsReport && !trip3d && !I.has("weather")) {
    if (st.stops.length >= 2) { add({ a: "trip", kind: "tweak", mode: null, vessel: null, tide: null, leaveAt: null, back: null, best: null }); tripPlanned = true; }
    else return { jobs: [], lang, say: L2("Tell me where you want to go — for example “Canning theke Basanti hoye Jharkhali, kal sokal 8 tay, nouka”. Or pick a ready trip:", "কোথায় যেতে চান বলুন — যেমন “ক্যানিং থেকে বাসন্তী হয়ে ঝড়খালি, কাল সকাল ৮টায়, নৌকায়”। বা একটি তৈরি যাত্রা বাছুন:"),
      chips: [{ label: L2("Tiger reserve gateway", "ব্যাঘ্র প্রকল্পের প্রবেশপথ"), send: L2("plan a boat trip from Sonakhali to Gosaba to Pakhiralay", "সোনাখালি থেকে গোসাবা হয়ে পাখিরালয় নৌকায় যাব") },
        { label: "Canning → Basanti → Jharkhali", send: L2("boat trip Canning to Basanti to Jharkhali", "ক্যানিং থেকে বাসন্তী হয়ে ঝড়খালি নৌকায়") },
        { label: "Hasnabad → Hingalganj → Sandeshkhali", send: L2("boat trip Hasnabad via Hingalganj to Sandeshkhali", "হাসনাবাদ থেকে হিঙ্গলগঞ্জ হয়ে সন্দেশখালি নৌকায়") }] };
  }
  const tripCtx = tripPlanned || (tripRelated && st.stops.length >= 2);
  if (tripCtx || (wantsReport && TRIP_WORD.test(f) && st.stops.length >= 2)) {
    const repF = fmts.filter((x) => x === "pdf" || x === "docx" || x === "xlsx");
    if (wantsReport && TRIP_WORD.test(f) || (tripPlanned && repF.length)) (repF.length ? repF : (["pdf"] as Fmt[])).forEach((x) => add({ a: "report", kind: "trip", fmt: x }));
    fmts.filter((x) => x === "gpx" || x === "gmaps" || x === "link" || (x === "geojson")).forEach((x) => add({ a: "trip", kind: "export", fmt: x }));
    if (I.has("save") && !hits.length) add({ a: "trip", kind: "save" });
    if (trip3d) add({ a: "trip", kind: "start3d", live: I.has("live") });
    if (I.has("weather") || (I.has("tide") && !tide)) add({ a: "weather", kind: "now", place: hitsTrip[0]?.row ?? null, tide: true });
    if (jobs.some((j) => j.a === "trip" || j.a === "report")) return done();
  }
  if (trip3d && st.stops.length >= 2) { add({ a: "trip", kind: "start3d", live: I.has("live") }); return done(); }

  /* ---------- reports and downloads */
  if (wantsReport && !jobs.some((j) => j.a === "report")) {
    const mapShot = I.has("mapExport") || (/(\bmap\b|manchitro|মানচিত্র|ম্যাপ)/i.test(f) && (fmts.includes("png") || /(print|export|chobi|ছবি|image)/i.test(f)) && !hits.length);
    if (mapShot) add({ a: "report", kind: "map", fmt: fmts.includes("png") ? "png" : "pdf" });
    else {
      const ds = datasetOf(f);
      const recentPlace = mem.placeTurn === mem.turn - 1 ? mem.place : null;
      const target = areaPlace ?? (ds ? null : recentPlace);
      const dataWanted = I.has("dataset") || fmts.includes("csv") || fmts.includes("geojson") || /(list|talika|তালিকা|layer|polygon|shapefile)/i.test(f);
      if (ds && dataWanted && !areaPlace) {
        const fmt = fmts.find((x) => x === "csv" || x === "xlsx" || x === "geojson") ?? "csv";
        add({ a: "report", kind: "dataset", fmt, dataset: ds });
      } else {
        const out = fmts.filter((x) => x === "pdf" || x === "docx" || x === "xlsx");
        const list: Fmt[] = out.length ? out : ["pdf"];
        for (const fm of list) {
          if (target) add({ a: "report", kind: PREFER_AREA.has(target.type) ? "area" : "place", fmt: fm, place: target });
          else if (theme) add({ a: "report", kind: "theme", fmt: fm, theme });
          else add({ a: "report", kind: "area", fmt: fm, place: null });
        }
      }
    }
    // "show Gosaba and download its report": also show it
    if (I.has("show") && areaPlace) add({ a: "map", kind: "goto", place: areaPlace, alts: hitsArea[0]?.alts ?? [] });
    return done();
  }

  /* ---------- decisions: best areas, safety */
  const findWords = I.has("find") || /(kothay|kothai|where|কোথায়|best|sera|সেরা|bhalo|valo|good|suitable|catch|dhorbo|dhorte|collect|pabo)/i.test(f);
  if (theme && theme !== "environment" && findWords && !I.has("stats") && !(I.has("show") && !I.has("find") && /(habitat|abas|আবাস|layer|map)/i.test(f))) {
    const near = (I.has("nearest") || HERE.test(f)) && !hits.length ? null : first(hitsArea) ?? recalled;
    add({ a: "decision", kind: "find", theme, place: near, radius: radiusKm(f) });
    if (I.has("weather")) add({ a: "weather", kind: "now", place: near, tide: true });
    return done();
  }
  if (I.has("risk") && !I.has("weather") && (place || mem.place)) { add({ a: "decision", kind: "risk", place: (place ?? mem.place)! }); return done(); }

  /* ---------- weather and tide */
  if (I.has("weather") || (I.has("tide") && !I.has("define"))) { add({ a: "weather", kind: "now", place: HERE.test(f) && !hits.length ? null : place, tide: I.has("tide") || true }); return done(); }

  /* ---------- definitions and how-to */
  if (I.has("howto") && !hitsArea.length) { add({ a: "help", kind: "howto", topic: f }); return done(); }
  if (I.has("define") && !I.has("stats")) {
    if (hitsArea.length && v) { add({ a: "data", kind: "value", metric: v.key, place: hitsArea[0].row }); return done(); }
    if (hitsArea.length) { add({ a: "place", kind: "about", place: hitsArea[0].row, alts: hitsArea[0].alts }); return done(); }
    add({ a: "help", kind: "explain", topic: f });
    return done();
  }

  /* ---------- numbers: counts, rankings, values */
  const metric = /(population|lok ?sonkhya|jon ?sonkhya|jonosonkhya|জনসংখ্যা|people|manush|লোক)/i.test(f) ? "population"
    : /(density|ghonotto|ঘনত্ব)/i.test(f) && !v ? "density" : /(\barea\b|khetrofol|ক্ষেত্রফল|size|koto boro|কত বড়)/i.test(f) && !v ? "area" : v?.key ?? null;
  const countWords = /(how many|koyta|koiti|kota|কয়টি|কয়টা|কটা|number of|\bcount\b)/i.test(f);
  if (countWords && /(village|gram|গ্রাম|ghat|jetty|ঘাট|island|dwip|দ্বীপ|service|hospital|school)/i.test(f) && metric !== "population") {
    const what = /(ghat|jetty|ঘাট)/i.test(f) ? "jetty" : /(service|hospital|school|পরিষেবা)/i.test(f) ? "poi" : /(island|dwip|দ্বীপ)/i.test(f) ? "island" : "village";
    const within = hitsArea.find((h) => h.row.type === "block" || h.row.type === "district")?.row ?? null;
    if (what === "island") add({ a: "data", kind: "rank", metric: "area", level: "island", n: 10, low: false, within: null });
    else add({ a: "data", kind: "count", what, within });
    return done();
  }
  const rankWords = topN(f) !== null || /(top|highest|lowest|most|least|maximum|minimum|sobcheye|sabcheye|sab theke|সবচেয়ে|which|kon|কোন|rank|list|beshi|বেশি)/i.test(f);
  if (metric && (I.has("stats") || rankWords) && (rankWords && (levelOf(f) || !hitsArea.length || hitsArea.some((h) => h.row.type === "block" || h.row.type === "district")))) {
    const level = levelOf(f) ?? "block";
    const within = hitsArea.find((h) => (h.row.type === "block" || h.row.type === "district") && h.row.type !== level)?.row ?? null;
    add({ a: "data", kind: "rank", metric, level, n: topN(f) ?? 5, low: wantsLowest(f), within });
    return done();
  }
  if (metric && (I.has("stats") || I.has("define") || /(koto|কত|value|man\b|মান)/i.test(f))) { add({ a: "data", kind: "value", metric, place: areaPlace }); return done(); }

  /* ---------- around a place */
  if (I.has("distance") && (hitsTrip.length >= 2 || (hitsTrip.length === 1 && mem.place && mem.place.key !== hitsTrip[0].row.key))) {
    const [a, b] = hitsTrip.length >= 2 ? [hitsTrip[0].row, hitsTrip[1].row] : [mem.place!, hitsTrip[0].row];
    add({ a: "place", kind: "distance", from: a, to: b });
    return done();
  }
  if (I.has("nearest") || (I.has("sos") && (hits.length || HERE.test(f)))) {
    add({ a: "place", kind: "nearest", cat: nearCatOf(f), place: HERE.test(f) && !hitsTrip.length ? null : first(hitsTrip) ?? recalled });
    return done();
  }
  if (I.has("compare") && hitsArea.length >= 2) { add({ a: "place", kind: "compare", places: hitsArea.map((h) => h.row) }); return done(); }
  if (I.has("risk")) { add({ a: "help", kind: "explain", topic: "permit" }); return done(); }

  /* ---------- map: layers, 3D, places */
  if (I.has("view2d")) add({ a: "map", kind: "view3d", on: false });
  const showWords = I.has("show") || I.has("layerWord") || I.has("view3d") || words <= 4;
  if (v && showWords && !(hits.length && hits[0].text.length >= v.key.length && !I.has("layerWord") && !I.has("view3d") && words <= 2)) add({ a: "map", kind: "layer", varKey: v.key });
  else if (theme && showWords && !hits.length) add({ a: "map", kind: "layer", theme });
  if (place && (showWords || words <= 6)) add({ a: "map", kind: "goto", place, alts: hits[0]?.alts ?? [] });
  if (I.has("view3d") && !I.has("view2d")) add({ a: "map", kind: "view3d", on: true });
  if (I.has("locate") && !jobs.length) add({ a: "map", kind: "locate" });
  if (I.has("save") && place) add({ a: "map", kind: "goto", place, alts: [] });
  if (jobs.length) return done();
  if (hits.length) { add({ a: "place", kind: "about", place: hits[0].row, alts: hits[0].alts }); return done(); }
  if (I.has("howto")) { add({ a: "help", kind: "howto", topic: f }); return done(); }
  if (I.has("yes")) return { jobs: [], lang, say: l("Sure — what would you like me to do?", "নিশ্চয়ই — কী করব বলুন?") };
  add({ a: "help", kind: "fallback" });
  return done();
}
