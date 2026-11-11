"use client";
/** Map export: the current view composed with title, legend, scale bar, north arrow and credits (PNG or PDF). */
import { getMap, getState } from "./store";
import { legendFor, type LegendDesc } from "./legend";
import { basemapById } from "./basemaps";
import { hexStore } from "../data/hex";
import { loadRasters } from "../data/catalog";
import type { Lang } from "../i18n";

export function captureMap(): Promise<HTMLCanvasElement> {
  const m = getMap();
  if (!m) return Promise.reject(new Error("Map not ready"));
  return new Promise((ok, err) => {
    m.once("render", () => {
      try {
        const src = m.getCanvas();
        const c = document.createElement("canvas");
        c.width = src.width; c.height = src.height;
        c.getContext("2d")!.drawImage(src, 0, 0);
        ok(c);
      } catch (e) { err(e); }
    });
    m.triggerRepaint();
  });
}

export async function activeLegends(lang: Lang): Promise<LegendDesc[]> {
  const [hx, ras] = await Promise.all([hexStore(), loadRasters()]);
  return getState().layers.filter((l) => l.visible).map((l) => legendFor(l, hx, ras, lang)).filter((d): d is LegendDesc => !!d).slice(0, 5);
}

function niceScale(mPerPx: number, maxPx: number) {
  const maxM = mPerPx * maxPx;
  const p = Math.pow(10, Math.floor(Math.log10(maxM)));
  const n = [1, 2, 5, 10].map((k) => k * p).filter((v) => v <= maxM).pop() || p;
  return { m: n, px: n / mPerPx };
}

/** Compose a print-ready map sheet on a canvas. */
export async function composeMap(opts: { title: string; legend: boolean; lang: Lang; dark?: boolean }): Promise<HTMLCanvasElement> {
  const m = getMap();
  if (!m) throw new Error("Map not ready");
  await document.fonts?.ready;
  const shot = await captureMap();
  const dpr = shot.width / m.getCanvas().clientWidth;
  const legends = opts.legend ? await activeLegends(opts.lang) : [];
  const W = shot.width, headH = Math.round(64 * dpr), footH = Math.round(34 * dpr);
  const c = document.createElement("canvas");
  c.width = W; c.height = shot.height + headH + footH;
  const g = c.getContext("2d")!;
  const ink = "#16201c", muted = "#5b6560";
  const font = (w: number, px: number) => `${w} ${Math.round(px * dpr)}px "Inter Variable", "Noto Sans Bengali", system-ui, sans-serif`;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
  // header
  g.fillStyle = "#123D32"; g.fillRect(0, 0, W, headH);
  g.fillStyle = "#F6F5EF"; g.font = font(700, 22); g.textBaseline = "middle";
  g.fillText(opts.title, 18 * dpr, headH * 0.42);
  g.font = font(500, 12); g.fillStyle = "#cfe3d8";
  const ctr = m.getCenter();
  g.fillText(`D.I.S.H.A.R.I · ${opts.lang === "bn" ? "সুন্দরবন ওয়েবজিআইএস" : "Sundarbans WebGIS"} · ${new Date().toLocaleDateString(opts.lang === "bn" ? "bn-IN" : "en-IN", { dateStyle: "long" })}`, 18 * dpr, headH * 0.78);
  // map
  g.drawImage(shot, 0, headH);
  g.strokeStyle = "#16201c"; g.lineWidth = 1 * dpr; g.strokeRect(0.5, headH + 0.5, W - 1, shot.height - 1);
  // north arrow
  const na = { x: W - 34 * dpr, y: headH + 40 * dpr, r: 16 * dpr };
  g.save(); g.translate(na.x, na.y); g.rotate((-m.getBearing() * Math.PI) / 180);
  g.fillStyle = "rgba(255,255,255,0.9)"; g.beginPath(); g.arc(0, 0, na.r + 6 * dpr, 0, Math.PI * 2); g.fill();
  g.fillStyle = ink; g.beginPath(); g.moveTo(0, -na.r); g.lineTo(na.r * 0.45, na.r * 0.6); g.lineTo(0, na.r * 0.25); g.lineTo(-na.r * 0.45, na.r * 0.6); g.closePath(); g.fill();
  g.fillStyle = ink; g.font = font(700, 11); g.textAlign = "center"; g.fillText("N", 0, -na.r - 1 * dpr);
  g.restore(); g.textAlign = "left";
  // scale bar
  const lat = ctr.lat;
  const mPerPx = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, m.getZoom())) / dpr;
  const sb = niceScale(mPerPx, 160 * dpr);
  const sx = W - sb.px - 22 * dpr, sy = headH + shot.height - 26 * dpr;
  g.fillStyle = "rgba(255,255,255,0.88)"; g.fillRect(sx - 8 * dpr, sy - 18 * dpr, sb.px + 16 * dpr, 30 * dpr);
  g.fillStyle = ink; g.fillRect(sx, sy, sb.px / 2, 5 * dpr); g.strokeStyle = ink; g.lineWidth = 1 * dpr; g.strokeRect(sx, sy, sb.px, 5 * dpr);
  g.font = font(600, 11); g.textAlign = "center";
  const lbl = sb.m >= 1000 ? `${sb.m / 1000} km` : `${sb.m} m`;
  g.fillText("0", sx, sy - 7 * dpr); g.fillText(lbl, sx + sb.px, sy - 7 * dpr); g.textAlign = "left";
  // legend box
  if (legends.length) {
    const pad = 10 * dpr, lw = 250 * dpr;
    let h = pad;
    const rows: (() => void)[] = [];
    let y = 0;
    const x0 = 14 * dpr;
    const lines: { kind: "title" | "item" | "ramp"; d: LegendDesc; i?: number }[] = [];
    for (const d of legends) {
      lines.push({ kind: "title", d });
      if (d.ramp) lines.push({ kind: "ramp", d });
      else (d.items || []).slice(0, 9).forEach((_, i) => lines.push({ kind: "item", d, i }));
    }
    const lh = (k: string) => (k === "title" ? 20 : k === "ramp" ? 30 : 17) * dpr;
    h += lines.reduce((s, l) => s + lh(l.kind), 0) + pad;
    const top = headH + shot.height - h - 14 * dpr;
    g.fillStyle = "rgba(255,255,255,0.93)"; g.fillRect(x0, top, lw, h); g.strokeStyle = "#c9c6bb"; g.strokeRect(x0 + 0.5, top + 0.5, lw - 1, h - 1);
    y = top + pad;
    for (const l of lines) {
      const H = lh(l.kind);
      if (l.kind === "title") {
        g.fillStyle = ink; g.font = font(700, 12); g.textBaseline = "middle";
        g.fillText(fit(g, l.d.title + (l.d.unit ? ` (${l.d.unit})` : ""), lw - 2 * pad), x0 + pad, y + H / 2);
      } else if (l.kind === "ramp") {
        const gr = g.createLinearGradient(x0 + pad, 0, x0 + lw - pad, 0);
        l.d.ramp!.forEach((col, k) => gr.addColorStop(k / (l.d.ramp!.length - 1), col));
        g.fillStyle = gr; g.fillRect(x0 + pad, y + 2 * dpr, lw - 2 * pad, 9 * dpr);
        g.fillStyle = muted; g.font = font(500, 10);
        g.fillText(l.d.min || "", x0 + pad, y + 20 * dpr); g.textAlign = "right"; g.fillText(l.d.max || "", x0 + lw - pad, y + 20 * dpr); g.textAlign = "left";
      } else {
        const it = l.d.items![l.i!];
        g.fillStyle = it.colour;
        if (it.line) g.fillRect(x0 + pad, y + H / 2 - 1.5 * dpr, 16 * dpr, 3 * dpr);
        else if (it.outline) { g.strokeStyle = it.colour; g.lineWidth = 2 * dpr; g.strokeRect(x0 + pad + 1 * dpr, y + 3 * dpr, 14 * dpr, H - 6 * dpr); }
        else g.fillRect(x0 + pad, y + 3 * dpr, 16 * dpr, H - 6 * dpr);
        g.fillStyle = ink; g.font = font(500, 11); g.textBaseline = "middle";
        g.fillText(fit(g, it.label, lw - 2 * pad - 24 * dpr), x0 + pad + 24 * dpr, y + H / 2);
      }
      y += H;
    }
    void rows;
  }
  // footer
  const bm = basemapById(getState().basemap);
  g.fillStyle = "#f3f1ea"; g.fillRect(0, headH + shot.height, W, footH);
  g.fillStyle = muted; g.font = font(500, 10.5); g.textBaseline = "middle";
  const b = m.getBounds();
  const ext = `${b.getSouth().toFixed(3)}°N–${b.getNorth().toFixed(3)}°N, ${b.getWest().toFixed(3)}°E–${b.getEast().toFixed(3)}°E · WGS 84 / Web Mercator`;
  g.fillText(fit(g, ext, W * 0.45), 14 * dpr, headH + shot.height + footH / 2);
  g.textAlign = "right";
  g.fillText(fit(g, `${opts.lang === "bn" ? "ভিত্তি মানচিত্র" : "Basemap"}: ${opts.lang === "bn" ? bm.bn : bm.en}${bm.attribution ? " — " + bm.attribution : ""}`, W * 0.52), W - 14 * dpr, headH + shot.height + footH / 2);
  g.textAlign = "left";
  return c;
}

function fit(g: CanvasRenderingContext2D, s: string, w: number) {
  if (g.measureText(s).width <= w) return s;
  let t = s;
  while (t.length > 3 && g.measureText(t + "…").width > w) t = t.slice(0, -1);
  return t + "…";
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const safeName = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 60) || "dishari";
