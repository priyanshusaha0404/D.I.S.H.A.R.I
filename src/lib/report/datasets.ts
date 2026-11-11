"use client";
/** The open datasets behind the site, as files: hexagon variables and time series, villages and towns, districts and
 *  blocks, islands, protected areas, ghats and services, rivers, mangrove polygons and more (CSV, Excel, GeoJSON). */
import { loadJSON } from "@/lib/data/fetch";
import { loadHexGeometry } from "@/lib/data/hex";
import { loadSources } from "@/lib/data/catalog";
import { loadAdmin, loadIslands, loadPoints, loadProtected, loadVillages } from "@/lib/data/entities";
import { exportGeoJSON, exportTable } from "@/lib/report";

type Row = (string | number | null)[];
export async function dataset(key: string, fmtOut: "csv" | "xlsx" | "geojson") {
  const name = `DISHARI_${key}`;
  if (key === "hex_vars") {
    const { hexStore } = await import("@/lib/data/hex");
    const hx = await hexStore();
    const vars = hx.catalog.variables;
    const head = ["hexagon", "lon", "lat", "area_km2", "block", "district", "island", ...vars.map((v) => v.key)];
    const rows: Row[] = Array.from({ length: hx.n }, (_, i) => [hx.meta.id[i], hx.meta.lon[i], hx.meta.lat[i], hx.meta.area[i], hx.meta.blocks[hx.meta.block[i]] || "", hx.meta.districts[hx.meta.district[i]] || "",
      hx.meta.island[i] >= 0 ? hx.meta.islands[hx.meta.island[i]] || "" : "", ...vars.map((v) => { const x = hx.value(v.key, i); return Number.isNaN(x) ? null : +x.toFixed(Math.max(v.digits, 0) + 2); })]);
    if (fmtOut === "geojson") {
      const g = await loadHexGeometry();
      return exportGeoJSON(name, { type: "FeatureCollection", features: g.features.map((f) => ({ type: "Feature", geometry: f.geometry, properties: Object.fromEntries(head.map((h, j) => [h, rows[f.id as number][j]])) })) });
    }
    return exportTable(name, head, rows, fmtOut);
  }
  if (key === "hex_series") {
    const { hexStore } = await import("@/lib/data/hex");
    const hx = await hexStore();
    const { defs, cols } = await hx.series();
    const colsHead: string[] = [], colsIdx: number[] = [];
    defs.forEach((s) => s.x.forEach((x, j) => { colsHead.push(`${s.key}_${x}`); colsIdx.push(s.col0 + j); }));
    const rows: Row[] = Array.from({ length: hx.n }, (_, i) => [hx.meta.id[i], hx.meta.lon[i], hx.meta.lat[i], ...colsIdx.map((c) => (Number.isNaN(cols[c][i]) ? null : +cols[c][i].toFixed(4)))]);
    return exportTable(name, ["hexagon", "lon", "lat", ...colsHead], rows, fmtOut as "csv" | "xlsx");
  }
  if (key === "dictionary") {
    const { loadCatalog } = await import("@/lib/data/catalog");
    const c = await loadCatalog();
    return exportTable(name, ["key", "label", "label_bn", "category", "unit", "period", "source", "description", "min", "mean", "max", "hexagons_with_data"],
      c.variables.map((v) => [v.key, v.label, v.label_bn, v.cat, v.unit, v.period || "", v.source, v.desc || "", v.kind === "cont" ? v.min : null, v.kind === "cont" ? v.mean : null, v.kind === "cont" ? v.max : null, v.n]), fmtOut as "csv" | "xlsx");
  }
  if (key === "sources") {
    const s = await loadSources();
    return exportTable(name, ["dataset", "provider", "period", "resolution", "licence", "url", "used_for"], s.map((x) => [x.name, x.provider, x.period, x.resolution, x.licence, x.url || "", x.layers]), fmtOut as "csv" | "xlsx");
  }
  const geo = async (file: string) => loadJSON<GeoJSON.FeatureCollection>(file);
  if (key === "villages") {
    const v = await loadVillages();
    if (fmtOut === "geojson") {
      const g = await geo("vector/villages.geojson");
      const by = new Map(v.map((r) => [r.id, r]));
      return exportGeoJSON(name, { type: "FeatureCollection", features: g.features.map((f) => { const r = by.get((f.properties as { id: number }).id); const { cells, bbox, ...rest } = (r || {}) as Record<string, unknown>; void cells; void bbox; return { ...f, properties: rest }; }) });
    }
    return exportTable(name, ["census_code", "name", "type", "gram_panchayat", "block", "subdistrict", "district", "population_2011", "households", "male", "female", "hh_size", "area_km2", "lon", "lat"],
      v.map((r) => [r.code, r.name, r.type, r.gp || "", r.block, r.subdistrict, r.district, r.population, r.households, r.male, r.female, r.hh_size ? +r.hh_size.toFixed(2) : null, r.area_km2, r.lon, r.lat]), fmtOut);
  }
  if (key === "admin") {
    const a = await loadAdmin();
    if (fmtOut === "geojson") {
      const [b, d] = await Promise.all([geo("vector/blocks.geojson"), geo("vector/districts.geojson")]);
      const bm = new Map(a.blocks.map((x) => [x.id, x])), dm = new Map(a.districts.map((x) => [x.id, x]));
      const prop = (x: { name: string; code: string | null; population: number | null; households: number | null; villages: number | null; area_km2: number } | undefined, level: string) =>
        x ? { level, name: x.name, code: x.code, population_2011: x.population, households: x.households, villages: x.villages, area_km2: x.area_km2 } : { level };
      return exportGeoJSON(name, { type: "FeatureCollection", features: [...d.features.map((f) => ({ ...f, properties: prop(dm.get((f.properties as { id: number }).id), "district") })),
        ...b.features.map((f) => ({ ...f, properties: prop(bm.get((f.properties as { id: number }).id), "block") }))] });
    }
    return exportTable(name, ["level", "name", "district", "code", "population_2011", "households", "villages", "area_km2"],
      [...a.districts.map((x) => ["district", x.name, x.name, x.code, x.population, x.households, x.villages, x.area_km2] as Row), ...a.blocks.map((x) => ["block", x.name, x.district || "", x.code, x.population, x.households, x.villages, x.area_km2] as Row)], fmtOut);
  }
  if (key === "islands") {
    const r = await loadIslands();
    if (fmtOut === "geojson") {
      const g = await geo("vector/islands.geojson");
      const by = new Map(r.map((x) => [x.id, x]));
      return exportGeoJSON(name, { type: "FeatureCollection", features: g.features.map((f) => { const x = by.get((f.properties as { id: number }).id); const { cells, bbox, ...rest } = (x || {}) as Record<string, unknown>; void cells; void bbox; return { ...f, properties: rest }; }) });
    }
    return exportTable(name, ["name", "category", "land_area_km2", "area_km2", "inhabited", "hazards", "nearest_port", "distance_to_port_km", "notes", "lon", "lat"],
      r.map((x) => [x.name, x.category, x.land_area_km2 ? +x.land_area_km2.toFixed(3) : null, x.area_km2, x.inhabited, x.hazards, x.nearest_port, x.dist_to_port_km, x.about, x.lon, x.lat]), fmtOut);
  }
  if (key === "protected") {
    const r = await loadProtected();
    if (fmtOut === "geojson") {
      const [g, d] = await Promise.all([geo("vector/protected_areas.geojson"), geo("vector/designations.geojson")]);
      const by = new Map(r.map((x) => [x.id, x]));
      return exportGeoJSON(name, { type: "FeatureCollection", features: [...g.features, ...d.features].map((f) => { const x = by.get((f.properties as { id: number }).id); const { cells, bbox, ...rest } = (x || {}) as Record<string, unknown>; void cells; void bbox; return { ...f, properties: rest }; }) });
    }
    return exportTable(name, ["name", "designation", "kind", "iucn", "status", "status_year", "reported_km2", "area_in_study_km2", "wdpa_id", "management"],
      r.map((x) => [x.name, x.designation, x.kind, x.iucn, x.status, x.status_year, x.reported_km2, x.area_km2, x.wdpa_id, x.authority]), fmtOut);
  }
  if (key === "points") {
    const p = await loadPoints();
    if (fmtOut === "geojson") {
      const all = [...p.jetty.map((x) => ({ ...x, layer: "ghat_jetty" })), ...p.poi.map((x) => ({ ...x, layer: "service" })), ...p.place.map((x) => ({ ...x, layer: "place" }))];
      return exportGeoJSON(name, { type: "FeatureCollection", features: all.map(({ lon, lat, cell, ...rest }) => ({ type: "Feature", properties: rest, geometry: { type: "Point", coordinates: [lon, lat] } })).map((f) => { void (f as unknown as { cell?: number }).cell; return f as GeoJSON.Feature; }) });
    }
    return exportTable(name, ["layer", "name", "kind", "category", "nearest_village", "block", "lon", "lat"],
      [...p.jetty.map((x) => ["ghat_jetty", x.name, x.kind || "", "", x.nearest_village || "", x.block_name || "", x.lon, x.lat] as Row), ...p.poi.map((x) => ["service", x.name, x.amenity || "", x.category || "", "", "", x.lon, x.lat] as Row),
        ...p.place.map((x) => ["place", x.name, x.place_type || "", "", "", "", x.lon, x.lat] as Row)], fmtOut);
  }
  const files: Record<string, string> = { waterways: "vector/waterways.geojson", water_bodies: "vector/water_bodies.geojson", mangrove_2016: "vector/mangrove_2016.geojson",
    mangrove_2025: "vector/mangrove_2025.geojson", habitat: "vector/habitat_patches.geojson", corridors: "vector/corridors.geojson", study_area: "vector/study_area.geojson" };
  if (files[key]) return exportGeoJSON(name, await geo(files[key]));
}

export const DATASETS: { key: string; en: string; bn: string; formats: ("csv" | "xlsx" | "geojson")[] }[] = [
  { key: "hex_vars", en: "All hexagon variables (93 columns)", bn: "ষড়ভুজের সব চলক (৯৩টি কলাম)", formats: ["csv", "xlsx", "geojson"] },
  { key: "hex_series", en: "Hexagon time series (2000–2025)", bn: "ষড়ভুজের সময় ধারা (২০০০–২০২৫)", formats: ["csv", "xlsx"] },
  { key: "villages", en: "Villages and towns — Census 2011", bn: "গ্রাম ও শহর — জনগণনা ২০১১", formats: ["csv", "xlsx", "geojson"] },
  { key: "admin", en: "Districts and blocks", bn: "জেলা ও ব্লক", formats: ["csv", "xlsx", "geojson"] },
  { key: "islands", en: "Islands", bn: "দ্বীপ", formats: ["csv", "xlsx", "geojson"] },
  { key: "protected", en: "Protected areas and forest compartments", bn: "সংরক্ষিত এলাকা ও বনাঞ্চল", formats: ["csv", "xlsx", "geojson"] },
  { key: "points", en: "Ghats, services and places", bn: "ঘাট, পরিষেবা ও স্থান", formats: ["csv", "xlsx", "geojson"] },
  { key: "waterways", en: "Rivers, canals and creeks", bn: "নদী, খাল ও খাঁড়ি", formats: ["geojson"] },
  { key: "water_bodies", en: "Ponds and water bodies", bn: "পুকুর ও জলাশয়", formats: ["geojson"] },
  { key: "mangrove_2016", en: "Mangrove polygons 2016", bn: "ম্যানগ্রোভ বহুভুজ ২০১৬", formats: ["geojson"] },
  { key: "mangrove_2025", en: "Mangrove polygons 2025", bn: "ম্যানগ্রোভ বহুভুজ ২০২৫", formats: ["geojson"] },
  { key: "habitat", en: "Tiger habitat patches", bn: "বাঘের আবাস খণ্ড", formats: ["geojson"] },
  { key: "corridors", en: "Tiger habitat corridors", bn: "বাঘের আবাস করিডোর", formats: ["geojson"] },
  { key: "study_area", en: "Study-area outline", bn: "সমীক্ষা এলাকার সীমানা", formats: ["geojson"] },
  { key: "dictionary", en: "Data dictionary (all variables)", bn: "তথ্য অভিধান (সব চলক)", formats: ["csv", "xlsx"] },
  { key: "sources", en: "Data sources", bn: "তথ্যের উৎস", formats: ["csv", "xlsx"] },
];

