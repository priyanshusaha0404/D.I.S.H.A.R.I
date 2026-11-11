/** Colour ramps, classification and MapLibre paint expressions for hexagon layers.
 *  Sequential ramps are one hue light → dark; diverging ramps are two hues with a neutral grey midpoint. */
import { classBreaks } from "./data/stats";
import type { ClassItem, VariableDef } from "./data/catalog";
import { fmt } from "./format";
import type { Lang } from "./i18n";

export type Method = "quantile" | "equal" | "jenks" | "stddev";
export interface Symbology { method: Method; k: number; reverse: boolean; ramp?: string }

export const RAMPS: Record<string, string[]> = {
  blue: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  green: ["#e2f2dc", "#b9e0ae", "#86c67f", "#55a95c", "#2f8a45", "#176a33", "#0b4a24"],
  orange: ["#fde6d0", "#fbc898", "#f6a462", "#ec7f37", "#d2611a", "#a6480f", "#79340b"],
  brown: ["#f3e9da", "#e3cdab", "#cfae80", "#b78d5a", "#97703f", "#73532d", "#50391f"],
  teal: ["#d4efec", "#a5dcd6", "#71c3bc", "#41a7a0", "#228b85", "#126d6a", "#0a4f4d"],
  purple: ["#ede5f7", "#d5c4ef", "#b99ee3", "#9b79d4", "#7e58bf", "#6340a1", "#472d78"],
  red: ["#fde2de", "#f8b8af", "#f08c7e", "#e35f55", "#c63a35", "#9c2724", "#711b19"],
  gray: ["#f0efec", "#d9d8d2", "#bdbcb4", "#9e9d95", "#7d7c75", "#5c5b55", "#3c3b37"],
  div_green: ["#8c510a", "#bf812d", "#dfc27d", "#f0efec", "#80cdc1", "#35978f", "#01665e"],
  div_blue: ["#9c2724", "#e35f55", "#f4b0a6", "#f0efec", "#9ec5f4", "#3987e5", "#184f95"],
  div_red: ["#184f95", "#3987e5", "#9ec5f4", "#f0efec", "#f4b0a6", "#e35f55", "#9c2724"],
};
/** Default classification: equal steps for 0–1 indices and percentages, natural breaks otherwise. */
export function defaultSymFor(def: VariableDef | undefined): Symbology {
  if (!def) return { method: "quantile", k: 7, reverse: false };
  if (def.kind === "count") return { method: "quantile", k: 5, reverse: false };
  if (def.ramp.startsWith("div_")) return { method: "equal", k: 7, reverse: false };
  if (def.unit === "index 0–1" || (def.unit === "%" && def.max > 50)) return { method: "equal", k: 5, reverse: false };
  return { method: "jenks", k: 6, reverse: false };
}
export const RAMP_NAMES = ["green", "blue", "teal", "orange", "brown", "purple", "red", "gray", "div_green", "div_blue", "div_red"];

/** Ordinal colours for zone and class variables (Low / Medium / High …). */
const PROTECTION = ["#d5ddd8", "#7cc47a", "#176a33"];
export function classColours(def: VariableDef): Record<number, string> {
  const items = def.classes || [];
  if (def.ramp === "protection") return Object.fromEntries(items.map((c, k) => [c.v, c.colour || PROTECTION[k] || "#999"]));
  const r = RAMPS[def.ramp] || RAMPS.green;
  const steps = items.length <= 3 ? [1, 3, 5] : items.length === 4 ? [1, 3, 4, 6] : items.map((_, k) => Math.round((k * 6) / (items.length - 1)));
  return Object.fromEntries(items.map((c, k) => [c.v, c.colour || r[steps[k]] || r[r.length - 1]]));
}

/** Pick n colours evenly from a 7-step ramp. */
export function sampleRamp(name: string, n: number, reverse = false): string[] {
  const r = RAMPS[name] || RAMPS.green;
  const out: string[] = [];
  if (n === 1) out.push(r[4]);
  else for (let k = 0; k < n; k++) out.push(interp(r, k / (n - 1)));
  return reverse ? out.reverse() : out;
}
function interp(r: string[], t: number): string {
  const x = t * (r.length - 1);
  const i = Math.min(r.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexRgb(r[i]), b = hexRgb(r[i + 1]);
  return rgbHex(a.map((v, j) => Math.round(v + (b[j] - v) * f)) as [number, number, number]);
}
export const hexRgb = (h: string): [number, number, number] => {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const rgbHex = (c: [number, number, number]) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

export interface Classified {
  kind: "classes" | "breaks";
  /** class values (zone / class variables) */
  classes?: { v: number; colour: string; label: string }[];
  /** upper-open breaks: colour k applies to [breaks[k], breaks[k+1]) */
  breaks?: number[];
  colours: string[];
  labels: string[];
  /** count variables: zero is drawn transparent */
  hideZero?: boolean;
}

const finiteOf = (v: Float32Array, dropZero = false) => {
  const out: number[] = [];
  for (let i = 0; i < v.length; i++) { const x = v[i]; if (!Number.isNaN(x) && (!dropZero || x > 0)) out.push(x); }
  return out;
};

/** Classify a hexagon variable for display. */
export function classify(def: VariableDef, values: Float32Array, sym: Symbology, lang: Lang): Classified {
  if ((def.kind === "zone" || def.kind === "class") && def.classes?.length) {
    const cc = classColours(def);
    const classes = def.classes.map((c: ClassItem) => ({ v: c.v, colour: cc[c.v], label: lang === "bn" ? c.bn : c.en }));
    return { kind: "classes", classes, colours: classes.map((c) => c.colour), labels: classes.map((c) => c.label) };
  }
  const isCount = def.kind === "count";
  const vals = finiteOf(values, isCount);
  const ramp = sym.ramp || def.ramp || "green";
  const diverging = ramp.startsWith("div_");
  let k = Math.max(2, Math.min(9, sym.k));
  if (!vals.length) return { kind: "breaks", breaks: [0], colours: [sampleRamp(ramp, 1)[0]], labels: ["—"] };
  let breaks: number[];
  if (diverging) {
    // symmetric about zero so the grey middle class means "no change"
    const sorted = [...vals].sort((a, b) => a - b);
    const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
    const m = Math.max(Math.abs(p(0.02)), Math.abs(p(0.98))) || 1;
    if (k % 2 === 0) k += 1;
    const half = (k - 1) / 2;
    const step = m / (half + 0.5);
    breaks = [-Infinity];
    for (let j = -half; j < half; j++) breaks.push((j + 0.5) * step);
  } else {
    const uniq = new Set(vals.map((x) => +x.toFixed(def.digits + 2)));
    if (uniq.size <= k) {
      breaks = [...uniq].sort((a, b) => a - b);
      k = breaks.length;
    } else if (sym.method === "equal" && (def.unit === "%" || def.unit === "index 0–1")) {
      const top = def.unit === "%" ? 100 : 1;
      breaks = Array.from({ length: k }, (_, j) => (top * j) / k);
    } else {
      const b = classBreaks(vals, k, sym.method);
      breaks = [b[0], ...b.slice(1, -1)];
      breaks = breaks.filter((x, j) => j === 0 || x > breaks[j - 1]);
      k = breaks.length;
    }
  }
  const colours = sampleRamp(ramp, k, sym.reverse);
  const d = Math.max(def.digits, 0);
  const max = Math.max(...vals.slice(0, 200000));
  const labels = breaks.map((b, j) => {
    const lo = j === 0 && diverging ? null : b;
    const hi = j + 1 < breaks.length ? breaks[j + 1] : null;
    if (lo === null) return `< ${fmt(hi as number, lang, d)}`;
    if (hi === null) return diverging ? `≥ ${fmt(lo, lang, d)}` : `${fmt(lo, lang, d)} – ${fmt(max, lang, d)}`;
    return `${fmt(lo, lang, d)} – ${fmt(hi, lang, d)}`;
  });
  const hideZero = isCount || (def.unit === "%" && def.min === 0 && !diverging);
  if (hideZero && labels.length && breaks[0] === 0) labels[0] = labels[0].replace(/^0 /, "> 0 ");
  return { kind: "breaks", breaks, colours, labels, hideZero };
}

/** MapLibre fill-color expression reading a feature-state key. */
export function fillExpression(c: Classified, stateKey: string): unknown {
  const st = ["feature-state", stateKey];
  const has = ["==", ["typeof", st], "number"];
  if (c.kind === "classes" && c.classes) {
    const match: unknown[] = ["match", ["round", st]];
    for (const cl of c.classes) match.push(cl.v, cl.colour);
    match.push("rgba(0,0,0,0)");
    return ["case", has, match, "rgba(0,0,0,0)"];
  }
  const b = c.breaks || [0];
  const step: unknown[] = ["step", st, c.colours[0]];
  for (let j = 1; j < b.length; j++) step.push(b[j], c.colours[j]);
  if (c.hideZero) return ["case", ["all", has, [">", st, 0]], step, "rgba(0,0,0,0)"];
  return ["case", has, step, "rgba(0,0,0,0)"];
}

/** Colour of one value under a classification (for charts, reports and exports). */
export function colourOf(c: Classified, v: number): string | null {
  if (Number.isNaN(v)) return null;
  if (c.kind === "classes") return c.classes?.find((x) => x.v === Math.round(v))?.colour ?? null;
  if (c.hideZero && v <= 0) return null;
  const b = c.breaks || [0];
  let j = 0;
  while (j + 1 < b.length && v >= b[j + 1]) j++;
  return c.colours[j];
}

/** Categorical slots for charts (fixed order, never cycled). */
export const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
