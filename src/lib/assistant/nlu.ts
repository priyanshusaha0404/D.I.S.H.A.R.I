/** Understanding what people type to the assistant — English, Bengali script and Banglish (Bengali in Latin letters):
 *  intents, places (from the site's own gazetteer), themes, map variables, file formats, times, stays, distances,
 *  travel mode, tide and numbers. Everything runs in the browser and works offline. */
import { bnToLatin, isBengali, normName, searchIndex, searchPlaces, type IndexRow } from "../data/search";
import { loadCatalog, type VariableDef } from "../data/catalog";

/* ------------------------------------------------------------------ normalising */
export function norm(s: string) {
  return s.normalize("NFC").toLowerCase().replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/[“”"‘’`]/g, "").replace(/[?!।]+/g, " ").replace(/\s+/g, " ").trim();
}
/** the message in its own script and in Latin letters, so one keyword list covers বাংলা, Banglish and English */
export function forms(s: string) {
  const n = norm(s);
  return isBengali(n) ? `${n} ⁞ ${bnToLatin(n).toLowerCase()}` : n;
}

/* ------------------------------------------------------------------ intents */
const R = (src: string) => new RegExp(src, "i");
export const INTENT = {
  greet: R("^(hi+|hello+|hey|hii+|namaskar|nomoskar|namaste|nomoshkar|good (morning|afternoon|evening)|subho|shubho|নমস্কার|হ্যালো|হাই|শুভ)\\b"),
  thanks: R("\\b(thank|thanks|thx|dhonnobad|dhonyobad|dhanyabad|ধন্যবাদ|thank you)\\b"),
  capab: R("(what can you do|what do you do|who are you|how can you help|help me\\b|^help$|^menu$|ki ki (korte )?paro|ki korte paro|ki korte paren|tumi ke|apni ke|tumi ki paro|তুমি কে|আপনি কে|কী করতে পার|কি করতে পার|কী কী পার)"),
  howto: R("(how (do|can|to|should) |how to\\b|kivabe|kibhabe|kibabe|kemon kore|kemne|কিভাবে|কীভাবে|কেমন করে|steps? to)"),
  define: R("(what is|what's|what are|what does .* mean|meaning of|define|explain|mane ki|maane ki|ki jinis|bolte ki bojhay|বুঝিয়ে|মানে কী|মানে কি|কী জিনিস|ki bujhay|bujhiye)"),
  show: R("\\b(show|open|display|see|view|zoom|go to|take me|fly to|locate|find|where is|where's|dekhao|dekhaw|dekhan|dekhte chai|dekhbo|khulo|kholo|niye jao|nie jao|koi|kothay|kothai|kon jaygay|দেখাও|দেখান|খোলো|কোথায়|নিয়ে যাও)\\b"),
  layerWord: R("\\b(layer|map of|stor|স্তর|লেয়ার|heatmap|choropleth)\\b"),
  basemap: R("(basemap|base map|satellite|imagery|street map|streets|topo|topographic|osm|openstreetmap|landsat|terrain map|ocean map|light gray|dark gray|hybrid|উপগ্রহ|স্যাটেলাইট|ভিত্তি মানচিত্র)"),
  view3d: R("(\\b3d\\b|3 d\\b|three d|৩ডি|৩ ডি|tilt|\\bthree dimension)"),
  view2d: R("(\\b2d\\b|flat map|২ডি)"),
  compare: R("(compare|comparison|tulona|তুলনা|swipe|\\bvs\\b|versus|before and after|aage pore|আগে পরে)"),
  dark: R("(dark mode|dark theme|night mode|kalo|অন্ধকার মোড|ডার্ক)"),
  light: R("(light mode|light theme|day mode|আলো মোড|লাইট মোড)"),
  toBn: R("(in bengali|in bangla|bangla(y|te|)\\s*(koro|kore dao|dekhao|bolo|kotha|switch|chai)|(switch|change|turn|set|make)\\b.*\\b(to|into|in)\\s*(bangla|bengali)|(language|bhasha|bhasa)\\s*(bangla|bengali)|(bangla|bengali)\\s*(language|bhasha|bhasa|mode)|বাংলায়|বাংলা করো|ভাষা বাংলা|বাংলা ভাষা)"),
  toEn: R("(in english|english(e|y)?\\s*(koro|kore dao|dekhao|bolo|switch|chai)|(switch|change|turn|set|make)\\b.*\\b(to|into|in)\\s*english|(language|bhasha|bhasa)\\s*english|english\\s*(language|bhasha|bhasa|mode)|ইংরেজিতে|ইংরেজি করো|ইংরেজি ভাষা)"),
  labels: R("\\b(labels?|nam|naam|নাম)\\b.*\\b(off|on|bondho|chalu|hide|show|লুকাও|দেখাও)"),
  reset: R("(reset (the )?map|clear (the )?map|whole delta|pura (ব-দ্বীপ|delta|sundarban) dekhao|home view|শুরুর দৃশ্য|সব মুছ)"),
  locate: R("(my location|where am i|amar location|ami kothay|আমার অবস্থান|আমি কোথায়|locate me)"),
  trip: R("(\\btrip\\b|\\bplan\\b|planning|journey|route|itinerary|travel|\\bjabo\\b|jaabo|jete chai|jete chaai|jaoa|jawa|\\bjai\\b|ghurbo|ghurte|ghure|bhromon|যাব|যেতে|ঘুরব|ঘুরতে|ভ্রমণ|যাত্রা|পরিকল্পনা|\\btheke\\b.*\\b(jabo|jete|porjonto|to)\\b|\\bfrom\\b.+\\bto\\b|\\bvia\\b|\\bhoye\\b|হয়ে|থেকে.*(যাব|পর্যন্ত)|how (can|do|should|to) (i |we )?(go|get|reach)|\\bget to\\b|\\breach\\b|kivabe jabo|kibhabe jabo|কিভাবে যাব|কীভাবে যাব)"),
  addStop: R("(add|jog koro|jog kor|jukto|যোগ কর|যুক্ত কর)"),
  removeStop: R("(remove|delete|baad dao|bad dao|sorao|soriye|বাদ দাও|সরাও|মুছে দাও)"),
  clearTrip: R("(clear (the |my )?trip|new trip|notun trip|trip (muche|mucho|clear)|যাত্রা মুছ)"),
  trip3d: R("(start (the |my )?(3d )?trip|3d trip|3d te (dekhao|chalao|cholo)|live (tracking|trip|3d)|track me|tracking|navigation|navigate|chalu koro trip|trip chalu|৩ডি যাত্রা|লাইভ|ট্র্যাকিং)"),
  live: R("(live|gps|tracking|track me|লাইভ|জিপিএস)"),
  download: R("(download|export|save as|\\bpdf\\b|\\bword\\b|docx|excel|xlsx|\\bcsv\\b|geojson|\\bgpx\\b|\\bpng\\b|\\bfile\\b|report|ripot|riport|ডাউনলোড|রিপোর্ট|পিডিএফ|এক্সেল|ফাইল)"),
  report: R("(report|ripot|riport|রিপোর্ট|profile|summary report)"),
  dataset: R("(dataset|data set|\\bdata\\b|table|census|all variables|attribute|তথ্য|ডেটা|ডাটা)"),
  mapExport: R("(map (pdf|png|image|chobi|export|print)|export (the )?map|print (the )?map|মানচিত্র (রপ্তানি|ছবি|পিডিএফ))"),
  find: R("(where (can|should|to|do)|best (place|area|spot|location|jayga)|good (place|area|spot)|suitable|uptukto|upojukto|valo jayga|bhalo jayga|kothay (pabo|dhorbo|dhora|jabo|mach|kakra|modhu|pawa)|ভালো জায়গা|উপযুক্ত|কোথায় (পাব|ধরব|ধরা)|find (areas|places|spots)|recommend)"),
  risk: R("(safe|safety|risk|danger|dangerous|bipod|bipodjonok|nirapod|bhoy|voy|attack|conflict|নিরাপদ|ঝুঁকি|বিপদ|ভয়|আক্রমণ|সংঘাত)"),
  weather: R("(weather|abohawa|aabohawa|আবহাওয়া|rain|brishti|bristi|বৃষ্টি|wind|hawa|হাওয়া|storm|jhor|ঝড়|temperature|tapmatra|তাপমাত্রা|forecast|purbabhas|পূর্বাভাস|cloud|megh)"),
  tide: R("(tide|jowar|joar|joyar|bhata|bhaata|জোয়ার|ভাটা|sea level|samudra tal)"),
  bestTime: R("(best time|when (should|to|can) i (go|leave|start)|kokhon (jabo|beroabo|berobo|rowna|shuru)|kokhon jaoa|কখন (যাব|বেরোব|রওনা)|ভালো সময়|valo somoy|bhalo somoy)"),
  stats: R("(how many|how much|\\bkoto\\b|কত|population|lok sonkhya|loksonkhya|jonsonkhya|জনসংখ্যা|\\btotal\\b|average|gor\\b|গড়|\\btop\\b|highest|lowest|most|least|maximum|minimum|sobcheye|sab theke|সবচেয়ে|rank|ranking|list of|kon (block|gram|dwip|island|jela)|which (block|village|island|district))"),
  nearest: R("(nearest|nearby|near me|closest|kache|kachhe|kachakachi|কাছে|কাছাকাছি|নিকটতম|around)"),
  distance: R("(distance|how far|koto dur|kotodur|কত দূর|দূরত্ব|durotto)"),
  sos: R("(emergency|\\bsos\\b|ambulance|police|hospital|doctor|daktar|haspatal|bipode|help number|helpline|জরুরি|অ্যাম্বুলেন্স|পুলিশ|হাসপাতাল|ডাক্তার|বিপদে)"),
  save: R("(save|bookmark|rakho|rekhe dao|সংরক্ষণ|রেখে দাও)"),
  pageDash: R("(dashboard|ড্যাশবোর্ড)"),
  pageReports: R("(reports page|report page|রিপোর্ট পাতা)"),
  pageMy: R("(my data|amar tothyo|আমার তথ্য|saved places|saved journeys)"),
  about: R("(about (the )?(data|site|website|project)|data source|sources|kotha theke data|tothyer utso|তথ্যের উৎস|which data)"),
  yes: R("^(yes|yeah|yep|ok|okay|sure|ha|haa|hya|hyan|thik ache|thikache|হ্যাঁ|ঠিক আছে|করো|koro)$"),
  no: R("^(no|nope|na|naa|না|thak|থাক)$"),
};
export type IntentKey = keyof typeof INTENT;
export function intents(f: string): Set<IntentKey> {
  const out = new Set<IntentKey>();
  (Object.keys(INTENT) as IntentKey[]).forEach((k) => { if (INTENT[k].test(f)) out.add(k); });
  return out;
}

/* ------------------------------------------------------------------ themes, modes, formats */
export type Theme = "tiger" | "fish" | "crab" | "honey" | "environment";
const THEMES: [Theme, RegExp][] = [
  ["tiger", R("(tiger|\\bbagh|baagh|বাঘ|royal bengal|wildlife|bonnoprani|বন্যপ্রাণী|deer|horin|হরিণ|chital)")],
  ["crab", R("(crab|kakra|kankra|kakda|kaankra|কাঁকড়া|কাকড়া)")],
  ["honey", R("(honey|modhu|\\bmou\\b|মধু|mouli|মৌলি|\\bbee|moumachi|মৌমাছি)")],
  ["fish", R("(fish|\\bmach\\b|\\bmaach\\b|\\bmaachh|\\bmachh|মাছ|fishing|jele|জেলে|prawn|chingri|চিংড়ি|meen|\\bmeen\\b)")],
  ["environment", R("(environment|poribesh|paribesh|পরিবেশ|erosion|bhangon|ভাঙন|climate|jolobayu|জলবায়ু|shoreline)")],
];
export const themeOf = (f: string): Theme | null => THEMES.find(([, re]) => re.test(f))?.[0] ?? null;

export type Fmt = "pdf" | "docx" | "xlsx" | "csv" | "geojson" | "gpx" | "png" | "gmaps" | "link";
const FMTS: [Fmt, RegExp][] = [
  ["pdf", R("(\\bpdf\\b|পিডিএফ)")], ["docx", R("(\\bword\\b|docx|\\bdoc\\b|ওয়ার্ড)")], ["xlsx", R("(excel|xlsx|spreadsheet|এক্সেল)")],
  ["csv", R("\\bcsv\\b")], ["geojson", R("(geojson|geo json|gis file|shapefile|\\bshp\\b)")], ["gpx", R("(\\bgpx\\b|gps file)")],
  ["png", R("(\\bpng\\b|\\bimage\\b|\\bchobi\\b|ছবি|picture|\\bjpg\\b)")], ["gmaps", R("(google ?maps?|গুগল ম্যাপ)")], ["link", R("(share link|\\blink\\b|লিঙ্ক|share)")],
];
export const formatsOf = (f: string): Fmt[] => FMTS.filter(([, re]) => re.test(f)).map(([k]) => k);

export function modeOf(f: string): "boat" | "walk" | "multimodal" | null {
  const b = /(nouka|nauka|nowka|\bnoka\b|নৌকা|\bboat|launch|lonch|ferry|bhotbhoti|ভটভটি|trawler|steamer|jolpoth|জলপথ|by water|by river|lanch)/i.test(f);
  const w = /(\bhete\b|hente|haanta|hata|হেঁটে|হাঁটা|walk|walking|on foot|paye|পায়ে)/i.test(f);
  if (b && w) return "multimodal";
  if (/(walk ?\+ ?boat|both|dutoi|duto mile|mix|মিলিয়ে|দুটো)/i.test(f)) return "multimodal";
  return b ? "boat" : w ? "walk" : null;
}
export const vesselOf = (f: string): "motor_boat" | "country_boat" | null =>
  /(deshi|desi|country boat|দেশি|dingi|ডিঙি|row ?boat|\bdaar\b|danr|দাঁড়)/i.test(f) ? "country_boat" : /(motor|bhotbhoti|ভটভটি|মোটর|trawler|launch|lonch)/i.test(f) ? "motor_boat" : null;
export const tideOf = (f: string): "low" | "high" | null =>
  /(jowar|joar|joyar|জোয়ার|high tide|full tide)/i.test(f) ? "high" : /(bhata|bhaata|ভাটা|low tide)/i.test(f) ? "low" : null;

/* ------------------------------------------------------------------ numbers, distances, durations, times */
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, ek: 1, dui: 2, tin: 3, char: 4, pach: 5, panch: 5, choy: 6, sat: 7, aat: 8, noy: 9, dosh: 10, das: 10,
  "এক": 1, "দুই": 2, "তিন": 3, "চার": 4, "পাঁচ": 5, "ছয়": 6, "সাত": 7, "আট": 8, "নয়": 9, "দশ": 10 };
export function topN(f: string): number | null {
  const m = f.match(/\b(top|first|prothom|প্রথম|শীর্ষ)\s*(\d{1,2})/i) || f.match(/(\d{1,2})\s*(ta|ti|টা|টি|ti\b)?\s*(village|gram|block|island|dwip|গ্রাম|ব্লক|দ্বীপ|places|jayga|জায়গা)/i);
  if (m) return Math.min(50, Number(m[2] && /\d/.test(m[2]) ? m[2] : m[1]));
  const w = f.match(/\btop\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  return w ? NUM_WORDS[w[1].toLowerCase()] : null;
}
export function radiusKm(f: string): number | null {
  const m = f.match(/(\d+(?:\.\d+)?)\s*(km|kms|kilomet(?:er|re)s?|kimi|কিমি|কিলোমিটার)\b/i);
  return m ? Number(m[1]) : null;
}
const DUR_RE = /(\d+(?:\.\d+)?|adh|aadh|half|dedh|derh|arai|আধ|দেড়|আড়াই)\s*(ghonta|ghanta|ghonte|hours?|hrs?|ঘণ্টা|ঘন্টা|min|mins|minutes?|minit|মিনিট)/gi;
function durMin(num: string, unit: string) {
  const n = /^(adh|aadh|half|আধ)$/i.test(num) ? 0.5 : /^(dedh|derh|দেড়)$/i.test(num) ? 1.5 : /^(arai|আড়াই)$/i.test(num) ? 2.5 : Number(num);
  return /^(min|mins|minute|minutes|minit|মিনিট)$/i.test(unit) ? n : n * 60;
}
export function durations(f: string): { at: number; min: number }[] {
  const out: { at: number; min: number }[] = [];
  for (const m of f.matchAll(DUR_RE)) out.push({ at: m.index ?? 0, min: Math.round(durMin(m[1], m[2])) });
  return out;
}
/** when to leave: "kal sokal 8 tay", "tomorrow 8:30 am", "aaj bikel 4 te", "8 pm", "ekhon" */
export function leaveTime(f: string, now = new Date()): number | null {
  const s = f.replace(DUR_RE, " ").replace(/(\d+(?:\.\d+)?)\s*(km|kms|kilomet\w*|kimi|কিমি)/gi, " ");
  let day = 0;
  if (/(porshu|porsu|day after tomorrow|পরশু)/i.test(s)) day = 2;
  else if (/(\bkal\b|\bkaal\b|kalke|tomorrow|tmrw|আগামীকাল|কাল)/i.test(s)) day = 1;
  let h: number | null = null, mi = 0;
  const hm = s.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?/i);
  const ap = s.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  const ta = s.match(/\b(\d{1,2})\s*(ta|tay|tae|tai|tar|টা|টায়|টার|o'?clock|baje|বাজে)\b/i) || s.match(/(\d{1,2})\s*(টা|টায়)/);
  let mer: string | null = null;
  if (hm) { h = Number(hm[1]); mi = Number(hm[2]); mer = hm[3] || null; }
  else if (ap) { h = Number(ap[1]); mer = ap[2]; }
  else if (ta) h = Number(ta[1]);
  const part = /(sokal|sakal|morning|সকাল|bhor|ভোর)/i.test(s) ? "am" : /(dupur|noon|দুপুর)/i.test(s) ? "noon" : /(bikel|bikal|biyel|afternoon|বিকেল|বিকাল)/i.test(s) ? "pm"
    : /(sondhe|sondhya|sandhya|evening|সন্ধ্যা|সন্ধে)/i.test(s) ? "pm" : /(\brat\b|\braat\b|night|রাত)/i.test(s) ? "night" : null;
  const nowWord = /(\bekhon\b|\bnow\b|right now|এখন|এক্ষুনি|ekkhuni)/i.test(s);
  if (h === null) {
    if (nowWord && !day) return null;                   // "now" = the default (next quarter hour)
    if (!day && !part) return null;
    h = part === "am" ? 8 : part === "noon" ? 12 : part === "pm" ? 16 : part === "night" ? 20 : 8;
  } else {
    if (mer?.toLowerCase() === "pm" && h < 12) h += 12;
    else if (mer?.toLowerCase() === "am" && h === 12) h = 0;
    else if (!mer) {
      if ((part === "pm" || part === "noon") && h < 12 && !(part === "noon" && h >= 11)) h += 12;
      else if (part === "night" && h >= 6 && h < 12) h += 12;
      else if (!part && h >= 1 && h <= 6) h += 12;         // "4 tay" without a part of day: afternoon
    }
  }
  const d = new Date(now);
  d.setDate(d.getDate() + day);
  d.setHours(h, mi, 0, 0);
  if (!day && d.getTime() < now.getTime() - 10 * 60000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/* ------------------------------------------------------------------ places in a sentence */
export interface PlaceHit { row: IndexRow; alts: IndexRow[]; at: number; end: number; text: string; fuzzy: boolean }
/** words that are never place names on their own (Banglish and English function words) */
const STOP = new Set(("a an the and or of in on at to from via by for with near my me i we you it is are was be do does what which where when how why who " +
  "theke hoye porjonto jabo jete jai jaoa jawa ar o ki koto kothay kothai kon kemon kivabe dao den chai koro korbo kore korte dekhao dekhan bolo bolun ache achhe nei hobe " +
  "kal kaal aaj ekhon sokal dupur bikel bikal sondhe rat raat ta tay te e ke r er re niye diye moddhe moddhye kache kachhe pase upor niche " +
  "report pdf word excel csv data map trip plan route boat nouka walk hete tide jowar bhata high low best top list show open find help weather rain wind " +
  "village gram block island dwip district jela ghat river nodi canal khal forest jongol area place places jayga sob all whole pura total population lok " +
  "tiger bagh fish mach crab kakra honey modhu mangrove 3d 2d live start stop new good bad safe risk time hour hours minute minutes km mile " +
  "ghonta ghanta ghonte ghante ghontay ghontar minit thakbo thakbe thaki thakte thaka stay staying abar tarpor erpor prothome sheshe fire phire firbo asbo ashbo ferot " +
  "ghurbo ghurte dekhbo korbo kobe kokhon jabe jaben jete chai lagbe kemon kivabe kibhabe location obosthan ekhane ekhan okhane sekhane oikhane " +
  "nouka nowka launch lonch ferry bhotbhoti motor deshi through then also please today tomorrow morning evening night return back").split(" "));
const PREFER: Record<string, string[]> = {
  trip: ["village", "town", "place", "jetty", "poi", "island", "block", "district", "forest_unit", "protected_area", "river", "canal"],
  area: ["block", "district", "island", "village", "town", "protected_area", "forest_unit", "place", "jetty", "poi", "river", "canal"],
  any: ["block", "district", "island", "town", "village", "place", "jetty", "protected_area", "forest_unit", "river", "canal", "poi"],
};
let nameIdx: Promise<Map<string, IndexRow[]>> | null = null;
function names() {
  if (!nameIdx) nameIdx = searchIndex().then((rows) => {
    const m = new Map<string, IndexRow[]>();
    const put = (k: string, r: IndexRow) => { if (!k || k.length < 3) return; (m.get(k) || m.set(k, []).get(k)!).push(r); };
    for (const r of rows) {
      put(r.key, r);
      // "basanti ct" → "basanti", "jharkhari jetty ghat" → "jharkhari ghat", "sagar island" → "sagar"
      const short = r.key.replace(/\s+(ct|cd block|block|island|reserve forest|ferry ghat|jetty ghat|jetty|ghat|pier|canal|river|wildlife sanctuary)$/, "");
      if (short !== r.key && short.length >= 4) put(short, r);
      if (r.name_bn) put(normName(r.name_bn), r);
    }
    return m;
  });
  return nameIdx;
}
const rank = (r: IndexRow, pref: string[]) => { const i = pref.indexOf(r.type); return (i < 0 ? 50 : i) - r.imp * 2; };
/** Places mentioned in a sentence, in order, longest names first; misspellings are matched by the gazetteer's fuzzy search. */
export async function placesIn(text: string, want: keyof typeof PREFER = "any"): Promise<PlaceHit[]> {
  const idx = await names();
  const n = norm(text);
  const lat = isBengali(n) ? bnToLatin(n).toLowerCase() : n;
  const words = normName(lat).split(" ").filter(Boolean);
  const hits: PlaceHit[] = [];
  const pref = PREFER[want];
  let i = 0;
  while (i < words.length) {
    let found: PlaceHit | null = null;
    for (let len = Math.min(5, words.length - i); len >= 1 && !found; len--) {
      const ph = words.slice(i, i + len).join(" ");
      if (len === 1 && (STOP.has(ph) || ph.length < 4 || /^\d+$/.test(ph))) continue;
      const rows = idx.get(ph);
      if (rows?.length) {
        const sorted = [...rows].sort((a, b) => rank(a, pref) - rank(b, pref));
        found = { row: sorted[0], alts: sorted.slice(1, 6), at: i, end: i + len, text: ph, fuzzy: false };
      }
    }
    if (!found) {
      const w = words[i];
      const prevNum = /^\d/.test(words[i - 1] || ""), nextNum = /^\d/.test(words[i + 1] || "");
      if (w.length >= 5 && !STOP.has(w) && !/^\d/.test(w) && !prevNum && !nextNum) {
        const r = await searchPlaces(w, { limit: 3 });
        const top = r.results[0];
        if (top && top.score >= 1.2 && Math.abs(top.name.length - w.length) <= 3 && top.name[0].toLowerCase() === w[0]) {
          const row = (idx.get(normName(top.name)) || [])[0];
          if (row) found = { row, alts: (idx.get(normName(top.name)) || []).slice(1, 6), at: i, end: i + 1, text: w, fuzzy: true };
        }
      }
    }
    if (found) { hits.push(found); i = found.end; } else i++;
  }
  // the same place twice in a row is one mention
  return hits.filter((h, k) => k === 0 || h.row.key !== hits[k - 1].row.key || h.at - hits[k - 1].end > 2);
}
/** word positions of trip markers, to read who is the start, the end and who is in between */
export function tripRoles(text: string, hits: PlaceHit[]): PlaceHit[] {
  const n = norm(text);
  const words = normName(isBengali(n) ? bnToLatin(n).toLowerCase() : n).split(" ");
  const at = (h: PlaceHit, k: number) => words[h.end + k] || "";
  const before = (h: PlaceHit) => words[h.at - 1] || "";
  let start = hits.findIndex((h) => /^(theke|thake|thekhe|থেকে)$/.test(at(h, 0)) || /^(from)$/.test(before(h)));
  let end = hits.findIndex((h) => /^(porjonto|porjanto|পর্যন্ত)$/.test(at(h, 0)) || (/^(to|till|until)$/.test(before(h)) && !/^(go|want)$/.test(words[h.at - 2] || "")));
  const out = [...hits];
  if (start > 0) { const [s] = out.splice(start, 1); out.unshift(s); end = end >= 0 && end < start ? end + 1 : end; start = 0; }
  const endIdx = end >= 0 ? out.indexOf(hits[end]) : -1;
  if (endIdx >= 0 && endIdx !== out.length - 1) { const [e] = out.splice(endIdx, 1); out.push(e); }
  return out;
}
/** stay minutes after a place: "Gosaba te 1 ghonta", "Pakhiralay 30 min thakbo"; or for every place: "prottek jaygay 30 min" */
export function staysFor(text: string, hits: PlaceHit[]): { each: number | null; per: Map<PlaceHit, number> } {
  const n = norm(text);
  const lat = isBengali(n) ? bnToLatin(n).toLowerCase() : n;
  const words = normName(lat).split(" ");
  const per = new Map<PlaceHit, number>();
  const ds = durations(lat);
  let each: number | null = null;
  if (/(prottek|protyek|protiti|protita|each|every|sob jaygay|sab jaygay|প্রতিটি|প্রত্যেক|সব জায়গায়)/i.test(lat) && ds.length) each = ds[0].min;
  if (each === null) for (const d of ds) {
    // the place just before the duration (within four words)
    const wi = lat.slice(0, d.at).split(" ").filter(Boolean).length;
    const h = [...hits].reverse().find((x) => x.end <= wi && wi - x.end <= 4);
    if (h && !per.has(h)) per.set(h, d.min);
  }
  void words;
  return { each, per };
}

/* ------------------------------------------------------------------ map variables */
const VAR_WORDS: Record<string, string> = {
  salinity: "salinity lobon lobonakto lonta nona নোনা লবণ লবণাক্ততা", rain_annual: "rain rainfall brishti bristi বৃষ্টি বৃষ্টিপাত", lst_modis: "temperature heat gorom tapmatra তাপমাত্রা গরম land surface temperature",
  elevation: "elevation height uchchota উচ্চতা altitude dem", pop_density: "population density people jonoghonotto জনঘনত্ব lok basti",
  mangrove_2025: "mangrove bada jongol forest cover ম্যানগ্রোভ বন sundari", mangrove_change: "mangrove change loss gain mangrove loss mangrove gain",
  ndvi_s2_2025: "ndvi greenness green sobuj সবুজ vegetation", erosion_1525: "erosion bhangon ভাঙন shoreline", accretion_1525: "accretion chor চর new land",
  water_freq: "water frequency flooding jol জল surface water", night_lights: "night lights alo আলো", cyclone_dist: "cyclone ghurnijhor ঘূর্ণিঝড় storm track",
  tiger_suit: "tiger habitat bagh বাঘ tiger suitability", prey_suit: "prey deer horin হরিণ chital", cons_priority: "conservation priority songrokkhon সংরক্ষণ",
  human_exposure: "human exposure conflict manush মানুষ", habitat_pressure: "habitat pressure chap চাপ", protection: "protection legal status protected sangrakshit সংরক্ষিত permit",
  boat_low: "boat access ghat distance nouka নৌকা", channel_main: "main channel river nodi নদী", creek_network: "creek khari খাঁড়ি creeks", chl: "chlorophyll chl",
  sst_monsoon: "sea surface temperature sst", lc_crop: "crop cropland chas chash ক্ষেত agriculture", lc_built: "built up buildings bari বাড়ি settlement",
};
let varIdx: Promise<{ def: VariableDef; words: string[]; label: string[] }[]> | null = null;
function vars() {
  if (!varIdx) varIdx = loadCatalog().then((c) => c.variables.map((def) => ({ def, words: normName(`${def.label} ${VAR_WORDS[def.key] || ""}`).split(" ").filter((w) => w.length > 2),
    label: [...new Set(normName(def.label).split(" ").filter((w) => w.length > 2 && !/^\d+$/.test(w)))] })));
  return varIdx;
}
/** the map variable a sentence talks about ("mangrove 2016", "salinity", "tiger habitat") */
export async function variableIn(text: string): Promise<VariableDef | null> {
  const n = norm(text);
  const lat = normName(isBengali(n) ? `${n} ${bnToLatin(n)}` : n);
  const ws = new Set(lat.split(" "));
  const years: string[] = lat.match(/\b(20\d\d)\b/g) || [];
  const y0 = years[0] || "";
  let best: { def: VariableDef; s: number } | null = null;
  for (const v of await vars()) {
    let s = 0;
    for (const w of new Set(v.words)) if (ws.has(w)) s += w.length >= 6 ? 1.4 : 1;
    if (VAR_WORDS[v.def.key]) for (const w of new Set(normName(VAR_WORDS[v.def.key]).split(" "))) if (w.length > 2 && lat.includes(w)) s += 0.6;
    if (y0 && v.def.key.includes(y0)) s += 2;
    if (y0 && v.def.period && String(v.def.period).includes(y0)) s += 1;
    // words of the label the message does not have count a little against (so "mangrove" picks mangrove cover, not mangrove change)
    s -= 0.15 * v.label.filter((w) => !ws.has(w)).length;
    if (!y0 && /_2025$/.test(v.def.key)) s += 0.3;                          // no year asked: the latest map
    if (s > (best?.s || 0)) best = { def: v.def, s };
  }
  return best && best.s >= 1.6 ? best.def : null;
}

/* ------------------------------------------------------------------ levels for rankings */
export function levelOf(f: string): "block" | "village" | "island" | "district" | null {
  if (/(village|gram|গ্রাম|mouza|mauza|মৌজা)/i.test(f)) return "village";
  if (/(island|dwip|dweep|দ্বীপ)/i.test(f)) return "island";
  if (/(district|jela|zila|জেলা)/i.test(f)) return "district";
  if (/(block|ব্লক)/i.test(f)) return "block";
  return null;
}
export const wantsLowest = (f: string) => /(lowest|least|minimum|\bmin\b|sobcheye kom|sab theke kom|kom\b|সবচেয়ে কম|কম)/i.test(f) && !/(at least)/i.test(f);
