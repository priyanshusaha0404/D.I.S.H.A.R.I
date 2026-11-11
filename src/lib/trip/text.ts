/** Words of the smart trip (planner, 3D trip and trip report) in English and Bengali. */
import { useApp } from "../app-context";
import type { Lang } from "../i18n";

const W = {
  title: ["Smart trip", "স্মার্ট ট্রিপ"],
  sub: ["Many places by boat and on foot — a timetable, the tide for every hop and a live 3D trip", "নৌকা ও হেঁটে একাধিক জায়গা — সময়সূচি, প্রতিটি যাত্রাংশের জোয়ার-ভাটা আর লাইভ ৩ডি যাত্রা"],
  stops: ["Places on your trip", "যাত্রার জায়গাগুলি"],
  start: ["Start", "শুরু"], finish: ["Finish", "শেষ"], stopN: ["Stop {n}", "{n} নং জায়গা"],
  addPh: ["Add a place — village, ghat, island, market…", "জায়গা যোগ করুন — গ্রাম, ঘাট, দ্বীপ, বাজার…"],
  pickMap: ["Pick on the map", "মানচিত্রে বাছুন"], myLoc: ["My location", "আমার অবস্থান"],
  stay: ["Stay", "থাকা"], noStay: ["Pass through", "না থেমে"],
  up: ["Move up", "উপরে নিন"], down: ["Move down", "নিচে নিন"], remove: ["Remove", "সরান"], makeStart: ["Start here", "এখান থেকে শুরু"],
  empty: ["Add at least two places — where you start and where you are going. Search, pick on the map or use your location.",
    "অন্তত দুটি জায়গা যোগ করুন — কোথা থেকে শুরু আর কোথায় যাবেন। খুঁজুন, মানচিত্রে বাছুন বা নিজের অবস্থান নিন।"],
  ready: ["Ready trips", "তৈরি যাত্রা"], readySub: ["Open one to see the plan, then change anything", "একটি খুলে পরিকল্পনা দেখুন, তারপর যা খুশি বদলান"],
  r1: ["Tiger reserve gateway", "ব্যাঘ্র প্রকল্পের প্রবেশপথ"], r2: ["Canning to Jharkhali by river", "নদীপথে ক্যানিং থেকে ঝড়খালি"], r3: ["Hasnabad to Sandeshkhali by river", "নদীপথে হাসনাবাদ থেকে সন্দেশখালি"],
  byBoat: ["by boat", "নৌকায়"],
  oneMore: ["Add one more place to plan the trip.", "যাত্রা পরিকল্পনার জন্য আর একটি জায়গা যোগ করুন।"],
  how: ["How you travel", "কীভাবে যাবেন"], travel: ["Travel by", "যাতায়াত"],
  leaveAt: ["Leave at", "রওনার সময়"], now: ["Now", "এখন"],
  bestOrder: ["Best order for the places in between", "মাঝের জায়গাগুলির সেরা ক্রম"],
  bestOrderSub: ["Visits them in the quickest order (up to 6)", "সবচেয়ে কম সময়ের ক্রমে ঘোরা (সর্বোচ্চ ৬টি)"],
  back: ["Come back to the start", "শুরুর জায়গায় ফিরে আসা"],
  tideAuto: ["Auto", "স্বয়ংক্রিয়"], tideAutoSub: ["The tide for each hop comes from the sea-level forecast at the time you leave", "প্রতিটি যাত্রাংশের জোয়ার-ভাটা রওনার সময়ের সমুদ্রতলের পূর্বাভাস থেকে"],
  plan: ["Plan trip", "যাত্রা পরিকল্পনা করুন"], replan: ["Plan again", "আবার পরিকল্পনা করুন"],
  planning: ["Finding hop {a} of {b}…", "{b}টির মধ্যে {a} নং যাত্রাংশ খোঁজা হচ্ছে…"],
  ordering: ["Trying every order… {a} / {b}", "সব ক্রম যাচাই হচ্ছে… {a} / {b}"],
  stale: ["The places or settings changed — plan again to update the times.", "জায়গা বা বিকল্প বদলেছে — সময় হালনাগাদ করতে আবার পরিকল্পনা করুন।"],
  failed: ["No connected route between {a} and {b}.", "{a} ও {b}-এর মধ্যে কোনো সংযুক্ত পথ পাওয়া যায়নি।"],
  reordered: ["Places in between were put in the quickest order.", "মাঝের জায়গাগুলি সবচেয়ে কম সময়ের ক্রমে সাজানো হয়েছে।"],
  yourTrip: ["Your trip", "আপনার যাত্রা"],
  k_total: ["Total time", "মোট সময়"], k_finish: ["Finish", "শেষ"], k_dist: ["Distance", "দূরত্ব"], k_boat: ["By boat", "নৌকায়"],
  k_walk: ["On foot", "হেঁটে"], k_changes: ["Changes", "বদল"], k_places: ["Places", "জায়গা"], k_stays: ["At places", "জায়গায় থাকা"],
  k_moving: ["moving {m}", "চলায় {m}"], k_leave: ["leave {t}", "রওনা {t}"], k_hops: ["{n} hops", "{n}টি যাত্রাংশ"], k_atGhats: ["{m} at ghats", "ঘাটে {m}"],
  split: ["Where the time goes", "সময় কোথায় যায়"],
  s_boat: ["Boat", "নৌকা"], s_walk: ["Walking", "হাঁটা"], s_change: ["Changing at ghats", "ঘাটে বদল"], s_stay: ["At places", "জায়গায় থাকা"],
  start3d: ["Start 3D trip", "৩ডি যাত্রা শুরু"], live3d: ["Live 3D trip", "লাইভ ৩ডি যাত্রা"],
  report: ["Report", "রিপোর্ট"], export: ["Export", "রপ্তানি"], sos: ["Help", "সহায়তা"], clear: ["Clear trip", "যাত্রা মুছুন"],
  ex_pdf: ["PDF report", "PDF রিপোর্ট"], ex_word: ["Word report", "Word রিপোর্ট"], ex_xlsx: ["Excel timetable", "Excel সময়সূচি"],
  ex_gpx: ["GPX (GPS apps)", "GPX (জিপিএস অ্যাপ)"], ex_geojson: ["GeoJSON", "GeoJSON"], ex_gmaps: ["Open in Google Maps", "গুগল ম্যাপে খুলুন"],
  ex_link: ["Copy share link", "শেয়ার লিঙ্ক কপি"], ex_save: ["Save to My data", "‘আমার তথ্য’-তে রাখুন"],
  making: ["Making…", "তৈরি হচ্ছে…"], copied: ["Link copied", "লিঙ্ক কপি হয়েছে"], savedOk: ["Saved to My data", "‘আমার তথ্য’-তে রাখা হয়েছে"],
  itin: ["Itinerary", "যাত্রাসূচি"], leave: ["Leave {t}", "{t}-এ রওনা"], arrive: ["Arrive {t}", "{t}-এ পৌঁছানো"],
  window: ["{a} – {b} · stay {m}", "{a} – {b} · {m} থাকা"],
  boatTo: ["{vessel} to {to}", "{to} পর্যন্ত {vessel}"], walkTo: ["Walk to {to}", "{to} পর্যন্ত হাঁটা"],
  via: ["via {r}", "{r} হয়ে"], changeAt: ["Change at {g}", "{g}-এ বদল"],
  ghatNear: ["the ghat near {v}", "{v}-এর কাছের ঘাট"], theGhat: ["the ghat", "ঘাট"],
  motor: ["Motor boat", "মোটর নৌকা"], country: ["Country boat", "দেশি নৌকা"],
  low: ["Low tide", "ভাটা"], high: ["High tide", "জোয়ার"], forecast: ["forecast", "পূর্বাভাস"], chosen: ["chosen", "নির্বাচিত"], usual: ["assumed", "ধরে নেওয়া"],
  creeks: ["{d} in small creeks", "{d} ছোট খাঁড়িতে"], permit: ["{d} in Forest Department permit waters", "{d} বন দপ্তরের অনুমতির জলপথে"],
  steps: ["Steps", "ধাপ"], hop: ["Hop {n}", "{n} নং যাত্রাংশ"],
  // SOS
  sosTitle: ["Emergency numbers", "জরুরি নম্বর"], sosNear: ["Nearest health and help points", "নিকটতম স্বাস্থ্য ও সহায়তা কেন্দ্র"],
  sosCall: ["Call", "ফোন"], sosFrom: ["from {p}", "{p} থেকে"],
  n112: ["All emergencies", "সব জরুরি পরিষেবা"], n100: ["Police", "পুলিশ"], n101: ["Fire", "দমকল"], n102: ["Ambulance", "অ্যাম্বুলেন্স"],
  n108: ["Emergency ambulance", "জরুরি অ্যাম্বুলেন্স"], n1554: ["Coast Guard (sea and rivers)", "উপকূলরক্ষী বাহিনী (সমুদ্র ও নদী)"],
  n1070: ["Disaster control room", "দুর্যোগ নিয়ন্ত্রণ কক্ষ"], n1098: ["Child helpline", "শিশু সহায়তা"], n1091: ["Women helpline", "মহিলা সহায়তা"],
  // 3D
  t_done: ["Trip complete", "যাত্রা সম্পূর্ণ"], t_next: ["Next: {name} · arrive {t}", "পরের জায়গা: {name} · পৌঁছানো {t}"],
  t_boat: ["{vessel} to {to}", "{to} পর্যন্ত {vessel}"], t_walk: ["Walk {d} to {to}", "{to} পর্যন্ত {d} হাঁটা"],
  t_change: ["At {at}: change from {a} to {b}", "{at}-এ: {a} থেকে {b}য় বদল"], t_stay: ["At {name} until {t}", "{t} পর্যন্ত {name}-এ"],
  t_wait: ["Waiting at {name}", "{name}-এ অপেক্ষা"],
  t_remaining: ["Remaining", "বাকি"], t_eta: ["Arrive", "পৌঁছানো"], t_progress: ["Progress", "অগ্রগতি"], t_clock: ["Time", "সময়"], t_nextIn: ["Next place", "পরের জায়গা"],
  t_play: ["Play", "চালান"], t_pause: ["Pause", "থামান"], t_resume: ["Resume", "চালু করুন"], t_speed: ["Speed", "গতি"],
  t_voiceOn: ["Voice on", "কণ্ঠ চালু"], t_voiceOff: ["Voice off", "কণ্ঠ বন্ধ"], t_2d: ["2D", "২ডি"], t_3d: ["3D", "৩ডি"],
  t_follow: ["Follow", "অনুসরণ"], t_live: ["Live GPS", "লাইভ জিপিএস"], t_sim: ["Simulate", "সিমুলেশন"], t_exit: ["Exit", "বন্ধ"],
  b_delta: ["Delta 3D", "ব-দ্বীপ ৩ডি"], b_sat: ["Satellite", "উপগ্রহ"], b_streets: ["Streets", "রাস্তা"], t_base: ["Basemap", "ভিত্তি মানচিত্র"],
  t_arrived: ["Arrived at {name}", "{name}-এ পৌঁছেছেন"], t_stayFor: ["Stay {m} · leave {t}", "{m} থাকুন · {t}-এ রওনা"],
  t_nextHop: ["Next: {how} to {to}", "এরপর: {to} পর্যন্ত {how}"], t_continue: ["Continue", "এগিয়ে চলুন"], t_end: ["Finish", "শেষ করুন"],
  t_doneSub: ["{dur} · {km} · {n} places", "{dur} · {km} · {n}টি জায়গা"], t_report: ["Trip report", "যাত্রার রিপোর্ট"],
  a_title: ["Around you · {r}", "আপনার চারপাশে · {r}"], a_paused: ["Paused at {t}", "{t}-এ থামানো"],
  a_search: ["Search: health, ghat, village, bank…", "খুঁজুন: স্বাস্থ্য, ঘাট, গ্রাম, ব্যাংক…"], a_none: ["Nothing of this kind within {r}.", "{r}-এর মধ্যে এমন কিছু নেই।"],
  a_show: ["Show help points around me", "আমার আশেপাশের সহায়তা কেন্দ্র দেখান"], a_go: ["Go", "যান"], a_goWalk: ["Walk {m} · {d}", "হাঁটা {m} · {d}"], a_looking: ["Looking around…", "চারপাশ দেখা হচ্ছে…"],
  a_hint: ["Health and help points are pinned on the map.", "স্বাস্থ্য ও সহায়তা কেন্দ্রগুলি মানচিত্রে চিহ্নিত।"],
  l_on: ["Live tracking", "লাইভ ট্র্যাকিং"], l_wait: ["Waiting for your location…", "আপনার অবস্থানের অপেক্ষা…"], l_acc: ["accuracy ± {m}", "নির্ভুলতা ± {m}"],
  l_off: ["You are {d} from the planned route", "আপনি পরিকল্পিত পথ থেকে {d} দূরে"], l_replan: ["Plan again from here", "এখান থেকে আবার পরিকল্পনা"],
  l_denied: ["Your location is not available. Allow location for this site to use live tracking.", "আপনার অবস্থান পাওয়া যাচ্ছে না। লাইভ ট্র্যাকিংয়ের জন্য এই সাইটে অবস্থানের অনুমতি দিন।"],
  l_onRoute: ["On route", "পথে আছেন"], l_speed: ["{v} km/h", "ঘণ্টায় {v} কিমি"],
  f_nogl: ["This device cannot draw 3D maps — the trip is shown on the map instead.", "এই যন্ত্রে ৩ডি মানচিত্র দেখানো যায় না — যাত্রা সাধারণ মানচিত্রে দেখানো হচ্ছে।"],
  // report
  r_title: ["Trip plan", "যাত্রা পরিকল্পনা"], r_summary: ["Summary", "সারসংক্ষেপ"], r_map: ["The whole trip on the map", "মানচিত্রে পুরো যাত্রা"],
  r_mapCap: ["Numbered pins are your places in order; blue lines are boat legs, dotted grey lines are walks.", "নম্বর দেওয়া পিনগুলি ক্রম অনুযায়ী আপনার জায়গা; নীল রেখা নৌপথ, ধূসর বিন্দুরেখা হাঁটা।"],
  r_day: ["Your day", "আপনার দিন"], r_timeline: ["Timeline", "সময়রেখা"],
  r_timelineCap: ["Moving (by boat or on foot) and time at each place, against the clock.", "ঘড়ির সময় অনুযায়ী চলা (নৌকা বা হেঁটে) আর প্রতিটি জায়গায় থাকা।"],
  r_splitCap: ["Share of the whole trip.", "পুরো যাত্রার ভাগ।"], r_tide: ["Tide along the trip", "যাত্রাপথে জোয়ার-ভাটা"],
  r_tideCap: ["Sea-level forecast (m above mean sea level) near the start; dots mark when each hop leaves.", "শুরুর কাছে সমুদ্রতলের পূর্বাভাস (গড় সমুদ্রতল থেকে মিটার); বিন্দুগুলি প্রতিটি যাত্রাংশের রওনার সময়।"],
  r_tideStrip: ["The tide used for each hop.", "প্রতিটি যাত্রাংশে ব্যবহৃত জোয়ার-ভাটা।"],
  r_hops: ["Hop by hop", "যাত্রাংশ অনুযায়ী"], r_hopsCap: ["Distance of every hop, split by boat and walking.", "প্রতিটি যাত্রাংশের দূরত্ব, নৌকা ও হাঁটা অনুযায়ী।"],
  r_itin: ["Itinerary", "যাত্রাসূচি"], r_notes: ["Notes", "টীকা"], r_help: ["Help numbers", "জরুরি নম্বর"], r_method: ["How this plan was made", "পরিকল্পনা কীভাবে তৈরি"],
  r_th_time: ["Time", "সময়"], r_th_place: ["Place", "জায়গা"], r_th_how: ["How you get there", "কীভাবে যাবেন"], r_th_tide: ["Tide", "জোয়ার-ভাটা"],
  r_th_hop: ["Hop", "যাত্রাংশ"], r_th_from: ["From", "কোথা থেকে"], r_th_to: ["To", "কোথায়"], r_th_dist: ["Distance", "দূরত্ব"], r_th_dur: ["Time", "সময়"],
  r_th_dep: ["Leave", "রওনা"], r_th_arr: ["Arrive", "পৌঁছানো"], r_th_mode: ["Mode", "ধরন"], r_th_rivers: ["Rivers", "নদী"],
  r_until: ["until {t}", "{t} পর্যন্ত"], r_leaveRow: ["Leave at {t}", "{t}-এ রওনা"],
  r_method1: ["Boat routes are found on a 100 m grid of navigable water at low and high tide (the National Park core is not crossed); walking follows OpenStreetMap roads and paths.",
    "নৌপথ খোঁজা হয় ভাটা ও জোয়ারের নৌচলাচলযোগ্য জলের ১০০ মিটার গ্রিডে (জাতীয় উদ্যানের কোর এলাকা পার হয় না); হাঁটার পথ ওপেনস্ট্রিটম্যাপের রাস্তা ও পথ ধরে।"],
  r_method2: ["Speeds: motor boat 8 km/h, country boat 5 km/h, walking 4.5 km/h; changing between boat and walking at a ghat takes 10 minutes.",
    "গতি: মোটর নৌকা ঘণ্টায় ৮ কিমি, দেশি নৌকা ঘণ্টায় ৫ কিমি, হাঁটা ঘণ্টায় ৪.৫ কিমি; ঘাটে নৌকা ও হাঁটার মধ্যে বদলে ১০ মিনিট।"],
  r_method3: ["The tide for each hop is read from the Open-Meteo sea-level forecast at the place and time you leave: above the 48-hour median is high tide.",
    "প্রতিটি যাত্রাংশের জোয়ার-ভাটা নেওয়া হয় রওনার জায়গা ও সময়ের ওপেন-মিটিও সমুদ্রতলের পূর্বাভাস থেকে: ৪৮ ঘণ্টার মধ্যমার উপরে হলে জোয়ার।"],
  r_settings: ["Travel", "যাতায়াত"], r_prefer: ["Route preference", "পথের পছন্দ"], r_tideSet: ["Tide", "জোয়ার-ভাটা"],
  r_tideAutoV: ["Auto — from the forecast for each hop", "স্বয়ংক্রিয় — প্রতিটি যাত্রাংশের পূর্বাভাস থেকে"],
  r_lane_move: ["Moving", "চলা"], r_lane_stay: ["At places", "জায়গায়"],
  r_order: ["Order", "ক্রম"], r_orderBest: ["Quickest order of the places in between", "মাঝের জায়গাগুলির সবচেয়ে কম সময়ের ক্রম"], r_orderAsGiven: ["As entered", "যেমন দেওয়া হয়েছে"],
  r_sheet_timetable: ["Timetable", "সময়সূচি"], r_sheet_legs: ["Legs", "অংশ"],
  r_coords: ["Coordinates", "স্থানাঙ্ক"],
} as const;

export type TripWord = keyof typeof W;
export function tw(lang: Lang, k: TripWord, p: Record<string, string | number> = {}): string {
  let s: string = W[k][lang === "bn" ? 1 : 0];
  for (const [a, b] of Object.entries(p)) s = s.split(`{${a}}`).join(String(b));
  return lang === "bn" ? bnFix(s) : s;
}
/** Bengali case endings after a name that ends in ঘাট: ঘাট-এ → ঘাটে, ঘাট-এর → ঘাটের */
export const bnFix = (s: string) => s.replace(/ঘাট-এর/g, "ঘাটের").replace(/ঘাট-এ/g, "ঘাটে").replace(/ঘাট-তে/g, "ঘাটে");
export function useTW() {
  const { lang } = useApp();
  return (k: TripWord, p?: Record<string, string | number>) => tw(lang, k, p);
}

export const MODE_COLOUR = { boat: "#2a78d6", walk: "#3c3b37", change: "#9a948a", stay: "#1baf7a", done: "#c98a00" } as const;

const BN_D = "০১২৩৪৫৬৭৮৯";
const bnDigits = (s: string) => s.replace(/[0-9]/g, (d) => BN_D[Number(d)]);
/** clock time in the interface language — in Bengali the way it is said: ভোর, সকাল, দুপুর, বিকাল, সন্ধ্যা, রাত */
export function clock(ms: number, lang: Lang) {
  const d = new Date(ms);
  if (lang !== "bn") return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const h = d.getHours(), m = d.getMinutes();
  const part = h < 4 ? "রাত" : h < 6 ? "ভোর" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকাল" : h < 20 ? "সন্ধ্যা" : "রাত";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${part} ${bnDigits(`${h12}:${String(m).padStart(2, "0")}`)}`;
}
export function dayLabel(ms: number, lang: Lang) {
  return new Date(ms).toLocaleDateString(lang === "bn" ? "bn-IN" : "en-IN", { weekday: "short", day: "numeric", month: "short" });
}
/** the name of where a leg starts or ends: the place, a named ghat, or "the ghat near <village>" */
export function legEnd(l: { fromName: string; toName: string; fromNear?: string; toNear?: string }, which: "from" | "to", lang: Lang) {
  const n = which === "from" ? l.fromName : l.toName;
  if (n) return n;
  const v = which === "from" ? l.fromNear : l.toNear;
  return v ? tw(lang, "ghatNear", { v }) : tw(lang, "theGhat");
}
export const vesselName = (v: string, lang: Lang) => tw(lang, v === "country_boat" ? "country" : "motor");
export const tideName = (t: "low" | "high", lang: Lang) => tw(lang, t);
export const SOS_NUMBERS = ["112", "100", "101", "102", "108", "1554", "1070", "1098", "1091"] as const;
