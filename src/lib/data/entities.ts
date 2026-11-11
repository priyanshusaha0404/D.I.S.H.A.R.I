/** Places that can be opened as a profile: districts, blocks, villages and towns, islands, protected areas and forest
 *  compartments, rivers, jetties, places, service points and single hexagons. All data is local. */
import { loadJSON } from "./fetch";
import { hexStore } from "./hex";

type Cells = [number, number][];
interface Admin { id: number; name: string; code: string | null; parent: number | null; district?: string; population: number | null; households: number | null; villages: number | null; area_km2: number; lon: number; lat: number; bbox: [number, number, number, number]; cells: Cells }
export interface VillageRec { id: number; code: string; name: string; gp: string | null; block: string; subdistrict: string; district: string; type: string; population: number | null; households: number | null; hh_size: number | null; male: number | null; female: number | null; area_km2: number; lon: number; lat: number; bbox: [number, number, number, number]; cells: Cells }
interface IslandRec { id: number; name: string | null; category: string | null; land_area_km2: number | null; inhabited: string | null; hazards: string | null; about: string | null; nearest_port: string | null; dist_to_port_km: number | null; area_km2: number; lon: number; lat: number; bbox: [number, number, number, number]; cells: Cells }
interface PaRec { id: number; wdpa_id: number | null; name: string; designation: string; designation_type: string | null; iucn: string | null; status: string | null; status_year: number | null; reported_km2: number | null; governance: string | null; authority: string | null; kind: "core" | "forest" | "designation"; area_km2: number; lon: number; lat: number; bbox: [number, number, number, number]; cells: Cells }
interface RiverRec { id: string; name: string; name_bn: string | null; classes: string[]; length_km: number; segments: number; ids: number[]; lon: number; lat: number; bbox: [number, number, number, number]; cells: Cells }
export interface PointRec { id: number; name: string | null; kind?: string; place_type?: string; amenity?: string; category?: string; nearest_village?: string; block_name?: string; lon: number; lat: number; cell: number }

export interface Entity {
  type: string; id: string; name: string; name_bn: string | null;
  lon: number; lat: number; bbox: [number, number, number, number] | null;
  cells: Cells;                 // [hexagon index, overlap km² (km for rivers)]
  attrs: Record<string, unknown>;
  admin: { block?: string | null; district?: string | null; island?: string | null };
  geom?: { layer: string; ids: (number | string)[] };
}

const files = {
  admin: () => loadJSON<{ districts: Admin[]; blocks: Admin[] }>("entities/admin.json"),
  villages: () => loadJSON<VillageRec[]>("entities/villages.json"),
  islands: () => loadJSON<IslandRec[]>("entities/islands.json"),
  protected: () => loadJSON<PaRec[]>("entities/protected.json"),
  rivers: () => loadJSON<RiverRec[]>("entities/rivers.json"),
  points: () => loadJSON<{ jetty: PointRec[]; place: PointRec[]; poi: PointRec[] }>("entities/points.json"),
};
export const loadVillages = files.villages;
export const loadAdmin = files.admin;
export const loadPoints = files.points;
export const loadIslands = files.islands;
export const loadProtected = files.protected;
export const loadRivers = files.rivers;

export async function getEntity(type: string, id: string): Promise<Entity | null> {
  const hx = await hexStore();
  const adminOf = (cells: Cells) => {
    if (!cells.length) return {};
    const best = cells.reduce((a, b) => (b[1] > a[1] ? b : a));
    const i = best[0];
    return { block: hx.meta.blocks[hx.meta.block[i]] ?? null, district: hx.meta.districts[hx.meta.district[i]] ?? null,
      island: hx.meta.island[i] >= 0 ? hx.meta.islands[hx.meta.island[i]] : null };
  };
  switch (type) {
    case "district":
    case "block": {
      const a = await files.admin();
      const r = (type === "district" ? a.districts : a.blocks).find((x) => String(x.id) === id);
      if (!r) return null;
      return { type, id, name: r.name, name_bn: null, lon: r.lon, lat: r.lat, bbox: r.bbox, cells: r.cells, attrs: { ...r, cells: undefined },
        admin: { district: type === "block" ? r.district : r.name, block: type === "block" ? r.name : null }, geom: { layer: type === "district" ? "districts" : "blocks", ids: [r.id] } };
    }
    case "village":
    case "town": {
      const v = (await files.villages()).find((x) => String(x.id) === id);
      if (!v) return null;
      return { type: v.type === "Urban" ? "town" : "village", id, name: v.name, name_bn: null, lon: v.lon, lat: v.lat, bbox: v.bbox, cells: v.cells,
        attrs: { ...v, cells: undefined }, admin: { block: v.block, district: v.district, island: adminOf(v.cells).island }, geom: { layer: "villages", ids: [v.id] } };
    }
    case "island": {
      const r = (await files.islands()).find((x) => String(x.id) === id);
      if (!r) return null;
      return { type, id, name: r.name || `Island ${r.id}`, name_bn: null, lon: r.lon, lat: r.lat, bbox: r.bbox, cells: r.cells, attrs: { ...r, cells: undefined },
        admin: { ...adminOf(r.cells), island: r.name }, geom: { layer: "islands", ids: [r.id] } };
    }
    case "forest_unit":
    case "protected_area": {
      const r = (await files.protected()).find((x) => String(x.id) === id);
      if (!r) return null;
      return { type: r.kind === "core" ? "protected_area" : "forest_unit", id, name: r.name, name_bn: null, lon: r.lon, lat: r.lat, bbox: r.bbox,
        cells: r.cells, attrs: { ...r, cells: undefined }, admin: adminOf(r.cells), geom: { layer: r.kind === "designation" ? "designations" : "protected_areas", ids: [r.id] } };
    }
    case "river":
    case "canal":
    case "creek": {
      const r = (await files.rivers()).find((x) => x.id === id);
      if (!r) return null;
      return { type, id, name: r.name, name_bn: r.name_bn, lon: r.lon, lat: r.lat, bbox: r.bbox, cells: r.cells, attrs: { ...r, cells: undefined },
        admin: adminOf(r.cells), geom: { layer: "waterways", ids: r.ids } };
    }
    case "jetty":
    case "place":
    case "poi": {
      const p = (await files.points())[type].find((x) => String(x.id) === id);
      if (!p) return null;
      const cells: Cells = [[p.cell, hx.meta.area[p.cell]]];
      return { type, id, name: p.name || (type === "jetty" ? "Jetty" : type === "poi" ? (p.amenity || "Service") : "Place"), name_bn: null,
        lon: p.lon, lat: p.lat, bbox: null, cells, attrs: { ...p }, admin: adminOf(cells) };
    }
    case "hex": {
      const i = hx.index.get(id);
      if (i === undefined) return null;
      const cells: Cells = [[i, hx.meta.area[i]]];
      const lon = hx.meta.lon[i], lat = hx.meta.lat[i];
      return { type, id, name: id, name_bn: null, lon, lat, bbox: [lon - 0.008, lat - 0.007, lon + 0.008, lat + 0.007], cells,
        attrs: { area_km2: hx.meta.area[i] }, admin: adminOf(cells), geom: { layer: "hex", ids: [i] } };
    }
  }
  return null;
}

/** What is at a map point: hexagon, village, block, island, protected areas — for the click card. */
export async function whatIsHere(lon: number, lat: number) {
  const hx = await hexStore();
  const i = hx.at(lon, lat);
  const [vills, prot, isl] = await Promise.all([files.villages(), files.protected(), files.islands()]);
  const inCell = (cells: Cells) => i !== null && cells.some(([c]) => c === i);
  const village = i === null ? undefined : vills
    .filter((v) => inCell(v.cells))
    .sort((a, b) => Math.hypot(a.lon - lon, a.lat - lat) - Math.hypot(b.lon - lon, b.lat - lat))[0];
  const pas = i === null ? [] : prot.filter((p) => p.kind !== "designation" && inCell(p.cells));
  const island = i !== null && hx.meta.island[i] >= 0 ? isl[hx.meta.island[i]] : undefined;
  const admin = await files.admin();
  const block = i !== null ? admin.blocks.find((b) => b.name === hx.meta.blocks[hx.meta.block[i]]) : undefined;
  return { hex: i, hexId: i !== null ? hx.meta.id[i] : null, village, pas, island, block, lon, lat };
}

/** Nearest points of a kind (jetties, services, places) or villages. */
export async function nearest(kind: "village", lon: number, lat: number, n?: number): Promise<{ rec: VillageRec; km: number }[]>;
export async function nearest(kind: "jetty" | "poi" | "place", lon: number, lat: number, n?: number): Promise<{ rec: PointRec; km: number }[]>;
export async function nearest(kind: "jetty" | "poi" | "place" | "village", lon: number, lat: number, n = 5): Promise<{ rec: VillageRec | PointRec; km: number }[]> {
  const kx = Math.cos((lat * Math.PI) / 180);
  const dist = (x: number, y: number) => Math.hypot((x - lon) * kx, y - lat) * 111.2;
  if (kind === "village") {
    return (await files.villages()).map((v) => ({ rec: v, km: dist(v.lon, v.lat) })).sort((a, b) => a.km - b.km).slice(0, n);
  }
  return (await files.points())[kind].map((p) => ({ rec: p, km: dist(p.lon, p.lat) })).sort((a, b) => a.km - b.km).slice(0, n);
}
