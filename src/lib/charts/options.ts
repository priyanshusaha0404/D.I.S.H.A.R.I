/** Chart option builders: one visual system for every chart (fixed categorical order, one axis, recessive grid,
 *  thin marks, legends for two or more series, tooltips on every mark). */
import { SERIES_DARK, SERIES_LIGHT } from "../symbology";

export interface Theme { dark: boolean; font?: string }
type Opt = Record<string, unknown>;

export function chrome(th: Theme) {
  return th.dark
    ? { surface: "#1a1a19", ink: "#f0efec", ink2: "#c3c2b7", muted: "#898781", grid: "#2c2c2a", axis: "#383835", series: SERIES_DARK, mid: "#383835" }
    : { surface: "#fcfcfb", ink: "#0b0b0b", ink2: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7", series: SERIES_LIGHT, mid: "#f0efec" };
}
const FONT = "'Inter Variable', 'Noto Sans Bengali', system-ui, sans-serif";

function base(th: Theme, opts: { legend?: boolean; bottom?: number; left?: number } = {}): Opt {
  const c = chrome(th);
  return {
    backgroundColor: "transparent",
    textStyle: { fontFamily: th.font || FONT, color: c.ink2 },
    color: c.series,
    grid: { left: opts.left ?? 56, right: 18, top: opts.legend ? 44 : 30, bottom: opts.bottom ?? 36, containLabel: false },
    tooltip: { trigger: "axis", backgroundColor: th.dark ? "#262624" : "#ffffff", borderColor: c.axis, textStyle: { color: c.ink, fontSize: 12 },
      axisPointer: { type: "line", lineStyle: { color: c.muted, width: 1 } }, confine: true },
    legend: opts.legend ? { top: 2, right: 0, icon: "roundRect", itemWidth: 12, itemHeight: 8, textStyle: { color: c.ink2, fontSize: 12 } } : undefined,
    aria: { enabled: true },
  };
}
function axisX(th: Theme, data?: unknown[], name?: string): Opt {
  const c = chrome(th);
  return { type: data ? "category" : "value", data, name, nameLocation: "middle", nameGap: 26, nameTextStyle: { color: c.muted, fontSize: 11 },
    axisLine: { lineStyle: { color: c.axis } }, axisTick: { show: false }, axisLabel: { color: c.muted, fontSize: 11, hideOverlap: true },
    splitLine: { show: !data, lineStyle: { color: c.grid } } };
}
function axisY(th: Theme, name?: string, opts: { min?: number | "dataMin"; max?: number; scale?: boolean } = {}): Opt {
  const c = chrome(th);
  return { type: "value", name, nameLocation: "end", nameTextStyle: { color: c.muted, fontSize: 11, align: "left" }, scale: opts.scale, min: opts.min, max: opts.max,
    axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: c.muted, fontSize: 11 }, splitLine: { lineStyle: { color: c.grid } } };
}

/** Lines over a shared x axis; optional linear trend drawn as a dashed line in the same colour. */
export function lineOption(th: Theme, p: { x: (string | number)[]; series: { name: string; data: number[]; trend?: number[] }[]; unit?: string; yScale?: boolean; area?: boolean }): Opt {
  const c = chrome(th);
  const many = p.series.length > 1;
  const s: Opt[] = [];
  p.series.forEach((se, k) => {
    const col = c.series[k % c.series.length];
    s.push({ name: se.name, type: "line", data: se.data.map((v) => (Number.isFinite(v) ? v : null)), showSymbol: p.x.length <= 30, symbolSize: 6,
      lineStyle: { width: 2, color: col }, itemStyle: { color: col, borderColor: c.surface, borderWidth: 1.5 }, connectNulls: false,
      areaStyle: p.area && !many ? { color: col, opacity: 0.08 } : undefined, endLabel: many && p.series.length <= 4 ? { show: true, formatter: "{a}", color: c.ink2, fontSize: 11 } : undefined });
    if (se.trend) s.push({ name: `${se.name} — trend`, type: "line", data: se.trend, showSymbol: false, lineStyle: { width: 1.5, type: "dashed", color: col },
      itemStyle: { color: col }, tooltip: { show: false }, silent: true });
  });
  return { ...base(th, { legend: many, bottom: 30 }), grid: { left: 56, right: many && p.series.length <= 4 ? 90 : 18, top: many ? 44 : 30, bottom: 30 },
    xAxis: { ...axisX(th, p.x), boundaryGap: false }, yAxis: axisY(th, p.unit, { scale: p.yScale ?? true }), series: s };
}

/** Bars (vertical, or horizontal for long category names). */
export function barOption(th: Theme, p: { categories: string[]; series: { name: string; data: number[]; colour?: string }[]; unit?: string; horizontal?: boolean; stack?: boolean; colours?: string[] }): Opt {
  const c = chrome(th);
  const many = p.series.length > 1;
  const series = p.series.map((se, k) => ({
    name: se.name, type: "bar", data: se.data.map((v, j) => ({ value: Number.isFinite(v) ? v : null, itemStyle: p.colours ? { color: p.colours[j] } : undefined })),
    stack: p.stack ? "s" : undefined, barMaxWidth: p.horizontal ? 18 : 28, barGap: "20%",
    itemStyle: { color: se.colour || c.series[k % c.series.length], borderRadius: p.stack ? 0 : p.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
      borderColor: p.stack ? c.surface : undefined, borderWidth: p.stack ? 1 : 0 },
  }));
  const cat = { ...axisX(th, p.categories), axisLabel: { color: c.muted, fontSize: 11, interval: 0, width: p.horizontal ? 165 : 80, overflow: "truncate", hideOverlap: !p.horizontal, rotate: !p.horizontal && p.categories.length > 8 ? 35 : 0 } };
  const val = axisY(th, p.unit, { scale: false });
  return { ...base(th, { legend: many, bottom: !p.horizontal && p.categories.length > 8 ? 70 : 36, left: p.horizontal ? 176 : 56 }),
    tooltip: { ...(base(th).tooltip as Opt), axisPointer: { type: "shadow" } },
    xAxis: p.horizontal ? { ...val, name: p.unit, nameLocation: "middle", nameGap: 24 } : cat,
    yAxis: p.horizontal ? { ...cat, inverse: true } : val, series };
}

export function histOption(th: Theme, h: { edges: number[]; counts: number[] }, unit: string, fmtv: (v: number) => string): Opt {
  const cats = h.counts.map((_, k) => `${fmtv(h.edges[k])}–${fmtv(h.edges[k + 1])}`);
  const o = barOption(th, { categories: cats, series: [{ name: "n", data: h.counts }] });
  (o.series as Opt[])[0].barCategoryGap = "6%";
  (o.series as Opt[])[0].barMaxWidth = 60;
  (o.xAxis as Opt).name = unit;
  (o.xAxis as Opt).axisLabel = { ...((o.xAxis as Opt).axisLabel as Opt), rotate: 35, hideOverlap: true };
  o.grid = { left: 56, right: 18, top: 18, bottom: 78 };
  return o;
}

export function boxOption(th: Theme, groups: { name: string; box: [number, number, number, number, number]; n: number }[], unit: string): Opt {
  const c = chrome(th);
  return { ...base(th, { bottom: 70 }), tooltip: { trigger: "item", confine: true },
    xAxis: { ...axisX(th, groups.map((g) => g.name)), axisLabel: { color: c.muted, fontSize: 11, rotate: groups.length > 6 ? 35 : 0, interval: 0 } },
    yAxis: axisY(th, unit, { scale: true }),
    series: [{ type: "boxplot", data: groups.map((g) => g.box), itemStyle: { color: th.dark ? "#184f95" : "#cde2fb", borderColor: c.series[0], borderWidth: 1.5 } }] };
}

export function scatterOption(th: Theme, p: { pts: [number, number][]; xName: string; yName: string; fit?: { slope: number; intercept: number }; colours?: string[] }): Opt {
  const c = chrome(th);
  const xs = p.pts.map((q) => q[0]);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const series: Opt[] = [{ type: "scatter", data: p.pts, symbolSize: 5, itemStyle: { color: c.series[0], opacity: 0.55 } }];
  if (p.fit) series.push({ type: "line", data: [[lo, p.fit.intercept + p.fit.slope * lo], [hi, p.fit.intercept + p.fit.slope * hi]], showSymbol: false,
    lineStyle: { color: c.series[1], width: 2 }, tooltip: { show: false }, silent: true });
  return { ...base(th, { bottom: 44 }), tooltip: { trigger: "item", confine: true },
    xAxis: { ...axisX(th, undefined, p.xName), scale: true, nameGap: 28 }, yAxis: { ...axisY(th, p.yName, { scale: true }) }, series };
}

/** Correlation matrix: diverging blue (negative) – grey (0) – red (positive). */
export function heatmapOption(th: Theme, labels: string[], m: number[][]): Opt {
  const c = chrome(th);
  const data: [number, number, number | null][] = [];
  m.forEach((r, i) => r.forEach((v, j) => data.push([j, i, Number.isFinite(v) ? +v.toFixed(2) : null])));
  return { ...base(th), tooltip: { trigger: "item", confine: true },
    grid: { left: 150, right: 70, top: 10, bottom: 120 },
    xAxis: { type: "category", data: labels, axisLabel: { rotate: 45, color: c.muted, fontSize: 10, width: 110, overflow: "truncate", interval: 0 }, axisTick: { show: false }, axisLine: { show: false } },
    yAxis: { type: "category", data: labels, inverse: true, axisLabel: { color: c.muted, fontSize: 10, width: 140, overflow: "truncate", interval: 0 }, axisTick: { show: false }, axisLine: { show: false } },
    visualMap: { min: -1, max: 1, calculable: true, orient: "vertical", right: 0, top: "middle", itemHeight: 140, textStyle: { color: c.muted },
      inRange: { color: ["#184f95", "#3987e5", "#9ec5f4", c.mid, "#f4b0a6", "#e35f55", "#9c2724"] } },
    series: [{ type: "heatmap", data, label: { show: labels.length <= 10, fontSize: 10, color: c.ink }, itemStyle: { borderColor: c.surface, borderWidth: 2 } }] };
}

/** One 100 % stacked bar per category (composition), e.g. land-cover shares by block. */
export function shareOption(th: Theme, categories: string[], parts: { name: string; data: number[]; colour: string }[]): Opt {
  const o = barOption(th, { categories, series: parts.map((p) => ({ name: p.name, data: p.data, colour: p.colour })), unit: "%", horizontal: true, stack: true });
  (o.xAxis as Opt).max = 100;
  o.legend = { ...(base(th, { legend: true }).legend as Opt), type: "scroll" };
  o.grid = { left: 140, right: 18, top: 40, bottom: 34 };
  return o;
}

export function donutOption(th: Theme, parts: { name: string; value: number; colour: string }[]): Opt {
  const c = chrome(th);
  return { ...base(th), tooltip: { trigger: "item", confine: true, valueFormatter: (v: number) => v?.toFixed?.(1) },
    legend: { orient: "vertical", right: 0, top: "middle", icon: "roundRect", itemWidth: 12, itemHeight: 8, textStyle: { color: c.ink2, fontSize: 12 } },
    series: [{ type: "pie", radius: ["52%", "78%"], center: ["32%", "50%"], avoidLabelOverlap: true, label: { show: false },
      itemStyle: { borderColor: c.surface, borderWidth: 2 }, data: parts.map((p) => ({ name: p.name, value: p.value, itemStyle: { color: p.colour } })) }] };
}
