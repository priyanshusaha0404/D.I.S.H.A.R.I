"use client";
/** Trip report charts, drawn on canvas at 2× so they print sharply and open in Word: the day on a timeline, where the
 *  time goes, the tide along the trip and every hop's distance. Colours follow the jobs they do — the travel mode
 *  (boat, walking, changing, at places) and the tide state — with a legend on every multi-series chart. */
import type { Lang } from "../i18n";
import type { TripPlan } from "./plan";
import type { Timeline, SegKind } from "./timeline";
import { split } from "./timeline";
import { clock, MODE_COLOUR, tw } from "./text";
import { fmt, fmtDuration, fmtKm } from "../format";
import type { SeaLevel } from "../data/weather";

const INK = "#16201c", INK2 = "#3b4640", MUTED = "#5b6560", GRID = "#e6e2d6", BASE = "#c9c3b4";
const TIDE = { high: "#2a78d6", low: "#eda100" };
export interface Png { src: string; w: number; h: number }

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w * 2; c.height = h * 2;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
  return [c, g];
}
const font = (g: CanvasRenderingContext2D, size: number, weight = 500) => { g.font = `${weight} ${size}px "Inter Variable", "Noto Sans Bengali", Arial, sans-serif`; };
function fit(g: CanvasRenderingContext2D, s: string, w: number) {
  if (g.measureText(s).width <= w) return s;
  let t = s;
  while (t.length > 1 && g.measureText(t + "…").width > w) t = t.slice(0, -1);
  return t + "…";
}
function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function hatch(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  if (w < 2) return;
  g.save(); rrect(g, x, y, w, h, Math.min(4, h / 3)); g.clip();
  g.fillStyle = "#f1eee6"; g.fillRect(x, y, w, h);
  g.strokeStyle = MODE_COLOUR.change; g.lineWidth = 1.5;
  for (let k = -h; k < w + h; k += 6) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); g.stroke(); }
  g.restore();
}
function dots(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string) {
  g.save(); rrect(g, x, y, w, h, Math.min(4, h / 3)); g.clip();
  g.fillStyle = colour; g.fillRect(x, y, w, h);
  g.fillStyle = "rgba(255,255,255,0.55)";
  for (let xx = x + 3; xx < x + w; xx += 6) for (let yy = y + 3; yy < y + h; yy += 6) { g.beginPath(); g.arc(xx, yy, 1.1, 0, 7); g.fill(); }
  g.restore();
}
const LABEL: Record<SegKind, "s_boat" | "s_walk" | "s_change" | "s_stay"> = { boat: "s_boat", walk: "s_walk", change: "s_change", stay: "s_stay" };
const swatch = (g: CanvasRenderingContext2D, k: SegKind, x: number, y: number) => {
  if (k === "change") hatch(g, x, y, 12, 12);
  else if (k === "walk") dots(g, x, y, 12, 12, MODE_COLOUR.walk);
  else { g.fillStyle = MODE_COLOUR[k]; rrect(g, x, y, 12, 12, 3); g.fill(); }
};
function hourStep(totalMin: number) { return totalMin <= 150 ? 30 : totalMin <= 600 ? 60 : totalMin <= 1200 ? 120 : 240; }

/** the day on one strip: moving (by mode, changes hatched) and time at each place (numbered) */
export function timelineChart(p: TripPlan, tl: Timeline, lang: Lang): Png {
  const W = 760, H = 186, L = 104, R = 16;
  const [c, g] = canvas(W, H);
  const X = (t: number) => L + (t / tl.total) * (W - L - R);
  // clock grid
  const step = hourStep(tl.total);
  const first = Math.ceil(tl.start / (step * 60000)) * step * 60000;
  font(g, 10.5, 500); g.textAlign = "center";
  for (let ms = first; ms <= tl.start + tl.total * 60000 + 1; ms += step * 60000) {
    const x = X((ms - tl.start) / 60000);
    g.strokeStyle = GRID; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 16); g.lineTo(x, 112); g.stroke();
    g.fillStyle = MUTED; g.fillText(clock(ms, lang), x, 128);
  }
  g.strokeStyle = BASE; g.beginPath(); g.moveTo(L, 112); g.lineTo(W - R, 112); g.stroke();
  g.textAlign = "left";
  font(g, 11.5, 650); g.fillStyle = INK2;
  g.fillText(fit(g, tw(lang, "r_lane_move"), L - 12), 8, 44);
  g.fillText(fit(g, tw(lang, "r_lane_stay"), L - 12), 8, 90);
  const used = new Set<SegKind>();
  for (const s of tl.segs) {
    const x = X(s.t0) + 1, w = Math.max(2, X(s.t1) - X(s.t0) - 2);
    used.add(s.kind);
    if (s.kind === "stay") {
      g.fillStyle = MODE_COLOUR.stay; rrect(g, x, 76, w, 24, 4); g.fill();
      if (w > 16 && s.stop !== undefined) { font(g, 11, 750); g.fillStyle = "#fff"; g.textAlign = "center"; g.fillText(fmt(s.stop, lang, 0), x + w / 2, 92.5); g.textAlign = "left"; }
    } else if (s.kind === "change") hatch(g, x, 30, w, 24);
    else if (s.kind === "walk") dots(g, x, 30, w, 24, MODE_COLOUR.walk);
    else { g.fillStyle = MODE_COLOUR.boat; rrect(g, x, 30, w, 24, 4); g.fill(); }
  }
  // places on the clock
  const marks = [{ t: 0, stop: 0 }, ...tl.arrive];
  marks.forEach((a, k) => {
    const x = X(a.t);
    g.fillStyle = k === 0 ? "#123D32" : k === marks.length - 1 ? "#e34948" : "#eb6834";
    g.beginPath(); g.arc(x, 66, 3.6, 0, 7); g.fill();
  });
  // legend
  let lx = L; font(g, 11.5, 550);
  (["boat", "walk", "change", "stay"] as SegKind[]).filter((k) => used.has(k)).forEach((k) => {
    swatch(g, k, lx, 150);
    const label = tw(lang, LABEL[k]);
    g.fillStyle = INK2; g.fillText(label, lx + 18, 160.5);
    lx += g.measureText(label).width + 40;
  });
  return { src: c.toDataURL("image/png"), w: W, h: H };
}

/** where the time goes: one stacked bar and a value legend */
export function splitChart(tl: Timeline, lang: Lang): Png & { share: Record<SegKind, number> } {
  const sp = split(tl);
  const keys = (["boat", "walk", "change", "stay"] as SegKind[]).filter((k) => sp[k] > 0.5);
  const total = keys.reduce((a, k) => a + sp[k], 0) || 1;
  const rows = Math.ceil(keys.length / 2);
  const W = 760, H = 48 + rows * 24 + 4;
  const [c, g] = canvas(W, H);
  let x = 8;
  keys.forEach((k, i) => {
    const w = ((W - 16) * sp[k]) / total;
    const r = i === 0 || i === keys.length - 1 ? 5 : 0;
    const xx = x + (i ? 1 : 0), ww = Math.max(1, w - (i ? 2 : 1));
    if (k === "change") hatch(g, xx, 8, ww, 24);
    else if (k === "walk") dots(g, xx, 8, ww, 24, MODE_COLOUR.walk);
    else { g.fillStyle = MODE_COLOUR[k]; rrect(g, xx, 8, ww, 24, r); g.fill(); }
    x += w;
  });
  font(g, 12, 550);
  keys.forEach((k, i) => {
    const col = i % 2, row = Math.floor(i / 2), lx = 8 + col * 372, ly = 56 + row * 24;
    swatch(g, k, lx, ly - 10);
    const label = tw(lang, LABEL[k]);
    g.fillStyle = INK; g.fillText(label, lx + 18, ly);
    const w0 = g.measureText(label).width;
    g.fillStyle = MUTED; g.fillText(`${fmtDuration(sp[k], lang)} · ${fmt(Math.round((100 * sp[k]) / total), lang, 0)}%`, lx + 26 + w0, ly);
  });
  const share = { boat: sp.boat / total, walk: sp.walk / total, change: sp.change / total, stay: sp.stay / total };
  return { src: c.toDataURL("image/png"), w: W, h: H, share };
}

/** the sea-level forecast across the trip, with each hop's departure on it */
export function tideChart(sea: SeaLevel | null, p: TripPlan, lang: Lang): Png | null {
  if (!sea || sea.series.length < 6) return null;
  const pts = sea.series.map((s) => ({ t: new Date(s.time.length <= 16 ? `${s.time}:00+05:30` : s.time).getTime(), h: s.h }));
  const a = Math.max(pts[0].t, p.start - 2 * 3600e3), b = Math.min(pts[pts.length - 1].t, p.end + 2 * 3600e3);
  if (b - a < 2 * 3600e3 || p.start > pts[pts.length - 1].t || p.end < pts[0].t) return null;
  const inRange = pts.filter((q) => q.t >= a - 3600e3 && q.t <= b + 3600e3);
  const hs = inRange.map((q) => q.h);
  const lo = Math.min(...hs), hi = Math.max(...hs), pad = Math.max(0.05, (hi - lo) * 0.12);
  const y0 = lo - pad, y1 = hi + pad;
  const sorted = sea.series.map((s) => s.h).sort((x, y) => x - y);
  const med = sorted[Math.floor(sorted.length / 2)];
  const W = 760, H = 230, L = 50, R = 18, T = 16, B = 58;
  const [c, g] = canvas(W, H);
  const X = (t: number) => L + ((t - a) / (b - a)) * (W - L - R), Y = (h: number) => T + (1 - (h - y0) / (y1 - y0)) * (H - T - B);
  const hAt = (t: number) => { let i = pts.findIndex((q) => q.t >= t); if (i <= 0) i = 1; const f = (t - pts[i - 1].t) / (pts[i].t - pts[i - 1].t || 1); return pts[i - 1].h + (pts[i].h - pts[i - 1].h) * Math.max(0, Math.min(1, f)); };
  // y grid
  font(g, 10.5, 500);
  for (let k = 0; k <= 4; k++) {
    const v = y0 + ((y1 - y0) * k) / 4, y = Y(v);
    g.strokeStyle = k ? GRID : BASE; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
    g.fillStyle = MUTED; g.textAlign = "right"; g.fillText(`${fmt(v, lang, 1)} ${lang === "bn" ? "মি" : "m"}`, L - 6, y + 4);
  }
  // x labels
  g.textAlign = "center";
  const step = (b - a) / 3600e3 > 14 ? 3 : 2;
  for (let t = Math.ceil(a / (step * 3600e3)) * step * 3600e3; t <= b; t += step * 3600e3) g.fillText(clock(t, lang), X(t), H - B + 16);
  // the trip, shaded
  g.fillStyle = "rgba(42,120,214,0.07)"; g.fillRect(X(Math.max(a, p.start)), T, X(Math.min(b, p.end)) - X(Math.max(a, p.start)), H - T - B);
  // median
  g.setLineDash([4, 4]); g.strokeStyle = MUTED; g.beginPath(); g.moveTo(L, Y(med)); g.lineTo(W - R, Y(med)); g.stroke(); g.setLineDash([]);
  g.textAlign = "left"; g.fillStyle = MUTED; font(g, 10, 600); g.fillText(lang === "bn" ? "মধ্যমা — এর উপরে জোয়ার" : "median — above it is high tide", L + 6, Y(med) - 5);
  // curve: 2px line with a light wash
  const curve: [number, number][] = [];
  for (let t = a; t <= b; t += 10 * 60000) curve.push([X(t), Y(hAt(t))]);
  g.beginPath(); curve.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.lineTo(X(b), Y(y0)); g.lineTo(X(a), Y(y0)); g.closePath();
  g.fillStyle = "rgba(42,120,214,0.10)"; g.fill();
  g.beginPath(); curve.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = "#2a78d6"; g.lineWidth = 2; g.lineJoin = "round"; g.stroke();
  // departures
  p.hops.forEach((h, k) => {
    if (h.depart < a || h.depart > b || !h.legs.some((l) => l.mode === "boat")) return;
    const x = X(h.depart), y = Y(hAt(h.depart));
    g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, 7.5, 0, 7); g.fill();
    g.fillStyle = TIDE[h.tide]; g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fill();
    font(g, 11, 750); g.fillStyle = INK; g.textAlign = "center"; g.fillText(fmt(k + 1, lang, 0), x, y - 12);
  });
  // legend
  g.textAlign = "left"; font(g, 11.5, 550);
  let lx = L;
  const items: [string, string][] = [["#2a78d6", lang === "bn" ? "সমুদ্রতল (পূর্বাভাস)" : "Sea level (forecast)"], [TIDE.high, `${tw(lang, "high")} — ${lang === "bn" ? "রওনা" : "departure"}`], [TIDE.low, `${tw(lang, "low")} — ${lang === "bn" ? "রওনা" : "departure"}`]];
  items.forEach(([col, label], i) => {
    if (i === 0) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(lx, H - 18); g.lineTo(lx + 16, H - 18); g.stroke(); }
    else { g.fillStyle = col; g.beginPath(); g.arc(lx + 6, H - 18, 5, 0, 7); g.fill(); }
    g.fillStyle = INK2; g.fillText(label, lx + 22, H - 14);
    lx += g.measureText(label).width + 46;
  });
  return { src: c.toDataURL("image/png"), w: W, h: H };
}

/** the tide used for each hop, on the clock (when there is no forecast curve) */
export function tideStrip(p: TripPlan, tl: Timeline, lang: Lang): Png {
  const W = 760, H = 96, L = 104, R = 16;
  const [c, g] = canvas(W, H);
  const X = (ms: number) => L + ((ms - p.start) / 60000 / tl.total) * (W - L - R);
  font(g, 11.5, 650); g.fillStyle = INK2; g.fillText(tw(lang, "r_th_tide"), 8, 34);
  p.hops.forEach((h, k) => {
    const x = X(h.depart) + 1, w = Math.max(2, X(h.arrive) - X(h.depart) - 2);
    g.fillStyle = TIDE[h.tide]; rrect(g, x, 18, w, 24, 4); g.fill();
    font(g, 11, 700); g.fillStyle = "#fff"; g.textAlign = "center";
    if (w > 18) g.fillText(fmt(k + 1, lang, 0), x + w / 2, 34.5);
    g.textAlign = "left";
  });
  font(g, 11.5, 550); let lx = L;
  (["high", "low"] as const).forEach((k) => {
    g.fillStyle = TIDE[k]; rrect(g, lx, 66, 12, 12, 3); g.fill();
    const label = tw(lang, k); g.fillStyle = INK2; g.fillText(label, lx + 18, 76.5); lx += g.measureText(label).width + 40;
  });
  return { src: c.toDataURL("image/png"), w: W, h: H };
}

/** every hop: distance by boat and on foot */
export function hopsChart(p: TripPlan, lang: Lang): Png {
  const rows = p.hops.map((h, k) => ({ k, label: `${fmt(k + 1, lang, 0)}. ${p.stops[h.from].name} → ${p.stops[h.to].name}`,
    boat: h.legs.filter((l) => l.mode === "boat").reduce((a, l) => a + l.km, 0), walk: h.legs.filter((l) => l.mode === "walk").reduce((a, l) => a + l.km, 0), min: h.min, km: h.km }));
  const rh = 28, W = 760, L = 250, R = 150, top = 24;
  const H = top + rows.length * rh + 44;
  const [c, g] = canvas(W, H);
  const max = Math.max(1, ...rows.map((r) => r.boat + r.walk));
  const nice = (v: number) => { const p10 = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map((m) => m * p10).find((m) => m >= v) || v; };
  const top_ = nice(max);
  const X = (v: number) => L + (v / top_) * (W - L - R);
  font(g, 10.5, 500);
  for (let k = 0; k <= 4; k++) {
    const v = (top_ * k) / 4, x = X(v);
    g.strokeStyle = k ? GRID : BASE; g.lineWidth = 1; g.beginPath(); g.moveTo(x, top - 6); g.lineTo(x, top + rows.length * rh); g.stroke();
    g.fillStyle = MUTED; g.textAlign = "center"; g.fillText(`${fmt(v, lang, 1)} ${lang === "bn" ? "কিমি" : "km"}`, x, 12);
  }
  g.textAlign = "left";
  rows.forEach((r, i) => {
    const y = top + i * rh;
    font(g, 11.5, 600); g.fillStyle = INK; g.fillText(fit(g, r.label, L - 16), 6, y + 15);
    let x = L;
    if (r.boat > 0) { const w = X(r.boat) - L; g.fillStyle = MODE_COLOUR.boat; rrect(g, x, y + 3, Math.max(3, w - (r.walk > 0 ? 1 : 0)), 16, 4); g.fill(); x += w; }
    if (r.walk > 0) { const w = X(r.walk) - L; dots(g, x + (r.boat > 0 ? 1 : 0), y + 3, Math.max(3, w - (r.boat > 0 ? 1 : 0)), 16, MODE_COLOUR.walk); x += w; }
    font(g, 11, 600); g.fillStyle = INK2; g.fillText(`${fmtKm(r.km * 1000, lang)} · ${fmtDuration(r.min, lang)}`, x + 8, y + 15);
  });
  font(g, 11.5, 550); let lx = L;
  (["boat", "walk"] as SegKind[]).forEach((k) => {
    if (!rows.some((r) => (k === "boat" ? r.boat : r.walk) > 0)) return;
    swatch(g, k, lx, H - 24);
    const label = tw(lang, LABEL[k]); g.fillStyle = INK2; g.fillText(label, lx + 18, H - 13.5); lx += g.measureText(label).width + 40;
  });
  return { src: c.toDataURL("image/png"), w: W, h: H };
}
