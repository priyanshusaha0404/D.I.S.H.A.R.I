/** Small geodesy helpers for trips: distances, bearings, timed polylines and snapping a GPS fix to the route. */
export type LL = [number, number];

const R = 6371008.8, D = Math.PI / 180;
export function metres(a: LL, b: LL): number {
  const dLat = (b[1] - a[1]) * D, dLon = (b[0] - a[0]) * D;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D) * Math.cos(b[1] * D) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
export function bearing(a: LL, b: LL): number {
  const y = Math.sin((b[0] - a[0]) * D) * Math.cos(b[1] * D);
  const x = Math.cos(a[1] * D) * Math.sin(b[1] * D) - Math.sin(a[1] * D) * Math.cos(b[1] * D) * Math.cos((b[0] - a[0]) * D);
  return (Math.atan2(y, x) / D + 360) % 360;
}
/** polygon ring of a circle with radius r metres */
export function ring(c: LL, r: number, n = 64): LL[] {
  const kx = 1 / (111320 * Math.cos(c[1] * D)), out: LL[] = [];
  for (let i = 0; i <= n; i++) { const a = ((i % n) / n) * 2 * Math.PI; out.push([c[0] + Math.cos(a) * r * kx, c[1] + (Math.sin(a) * r) / 110574]); }
  return out;
}
export const circle = (c: LL, r: number): GeoJSON.Feature<GeoJSON.Polygon> => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring(c, r)] } });

/** A trip flattened into one timed polyline (t = trip minutes from departure, m = metres along). */
export interface TimedPt { lon: number; lat: number; t: number; m: number; seg: number }
export interface TimedSeg { i: number; mode: "boat" | "walk" | "wait" | "stay"; t0: number; t1: number; m0: number; m1: number; hop: number; leg: number }

/** position at trip time t (minutes) */
export function at(pts: TimedPt[], t: number): { lon: number; lat: number; i: number; brg: number; m: number } {
  let lo = 0, hi = pts.length - 1;
  if (t <= pts[0].t) return { lon: pts[0].lon, lat: pts[0].lat, i: 0, brg: pts.length > 1 ? bearing([pts[0].lon, pts[0].lat], [pts[1].lon, pts[1].lat]) : 0, m: 0 };
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].t <= t) lo = mid; else hi = mid; }
  const a = pts[lo], b = pts[hi], f = b.t > a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 1;
  return { lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f, i: lo, brg: bearing([a.lon, a.lat], [b.lon, b.lat]), m: a.m + (b.m - a.m) * f };
}

/** Snap a point to the polyline: nearest position, its distance from the line (m) and the trip time there. */
export function snap(pts: TimedPt[], p: LL, hint = 0): { d: number; t: number; m: number; lon: number; lat: number; i: number } {
  const kx = Math.cos(p[1] * D) * 111320, ky = 110574;
  let best = { d: Infinity, t: 0, m: 0, lon: p[0], lat: p[1], i: 0 };
  // search the whole line, preferring segments near the previous match when distances tie
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ax = (a.lon - p[0]) * kx, ay = (a.lat - p[1]) * ky, bx = (b.lon - p[0]) * kx, by = (b.lat - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const f = L2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
    const x = ax + dx * f, y = ay + dy * f, d = Math.hypot(x, y) + (i < hint ? 0.5 : 0);
    if (d < best.d) best = { d, t: a.t + (b.t - a.t) * f, m: a.m + (b.m - a.m) * f, lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f, i };
  }
  return best;
}

export function bboxOf(coords: LL[], pad = 0): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of coords) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a - pad, b - pad, c + pad, d + pad];
}
