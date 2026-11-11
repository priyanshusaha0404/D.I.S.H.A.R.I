/** Typed access to the published catalogue: hexagon variables, time series, rasters, modules and sources. */
import { loadJSON } from "./fetch";

export interface ClassItem { v: number; en: string; bn: string; colour?: string }
export interface VariableDef {
  key: string; label: string; label_bn: string; cat: string; source: string; ramp: string; digits: number;
  kind: "cont" | "zone" | "count" | "class"; unit: string; unit_bn: string; period: string | null; season?: string;
  classes?: ClassItem[]; desc?: string; desc_bn?: string; n: number; min: number; max: number; mean: number; q: [number, number];
}
export interface SeriesDef {
  key: string; label: string; label_bn: string; unit: string; unit_bn?: string; source: string; x: (number | string)[];
  xkind?: "month" | "yearmonth"; digits: number; col0: number; q: [number, number][];
}
export interface Category { key: string; en: string; bn: string }
export interface Catalog {
  categories: Category[]; variables: VariableDef[]; series: SeriesDef[];
  study_area: { hexagons: number; area_km2: number; bbox: [number, number, number, number] };
  release: { tag: string; exported: string };
}
export interface RasterDef {
  url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]];
  bounds: [number, number, number, number]; width: number; height: number; title: string; thumb?: string;
  legend: null | { type: "categorical"; items: { v: number; en: string; colour: string }[] } | { type: "ramp"; colours: string[]; min: number; max: number };
}
export interface ModelCard {
  key: string; run: number; name: string; version: string; date: string; algorithm: string; scheme: string;
  labels: { rows: number; positive_cells: number; background_cells: number }; features: number; domain: string; metric: string;
  spatial_cv: number; sd: number; random_cv: number; boyce: number | null; tss: number | null; thresholds: Record<string, number>;
  leaderboard: { model: string; rank: number; auc: number; auc_sd: number; boyce: number; tss: number; tied: boolean }[];
  friedman_p: number | null; drivers: { feature: string; label: string; label_bn: string; importance: number }[];
  themes: { key: string; en: string; bn: string; pct: number }[];
}
export interface Species {
  group: string; scientific: string; common: string; local_bn: string | null; local: string | null; habitat: string | null;
  status: string | null; refs: { url: string; title: string }[];
}
export interface Modules {
  tiger: {
    models: ModelCard[]; species: Species[];
    patches: { id: number; cells: number; area_km2: number; mean_suitability: number }[];
    corridors: { id: number; from: number; to: number; length_km: number; cost: number; mean_suitability: number }[];
    records: { tiger: { records: number; hexagons: number; first: string; last: string }; prey: { records: number; hexagons: number } };
  };
  fish: { species: Species[] }; crab: { species: Species[] }; honey: { species: Species[] };
  environment: { mangrove_patches: Record<string, { n: number; km2: number; largest: number }> };
}
export interface Source {
  key: string; group: string; name: string; provider: string; url: string | null; licence: string; period: string; resolution: string; layers: string;
}

export const loadCatalog = () => loadJSON<Catalog>("catalog.json");
export const loadRasters = () => loadJSON<Record<string, RasterDef>>("raster/index.json");
export const loadModules = () => loadJSON<Modules>("modules.json");
export const loadSources = () => loadJSON<Source[]>("sources.json");

export function varLabel(v: { label: string; label_bn?: string }, lang: "en" | "bn") {
  return lang === "bn" && v.label_bn ? v.label_bn : v.label;
}
export function varUnit(v: { unit: string; unit_bn?: string }, lang: "en" | "bn") {
  return lang === "bn" && v.unit_bn ? v.unit_bn : v.unit;
}
