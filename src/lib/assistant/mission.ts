"use client";
/** Spots from the models for a livelihood trip ("ami modhu ante jabo", "ferar pothe mach o dhorbo"): the best hexagons of
 *  the tiger / fish / honey / crab index near a start, or along the way back. The National Park core is never chosen and a
 *  spot has to be reachable by boat from a ghat. */
import { hexStore } from "../data/hex";
import { zoneIndex, type Zone } from "../zones";
import type { LL } from "../trip/geo";

export interface Spot { i: number; zone: Zone; lon: number; lat: number; idx: number; km: number; block: string; gate: number; hex: string }

export const kmBetween = (a: LL, b: LL) => {
  const kx = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, a[1] - b[1]) * 111.2;
};
/** how long people usually stay for each job (minutes) */
export const STAY: Record<Zone, number> = { honey: 180, crab: 120, fish: 120, tiger: 60 };
export const ZONE_WORD: Record<Zone, [string, string]> = { honey: ["Honey", "মধু"], fish: ["Fishing", "মাছ ধরা"], crab: ["Crab", "কাঁকড়া"], tiger: ["Tiger watch", "বাঘ দেখা"] };

/**
 * The best spots of one zone.
 * - near `centre` (or, with `via` = [from, to], the smallest detour on the way from → to)
 * - `nearest`: closeness counts most, among spots that are still good
 */
export async function findSpots(zone: Zone, centre: LL, o: { radius?: number; n?: number; nearest?: boolean; via?: [LL, LL]; avoid?: LL[] } = {}): Promise<Spot[]> {
  const [hx, v] = await Promise.all([hexStore(), zoneIndex(zone)]);
  const prot = hx.get("protection"), boat = hx.get("boat_low");
  const n = o.n ?? 6;
  const minIdx = o.nearest ? 0.5 : 0.6;
  let r = o.radius ?? (o.nearest ? 15 : 25);
  let cand: { i: number; km: number; score: number; x: number }[] = [];
  for (let pass = 0; pass < 3; pass++, r *= 1.7) {
    cand = [];
    for (let i = 0; i < hx.n; i++) {
      const x = v[i];
      if (Number.isNaN(x) || x < minIdx) continue;
      if (Math.round(prot[i]) === 3) continue;                 // National Park core: no entry
      const b = boat[i];
      if (!Number.isNaN(b) && b > 30) continue;                 // too far from any ghat by boat
      const p: LL = [hx.meta.lon[i], hx.meta.lat[i]];
      if (o.avoid?.some((a) => kmBetween(a, p) < 2.5)) continue;
      let km: number, score: number;
      if (o.via) {
        const [A, S] = o.via;
        const det = kmBetween(A, p) + kmBetween(p, S) - kmBetween(A, S);
        if (det > r * 0.6) continue;
        km = kmBetween(S, p);
        score = x - det * (o.nearest ? 0.06 : 0.03);
      } else {
        km = kmBetween(centre, p);
        if (km > r) continue;
        score = o.nearest ? x * 0.6 - km * 0.05 : x - km * 0.012;
      }
      cand.push({ i, km, score, x });
    }
    if (cand.length >= Math.min(n, 3)) break;
  }
  cand.sort((a, b) => b.score - a.score);
  const out: Spot[] = [];
  for (const c of cand) {
    const p: LL = [hx.meta.lon[c.i], hx.meta.lat[c.i]];
    if (out.some((s) => kmBetween([s.lon, s.lat], p) < 3)) continue;   // spread the choices out
    const g = Math.round(prot[c.i]);
    out.push({ i: c.i, zone, lon: p[0], lat: p[1], idx: c.x, km: c.km, block: hx.meta.blocks[hx.meta.block[c.i]] || "", gate: Number.isNaN(g) ? 1 : g, hex: hx.meta.id[c.i] });
    if (out.length >= n) break;
  }
  return out;
}

/* ------------------------------------------------------------------ reading a mission from a message */
const RETURN = /(ferar pothe|ferar pathe|firar pothe|ferot (asar|ashar|aste)|fire (asar|ashar|aste|asbar|ashbar)|ferar somoy|on the way back|way back|while returning|on return|coming back|returning|ফেরার পথে|ফেরার সময়|ফিরতি পথে|ফিরে আসার সময়)/i;
const NEAREST = /(nearest|closest|kache[r]?|kachhe[r]?|kachakachi|kacha kachi|nikot|nikoto|nearby|close by|কাছের|কাছে|নিকটতম|কাছাকাছি)/i;
const GO_WORDS = /(jabo|jaabo|jete|jaite|jai\b|jacchi|jachhi|jeta|go\b|going|trip|ante|anbo|ante|aante|collect|dhorbo|dhorte|dhora|dhorar|catch|pabo|pete|tulbo|tulte|bhanga|bhangte|dekhbo|dekhte|see|watch|যাব|যেতে|আনতে|আনব|ধরব|ধরতে|তুলতে|ভাঙতে|দেখতে|দেখব|সংগ্রহ)/i;
const ZRE: [Zone, RegExp][] = [
  ["honey", /(honey|modhu|\bmou\b|মধু|mouchak|moucak|মৌচাক|moumachi|মৌমাছি)/i],
  ["fish", /(fish|\bmach\b|\bmaach|\bmachh|macher|maacher|মাছ|fishing|chingri|চিংড়ি|meen\b)/i],
  ["crab", /(crab|kakra|kankra|kakda|kaankra|কাঁকড়া|কাকড়া)/i],
  ["tiger", /(tiger|\bbagh|baagh|বাঘ|royal bengal)/i],
];
const zonesIn = (s: string): Zone[] => {
  const hits = ZRE.map(([z, re]) => { const m = s.match(re); return m ? { z, at: m.index ?? 0 } : null; }).filter(Boolean) as { z: Zone; at: number }[];
  return hits.sort((a, b) => a.at - b.at).map((h) => h.z);
};
export interface MissionWords { out: Zone[]; back: Zone[]; nearest: boolean; go: boolean; returnOnly: boolean }
export function missionWords(f: string): MissionWords | null {
  const m = f.match(RETURN);
  const before = m ? f.slice(0, m.index) : f, after = m ? f.slice((m.index ?? 0) + m[0].length) : "";
  const out = zonesIn(before), back = zonesIn(after).filter((z) => !out.includes(z) || true);
  if (!out.length && !back.length) return null;
  return { out, back, nearest: NEAREST.test(f), go: GO_WORDS.test(f) || !!m, returnOnly: !out.length && back.length > 0 };
}
export const nearestWord = (f: string) => NEAREST.test(f);
export const goWord = (f: string) => GO_WORDS.test(f);
