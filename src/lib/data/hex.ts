/** The 1.6 km² hexagon grid: geometry, administrative membership and every published variable, decoded from the
 *  quantised binary columns (Int16 → Float32, NaN = no data). */
import { loadBinary, loadJSON } from "./fetch";
import { loadCatalog, type Catalog, type SeriesDef, type VariableDef } from "./catalog";

export interface HexMeta {
  n: number; id: string[]; lon: number[]; lat: number[]; area: number[]; block: number[]; district: number[]; island: number[];
  blocks: string[]; districts: string[]; islands: (string | null)[]; x: number[]; y: number[];
}

export class HexStore {
  readonly n: number;
  readonly index: Map<string, number>;
  readonly vars = new Map<string, Float32Array>();
  readonly varDefs = new Map<string, VariableDef>();
  private seriesCols: Float32Array[] | null = null;
  private bucket = new Map<string, number[]>();
  private nbrs: Int32Array[] | null = null;

  constructor(readonly meta: HexMeta, readonly catalog: Catalog, blob: Uint8Array) {
    this.n = meta.n;
    this.index = new Map(meta.id.map((id, i) => [id, i]));
    const q = new Int16Array(blob.buffer, blob.byteOffset, blob.byteLength / 2);
    catalog.variables.forEach((v, k) => {
      this.vars.set(v.key, decode(q, k, this.n, v.q[0], v.q[1]));
      this.varDefs.set(v.key, v);
    });
    for (let i = 0; i < this.n; i++) {
      const key = `${Math.floor(meta.lon[i] / 0.02)}:${Math.floor(meta.lat[i] / 0.02)}`;
      (this.bucket.get(key) || this.bucket.set(key, []).get(key)!).push(i);
    }
  }

  get(key: string): Float32Array {
    const a = this.vars.get(key);
    if (!a) throw new Error(`Unknown variable ${key}`);
    return a;
  }
  def(key: string): VariableDef | undefined {
    return this.varDefs.get(key);
  }
  value(key: string, i: number): number {
    return this.vars.get(key)?.[i] ?? NaN;
  }

  /** Hexagon containing a point (nearest centroid within ~1 km — the cells form a regular hexagonal lattice). */
  at(lon: number, lat: number): number | null {
    const bx = Math.floor(lon / 0.02), by = Math.floor(lat / 0.02);
    let best = -1, bd = Infinity;
    const kx = Math.cos((lat * Math.PI) / 180);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const i of this.bucket.get(`${bx + dx}:${by + dy}`) || []) {
        const d = ((this.meta.lon[i] - lon) * kx) ** 2 + (this.meta.lat[i] - lat) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best >= 0 && Math.sqrt(bd) * 111 < 1.1 ? best : null;
  }

  /** Hexagons whose centre lies within `km` of a point, nearest first. */
  near(lon: number, lat: number, km: number): { i: number; km: number }[] {
    const out: { i: number; km: number }[] = [];
    const kx = Math.cos((lat * Math.PI) / 180);
    for (let i = 0; i < this.n; i++) {
      const d = Math.hypot((this.meta.lon[i] - lon) * kx, this.meta.lat[i] - lat) * 111.2;
      if (d <= km) out.push({ i, km: d });
    }
    return out.sort((a, b) => a.km - b.km);
  }

  /** Neighbour lists on the hexagon lattice (centres closer than 1.25 × the typical spacing). */
  neighbours(): Int32Array[] {
    if (this.nbrs) return this.nbrs;
    const { x, y } = this.meta;
    const cell = 1500;
    const grid = new Map<string, number[]>();
    for (let i = 0; i < this.n; i++) {
      const k = `${Math.floor(x[i] / cell)}:${Math.floor(y[i] / cell)}`;
      (grid.get(k) || grid.set(k, []).get(k)!).push(i);
    }
    // typical spacing = median nearest-neighbour distance
    const nn: number[] = [];
    for (let i = 0; i < this.n; i += 7) {
      let b = Infinity;
      const gx = Math.floor(x[i] / cell), gy = Math.floor(y[i] / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
        for (const j of grid.get(`${gx + dx}:${gy + dy}`) || []) if (j !== i) b = Math.min(b, Math.hypot(x[i] - x[j], y[i] - y[j]));
      if (Number.isFinite(b)) nn.push(b);
    }
    nn.sort((a, b) => a - b);
    const thr = (nn[Math.floor(nn.length / 2)] || 1360) * 1.25;
    this.nbrs = [];
    for (let i = 0; i < this.n; i++) {
      const gx = Math.floor(x[i] / cell), gy = Math.floor(y[i] / cell);
      const list: number[] = [];
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++)
        for (const j of grid.get(`${gx + dx}:${gy + dy}`) || []) if (j !== i && Math.hypot(x[i] - x[j], y[i] - y[j]) <= thr) list.push(j);
      this.nbrs.push(Int32Array.from(list));
    }
    return this.nbrs;
  }

  /** Time series columns (loaded on first use, ~1.7 MB). */
  async series(): Promise<{ defs: SeriesDef[]; cols: Float32Array[] }> {
    if (!this.seriesCols) {
      const blob = await loadBinary("hex/series.bin.gz");
      const q = new Int16Array(blob.buffer, blob.byteOffset, blob.byteLength / 2);
      const cols: Float32Array[] = [];
      for (const s of this.catalog.series) s.q.forEach(([lo, sc], j) => { cols[s.col0 + j] = decode(q, s.col0 + j, this.n, lo, sc); });
      this.seriesCols = cols;
    }
    return { defs: this.catalog.series, cols: this.seriesCols };
  }
}

function decode(q: Int16Array, col: number, n: number, lo: number, scale: number): Float32Array {
  const out = new Float32Array(n);
  const off = col * n;
  for (let i = 0; i < n; i++) {
    const v = q[off + i];
    out[i] = v === -32768 ? NaN : (v + 32000) * scale + lo;
  }
  return out;
}

let store: Promise<HexStore> | null = null;
export function hexStore(): Promise<HexStore> {
  if (!store) {
    store = Promise.all([loadJSON<HexMeta>("hex/meta.json"), loadCatalog(), loadBinary("hex/vars.bin.gz")])
      .then(([m, c, b]) => new HexStore(m, c, b));
    store.catch(() => { store = null; });
  }
  return store;
}

export interface HexGeoJSON extends GeoJSON.FeatureCollection<GeoJSON.Polygon, { i: number }> {}
export const loadHexGeometry = () => loadJSON<HexGeoJSON>("hex/grid.geojson");

/** Area-weighted aggregation of a variable over a set of hexagons ([index, weight km²] pairs). */
export function aggregate(values: Float32Array, cells: [number, number][]): { mean: number; min: number; max: number; n: number; w: number } {
  let s = 0, w = 0, mn = Infinity, mx = -Infinity, n = 0;
  for (const [i, wt] of cells) {
    const v = values[i];
    if (Number.isNaN(v)) continue;
    s += v * wt; w += wt; n++;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return { mean: w > 0 ? s / w : NaN, min: n ? mn : NaN, max: n ? mx : NaN, n, w };
}

/** Count of hexagons (and their overlap area) per class value. */
export function classAreas(values: Float32Array, cells: [number, number][]): Map<number, { n: number; km2: number }> {
  const m = new Map<number, { n: number; km2: number }>();
  for (const [i, wt] of cells) {
    const v = values[i];
    if (Number.isNaN(v)) continue;
    const k = Math.round(v);
    const e = m.get(k) || { n: 0, km2: 0 };
    e.n++; e.km2 += wt;
    m.set(k, e);
  }
  return m;
}
