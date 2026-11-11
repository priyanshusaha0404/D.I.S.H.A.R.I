/** Place search that runs entirely in the browser (works offline): English or Bengali, fuzzy trigram matching,
 *  romanisation-tolerant consonant skeletons, prefix and alternative-name boosts — the same ranking the PostGIS
 *  version used, ported to TypeScript. Also understands hexagon ids ("BO-41") and coordinates ("22.15, 88.80"). */
import { loadJSON } from "./fetch";

export interface Place {
  type: string; id: string; name: string; name_bn: string | null; context: string; lon: number; lat: number;
  bbox: [number, number, number, number] | null; importance: number; population: number; score: number;
}
export interface Row { type: string; id: string; name: string; name_bn: string | null; key: string; skel: string; alt: string; context: string; lon: number; lat: number; bbox: [number, number, number, number] | null; imp: number; pop: number; tk: string[]; ts: Set<string>; tsk: Set<string>; ta: Set<string> | null }

let rows: Promise<Row[]> | null = null;
function load(): Promise<Row[]> {
  if (!rows) {
    rows = loadJSON<{ fields: string[]; rows: unknown[][] }>("search.json").then((d) => d.rows.map((r) => {
      const [type, id, name, name_bn, key, skel, alt, context, lon, lat, bbox, imp, pop] = r as [string, string, string, string | null, string, string, string, string, number, number, [number, number, number, number] | null, number, number];
      return { type, id, name, name_bn, key, skel, alt, context, lon, lat, bbox, imp, pop, tk: trigramList(key), ts: trigrams(key), tsk: trigrams(skel), ta: alt ? trigrams(alt) : null };
    }));
    rows.catch(() => { rows = null; });
  }
  return rows;
}

/** the whole gazetteer (for the assistant, which looks for place names inside a sentence) */
export type IndexRow = Row;
export const searchIndex = () => load();

// ------------------------------------------------------------------ normalisation (mirrors geo.norm_name / geo.skeleton)
export function normName(t: string): string {
  return t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ")
    .replace(/[^a-z0-9ঀ-৿]+/g, " ").trim();
}
export function skeleton(t: string): string {
  let out = "";
  for (let w of normName(t).replace(/[^a-z0-9 ]/g, "").split(/\s+/)) {
    if (!w) continue;
    w = w.replace(/chh/g, "C").replace(/ch/g, "C").replace(/ph/g, "f").replace(/kh/g, "k").replace(/gh/g, "g").replace(/jh/g, "j")
      .replace(/th/g, "t").replace(/dh/g, "d").replace(/bh/g, "b").replace(/sh/g, "s");
    w = w.replace(/[cvqzx]/g, (c) => ({ c: "k", v: "b", q: "k", z: "j", x: "k" })[c] as string).replace(/C/g, "c");
    const first = w[0], rest = w.slice(1).replace(/[aeiouyhw]/g, "");
    out += (first + rest).replace(/(.)\1+/g, "$1");
  }
  return out;
}

// ------------------------------------------------------------------ Bengali -> Latin (phonetic, for matching)
const CONS: Record<string, string> = { "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng", "চ": "ch", "ছ": "chh", "জ": "j", "ঝ": "jh", "ঞ": "n", "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n", "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n", "প": "p", "ফ": "ph", "ব": "b", "ভ": "bh", "ম": "m", "য": "j", "র": "r", "ল": "l", "শ": "sh", "ষ": "sh", "স": "s", "হ": "h", "ড়": "r", "ঢ়": "rh", "য়": "y", "ৎ": "t" };
const VOW: Record<string, string> = { "অ": "o", "আ": "a", "ই": "i", "ঈ": "i", "উ": "u", "ঊ": "u", "ঋ": "ri", "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou" };
const SIGN: Record<string, string> = { "া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u", "ৃ": "ri", "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou" };
const OTHER: Record<string, string> = { "ং": "ng", "ঃ": "h", "ঁ": "n", "্": "", "়": "" };
const BN_RE = /[ঀ-৿]/;
export const isBengali = (s: string) => BN_RE.test(s);
export function bnToLatin(text: string): string {
  const s = text.normalize("NFC").replace(/ড়/g, "ড়").replace(/ঢ়/g, "ঢ়").replace(/য়/g, "য়");
  const ch = Array.from(s);
  let out = "";
  ch.forEach((c, i) => {
    const nx = ch[i + 1] || "";
    if (CONS[c] !== undefined) {
      out += CONS[c];
      if (!SIGN[nx] && nx !== "্" && nx !== "়" && BN_RE.test(nx || " ")) out += "a";
    } else if (VOW[c] !== undefined) out += VOW[c];
    else if (SIGN[c] !== undefined) out += SIGN[c];
    else if (OTHER[c] !== undefined) out += OTHER[c];
    else if (c >= "০" && c <= "৯") out += String(c.charCodeAt(0) - 0x09e6);
    else out += c;
  });
  return out.replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------------------ pg_trgm-compatible trigram similarity
function trigramList(s: string): string[] {
  const out: string[] = [];
  for (const w of s.toLowerCase().split(/[^a-z0-9ঀ-৿]+/)) {
    if (!w) continue;
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) out.push(p.slice(i, i + 3));
  }
  return out;
}
function trigrams(s: string): Set<string> {
  return new Set(trigramList(s));
}
function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((t) => { if (b.has(t)) shared++; });
  return shared / (a.size + b.size - shared);
}
/** Greatest similarity between the query trigrams and any continuous extent of the target's ordered trigrams. */
function wordSimilarity(q: Set<string>, target: string[]): number {
  if (!q.size || !target.length) return 0;
  let best = 0;
  for (let s = 0; s < target.length; s++) {
    if (!q.has(target[s])) continue;
    const ext = new Set<string>();
    let shared = 0;
    for (let e = s; e < target.length && e < s + q.size + 4; e++) {
      const t = target[e];
      if (!ext.has(t)) { ext.add(t); if (q.has(t)) shared++; }
      const sim = shared / (q.size + ext.size - shared);
      if (sim > best) best = sim;
    }
  }
  return best;
}

const TYPE_BOOST: Record<string, number> = { block: 0.15, district: 0.15, island: 0.1, village: 0.08, town: 0.1 };

export interface SearchResult { query: string; latin: string | null; results: Place[] }

export async function searchPlaces(query: string, opts: { types?: string[]; limit?: number } = {}): Promise<SearchResult> {
  const q = query.trim().slice(0, 80);
  const data = await load();
  if (!q) return { query: q, latin: null, results: [] };
  const bn = isBengali(q);
  const latin = bn ? bnToLatin(q) : q;
  const key = normName(latin), skel = skeleton(latin);
  const qt = trigrams(key), qs = trigrams(skel);
  const qtl = key.split(" ");
  const out: Place[] = [];
  for (const r of data) {
    if (opts.types && !opts.types.includes(r.type)) continue;
    let direct = 0;
    if (bn && r.name_bn && r.name_bn.includes(q.normalize("NFC"))) direct = 2;
    const prefix = r.key.startsWith(key);
    const inner = r.key.includes(` ${key}`);
    const sim = similarity(qt, r.ts);
    const ws = qtl.length ? wordSimilarity(qt, r.tk) : 0;
    const sk = skel.length >= 2 ? similarity(qs, r.tsk) : 0;
    const alt = r.ta ? wordSimilarity(qt, trigramList(r.alt)) : 0;
    const pass = direct > 0 || prefix || inner || sim > 0.22 || ws > 0.5 || (skel.length >= 3 && sk > 0.34) || alt > 0.5;
    if (!pass) continue;
    const score = direct + (r.key === key ? 1 : 0) + (prefix ? 0.55 : 0) + (inner ? 0.25 : 0) + sim * 0.9 + ws * 0.5 +
      sk * 0.6 + (skel.length >= 3 && r.skel === skel ? 0.35 : 0) + alt * 0.5 + r.imp * 0.3 + (TYPE_BOOST[r.type] || 0);
    out.push({ type: r.type, id: r.id, name: r.name, name_bn: r.name_bn, context: r.context, lon: r.lon, lat: r.lat, bbox: r.bbox,
      importance: r.imp, population: r.pop, score });
  }
  out.sort((a, b) => b.score - a.score || b.importance - a.importance || a.name.localeCompare(b.name));
  return { query: q, latin: bn ? latin : null, results: out.slice(0, opts.limit ?? 12) };
}

export const GRID_RE = /^\s*([A-Za-z]{1,2})\s*-?\s*(\d{1,3})\s*$/;
export const COORD_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
/** "BO 41" -> "BO-41" */
export function gridIdOf(q: string): string | null {
  const m = q.match(GRID_RE);
  return m ? `${m[1].toUpperCase()}-${Number(m[2])}` : null;
}
/** "22.15, 88.80" or "88.80, 22.15" -> [lon, lat] inside the study region */
export function coordOf(q: string): [number, number] | null {
  const m = q.match(COORD_RE);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  if (a > 20 && a < 24 && b > 86 && b < 91) return [b, a];
  if (b > 20 && b < 24 && a > 86 && a < 91) return [a, b];
  return null;
}
