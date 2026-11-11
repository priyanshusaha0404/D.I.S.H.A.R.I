/** Everything practical about a block, a village or a point: people, villages, ghats, services, where a forest permit
 *  is needed. Built from the census, the gazetteer and the legal zones shipped with the site. */
import { loadAdmin, loadPoints, loadVillages, nearest, whatIsHere } from "./data/entities";
import { hexStore } from "./data/hex";

export const CATS = ["health", "emergency", "shelter", "finance", "market", "education", "transport", "religious", "government", "community", "other"] as const;
export const CAT_NAME: Record<string, [string, string]> = {
  health: ["Health", "স্বাস্থ্য"], emergency: ["Police and emergency", "পুলিশ ও জরুরি"], shelter: ["Cyclone shelters", "আশ্রয়কেন্দ্র"], finance: ["Banks and post", "ব্যাংক ও ডাকঘর"],
  market: ["Markets", "বাজার"], education: ["Schools", "স্কুল"], transport: ["Transport", "পরিবহন"], religious: ["Temples and mosques", "মন্দির ও মসজিদ"],
  government: ["Government", "সরকারি"], community: ["Community", "কমিউনিটি"], other: ["Other", "অন্যান্য"], jetty: ["Ghats and jetties", "ঘাট ও জেটি"],
};
export const CAT_COLOUR: Record<string, string> = { health: "#f0556a", emergency: "#f0556a", shelter: "#f5a623", finance: "#b78bfa", market: "#f97316", education: "#4f8ef7",
  transport: "#2dd4a7", religious: "#facc15", government: "#94a0bf", community: "#e879a6", other: "#94a0bf", jetty: "#38bdf8" };

export interface Pt { id: string; name: string; sub: string; lon: number; lat: number; cat: string; type: "jetty" | "poi" }
export interface BlockInfo {
  id: string; name: string; district: string; lon: number; lat: number; bbox: [number, number, number, number] | null;
  population: number; households: number; male: number; female: number; sexRatio: number | null; hhSize: number | null;
  villages: number; towns: number; area: number; density: number | null;
  ghats: Pt[]; services: Record<string, Pt[]>;
  top: { id: string; name: string; population: number; households: number; lon: number; lat: number; type: string }[];
  zones: { open: number; permit: number; core: number }; land: number | null; water: number | null;
}
const norm = (s: string | undefined | null) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

let ptsCache: Promise<Pt[]> | null = null;
export function allPoints(): Promise<Pt[]> {
  if (!ptsCache) ptsCache = loadPoints().then((p) => [
    ...p.jetty.map((j): Pt => ({ id: String(j.id), name: j.name || (j.nearest_village ? `Ghat near ${j.nearest_village}` : "Ghat"), sub: (j.kind || "ghat").replace(/_/g, " "), lon: j.lon, lat: j.lat, cat: "jetty", type: "jetty" })),
    ...p.poi.map((s): Pt => ({ id: String(s.id), name: s.name || (s.amenity || s.category || "").replace(/_/g, " "), sub: (s.amenity || s.category || "").replace(/_/g, " "), lon: s.lon, lat: s.lat, cat: s.category || "other", type: "poi" })),
  ]);
  return ptsCache;
}

let blocksCache: Promise<BlockInfo[]> | null = null;
export function allBlocks(): Promise<BlockInfo[]> {
  if (!blocksCache) blocksCache = (async () => {
    const [admin, vill, pts, hx, raw] = await Promise.all([loadAdmin(), loadVillages(), allPoints(), hexStore(), loadPoints()]);
    const prot = hx.get("protection"), land = hx.get("land_share");
    // which block a point lies in: its own block name, else the block of its hexagon
    const blockOf = new Map<string, string>();
    raw.jetty.forEach((j) => blockOf.set(`jetty${j.id}`, norm(j.block_name) || norm(hx.meta.blocks[hx.meta.block[j.cell as number]])));
    raw.poi.forEach((s) => blockOf.set(`poi${s.id}`, norm(s.block_name) || norm(hx.meta.blocks[hx.meta.block[s.cell as number]])));
    return admin.blocks.map((b): BlockInfo => {
      const key = norm(b.name);
      const vs = vill.filter((v) => norm(v.block) === key);
      const male = vs.reduce((s, v) => s + (v.male || 0), 0), female = vs.reduce((s, v) => s + (v.female || 0), 0);
      const mine = pts.filter((p) => blockOf.get(p.type + p.id) === key);
      const services: Record<string, Pt[]> = {};
      mine.filter((p) => p.type === "poi").forEach((p) => { (services[p.cat] ||= []).push(p); });
      const z = { open: 0, permit: 0, core: 0 };
      let la = 0, lw = 0;
      for (const [i, w] of b.cells) {
        const g = Math.round(prot[i]);
        if (g === 3) z.core += w; else if (g === 2) z.permit += w; else if (g === 1) z.open += w;
        if (!Number.isNaN(land[i])) { la += (land[i] / 100) * w; lw += w; }
      }
      const zt = z.open + z.permit + z.core || 1;
      const pop = b.population || vs.reduce((s, v) => s + (v.population || 0), 0);
      const hh = b.households || vs.reduce((s, v) => s + (v.households || 0), 0);
      return { id: String(b.id), name: b.name, district: b.district || "", lon: b.lon, lat: b.lat, bbox: (b.bbox as [number, number, number, number]) || null,
        population: pop, households: hh, male, female, sexRatio: male ? Math.round((female / male) * 1000) : null, hhSize: hh ? pop / hh : null,
        villages: vs.filter((v) => v.type !== "Urban").length || b.villages || 0, towns: vs.filter((v) => v.type === "Urban").length, area: b.area_km2, density: b.area_km2 ? pop / b.area_km2 : null,
        ghats: mine.filter((p) => p.type === "jetty"), services,
        top: [...vs].sort((a, c) => (c.population || 0) - (a.population || 0)).slice(0, 8).map((v) => ({ id: String(v.id), name: v.name, population: v.population || 0, households: v.households || 0, lon: v.lon, lat: v.lat, type: v.type === "Urban" ? "town" : "village" })),
        zones: { open: (z.open / zt) * 100, permit: (z.permit / zt) * 100, core: (z.core / zt) * 100 }, land: lw ? (la / lw) * 100 : null, water: lw ? 100 - (la / lw) * 100 : null };
    });
  })();
  return blocksCache;
}
export async function blockByName(name: string) { const k = norm(name); return (await allBlocks()).find((b) => norm(b.name) === k) || null; }
export async function blockById(id: string) { return (await allBlocks()).find((b) => b.id === id) || null; }

export interface PointInfo {
  lon: number; lat: number; block: BlockInfo | null; inside: boolean;
  village: { id: string; name: string; type: string; population: number; households: number; male: number; female: number; area: number } | null;
  island: string | null; gate: 1 | 2 | 3 | null; forest: string | null;
  ghats: { p: Pt; km: number }[]; health: { p: Pt; km: number }[];
}
const km = (a: [number, number], b: [number, number]) => { const kx = Math.cos((a[1] * Math.PI) / 180); return Math.hypot((a[0] - b[0]) * kx, a[1] - b[1]) * 111.2; };
export async function nearestPts(lon: number, lat: number, cats: string[] | null, n = 6) {
  const pts = await allPoints();
  return pts.filter((p) => !cats || cats.includes(p.cat)).map((p) => ({ p, km: km([lon, lat], [p.lon, p.lat]) })).sort((a, b) => a.km - b.km).slice(0, n);
}
export async function pointInfo(lon: number, lat: number): Promise<PointInfo> {
  const [w, hx] = await Promise.all([whatIsHere(lon, lat), hexStore()]);
  const g = w.hex !== null && w.hex !== undefined ? Math.round(hx.value("protection", w.hex)) : NaN;
  const v = w.village as (typeof w.village & { male?: number; female?: number; area_km2?: number }) | null;
  const pa = w.pas.find((p) => p.kind === "core") || w.pas[0];
  return { lon, lat, inside: w.hex !== null && w.hex !== undefined, block: w.block ? await blockByName(w.block.name) : null,
    village: v ? { id: String(v.id), name: v.name, type: v.type === "Urban" ? "town" : "village", population: v.population || 0, households: v.households || 0, male: v.male || 0, female: v.female || 0, area: v.area_km2 || 0 } : null,
    island: w.island?.name || null, gate: g === 1 || g === 2 || g === 3 ? g : null, forest: pa ? pa.name : null,
    ghats: await nearestPts(lon, lat, ["jetty"], 3), health: await nearestPts(lon, lat, ["health"], 2) };
}
export { nearest };
