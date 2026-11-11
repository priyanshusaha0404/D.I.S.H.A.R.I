/** Points of interest in priority order (help first), from the site's own data, with downloads in GeoJSON, Shapefile,
 *  KML and CSV. */
import { loadPoints, loadVillages } from "./data/entities";
import { hexStore } from "./data/hex";

export interface Poi { id: string; type: "poi" | "jetty" | "village" | "town"; cat: string; name: string; sub: string; block: string; lon: number; lat: number; pop?: number }
export const POI_CATS: { key: string; en: string; bn: string; colour: string; icon: string }[] = [
  { key: "health", en: "Hospitals and health", bn: "হাসপাতাল ও স্বাস্থ্য", colour: "#f0556a", icon: "✚" },
  { key: "emergency", en: "Police, fire and emergency", bn: "পুলিশ, দমকল ও জরুরি", colour: "#ef4444", icon: "!" },
  { key: "shelter", en: "Cyclone shelters", bn: "ঘূর্ণিঝড় আশ্রয়কেন্দ্র", colour: "#f59e0b", icon: "⌂" },
  { key: "jetty", en: "Ghats and jetties", bn: "ঘাট ও জেটি", colour: "#38bdf8", icon: "⚓" },
  { key: "transport", en: "Bus, ferry and transport", bn: "বাস, ফেরি ও পরিবহন", colour: "#2dd4a7", icon: "⇄" },
  { key: "market", en: "Markets and shops", bn: "বাজার ও দোকান", colour: "#fb923c", icon: "◆" },
  { key: "finance", en: "Banks, ATMs and post", bn: "ব্যাংক, এটিএম ও ডাকঘর", colour: "#b78bfa", icon: "₹" },
  { key: "education", en: "Schools and colleges", bn: "স্কুল ও কলেজ", colour: "#60a5fa", icon: "✎" },
  { key: "government", en: "Government offices", bn: "সরকারি অফিস", colour: "#94a3b8", icon: "▣" },
  { key: "village", en: "Villages and towns", bn: "গ্রাম ও শহর", colour: "#a3e635", icon: "●" },
  { key: "religious", en: "Temples and mosques", bn: "মন্দির ও মসজিদ", colour: "#facc15", icon: "✦" },
  { key: "community", en: "Community places", bn: "সামাজিক স্থান", colour: "#f472b6", icon: "◉" },
  { key: "other", en: "Other", bn: "অন্যান্য", colour: "#a1a1aa", icon: "·" },
];
export const poiCat = (k: string) => POI_CATS.find((c) => c.key === k) || POI_CATS[POI_CATS.length - 1];

let cache: Promise<Poi[]> | null = null;
export function loadPois(): Promise<Poi[]> {
  if (!cache) cache = (async () => {
    const [p, v, hx] = await Promise.all([loadPoints(), loadVillages(), hexStore()]);
    const blk = (name: string | undefined | null, cell: unknown) => name || (typeof cell === "number" ? hx.meta.blocks[hx.meta.block[cell]] || "" : "");
    const known = new Set(POI_CATS.map((c) => c.key));
    return [
      ...p.poi.map((s): Poi => ({ id: String(s.id), type: "poi", cat: known.has(s.category || "") ? s.category! : "other", name: s.name || (s.amenity || s.category || "").replace(/_/g, " "),
        sub: (s.amenity || s.category || "").replace(/_/g, " "), block: blk(s.block_name, s.cell), lon: s.lon, lat: s.lat })),
      ...p.jetty.map((j): Poi => ({ id: String(j.id), type: "jetty", cat: "jetty", name: j.name || (j.nearest_village ? `Ghat near ${j.nearest_village}` : "Ghat"), sub: (j.kind || "ghat").replace(/_/g, " "),
        block: blk(j.block_name, j.cell), lon: j.lon, lat: j.lat })),
      ...v.map((x): Poi => ({ id: String(x.id), type: x.type === "Urban" ? "town" : "village", cat: "village", name: x.name, sub: x.type === "Urban" ? "town" : "village", block: x.block || "", lon: x.lon, lat: x.lat, pop: x.population || 0 })),
    ];
  })();
  return cache;
}

export function poiGeoJSON(list: Poi[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: list.map((p) => ({ type: "Feature", properties: { id: p.id, t: p.type, cat: p.cat, name: p.name, kind: p.sub, block: p.block, ...(p.pop !== undefined ? { population: p.pop } : {}) },
    geometry: { type: "Point", coordinates: [+p.lon.toFixed(6), +p.lat.toFixed(6)] } })) };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function poiKML(list: Poi[], title: string): string {
  const cats = [...new Set(list.map((p) => p.cat))];
  const abgr = (hex: string) => `ff${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(title)}</name>
${cats.map((c) => `<Style id="${c}"><IconStyle><color>${abgr(poiCat(c).colour)}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>`).join("\n")}
${cats.map((c) => `<Folder><name>${esc(poiCat(c).en)}</name>
${list.filter((p) => p.cat === c).map((p) => `<Placemark><name>${esc(p.name)}</name><styleUrl>#${c}</styleUrl><ExtendedData><Data name="kind"><value>${esc(p.sub)}</value></Data><Data name="block"><value>${esc(p.block)}</value></Data></ExtendedData><Point><coordinates>${p.lon.toFixed(6)},${p.lat.toFixed(6)},0</coordinates></Point></Placemark>`).join("\n")}
</Folder>`).join("\n")}
</Document></kml>`;
}

/* ------------------------------------------------------------------ ESRI Shapefile (points), zipped */
const enc = new TextEncoder();
function dbf(rows: (string | number)[][], fields: { name: string; type: "C" | "N"; len: number; dec?: number }[]): Uint8Array {
  const recLen = 1 + fields.reduce((s, f) => s + f.len, 0), headLen = 32 + fields.length * 32 + 1;
  const buf = new Uint8Array(headLen + rows.length * recLen + 1);
  const dv = new DataView(buf.buffer);
  const now = new Date();
  buf[0] = 3; buf[1] = now.getFullYear() - 1900; buf[2] = now.getMonth() + 1; buf[3] = now.getDate();
  dv.setUint32(4, rows.length, true); dv.setUint16(8, headLen, true); dv.setUint16(10, recLen, true); buf[29] = 0x57;
  fields.forEach((f, i) => {
    const o = 32 + i * 32;
    buf.set(enc.encode(f.name.slice(0, 10)), o); buf[o + 11] = f.type.charCodeAt(0); buf[o + 16] = f.len; buf[o + 17] = f.dec || 0;
  });
  buf[headLen - 1] = 0x0d;
  rows.forEach((r, ri) => {
    let o = headLen + ri * recLen;
    buf[o++] = 0x20;
    fields.forEach((f, fi) => {
      const cell = buf.subarray(o, o + f.len).fill(0x20);
      if (f.type === "N") { const s = typeof r[fi] === "number" ? (r[fi] as number).toFixed(f.dec || 0) : ""; const b = enc.encode(s.slice(-f.len)); cell.set(b, f.len - b.length); }
      else { let b = enc.encode(String(r[fi] ?? "")); while (b.length > f.len) b = b.subarray(0, b.length - 1); while (b.length && (b[b.length - 1] & 0xc0) === 0x80) b = b.subarray(0, b.length - 1); if (b.length && b[b.length - 1] >= 0xc0) b = b.subarray(0, b.length - 1); cell.set(b, 0); }
      o += f.len;
    });
  });
  buf[buf.length - 1] = 0x1a;
  return buf;
}
const PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
export async function poiShapefileZip(list: Poi[], base: string): Promise<Blob> {
  const n = list.length;
  const shp = new DataView(new ArrayBuffer(100 + n * 28)), shx = new DataView(new ArrayBuffer(100 + n * 8));
  const xs = list.map((p) => p.lon), ys = list.map((p) => p.lat);
  const box = n ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, 0, 0];
  for (const [dv, len] of [[shp, 100 + n * 28], [shx, 100 + n * 8]] as [DataView, number][]) {
    dv.setInt32(0, 9994); dv.setInt32(24, len / 2); dv.setInt32(28, 1000, true); dv.setInt32(32, 1, true);
    box.forEach((b, i) => dv.setFloat64(36 + i * 8, b, true));
  }
  list.forEach((p, i) => {
    const o = 100 + i * 28;
    shp.setInt32(o, i + 1); shp.setInt32(o + 4, 10); shp.setInt32(o + 8, 1, true); shp.setFloat64(o + 12, p.lon, true); shp.setFloat64(o + 20, p.lat, true);
    shx.setInt32(100 + i * 8, o / 2); shx.setInt32(104 + i * 8, 10);
  });
  const table = dbf(list.map((p) => [p.name, p.cat, p.sub, p.block, p.lon, p.lat]),
    [{ name: "NAME", type: "C", len: 120 }, { name: "CATEGORY", type: "C", len: 20 }, { name: "KIND", type: "C", len: 40 }, { name: "BLOCK", type: "C", len: 40 },
      { name: "LON", type: "N", len: 12, dec: 6 }, { name: "LAT", type: "N", len: 12, dec: 6 }]);
  const { zipSync } = await import("fflate");
  const z = zipSync({ [`${base}.shp`]: new Uint8Array(shp.buffer), [`${base}.shx`]: new Uint8Array(shx.buffer), [`${base}.dbf`]: table, [`${base}.prj`]: enc.encode(PRJ), [`${base}.cpg`]: enc.encode("UTF-8") });
  return new Blob([z], { type: "application/zip" });
}
