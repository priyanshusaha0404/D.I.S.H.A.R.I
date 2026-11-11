/** A planned trip as one timed line (for the 3D trip and live tracking) and as a list of segments
 *  (boat · walk · change at a ghat · time at a place) on the clock. Times are minutes from departure. */
import { metres, type LL, type TimedPt } from "./geo";
import type { TripPlan } from "./plan";

export type SegKind = "boat" | "walk" | "change" | "stay";
export interface TSeg { kind: SegKind; t0: number; t1: number; hop: number; leg: number; stop?: number; m0: number; m1: number }
export interface Timeline {
  start: number;            // epoch ms of departure
  total: number;            // minutes
  metres: number;
  pts: TimedPt[];
  segs: TSeg[];
  arrive: { stop: number; t: number; leave: number }[];   // arrival at every stop after the first (t, leave in trip minutes)
}

export function buildTimeline(p: TripPlan): Timeline {
  const T = (ms: number) => (ms - p.start) / 60000;
  const pts: TimedPt[] = [];
  const segs: TSeg[] = [];
  const arrive: Timeline["arrive"] = [];
  let m = 0, lastT = 0;
  let last: LL = [p.stops[0].lon, p.stops[0].lat];
  pts.push({ lon: last[0], lat: last[1], t: 0, m: 0, seg: 0 });
  const hold = (t1: number, kind: SegKind, hop: number, leg: number, stop?: number) => {
    if (t1 <= lastT + 1e-6) return;
    segs.push({ kind, t0: lastT, t1, hop, leg, stop, m0: m, m1: m });
    pts.push({ lon: last[0], lat: last[1], t: t1, m, seg: segs.length - 1 });
    lastT = t1;
  };
  p.hops.forEach((h, hi) => {
    hold(T(h.depart), "stay", hi, -1, h.from);
    h.legs.forEach((l, li) => {
      hold(T(l.t0), "change", hi, li);
      const cs = l.coords as LL[];
      if (cs.length < 2) return;
      const cum = [0];
      for (let i = 1; i < cs.length; i++) cum.push(cum[i - 1] + metres(cs[i - 1], cs[i]));
      const len = cum[cum.length - 1] || 1;
      const a = T(l.t0), b = Math.max(a + 0.05, T(l.t1));
      segs.push({ kind: l.mode, t0: a, t1: b, hop: hi, leg: li, m0: m, m1: m + len });
      const si = segs.length - 1;
      cs.forEach((c, i) => pts.push({ lon: c[0], lat: c[1], t: a + (cum[i] / len) * (b - a), m: m + cum[i], seg: si }));
      m += len; lastT = b; last = cs[cs.length - 1];
    });
    // the place itself (the route may end at the nearest water or path)
    const to = p.stops[h.to];
    const end: LL = [to.lon, to.lat];
    if (metres(last, end) > 5 && metres(last, end) < 3000) {
      pts.push({ lon: end[0], lat: end[1], t: lastT + 0.01, m: m + metres(last, end), seg: segs.length - 1 });
      m += metres(last, end); last = end; lastT += 0.01;
    }
    const leave = hi + 1 < p.hops.length ? T(p.hops[hi + 1].depart) : lastT;
    arrive.push({ stop: h.to, t: lastT, leave });
  });
  return { start: p.start, total: Math.max(lastT, 0.1), metres: m, pts, segs, arrive };
}

/** the segment at trip time t */
export function segAt(tl: Timeline, t: number): TSeg | undefined {
  let lo = 0, hi = tl.segs.length - 1;
  if (hi < 0) return undefined;
  if (t >= tl.segs[hi].t0) return tl.segs[hi];
  while (lo < hi) { const mid = (lo + hi) >> 1; if (tl.segs[mid].t1 <= t) lo = mid + 1; else hi = mid; }
  return tl.segs[lo];
}

/** minutes of each kind (for "where the time goes") */
export function split(tl: Timeline): Record<SegKind, number> {
  const s: Record<SegKind, number> = { boat: 0, walk: 0, change: 0, stay: 0 };
  for (const g of tl.segs) s[g.kind] += g.t1 - g.t0;
  return s;
}
