/** Where the models put tiger, fish, honey and crab — one 0–1 index per 1.6 km² hexagon.
 *  Tiger: the tiger habitat suitability model (spatial-CV ROC-AUC 0.74). Fish, honey and crab: suitability indexes built
 *  from the satellite and river layers each livelihood depends on (rivers and chlorophyll for fish, dense flowering
 *  mangrove for honey, mangrove creeks with tidal water for crab), with boat access from a ghat. */
import { hexStore, type HexStore } from "./data/hex";

export type Zone = "tiger" | "fish" | "honey" | "crab";
export const ZONES: Zone[] = ["tiger", "fish", "honey", "crab"];
export const ZONE_META: Record<Zone, { en: string; bn: string; colour: string; ramp: string[]; how: [string, string] }> = {
  tiger: { en: "Tiger zones", bn: "বাঘের এলাকা", colour: "#f97316", ramp: ["rgba(249,115,22,0)", "#fde68a", "#fb923c", "#ea580c", "#9a3412"],
    how: ["Tiger habitat suitability model", "বাঘের আবাস উপযোগিতা মডেল"] },
  fish: { en: "Fish zones", bn: "মাছের এলাকা", colour: "#38bdf8", ramp: ["rgba(56,189,248,0)", "#bae6fd", "#38bdf8", "#0284c7", "#0c4a6e"],
    how: ["Rivers, permanent water, chlorophyll, boat access", "নদী, স্থায়ী জল, ক্লোরোফিল, নৌকায় পৌঁছানো"] },
  honey: { en: "Honey zones", bn: "মধুর এলাকা", colour: "#facc15", ramp: ["rgba(250,204,21,0)", "#fef9c3", "#fde047", "#eab308", "#854d0e"],
    how: ["Dense green mangrove, boat access", "ঘন সবুজ ম্যানগ্রোভ, নৌকায় পৌঁছানো"] },
  crab: { en: "Crab zones", bn: "কাঁকড়ার এলাকা", colour: "#f43f5e", ramp: ["rgba(244,63,94,0)", "#fecdd3", "#fb7185", "#e11d48", "#881337"],
    how: ["Creeks inside mangrove, tidal water, boat access", "ম্যানগ্রোভের খাঁড়ি, জোয়ারের জল, নৌকায় পৌঁছানো"] },
};

const norm01 = (v: Float32Array | number[], lo: number, hi: number) => (x: number) => (Number.isNaN(x) ? NaN : Math.max(0, Math.min(1, (x - lo) / (hi - lo || 1))));
function weighted(hx: HexStore, parts: [string, number, number, number][], gate?: (i: number) => number): Float32Array {
  const out = new Float32Array(hx.n).fill(NaN);
  const cols = parts.map(([k, lo, hi, w]) => ({ v: hx.get(k), f: norm01([], lo, hi), w }));
  for (let i = 0; i < hx.n; i++) {
    let s = 0, ws = 0;
    for (const c of cols) { const x = c.f(c.v[i]); if (!Number.isNaN(x)) { s += x * Math.abs(c.w); ws += Math.abs(c.w); } }
    if (!ws) continue;
    out[i] = (s / ws) * (gate ? gate(i) : 1);
  }
  return out;
}

const cache = new Map<Zone, Float32Array>();
export async function zoneIndex(z: Zone): Promise<Float32Array> {
  const hit = cache.get(z);
  if (hit) return hit;
  const hx = await hexStore();
  const boat = hx.get("boat_low");
  const reach = (i: number) => { const b = boat[i]; return Number.isNaN(b) ? 0.6 : b <= 4 ? 1 : b <= 12 ? 0.85 : b <= 25 ? 0.65 : 0.45; };
  let v: Float32Array;
  if (z === "tiger") v = Float32Array.from(hx.get("tiger_suit"));
  else if (z === "fish") {
    const water = hx.get("water_perm");
    v = weighted(hx, [["channel_main", 0, 60, 2], ["water_perm", 10, 90, 1.5], ["chl", 4.2, 6.2, 1], ["water_tidal", 0, 40, 0.5]], (i) => (Number.isNaN(water[i]) || water[i] < 5 ? 0.2 : 1) * reach(i));
  } else if (z === "honey") {
    const m = hx.get("mangrove_2025");
    v = weighted(hx, [["mangrove_2025", 30, 95, 2], ["ndvi_s2_2025", 0.3, 0.75, 1.5], ["lc_mangrove", 20, 95, 1]], (i) => (Number.isNaN(m[i]) || m[i] < 20 ? 0.1 : 1) * reach(i));
  } else {
    const m = hx.get("mangrove_2025");
    v = weighted(hx, [["creek_network", 2, 40, 2], ["mangrove_2025", 20, 90, 1.5], ["water_tidal", 0, 40, 1], ["channel_creek", 0, 30, 1]], (i) => (Number.isNaN(m[i]) || m[i] < 10 ? 0.2 : 1) * reach(i));
  }
  // stretch to 0–1 so the four maps read the same way
  let lo = Infinity, hi = -Infinity;
  for (const x of v) if (!Number.isNaN(x)) { if (x < lo) lo = x; if (x > hi) hi = x; }
  for (let i = 0; i < v.length; i++) if (!Number.isNaN(v[i])) v[i] = (v[i] - lo) / (hi - lo || 1);
  cache.set(z, v);
  return v;
}
/** high / medium / low with the model's own words */
export const level = (x: number) => (x >= 0.66 ? 3 : x >= 0.4 ? 2 : x >= 0 ? 1 : 0);
export const LEVEL: Record<number, [string, string]> = { 3: ["High", "বেশি"], 2: ["Medium", "মাঝারি"], 1: ["Low", "কম"], 0: ["—", "—"] };

/** the zone as weighted points (hexagon centres) for a density map */
export async function zonePoints(z: Zone): Promise<GeoJSON.FeatureCollection> {
  const [hx, v] = await Promise.all([hexStore(), zoneIndex(z)]);
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i < hx.n; i++) {
    const x = v[i];
    if (Number.isNaN(x) || x < 0.25) continue;
    features.push({ type: "Feature", id: i, properties: { w: +((x - 0.25) / 0.75).toFixed(3), z }, geometry: { type: "Point", coordinates: [hx.meta.lon[i], hx.meta.lat[i]] } });
  }
  return { type: "FeatureCollection", features };
}
