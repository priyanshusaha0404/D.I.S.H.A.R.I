/** Statistics used by the dashboard, profiles and reports. Pure functions, no dependencies. */

export const finite = (a: ArrayLike<number>): number[] => {
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i])) out.push(a[i]);
  return out;
};
export const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

export interface Describe {
  n: number; missing: number; mean: number; median: number; sd: number; variance: number; cv: number; min: number; max: number;
  range: number; q1: number; q3: number; iqr: number; p5: number; p95: number; skewness: number; kurtosis: number; sum: number; se: number;
}
export function describe(values: ArrayLike<number>): Describe {
  const a = finite(values);
  const s = [...a].sort((x, y) => x - y);
  const n = a.length;
  const m = mean(a);
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of a) { const d = v - m; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  const variance = n > 1 ? m2 / (n - 1) : NaN;
  const sd = Math.sqrt(variance);
  const g1 = n > 2 && m2 > 0 ? (Math.sqrt(n * (n - 1)) / (n - 2)) * ((m3 / n) / Math.pow(m2 / n, 1.5)) : NaN;
  const g2 = n > 3 && m2 > 0 ? ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * ((m4 / n) / Math.pow(m2 / n, 2)) - 3 * (n - 1)) : NaN;
  const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75);
  return {
    n, missing: values.length - n, mean: m, median: quantile(s, 0.5), sd, variance, cv: m !== 0 ? (sd / Math.abs(m)) * 100 : NaN,
    min: s[0] ?? NaN, max: s[n - 1] ?? NaN, range: n ? s[n - 1] - s[0] : NaN, q1, q3, iqr: q3 - q1, p5: quantile(s, 0.05), p95: quantile(s, 0.95),
    skewness: g1, kurtosis: g2, sum: sum(a), se: sd / Math.sqrt(n),
  };
}

export function weightedMean(values: ArrayLike<number>, weights: ArrayLike<number>): number {
  let s = 0, w = 0;
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i]) && Number.isFinite(weights[i])) { s += values[i] * weights[i]; w += weights[i]; }
  return w > 0 ? s / w : NaN;
}

/** Histogram with Freedman–Diaconis bins (bounded 6..40) unless a bin count is given. */
export function histogram(values: ArrayLike<number>, bins?: number) {
  const a = finite(values).sort((x, y) => x - y);
  if (!a.length) return { edges: [] as number[], counts: [] as number[] };
  const lo = a[0], hi = a[a.length - 1];
  if (hi === lo) return { edges: [lo, hi], counts: [a.length] };
  let k = bins;
  if (!k) {
    const iqr = quantile(a, 0.75) - quantile(a, 0.25);
    const w = 2 * iqr * Math.pow(a.length, -1 / 3);
    k = w > 0 ? Math.round((hi - lo) / w) : Math.round(Math.sqrt(a.length));
    k = Math.max(6, Math.min(40, k));
  }
  const step = (hi - lo) / k;
  const counts = new Array(k).fill(0);
  for (const v of a) counts[Math.min(k - 1, Math.floor((v - lo) / step))]++;
  return { edges: Array.from({ length: k + 1 }, (_, i) => lo + i * step), counts };
}

/** Box-plot five-number summary with 1.5 IQR whiskers and outliers. */
export function boxStats(values: ArrayLike<number>) {
  const s = finite(values).sort((x, y) => x - y);
  const q1 = quantile(s, 0.25), q2 = quantile(s, 0.5), q3 = quantile(s, 0.75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const inside = s.filter((v) => v >= lo && v <= hi);
  return { box: [inside[0] ?? q1, q1, q2, q3, inside[inside.length - 1] ?? q3], outliers: s.filter((v) => v < lo || v > hi), n: s.length };
}

// ------------------------------------------------------------------ distributions (regularised incomplete beta)
function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const k of c) ser += k / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
export function incBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
/** Two-sided p-value of Student's t. */
export const tPValue = (t: number, df: number) => (df > 0 && Number.isFinite(t) ? incBeta(df / (df + t * t), df / 2, 0.5) : NaN);
/** Upper-tail p-value of F(d1, d2). */
export const fPValue = (f: number, d1: number, d2: number) => (f > 0 ? incBeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2) : 1);
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}
export const zPValue = (z: number) => 2 * (1 - normCdf(Math.abs(z)));

// ------------------------------------------------------------------ correlation and regression
function pairs(x: ArrayLike<number>, y: ArrayLike<number>) {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < x.length; i++) if (Number.isFinite(x[i]) && Number.isFinite(y[i])) { xs.push(x[i]); ys.push(y[i]); }
  return [xs, ys] as const;
}
export function pearson(x: ArrayLike<number>, y: ArrayLike<number>) {
  const [a, b] = pairs(x, y);
  const n = a.length, ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  const r = sab / Math.sqrt(saa * sbb);
  const t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
  return { r, n, p: tPValue(t, n - 2) };
}
function ranks(a: number[]): number[] {
  const idx = a.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
export function spearman(x: ArrayLike<number>, y: ArrayLike<number>) {
  const [a, b] = pairs(x, y);
  const res = pearson(ranks(a), ranks(b));
  return { rho: res.r, n: res.n, p: res.p };
}
export interface Ols { slope: number; intercept: number; r2: number; adjR2: number; n: number; seSlope: number; t: number; p: number; rmse: number; ci: [number, number] }
export function ols(x: ArrayLike<number>, y: ArrayLike<number>): Ols {
  const [a, b] = pairs(x, y);
  const n = a.length, ma = mean(a), mb = mean(b);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = a[i] - ma, dy = b[i] - mb; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const slope = sxy / sxx, intercept = mb - slope * ma;
  let sse = 0;
  for (let i = 0; i < n; i++) { const e = b[i] - (intercept + slope * a[i]); sse += e * e; }
  const r2 = 1 - sse / syy;
  const s2 = sse / (n - 2);
  const se = Math.sqrt(s2 / sxx);
  const t = slope / se;
  const tc = n > 30 ? 1.96 : 2.05;
  return { slope, intercept, r2, adjR2: 1 - (1 - r2) * ((n - 1) / (n - 2)), n, seSlope: se, t, p: tPValue(t, n - 2), rmse: Math.sqrt(sse / n),
    ci: [slope - tc * se, slope + tc * se] };
}
/** One-way ANOVA across groups. */
export function anova(groups: number[][]) {
  const g = groups.map((x) => x.filter(Number.isFinite)).filter((x) => x.length > 0);
  const all = g.flat();
  const N = all.length, k = g.length, gm = mean(all);
  let ssb = 0, ssw = 0;
  for (const x of g) {
    const m = mean(x);
    ssb += x.length * (m - gm) ** 2;
    for (const v of x) ssw += (v - m) ** 2;
  }
  const df1 = k - 1, df2 = N - k;
  const F = (ssb / df1) / (ssw / df2);
  return { F, df1, df2, p: fPValue(F, df1, df2), eta2: ssb / (ssb + ssw), k, N };
}

// ------------------------------------------------------------------ trend test for time series
/** Mann–Kendall trend test (tie-corrected variance) with Sen's slope. */
export function mannKendall(xs: number[], ys: number[]) {
  const p: [number, number][] = [];
  xs.forEach((x, i) => { if (Number.isFinite(ys[i])) p.push([x, ys[i]]); });
  const n = p.length;
  let S = 0;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
    const d = p[j][1] - p[i][1];
    S += d > 0 ? 1 : d < 0 ? -1 : 0;
    if (p[j][0] !== p[i][0]) slopes.push(d / (p[j][0] - p[i][0]));
  }
  const counts = new Map<number, number>();
  for (const [, v] of p) counts.set(v, (counts.get(v) || 0) + 1);
  let tie = 0;
  counts.forEach((t) => { if (t > 1) tie += t * (t - 1) * (2 * t + 5); });
  const varS = (n * (n - 1) * (2 * n + 5) - tie) / 18;
  const z = S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0;
  slopes.sort((a, b) => a - b);
  const sen = quantile(slopes, 0.5);
  const medX = quantile(p.map((q) => q[0]).sort((a, b) => a - b), 0.5), medY = quantile(p.map((q) => q[1]).sort((a, b) => a - b), 0.5);
  const tau = n > 1 ? S / ((n * (n - 1)) / 2) : NaN;
  return { n, S, z, p: n >= 4 ? zPValue(z) : NaN, tau, sen, intercept: medY - sen * medX };
}

// ------------------------------------------------------------------ spatial autocorrelation on the hexagon lattice
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
/** Global Moran's I with row-standardised contiguity weights and a permutation test. */
export function moransI(values: Float32Array, nb: Int32Array[], perms = 499) {
  const idx: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) idx.push(i);
  const pos = new Int32Array(values.length).fill(-1);
  idx.forEach((g, k) => (pos[g] = k));
  const n = idx.length;
  const x = idx.map((g) => values[g]);
  const m = mean(x);
  const z = x.map((v) => v - m);
  const m2 = z.reduce((s, v) => s + v * v, 0) / n;
  const nl = idx.map((g) => Array.from(nb[g]).map((j) => pos[j]).filter((k) => k >= 0));
  const calc = (zz: number[]) => {
    let s = 0, wsum = 0;
    for (let k = 0; k < n; k++) {
      const L = nl[k];
      if (!L.length) continue;
      let lag = 0;
      for (const j of L) lag += zz[j];
      s += zz[k] * (lag / L.length);
      wsum += 1;
    }
    return (n / wsum) * (s / (n * m2));
  };
  const I = calc(z);
  const rnd = seeded(42);
  let ge = 0;
  const sims: number[] = [];
  const zz = [...z];
  for (let p = 0; p < perms; p++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [zz[i], zz[j]] = [zz[j], zz[i]]; }
    const v = calc(zz);
    sims.push(v);
    if (v >= I) ge++;
  }
  const sm = mean(sims), ssd = Math.sqrt(sims.reduce((s, v) => s + (v - sm) ** 2, 0) / (perms - 1));
  return { I, expected: -1 / (n - 1), z: (I - sm) / ssd, p: (Math.min(ge, perms - ge) + 1) / (perms + 1), n };
}

/** Local Moran's I (LISA) with conditional permutations. Cluster codes: 1 HH, 2 LL, 3 LH, 4 HL, 0 not significant, NaN no data. */
export function lisa(values: Float32Array, nb: Int32Array[], alpha = 0.05, perms = 199) {
  const n = values.length;
  const valid: number[] = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(values[i])) valid.push(i);
  const m = mean(valid.map((i) => values[i]));
  const m2 = valid.reduce((s, i) => s + (values[i] - m) ** 2, 0) / valid.length;
  const z = new Float64Array(n).fill(NaN);
  for (const i of valid) z[i] = (values[i] - m) / Math.sqrt(m2);
  const zs = valid.map((i) => z[i]);
  const rnd = seeded(7);
  const out = new Float32Array(n).fill(NaN);
  const Iv = new Float32Array(n).fill(NaN);
  const pv = new Float32Array(n).fill(NaN);
  for (const i of valid) {
    const L = Array.from(nb[i]).filter((j) => Number.isFinite(z[j]));
    if (!L.length) { out[i] = 0; continue; }
    const lag = L.reduce((s, j) => s + z[j], 0) / L.length;
    const I = z[i] * lag;
    let ext = 0;
    for (let p = 0; p < perms; p++) {
      let s = 0;
      for (let k = 0; k < L.length; k++) s += zs[Math.floor(rnd() * zs.length)];
      const Ip = z[i] * (s / L.length);
      if (I >= 0 ? Ip >= I : Ip <= I) ext++;
    }
    const p = (ext + 1) / (perms + 1);
    Iv[i] = I; pv[i] = p;
    out[i] = p > alpha ? 0 : z[i] > 0 && lag > 0 ? 1 : z[i] < 0 && lag < 0 ? 2 : z[i] < 0 && lag > 0 ? 3 : 4;
  }
  return { cluster: out, I: Iv, p: pv };
}

/** Getis–Ord Gi* hot-spot z-scores (binary contiguity incl. the cell itself). Class: ±3 99 %, ±2 95 %, ±1 90 %, 0 n.s. */
export function getisOrd(values: Float32Array, nb: Int32Array[]) {
  const n = values.length;
  const valid: number[] = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(values[i])) valid.push(i);
  const N = valid.length;
  const xm = mean(valid.map((i) => values[i]));
  const S = Math.sqrt(valid.reduce((s, i) => s + values[i] * values[i], 0) / N - xm * xm);
  const z = new Float32Array(n).fill(NaN);
  const cls = new Float32Array(n).fill(NaN);
  for (const i of valid) {
    const L = [i, ...Array.from(nb[i]).filter((j) => Number.isFinite(values[j]))];
    const w = L.length;
    const sx = L.reduce((s, j) => s + values[j], 0);
    const num = sx - xm * w;
    const den = S * Math.sqrt((N * w - w * w) / (N - 1));
    const g = den > 0 ? num / den : 0;
    z[i] = g;
    const a = Math.abs(g);
    cls[i] = (a >= 2.576 ? 3 : a >= 1.96 ? 2 : a >= 1.645 ? 1 : 0) * Math.sign(g);
  }
  return { z, cls };
}

// ------------------------------------------------------------------ classification for choropleths
export type ClassMethod = "quantile" | "equal" | "jenks" | "stddev";
export function classBreaks(values: ArrayLike<number>, k: number, method: ClassMethod): number[] {
  const a = finite(values).sort((x, y) => x - y);
  if (!a.length) return [];
  const lo = a[0], hi = a[a.length - 1];
  if (lo === hi) return [lo, hi];
  if (method === "equal") return Array.from({ length: k + 1 }, (_, i) => lo + ((hi - lo) * i) / k);
  if (method === "quantile") {
    const b = Array.from({ length: k + 1 }, (_, i) => quantile(a, i / k));
    return b.filter((v, i) => i === 0 || v > b[i - 1]);
  }
  if (method === "stddev") {
    const m = mean(a), sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
    const b = [lo];
    for (let s = -2; s <= 2; s++) { const v = m + s * sd * 0.5 * 2; if (v > lo && v < hi) b.push(v); }
    b.push(hi);
    return Array.from(new Set(b)).sort((x, y) => x - y);
  }
  return jenks(a.length > 1500 ? sample(a, 1500) : a, k, lo, hi);
}
function sample(a: number[], m: number): number[] {
  const out: number[] = [];
  const step = a.length / m;
  for (let i = 0; i < m; i++) out.push(a[Math.floor(i * step)]);
  return out;
}
/** Fisher–Jenks natural breaks (exact dynamic programme on the sorted values). */
export function jenks(data: number[], k: number, lo: number, hi: number): number[] {
  const n = data.length;
  k = Math.min(k, n);
  const lower = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  const vari = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(Infinity));
  for (let i = 1; i <= k; i++) { lower[1][i] = 1; vari[1][i] = 0; }
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0, v = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1;
      const val = data[i3 - 1];
      s2 += val * val; s1 += val; w++;
      v = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if (i4 !== 0) for (let j = 2; j <= k; j++) {
        if (vari[l][j] >= v + vari[i4][j - 1]) { lower[l][j] = i3; vari[l][j] = v + vari[i4][j - 1]; }
      }
    }
    lower[l][1] = 1; vari[l][1] = v;
  }
  const breaks = new Array(k + 1);
  breaks[k] = hi; breaks[0] = lo;
  let cnt = k, idx = n;
  while (cnt > 1) {
    const id = lower[idx][cnt] - 2;
    breaks[cnt - 1] = data[Math.max(0, id)];
    idx = lower[idx][cnt] - 1;
    cnt--;
  }
  return Array.from(new Set(breaks)).sort((x, y) => x - y);
}
