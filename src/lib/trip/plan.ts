/** Smart trip: plan a journey through several stops — boat, walking or both — with a timetable, the tide for every
 *  hop (from the sea-level forecast at the time you leave), river names along boat legs and the ghats where you change. */
import { planRoute, type Leg, type PlanRequest } from "../routing/client";
import { getSeaLevel } from "../data/weather";
import { loadJSON } from "../data/fetch";
import { loadPoints, loadVillages } from "../data/entities";
import { metres, type LL } from "./geo";

export interface TripStop { id: string; name: string; lon: number; lat: number; type: string; ref?: string; stay: number }
export interface TripSettings {
  mode: PlanRequest["mode"]; vessel: PlanRequest["vessel"]; prefer: PlanRequest["prefer"];
  tide: "auto" | "low" | "high"; leaveAt: number; bestOrder: boolean; returnToStart: boolean;
}
export interface TripLeg extends Leg { t0: number; t1: number; fromName: string; toName: string; rivers: string[];
  /** nearest village where a leg starts or ends at an unnamed ghat */
  fromNear?: string; toNear?: string }
export interface Hop {
  from: number; to: number; tide: "low" | "high"; tideSource: "forecast" | "chosen" | "default"; tideH?: number;
  depart: number; arrive: number; km: number; min: number; legs: TripLeg[]; notes: { key: string; m?: number }[];
}
export interface TripPlan {
  stops: TripStop[]; hops: Hop[]; settings: TripSettings; start: number; end: number; created: number;
  totals: { min: number; moveMin: number; stayMin: number; changeMin: number; km: number; boatKm: number; walkKm: number; changes: number; creekKm: number; permitKm: number };
  failed?: { hop: number; reason?: string };
  reordered?: boolean;
}

export const DEFAULT_SETTINGS = (): TripSettings => ({
  mode: "multimodal", vessel: "motor_boat", prefer: "safe", tide: "auto", leaveAt: nextQuarter(), bestOrder: false, returnToStart: false,
});
export function nextQuarter(from = Date.now()) { const q = 15 * 60000; return Math.ceil((from + 5 * 60000) / q) * q; }

/* ------------------------------------------------------------------ tide at a time and place */
const seaCache = new Map<string, { at: number; p: ReturnType<typeof getSeaLevel> }>();
function sea(ll: LL) {
  const k = `${ll[1].toFixed(2)},${ll[0].toFixed(2)}`;
  const c = seaCache.get(k);
  if (c && Date.now() - c.at < 20 * 60000) return c.p;
  const p = getSeaLevel(ll[1], ll[0]);
  seaCache.set(k, { at: Date.now(), p });
  return p;
}
export async function tideAt(ll: LL, when: number): Promise<{ tide: "low" | "high"; h: number } | null> {
  const { data } = await sea(ll).catch(() => ({ data: null }));
  if (!data || data.series.length < 6) return null;
  const ts = data.series.map((p) => new Date(p.time.length <= 16 ? `${p.time}:00+05:30` : p.time).getTime());
  if (when < ts[0] - 3600e3 || when > ts[ts.length - 1]) return null;
  let i = ts.findIndex((t) => t >= when);
  if (i <= 0) i = 1;
  const f = Math.max(0, Math.min(1, (when - ts[i - 1]) / (ts[i] - ts[i - 1])));
  const h = data.series[i - 1].h + (data.series[i].h - data.series[i - 1].h) * f;
  const sorted = data.series.map((p) => p.h).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  return { tide: h >= med ? "high" : "low", h };
}

/* ------------------------------------------------------------------ names along the way */
type Seg = { a: LL; b: LL; name: string };
let riverIndex: Promise<Map<string, Seg[]>> | null = null;
const cellKey = (x: number, y: number) => `${Math.floor(x / 0.02)}:${Math.floor(y / 0.02)}`;
function rivers(): Promise<Map<string, Seg[]>> {
  if (!riverIndex) riverIndex = loadJSON<GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString, { name?: string }>>("vector/waterways.geojson").then((fc) => {
    const idx = new Map<string, Seg[]>();
    for (const f of fc.features) {
      const name = (f.properties?.name || "").trim();
      if (!name || !f.geometry) continue;
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const cs of lines) for (let i = 1; i < cs.length; i++) {
        const s: Seg = { a: cs[i - 1] as LL, b: cs[i] as LL, name };
        const k = cellKey((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2);
        (idx.get(k) || idx.set(k, []).get(k)!).push(s);
      }
    }
    return idx;
  });
  return riverIndex;
}
function distToSeg(p: LL, s: Seg) {
  const kx = Math.cos((p[1] * Math.PI) / 180) * 111320, ky = 110574;
  const ax = (s.a[0] - p[0]) * kx, ay = (s.a[1] - p[1]) * ky, bx = (s.b[0] - p[0]) * kx, by = (s.b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const f = L2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
  return Math.hypot(ax + dx * f, ay + dy * f);
}
/** Named rivers and canals a boat leg follows, in order of first appearance (up to 3). */
export async function riversAlong(coords: LL[]): Promise<string[]> {
  const idx = await rivers();
  const share = new Map<string, number>(), order: string[] = [];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = metres(coords[i - 1], coords[i]);
    acc += d;
    if (acc < 700 && i < coords.length - 1) continue;
    acc = 0;
    const p = coords[i];
    const gx = Math.floor(p[0] / 0.02), gy = Math.floor(p[1] / 0.02);
    let best: { d: number; name: string } | null = null;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const s of idx.get(`${gx + dx}:${gy + dy}`) || []) { const dd = distToSeg(p, s); if (dd < 900 && (!best || dd < best.d)) best = { d: dd, name: s.name }; }
    if (best) { if (!share.has(best.name)) order.push(best.name); share.set(best.name, (share.get(best.name) || 0) + 1); }
  }
  return order.filter((n) => (share.get(n) || 0) >= 2 || order.length <= 2).slice(0, 3);
}
/** The nearest ghat / jetty name within 700 m (where you change between walking and the boat). */
export async function ghatNear(p: LL): Promise<string | null> {
  const pts = await loadPoints();
  let best: { d: number; name: string | null } | null = null;
  for (const j of pts.jetty) { const d = metres(p, [j.lon, j.lat]); if (d < 700 && (!best || d < best.d)) best = { d, name: j.name }; }
  return best ? best.name || null : null;
}

/** the nearest village (within 4 km) — to name an unnamed ghat "the ghat near …" */
export async function villageNear(p: LL): Promise<string | undefined> {
  const vs = await loadVillages();
  let best: { d: number; name: string } | null = null;
  for (const v of vs) { const d = metres(p, [v.lon, v.lat]); if (d < 4000 && (!best || d < best.d)) best = { d, name: v.name }; }
  return best?.name;
}

/* ------------------------------------------------------------------ best order of the stops in between */
async function bestOrder(stops: TripStop[], s: TripSettings, onProgress?: (done: number, total: number) => void): Promise<TripStop[] | null> {
  const first = stops[0], last = stops[stops.length - 1], mids = stops.slice(1, -1);
  if (mids.length < 2 || mids.length > 6) return null;
  const pts = [first, ...mids, last];
  const n = pts.length;
  const M: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  const tide = s.tide === "auto" ? "low" : s.tide;
  const jobs: [number, number][] = [];
  for (let k = 1; k <= mids.length; k++) { jobs.push([0, k]); jobs.push([k, n - 1]); }
  for (let a = 1; a <= mids.length; a++) for (let b = a + 1; b <= mids.length; b++) jobs.push([a, b]);
  let done = 0;
  for (const [a, b] of jobs) {
    const r = await planRoute({ origin: [pts[a].lon, pts[a].lat], dest: [pts[b].lon, pts[b].lat], mode: s.mode, tide, vessel: s.vessel, prefer: s.prefer, alternatives: false }).catch(() => null);
    const m = r?.status === "ok" && r.routes[0] ? r.routes[0].min : Infinity;
    M[a][b] = m; if (a !== 0 && b !== n - 1) M[b][a] = m;
    onProgress?.(++done, jobs.length);
  }
  const idx = mids.map((_, k) => k + 1);
  let best: number[] | null = null, bestT = Infinity;
  const perm = (arr: number[], l: number) => {
    if (l === arr.length) {
      let tt = M[0][arr[0]] + M[arr[arr.length - 1]][n - 1];
      for (let i = 1; i < arr.length; i++) tt += M[arr[i - 1]][arr[i]];
      if (tt < bestT) { bestT = tt; best = [...arr]; }
      return;
    }
    for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; perm(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; }
  };
  perm(idx, 0);
  if (!best || !Number.isFinite(bestT)) return null;
  return [first, ...(best as number[]).map((k) => pts[k]), last];
}

/* ------------------------------------------------------------------ plan */
export async function planTrip(input: TripStop[], s: TripSettings, onProgress?: (msg: { phase: "order" | "route"; done: number; total: number }) => void): Promise<TripPlan> {
  let stops = input.map((x) => ({ ...x }));
  if (s.returnToStart && stops.length >= 2) stops.push({ ...stops[0], id: stops[0].id + "-back", stay: 0 });
  let reordered = false;
  if (s.bestOrder) {
    const o = await bestOrder(stops, s, (done, total) => onProgress?.({ phase: "order", done, total }));
    if (o) { reordered = o.some((x, i) => x.id !== stops[i].id); stops = o; }
  }
  const hops: Hop[] = [];
  let clock = s.leaveAt;
  let failed: TripPlan["failed"];
  for (let i = 0; i < stops.length - 1; i++) {
    onProgress?.({ phase: "route", done: i, total: stops.length - 1 });
    const a = stops[i], b = stops[i + 1];
    if (i > 0) clock += a.stay * 60000;
    let tide: "low" | "high" = s.tide === "auto" ? "low" : s.tide, tideSource: Hop["tideSource"] = s.tide === "auto" ? "default" : "chosen", tideH: number | undefined;
    if (s.tide === "auto" && s.mode !== "walk") {
      const tt = await tideAt([a.lon, a.lat], clock);
      if (tt) { tide = tt.tide; tideSource = "forecast"; tideH = tt.h; }
    }
    const res = await planRoute({ origin: [a.lon, a.lat], dest: [b.lon, b.lat], mode: s.mode, tide, vessel: s.vessel, prefer: s.prefer, alternatives: false }).catch((e: Error) => ({ status: "no_route" as const, routes: [], notes: [], reason: e.message }));
    if (res.status !== "ok" || !res.routes[0]) { failed = { hop: i, reason: res.reason }; break; }
    const r = res.routes[0];
    const moving = r.legs.reduce((x, l) => x + l.min, 0);
    const gap = r.legs.length > 1 ? Math.max(0, (r.min - moving) / (r.legs.length - 1)) : 0;
    let t = clock;
    const legs: TripLeg[] = [];
    for (let k = 0; k < r.legs.length; k++) {
      const l = r.legs[k];
      if (k > 0) t += gap * 60000;
      const t0 = t, t1 = t + l.min * 60000;
      t = t1;
      const startLL = l.coords[0] as LL, endLL = l.coords[l.coords.length - 1] as LL;
      const fromName = k === 0 ? a.name : (await ghatNear(startLL)) || legs[k - 1]?.toName || "";
      const toName = k === r.legs.length - 1 ? b.name : (await ghatNear(endLL)) || "";
      const fromNear = !fromName ? await villageNear(startLL) : undefined, toNear = !toName ? await villageNear(endLL) : undefined;
      legs.push({ ...l, t0, t1, fromName, toName, fromNear, toNear, rivers: l.mode === "boat" ? await riversAlong(l.coords as LL[]) : [] });
    }
    for (let k = 0; k < legs.length - 1; k++) if (!legs[k].toName) { legs[k].toName = legs[k + 1].fromName || ""; if (!legs[k].toName) legs[k].toNear = legs[k + 1].fromNear || legs[k].toNear; }
    for (let k = 1; k < legs.length; k++) if (!legs[k].fromName && !legs[k].fromNear) legs[k].fromNear = legs[k - 1].toNear;
    hops.push({ from: i, to: i + 1, tide, tideSource, tideH, depart: clock, arrive: t, km: r.km, min: r.min, legs, notes: res.notes });
    clock = t;
  }
  onProgress?.({ phase: "route", done: stops.length - 1, total: stops.length - 1 });
  const all = hops.flatMap((h) => h.legs);
  const moveMin = all.reduce((x, l) => x + l.min, 0);
  const totalMin = hops.length ? (hops[hops.length - 1].arrive - s.leaveAt) / 60000 : 0;
  const stayMin = stops.slice(1, hops.length).reduce((x, st) => x + st.stay, 0);
  return {
    stops, hops, settings: s, start: s.leaveAt, end: hops.length ? hops[hops.length - 1].arrive : s.leaveAt, created: Date.now(), failed, reordered,
    totals: {
      min: totalMin, moveMin, stayMin, changeMin: Math.max(0, totalMin - moveMin - stayMin), km: all.reduce((x, l) => x + l.km, 0),
      boatKm: all.filter((l) => l.mode === "boat").reduce((x, l) => x + l.km, 0), walkKm: all.filter((l) => l.mode === "walk").reduce((x, l) => x + l.km, 0),
      changes: hops.reduce((x, h) => x + Math.max(0, h.legs.length - 1), 0), creekKm: all.reduce((x, l) => x + (l.creekKm || 0), 0), permitKm: all.reduce((x, l) => x + (l.permitKm || 0), 0),
    },
  };
}

/** Everything the 3D view and the reports need, as one list of legs with stop indices. */
export function allLegs(p: TripPlan) { return p.hops.flatMap((h, hi) => h.legs.map((l, li) => ({ ...l, hop: hi, li }))); }

/* ------------------------------------------------------------------ share links */
export function encodeTrip(stops: TripStop[], s: TripSettings): string {
  const o = { s: stops.map((x) => [x.name, +x.lon.toFixed(5), +x.lat.toFixed(5), x.type, x.ref || "", x.stay]), m: s.mode, v: s.vessel, p: s.prefer, t: s.tide, l: s.leaveAt, b: s.bestOrder ? 1 : 0, r: s.returnToStart ? 1 : 0 };
  return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeTrip(code: string): { stops: TripStop[]; settings: TripSettings } | null {
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, "+").replace(/_/g, "/")))));
    const stops: TripStop[] = (o.s as [string, number, number, string, string, number][]).map((x, i) => ({ id: `s${i}-${Date.now().toString(36)}`, name: x[0], lon: x[1], lat: x[2], type: x[3], ref: x[4] || undefined, stay: x[5] ?? 30 }));
    const d = DEFAULT_SETTINGS();
    return { stops, settings: { ...d, mode: o.m || d.mode, vessel: o.v || d.vessel, prefer: o.p || d.prefer, tide: o.t || d.tide, leaveAt: o.l && o.l > Date.now() - 6 * 3600e3 ? o.l : d.leaveAt, bestOrder: !!o.b, returnToStart: !!o.r } };
  } catch { return null; }
}
