/** Area profiles: every published variable summarised over the hexagons of a place (area-weighted). */
import { aggregate, classAreas, type HexStore } from "./data/hex";
import { varLabel, varUnit, type SeriesDef, type VariableDef } from "./data/catalog";
import { classColours } from "./symbology";
import { fmt } from "./format";
import type { Lang } from "./i18n";

export type Cells = [number, number][];
export interface ProfileRow {
  key: string; label: string; unit: string; value: string; raw: number; range?: string;
  classes?: { v: number; label: string; km2: number; pct: number; colour: string }[];
  kind: VariableDef["kind"]; total?: boolean;
}
export interface ProfileSection { key: string; title: string; rows: ProfileRow[] }

/** variables that are per-hexagon totals (summed, weighted by the share of each hexagon inside the place) */
export const TOTALS = new Set(["tiger_records", "prey_records", "buildings", "waterway_len", "roads_len", "cyclone_len"]);

export function sumOver(hx: HexStore, key: string, cells: Cells) {
  const v = hx.get(key);
  let s = 0, n = 0;
  for (const [i, w] of cells) {
    const x = v[i];
    if (Number.isNaN(x)) continue;
    const a = hx.meta.area[i] || w;
    s += x * Math.min(1, w / a); n++;
  }
  return { sum: s, n };
}
/** population estimate from WorldPop density × area */
export function popEstimate(hx: HexStore, cells: Cells) {
  const v = hx.get("pop_density");
  let s = 0;
  for (const [i, w] of cells) if (!Number.isNaN(v[i])) s += v[i] * w;
  return s;
}

export function row(hx: HexStore, def: VariableDef, cells: Cells, lang: Lang): ProfileRow | null {
  const vals = hx.get(def.key);
  const unit = varUnit(def, lang);
  const label = varLabel(def, lang);
  if ((def.kind === "zone" || def.kind === "class") && def.classes) {
    const ca = classAreas(vals, cells);
    const tot = [...ca.values()].reduce((s, e) => s + e.km2, 0);
    if (!tot) return null;
    const cc = classColours(def);
    const classes = def.classes.map((c) => ({ v: c.v, label: lang === "bn" ? c.bn : c.en, km2: ca.get(c.v)?.km2 || 0, pct: ((ca.get(c.v)?.km2 || 0) / tot) * 100, colour: cc[c.v] }));
    const top = [...classes].sort((a, b) => b.km2 - a.km2)[0];
    return { key: def.key, label, unit, value: cells.length === 1 ? top.label : `${top.label} ${fmt(top.pct, lang, 0)}%`, raw: top.v, classes, kind: def.kind };
  }
  if (TOTALS.has(def.key)) {
    const { sum, n } = sumOver(hx, def.key, cells);
    if (!n) return null;
    return { key: def.key, label, unit, value: `${fmt(sum, lang, def.kind === "count" ? 0 : def.digits)} ${unit}`, raw: sum, kind: def.kind, total: true };
  }
  const a = aggregate(vals, cells);
  if (!a.n) return null;
  const d = def.digits;
  return { key: def.key, label, unit, value: `${fmt(a.mean, lang, d)} ${unit}`.trim(), raw: a.mean,
    range: a.n > 1 && a.max > a.min ? `${fmt(a.min, lang, d)} – ${fmt(a.max, lang, d)}` : undefined, kind: def.kind };
}

export function buildProfile(hx: HexStore, cells: Cells, lang: Lang): ProfileSection[] {
  const out: ProfileSection[] = [];
  for (const c of hx.catalog.categories) {
    const rows: ProfileRow[] = [];
    for (const def of hx.catalog.variables) {
      if (def.cat !== c.key) continue;
      const r = row(hx, def, cells, lang);
      if (r) rows.push(r);
    }
    if (rows.length) out.push({ key: c.key, title: lang === "bn" ? c.bn : c.en, rows });
  }
  return out;
}

/** Area-weighted series over a place, e.g. MODIS NDVI 2000–2025. */
export async function seriesOver(hx: HexStore, key: string, cells: Cells): Promise<{ x: (number | string)[]; y: number[]; def: SeriesDef } | null> {
  const { defs, cols } = await hx.series();
  const s = defs.find((x) => x.key === key);
  if (!s) return null;
  const y = s.x.map((_, j) => { const a = aggregate(cols[s.col0 + j], cells); return a.n ? a.mean : NaN; });
  return { x: s.x, y, def: s };
}

export const KM2 = (lang: Lang) => (lang === "bn" ? "বর্গকিমি" : "km²");
