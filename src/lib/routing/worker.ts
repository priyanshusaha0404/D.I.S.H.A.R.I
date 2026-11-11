/// <reference lib="webworker" />
/* Route engine running in a Web Worker (works offline): A* on the 100 m navigable-water grid for boats, A* on the
 * OpenStreetMap path network for walking, and one combined Dijkstra (walk ⇄ jetty ⇄ boat) for walk + boat journeys.
 * National Park core cells are not part of the water network. */
import { gunzipSync } from "fflate";
import { fromUtm, toUtm } from "../data/utm";

interface Meta {
  water: { width: number; height: number; x0: number; y0: number; dx: number; dy: number };
  walk: { nodes: number; edges: number; coords: number };
  transfers: { jetty: number; name: string | null; lon: number; lat: number; walk: number; low: number; high: number }[];
  speeds: { motor_boat: number; country_boat: number; walk: number; transfer_min: number };
}
export interface PlanRequest {
  origin: [number, number]; dest: [number, number]; mode: "boat" | "walk" | "multimodal"; tide: "low" | "high";
  vessel: "motor_boat" | "country_boat"; prefer: "safe" | "main" | "shortest"; alternatives: boolean;
}
export interface Leg { mode: "boat" | "walk"; coords: [number, number][]; km: number; min: number; creekKm: number; permitKm: number; mainKm: number; from?: string; to?: string }
export interface RouteResult { legs: Leg[]; km: number; min: number; transfers: number }
export interface PlanResponse { status: "ok" | "no_route"; routes: RouteResult[]; notes: { key: string; m?: number; name?: string }[]; reason?: string }

let meta: Meta | null = null;
let water: Uint8Array | null = null;
let walk: { lon: Float64Array; lat: Float64Array; big: Uint8Array; src: Uint32Array; tgt: Uint32Array; len: Float32Array; res: Uint8Array; off: Uint32Array; xy: Int32Array; adjStart: Int32Array; adjNode: Int32Array; adjEdge: Int32Array; bucket: Map<string, number[]> } | null = null;
let loadedVersion = "";

async function load(version: string) {
  if (loadedVersion === version && meta && water && walk) return;
  const url = (p: string) => `/data/${p}?v=${version}`;
  const [m, w, k] = await Promise.all([
    fetch(url("routing/meta.json")).then((r) => r.json() as Promise<Meta>),
    fetch(url("routing/water.bin.gz")).then((r) => r.arrayBuffer()),
    fetch(url("routing/walk.bin.gz")).then((r) => r.arrayBuffer()),
  ]);
  meta = m;
  const wb = new Uint8Array(w);
  water = wb[0] === 0x1f && wb[1] === 0x8b ? gunzipSync(wb) : wb;
  const kb0 = new Uint8Array(k);
  const kb = kb0[0] === 0x1f && kb0[1] === 0x8b ? gunzipSync(kb0) : kb0;
  const N = m.walk.nodes, E = m.walk.edges, C = m.walk.coords;
  let o = 0;
  const take = (bytes: number) => { const s = kb.slice(o, o + bytes); o += bytes; return s.buffer; };
  const nll = new Int32Array(take(8 * N));
  const big = new Uint8Array(take(N));
  const src = new Uint32Array(take(4 * E));
  const tgt = new Uint32Array(take(4 * E));
  const len = new Float32Array(take(4 * E));
  const res = new Uint8Array(take(E));
  const off = new Uint32Array(take(4 * (E + 1)));
  const xy = new Int32Array(take(8 * C));
  const lon = new Float64Array(N), lat = new Float64Array(N);
  const bucket = new Map<string, number[]>();
  for (let i = 0; i < N; i++) {
    lon[i] = nll[2 * i] / 1e6; lat[i] = nll[2 * i + 1] / 1e6;
    if (!big[i]) continue;
    const key = `${Math.floor(lon[i] / 0.01)}:${Math.floor(lat[i] / 0.01)}`;
    (bucket.get(key) || bucket.set(key, []).get(key)!).push(i);
  }
  const deg = new Int32Array(N + 1);
  for (let e = 0; e < E; e++) if (!res[e]) { deg[src[e] + 1]++; deg[tgt[e] + 1]++; }
  for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
  const adjNode = new Int32Array(deg[N]), adjEdge = new Int32Array(deg[N]);
  const fill = deg.slice(0, N);
  for (let e = 0; e < E; e++) {
    if (res[e]) continue;
    const a = src[e], b = tgt[e];
    adjNode[fill[a]] = b; adjEdge[fill[a]++] = e;
    adjNode[fill[b]] = a; adjEdge[fill[b]++] = e;
  }
  walk = { lon, lat, big, src, tgt, len, res, off, xy, adjStart: deg, adjNode, adjEdge, bucket };
  loadedVersion = version;
}

// ------------------------------------------------------------------ binary heap keyed by float priority
class Heap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop(): [number, number] {
    const k = this.k, v = this.v;
    const rk = k[0], rv = v[0];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return [rk, rv];
  }
}

// ------------------------------------------------------------------ water grid helpers
const DIRS: [number, number, number][] = [[0, 1, 100], [1, 0, 100], [0, -1, 100], [-1, 0, 100], [1, 1, 141.42], [1, -1, 141.42], [-1, 1, 141.42], [-1, -1, 141.42]];
const bitOf = (tide: "low" | "high") => (tide === "low" ? 64 : 128);
function cellOf(lon: number, lat: number): [number, number] {
  const w = meta!.water;
  const [E, N] = toUtm(lon, lat);
  return [Math.floor((N - w.y0) / w.dy), Math.floor((E - w.x0) / w.dx)];
}
function cellLonLat(c: number): [number, number] {
  const w = meta!.water;
  const r = Math.floor(c / w.width), col = c % w.width;
  return fromUtm(w.x0 + (col + 0.5) * w.dx, w.y0 + (r + 0.5) * w.dy);
}
function snapWater(lon: number, lat: number, tide: "low" | "high", maxM: number): { cell: number; m: number } | null {
  const w = meta!.water, f = water!, bit = bitOf(tide);
  const [r0, c0] = cellOf(lon, lat);
  const R = Math.ceil(maxM / 100);
  let best = -1, bd = Infinity;
  for (let rad = 0; rad <= R; rad++) {
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || c < 0 || r >= w.height || c >= w.width) continue;
      const idx = r * w.width + c;
      if (!(f[idx] & bit)) continue;
      const d = Math.hypot(dr, dc) * 100;
      if (d < bd) { bd = d; best = idx; }
    }
    if (best >= 0 && bd <= rad * 100) break;
  }
  return best >= 0 && bd <= maxM ? { cell: best, m: bd } : null;
}
/** cost of one water step: "safe" keeps to wide main rivers and away from narrow forest creeks and the forest edge,
 *  "main" prefers main channels, "shortest" is plain distance */
function stepMult(flag: number, prefer: "safe" | "main" | "shortest") {
  if (prefer === "shortest") return 1;
  if (prefer === "safe") return (flag & 8 ? 1 : flag & 16 ? 3.2 : 1.35) * (flag & 32 ? 1.8 : 1);
  return flag & 8 ? 1 : flag & 16 ? 1.6 : 1.15;
}
function waterAStar(a: number, b: number, tide: "low" | "high", prefer: "safe" | "main" | "shortest", penalty?: Uint8Array): number[] | null {
  const w = meta!.water, f = water!, bit = bitOf(tide), W = w.width, H = w.height;
  const g = new Float32Array(W * H).fill(Infinity);
  const parent = new Int32Array(W * H).fill(-1);
  const br = Math.floor(b / W), bc = b % W;
  const h = (i: number) => Math.hypot(Math.floor(i / W) - br, (i % W) - bc) * 100;
  const heap = new Heap();
  g[a] = 0; heap.push(h(a), a);
  while (heap.size) {
    const [, u] = heap.pop();
    if (u === b) break;
    const gu = g[u];
    const ur = Math.floor(u / W), uc = u % W;
    for (const [dr, dc, d] of DIRS) {
      const r = ur + dr, c = uc + dc;
      if (r < 0 || c < 0 || r >= H || c >= W) continue;
      const v = r * W + c;
      const fv = f[v];
      if (!(fv & bit)) continue;
      const cost = d * stepMult(fv, prefer) * (penalty && penalty[v] ? 4 : 1);
      const nv = gu + cost;
      if (nv < g[v]) { g[v] = nv; parent[v] = u; heap.push(nv + h(v), v); }
    }
  }
  if (!Number.isFinite(g[b])) return null;
  const path: number[] = [];
  for (let c = b; c !== -1; c = parent[c]) path.push(c);
  return path.reverse();
}

function douglasPeucker(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [x1, y1] = pts[s], [x2, y2] = pts[e];
    const L = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
    let md = 0, mi = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((y2 - y1) * pts[i][0] - (x2 - x1) * pts[i][1] + x2 * y1 - y2 * x1) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function waterLeg(path: number[], speed: number): Leg {
  const w = meta!.water, f = water!, W = w.width;
  let m = 0, creek = 0, permit = 0, main = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const d = Math.floor(a / W) !== Math.floor(b / W) && a % W !== b % W ? 141.42 : 100;
    m += d;
    if (f[b] & 16) creek += d;
    if (f[b] & 32) permit += d;
    if (f[b] & 8) main += d;
  }
  const xy: [number, number][] = path.map((c) => [w.x0 + ((c % W) + 0.5) * w.dx, w.y0 + (Math.floor(c / W) + 0.5) * w.dy]);
  const coords = douglasPeucker(xy, 25).map(([x, y]) => fromUtm(x, y));
  return { mode: "boat", coords, km: m / 1000, min: (m / 1000 / speed) * 60, creekKm: creek / 1000, permitKm: permit / 1000, mainKm: main / 1000 };
}

// ------------------------------------------------------------------ walking network
function snapWalk(lon: number, lat: number, maxM: number): { node: number; m: number } | null {
  const k = walk!;
  const bx = Math.floor(lon / 0.01), by = Math.floor(lat / 0.01);
  const R = Math.ceil(maxM / 1000) + 1;
  let best = -1, bd = Infinity;
  const kx = Math.cos((lat * Math.PI) / 180) * 111200, ky = 111200;
  for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
    for (const i of k.bucket.get(`${bx + dx}:${by + dy}`) || []) {
      const d = Math.hypot((k.lon[i] - lon) * kx, (k.lat[i] - lat) * ky);
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best >= 0 && bd <= maxM ? { node: best, m: bd } : null;
}
function edgeCoords(e: number, forward: boolean): [number, number][] {
  const k = walk!;
  const out: [number, number][] = [];
  for (let j = k.off[e]; j < k.off[e + 1]; j++) out.push([k.xy[2 * j] / 1e6, k.xy[2 * j + 1] / 1e6]);
  return forward ? out : out.reverse();
}
function walkSearch(a: number, b: number): { nodes: number[]; edges: number[] } | null {
  const k = walk!;
  const N = k.lon.length;
  const g = new Float64Array(N).fill(Infinity), pe = new Int32Array(N).fill(-1), pn = new Int32Array(N).fill(-1);
  const kx = Math.cos((k.lat[b] * Math.PI) / 180) * 111200;
  const h = (i: number) => Math.hypot((k.lon[i] - k.lon[b]) * kx, (k.lat[i] - k.lat[b]) * 111200);
  const heap = new Heap();
  g[a] = 0; heap.push(h(a), a);
  while (heap.size) {
    const [, u] = heap.pop();
    if (u === b) break;
    for (let j = k.adjStart[u]; j < k.adjStart[u + 1]; j++) {
      const v = k.adjNode[j], e = k.adjEdge[j];
      const nv = g[u] + k.len[e];
      if (nv < g[v]) { g[v] = nv; pe[v] = e; pn[v] = u; heap.push(nv + h(v), v); }
    }
  }
  if (!Number.isFinite(g[b])) return null;
  const nodes: number[] = [], edges: number[] = [];
  for (let c = b; c !== a; c = pn[c]) { nodes.push(c); edges.push(pe[c]); }
  nodes.push(a);
  return { nodes: nodes.reverse(), edges: edges.reverse() };
}
function walkLeg(nodes: number[], edges: number[], speed: number): Leg {
  const k = walk!;
  let m = 0;
  const coords: [number, number][] = [];
  edges.forEach((e, i) => {
    m += k.len[e];
    const fwd = k.src[e] === nodes[i];
    const c = edgeCoords(e, fwd);
    if (coords.length) c.shift();
    coords.push(...c);
  });
  if (!coords.length) coords.push([k.lon[nodes[0]], k.lat[nodes[0]]]);
  return { mode: "walk", coords, km: m / 1000, min: (m / 1000 / speed) * 60, creekKm: 0, permitKm: 0, mainKm: 0 };
}

// ------------------------------------------------------------------ combined walk + boat (time-based Dijkstra)
function multimodal(o: [number, number], d: [number, number], tide: "low" | "high", boatSpeed: number, prefer: "safe" | "main" | "shortest") {
  const k = walk!, w = meta!.water, f = water!, bit = bitOf(tide), W = w.width, H = w.height;
  const N = k.lon.length, M = W * H;
  const walkMs = (meta!.speeds.walk * 1000) / 3600, boatMs = (boatSpeed * 1000) / 3600;
  const t = new Float64Array(N + M).fill(Infinity);
  const par = new Int32Array(N + M).fill(-1), parEdge = new Int32Array(N).fill(-1);
  const transfersBy = new Map<number, number[]>();
  for (const tr of meta!.transfers) {
    const wc = tide === "low" ? tr.low : tr.high;
    if (tr.walk < 0 || wc < 0) continue;
    (transfersBy.get(tr.walk) || transfersBy.set(tr.walk, []).get(tr.walk)!).push(N + wc);
    (transfersBy.get(N + wc) || transfersBy.set(N + wc, []).get(N + wc)!).push(tr.walk);
  }
  const heap = new Heap();
  const sw = snapWalk(o[0], o[1], 2000), sb = snapWater(o[0], o[1], tide, 500);
  if (sw) { t[sw.node] = sw.m / walkMs; heap.push(t[sw.node], sw.node); }
  if (sb) { t[N + sb.cell] = sb.m / walkMs; heap.push(t[N + sb.cell], N + sb.cell); }
  const ew = snapWalk(d[0], d[1], 2000), eb = snapWater(d[0], d[1], tide, 500);
  const goals = new Set<number>([...(ew ? [ew.node] : []), ...(eb ? [N + eb.cell] : [])]);
  if (!goals.size || !heap.size) return null;
  const transferS = meta!.speeds.transfer_min * 60;
  let goal = -1;
  while (heap.size) {
    const [tu, u] = heap.pop();
    if (tu > t[u]) continue;
    if (goals.has(u)) { goal = u; break; }
    if (u < N) {
      for (let j = k.adjStart[u]; j < k.adjStart[u + 1]; j++) {
        const v = k.adjNode[j], e = k.adjEdge[j];
        const nv = tu + k.len[e] / walkMs;
        if (nv < t[v]) { t[v] = nv; par[v] = u; parEdge[v] = e; heap.push(nv, v); }
      }
    } else {
      const c = u - N, ur = Math.floor(c / W), uc = c % W;
      for (const [dr, dc, dd] of DIRS) {
        const r = ur + dr, cc = uc + dc;
        if (r < 0 || cc < 0 || r >= H || cc >= W) continue;
        const v = r * W + cc;
        if (!(f[v] & bit)) continue;
        const nv = tu + (dd * stepMult(f[v], prefer)) / boatMs;
        if (nv < t[N + v]) { t[N + v] = nv; par[N + v] = u; heap.push(nv, N + v); }
      }
    }
    for (const v of transfersBy.get(u) || []) {
      const nv = tu + transferS;
      if (nv < t[v]) { t[v] = nv; par[v] = u; if (v < N) parEdge[v] = -2; heap.push(nv, v); }
    }
  }
  if (goal < 0) return null;
  const seq: number[] = [];
  for (let c = goal; c !== -1; c = par[c]) seq.push(c);
  seq.reverse();
  const legs: Leg[] = [];
  let i = 0;
  while (i < seq.length) {
    const isWater = seq[i] >= N;
    let j = i;
    while (j + 1 < seq.length && (seq[j + 1] >= N) === isWater && !(seq[j + 1] < N && parEdge[seq[j + 1]] === -2)) j++;
    const part = seq.slice(i, j + 1);
    if (isWater) {
      if (part.length > 1) legs.push(waterLeg(part.map((x) => x - N), boatSpeed));
    } else if (part.length > 1) {
      const edges = part.slice(1).map((n) => parEdge[n]);
      legs.push(walkLeg(part, edges, meta!.speeds.walk));
    }
    i = j + 1;
  }
  return { legs, snapStart: Math.min(sw?.m ?? Infinity, sb?.m ?? Infinity), snapEnd: Math.min(ew?.m ?? Infinity, eb?.m ?? Infinity) };
}

function overlap(a: number[], b: number[]) {
  const s = new Set(b);
  let n = 0;
  for (const x of a) if (s.has(x)) n++;
  return n / Math.max(1, a.length);
}

// ------------------------------------------------------------------ plan
function plan(q: PlanRequest): PlanResponse {
  const speed = meta!.speeds[q.vessel];
  const notes: PlanResponse["notes"] = [];
  const routes: RouteResult[] = [];
  const pack = (legs: Leg[]): RouteResult => ({ legs, km: legs.reduce((s, l) => s + l.km, 0),
    min: legs.reduce((s, l) => s + l.min, 0) + Math.max(0, legs.length - 1) * meta!.speeds.transfer_min, transfers: Math.max(0, legs.length - 1) });
  if (q.mode === "boat") {
    const a = snapWater(q.origin[0], q.origin[1], q.tide, 3000), b = snapWater(q.dest[0], q.dest[1], q.tide, 3000);
    if (!a || !b) return { status: "no_route", routes, notes, reason: !a ? "origin_far_water" : "dest_far_water" };
    if (a.m > 150) notes.push({ key: "route.note.startMoved", m: a.m });
    if (b.m > 150) notes.push({ key: "route.note.endMoved", m: b.m });
    const p1 = waterAStar(a.cell, b.cell, q.tide, q.prefer);
    if (!p1) return { status: "no_route", routes, notes, reason: "not_connected" };
    routes.push(pack([waterLeg(p1, speed)]));
    if (q.alternatives && p1.length > 20) {
      const W = meta!.water.width;
      const pen = new Uint8Array(water!.length);
      for (const c of p1) for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const v = c + dr * W + dc; if (v >= 0 && v < pen.length) pen[v] = 1; }
      pen[a.cell] = pen[b.cell] = 0;
      const p2 = waterAStar(a.cell, b.cell, q.tide, q.prefer, pen);
      if (p2 && overlap(p2, p1) < 0.75) routes.push(pack([waterLeg(p2, speed)]));
    }
  } else if (q.mode === "walk") {
    const a = snapWalk(q.origin[0], q.origin[1], 2000), b = snapWalk(q.dest[0], q.dest[1], 2000);
    if (!a || !b) return { status: "no_route", routes, notes, reason: !a ? "origin_far_road" : "dest_far_road" };
    if (a.m > 150) notes.push({ key: "route.note.startMovedRoad", m: a.m });
    if (b.m > 150) notes.push({ key: "route.note.endMovedRoad", m: b.m });
    const p = walkSearch(a.node, b.node);
    if (!p) return { status: "no_route", routes, notes, reason: "not_connected_walk" };
    routes.push(pack([walkLeg(p.nodes, p.edges, meta!.speeds.walk)]));
  } else {
    const r = multimodal(q.origin, q.dest, q.tide, speed, q.prefer);
    if (!r || !r.legs.length) return { status: "no_route", routes, notes, reason: "not_connected_multi" };
    if (r.snapStart > 150) notes.push({ key: "route.note.startMovedAny", m: r.snapStart });
    if (r.snapEnd > 150) notes.push({ key: "route.note.endMovedAny", m: r.snapEnd });
    routes.push(pack(r.legs));
  }
  return { status: "ok", routes, notes };
}

self.onmessage = async (ev: MessageEvent<{ id: number; version: string; req: PlanRequest }>) => {
  const { id, version, req } = ev.data;
  try {
    await load(version);
    const res = plan(req);
    (self as unknown as Worker).postMessage({ id, ok: true, res });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(e) });
  }
};
export {};
