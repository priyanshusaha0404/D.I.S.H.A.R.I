/** What is around a point (from the site's own data, so it works offline): help, ghats, villages, services, places. */
import { loadPoints, loadVillages } from "../data/entities";
import { metres, type LL } from "./geo";

export type NearGroup = "help" | "ghats" | "villages" | "services" | "places";
export interface NearItem { i: number; group: NearGroup; kind: string; name: string; lon: number; lat: number; d: number; sub: string; ref: { type: string; id: string }; pop?: number | null }

export const GROUP_STYLE: Record<NearGroup, { color: string; icon: string; en: string; bn: string }> = {
  help: { color: "#e34948", icon: "health", en: "Help", bn: "সহায়তা" },
  ghats: { color: "#256abf", icon: "anchor", en: "Ghats", bn: "ঘাট" },
  villages: { color: "#97703f", icon: "village", en: "Villages", bn: "গ্রাম" },
  services: { color: "#6250d6", icon: "bank", en: "Services", bn: "পরিষেবা" },
  places: { color: "#3c3b37", icon: "place", en: "Places", bn: "স্থান" },
};
const CAT_ICON: Record<string, string> = { health: "health", emergency: "shield", shelter: "home", finance: "bank", market: "market", education: "school",
  religious: "temple", transport: "bus", government: "bank", community: "village", other: "info" };
const CAT_BN: Record<string, string> = { health: "স্বাস্থ্য", emergency: "জরুরি", shelter: "আশ্রয়", finance: "ব্যাংক", market: "বাজার", education: "শিক্ষা",
  religious: "ধর্মীয়", transport: "পরিবহন", government: "সরকারি", community: "সামাজিক", other: "অন্যান্য" };

export const iconFor = (x: NearItem) => (x.group === "services" || x.group === "help" ? CAT_ICON[x.kind] || "info" : GROUP_STYLE[x.group].icon);

export async function around(p: LL, radius: number, lang: "en" | "bn"): Promise<NearItem[]> {
  const [pts, vills] = await Promise.all([loadPoints(), loadVillages()]);
  const out: NearItem[] = [];
  const add = (x: Omit<NearItem, "i" | "d">) => { const d = metres(p, [x.lon, x.lat]); if (d <= radius) out.push({ ...x, i: 0, d }); };
  for (const s of pts.poi) {
    const cat = s.category || "other";
    const group: NearGroup = cat === "health" || cat === "emergency" || cat === "shelter" ? "help" : "services";
    add({ group, kind: cat, name: s.name || (lang === "bn" ? CAT_BN[cat] : s.amenity || cat), lon: s.lon, lat: s.lat,
      sub: `${lang === "bn" ? CAT_BN[cat] || cat : cat[0].toUpperCase() + cat.slice(1)}${s.amenity ? ` · ${s.amenity.replace(/_/g, " ")}` : ""}`, ref: { type: "poi", id: String(s.id) } });
  }
  for (const j of pts.jetty) add({ group: "ghats", kind: j.kind || "jetty",
    name: j.name || (j.nearest_village ? (lang === "bn" ? `${j.nearest_village}-এর কাছের ঘাট` : `Ghat near ${j.nearest_village}`) : (lang === "bn" ? "ঘাট" : "Ghat / jetty")), lon: j.lon, lat: j.lat,
    sub: j.kind === "ferry_terminal" ? (lang === "bn" ? "ফেরিঘাট" : "Ferry ghat") : (lang === "bn" ? "জেটি" : "Jetty"), ref: { type: "jetty", id: String(j.id) } });
  for (const v of vills) add({ group: "villages", kind: v.type === "Urban" ? "town" : "village", name: v.name, lon: v.lon, lat: v.lat, pop: v.population,
    sub: `${v.type === "Urban" ? (lang === "bn" ? "শহর" : "Town") : (lang === "bn" ? "গ্রাম" : "Village")}${v.population ? ` · ${v.population.toLocaleString(lang === "bn" ? "bn-IN" : "en-IN")} ${lang === "bn" ? "জন" : "people"}` : ""}`,
    ref: { type: v.type === "Urban" ? "town" : "village", id: String(v.id) } });
  for (const pl of pts.place) add({ group: "places", kind: pl.place_type || "place", name: pl.name || "", lon: pl.lon, lat: pl.lat,
    sub: (pl.place_type || "place").replace(/_/g, " "), ref: { type: "place", id: String(pl.id) } });
  out.sort((a, b) => a.d - b.d);
  out.forEach((x, i) => { x.i = i; });
  return out.filter((x) => x.name);
}

/** nearest of a group from a point (no radius limit) — for the SOS panel */
export async function nearestOf(p: LL, cats: string[], n = 3) {
  const pts = await loadPoints();
  return pts.poi.filter((s) => cats.includes(s.category || "")).map((s) => ({ s, d: metres(p, [s.lon, s.lat]) })).sort((a, b) => a.d - b.d).slice(0, n);
}
