"use client";
/** Off-screen map pictures for reports, drawn from the site's own data (so they work offline). */
import maplibregl, { type LayerSpecification, type StyleSpecification } from "maplibre-gl";
import { deltaData, PALETTE } from "../map/basemaps";
import { loadHexGeometry } from "../data/hex";
import { loadJSON } from "../data/fetch";
import type { LegendItem } from "../map/legend";

export interface MapShotOpts {
  bounds: [number, number, number, number];
  hexColours?: (string | null)[];          // colour per hexagon index (null = not drawn)
  highlight?: GeoJSON.FeatureCollection;
  lines?: GeoJSON.FeatureCollection;       // property "mode": boat | walk
  points?: { lon: number; lat: number; colour: string }[];
  legend?: { title: string; items: LegendItem[] };
  width?: number; height?: number; labels?: boolean; padding?: number;
  /** draw on top of the captured map (canvas at 2×, project gives canvas pixels) */
  draw?: (g: CanvasRenderingContext2D, project: (ll: [number, number]) => [number, number], s: number) => void | Promise<void>;
}

export async function mapPng(o: MapShotOpts): Promise<{ src: string; w: number; h: number }> {
  const W = o.width ?? 1000, H = o.height ?? 620;
  const [d, labels, grid] = await Promise.all([deltaData(), loadJSON<GeoJSON.FeatureCollection>("vector/labels.geojson"), o.hexColours ? loadHexGeometry() : Promise.resolve(null)]);
  const c = PALETTE.light;
  const sources: StyleSpecification["sources"] = {
    study: { type: "geojson", data: d.study }, land: { type: "geojson", data: d.land }, water: { type: "geojson", data: d.water },
    rivers: { type: "geojson", data: d.rivers }, mangrove: { type: "geojson", data: d.mangrove }, blocks: { type: "geojson", data: d.blocks },
    districts: { type: "geojson", data: d.districts }, labels: { type: "geojson", data: labels },
  };
  const layers: LayerSpecification[] = [
    { id: "bg", type: "background", paint: { "background-color": c.outside } },
    { id: "study", type: "fill", source: "study", paint: { "fill-color": c.sea } },
    { id: "land", type: "fill", source: "land", paint: { "fill-color": c.land } },
    { id: "mangrove", type: "fill", source: "mangrove", paint: { "fill-color": c.mangrove } },
    { id: "water", type: "fill", source: "water", paint: { "fill-color": c.water } },
    { id: "rivers", type: "line", source: "rivers", paint: { "line-color": c.river, "line-width": ["match", ["get", "c"], "river", 1.4, 0.5] } },
  ];
  if (grid && o.hexColours) {
    const feats = grid.features.filter((f) => o.hexColours![f.id as number]).map((f) => ({ ...f, properties: { c: o.hexColours![f.id as number] } }));
    sources.hexes = { type: "geojson", data: { type: "FeatureCollection", features: feats } };
    layers.push({ id: "hexes", type: "fill", source: "hexes", paint: { "fill-color": ["get", "c"], "fill-opacity": 0.82 } });
  }
  layers.push({ id: "blocks", type: "line", source: "blocks", paint: { "line-color": c.block, "line-width": 0.8, "line-dasharray": [3, 2] } },
    { id: "districts", type: "line", source: "districts", paint: { "line-color": c.district, "line-width": 1.4 } });
  if (o.highlight) {
    sources.hl = { type: "geojson", data: o.highlight };
    layers.push({ id: "hl-c", type: "line", source: "hl", paint: { "line-color": "#3d2a00", "line-width": 5, "line-opacity": 0.4 } },
      { id: "hl", type: "line", source: "hl", paint: { "line-color": "#eda100", "line-width": 2.6 } });
  }
  if (o.lines) {
    sources.lines = { type: "geojson", data: o.lines };
    layers.push({ id: "ln-c", type: "line", source: "lines", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 7 } },
      { id: "ln", type: "line", source: "lines", filter: ["!=", ["get", "mode"], "walk"], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["coalesce", ["get", "colour"], "#2a78d6"], "line-width": 4 } },
      { id: "ln-w", type: "line", source: "lines", filter: ["==", ["get", "mode"], "walk"], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["coalesce", ["get", "colour"], "#3c3b37"], "line-width": 4, "line-dasharray": [0.2, 1.8] } });
  }
  if (o.points?.length) {
    sources.pts = { type: "geojson", data: { type: "FeatureCollection", features: o.points.map((p) => ({ type: "Feature", properties: { c: p.colour }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) } };
    layers.push({ id: "pts", type: "circle", source: "pts", paint: { "circle-radius": 7, "circle-color": ["get", "c"], "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
  }
  if (o.labels !== false) {
    const halo = { "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.4 };
    layers.push(
      { id: "lab-i", type: "symbol", source: "labels", filter: ["==", ["get", "t"], "island"], layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Italic"], "text-size": 11 }, paint: { "text-color": "#1f5f7a", ...halo } },
      { id: "lab-t", type: "symbol", source: "labels", filter: ["in", ["get", "t"], ["literal", ["town", "block"]]], layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Medium"], "text-size": 11.5 }, paint: { "text-color": "#1f2a25", ...halo } },
      { id: "lab-v", type: "symbol", source: "labels", minzoom: 11, filter: ["==", ["get", "t"], "village"], layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Regular"], "text-size": 10.5, "symbol-sort-key": ["-", 0, ["get", "r"]] }, paint: { "text-color": "#3b4640", ...halo } });
  }
  const div = document.createElement("div");
  div.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;height:${H}px;`;
  document.body.appendChild(div);
  const map = new maplibregl.Map({
    container: div, interactive: false, attributionControl: false, preserveDrawingBuffer: true, fadeDuration: 0, pixelRatio: 2,
    style: { version: 8, glyphs: `${location.origin}/glyphs/{fontstack}/{range}.pbf`, sources, layers },
    bounds: [[o.bounds[0], o.bounds[1]], [o.bounds[2], o.bounds[3]]], fitBoundsOptions: { padding: o.padding ?? 36, maxZoom: 14 },
  } as maplibregl.MapOptions);
  try {
    await new Promise<void>((ok) => {
      const to = setTimeout(ok, 12000);
      map.once("idle", () => { clearTimeout(to); ok(); });
    });
    const src = map.getCanvas();
    const out = document.createElement("canvas");
    out.width = src.width; out.height = src.height;
    const g = out.getContext("2d")!;
    g.drawImage(src, 0, 0);
    const s = out.width / W;
    if (o.draw) await o.draw(g, (ll) => { const p = map.project(ll); return [p.x * s, p.y * s]; }, s);
    // scale bar
    const lat = map.getCenter().lat;
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, map.getZoom()));
    const maxM = mpp * 140;
    const p = Math.pow(10, Math.floor(Math.log10(maxM)));
    const nice = [1, 2, 5, 10].map((k) => k * p).filter((v) => v <= maxM).pop() || p;
    const px = (nice / mpp) * s;
    const x0 = out.width - px - 22 * s, y0 = out.height - 24 * s;
    g.fillStyle = "rgba(255,255,255,0.88)"; g.fillRect(x0 - 8 * s, y0 - 18 * s, px + 16 * s, 30 * s);
    g.fillStyle = "#16201c"; g.fillRect(x0, y0, px / 2, 5 * s); g.strokeStyle = "#16201c"; g.lineWidth = s; g.strokeRect(x0, y0, px, 5 * s);
    g.font = `600 ${11 * s}px "Inter Variable", sans-serif`; g.textAlign = "center";
    g.fillText("0", x0, y0 - 6 * s); g.fillText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, x0 + px, y0 - 6 * s);
    // north arrow
    g.save(); g.translate(out.width - 30 * s, 34 * s);
    g.fillStyle = "rgba(255,255,255,0.9)"; g.beginPath(); g.arc(0, 0, 18 * s, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#16201c"; g.beginPath(); g.moveTo(0, -12 * s); g.lineTo(6 * s, 8 * s); g.lineTo(0, 4 * s); g.lineTo(-6 * s, 8 * s); g.closePath(); g.fill();
    g.restore();
    // legend
    if (o.legend?.items.length) {
      const items = o.legend.items.slice(0, 9);
      const lh = 17 * s, pad = 9 * s, w = 220 * s, h = pad * 2 + 18 * s + items.length * lh;
      const lx = 12 * s, ly = out.height - h - 12 * s;
      g.fillStyle = "rgba(255,255,255,0.93)"; g.fillRect(lx, ly, w, h); g.strokeStyle = "#c9c6bb"; g.strokeRect(lx, ly, w, h);
      g.textAlign = "left"; g.textBaseline = "middle"; g.fillStyle = "#16201c";
      g.font = `700 ${11.5 * s}px "Inter Variable", "Noto Sans Bengali", sans-serif`;
      g.fillText(o.legend.title.slice(0, 40), lx + pad, ly + pad + 8 * s);
      g.font = `500 ${10.5 * s}px "Inter Variable", "Noto Sans Bengali", sans-serif`;
      items.forEach((it, k) => {
        const y = ly + pad + 18 * s + k * lh;
        g.fillStyle = it.colour;
        if (it.line) g.fillRect(lx + pad, y + lh / 2 - 1.5 * s, 16 * s, 3 * s); else g.fillRect(lx + pad, y + 3 * s, 16 * s, lh - 6 * s);
        g.fillStyle = "#16201c"; g.fillText(it.label.slice(0, 34), lx + pad + 24 * s, y + lh / 2);
      });
    }
    return { src: out.toDataURL("image/png"), w: W, h: H };
  } finally {
    map.remove();
    div.remove();
  }
}

/** Bounding box of a set of hexagons (with a margin). */
export function cellsBounds(lon: number[], lat: number[], idx: number[], pad = 0.01): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const i of idx) { a = Math.min(a, lon[i]); b = Math.min(b, lat[i]); c = Math.max(c, lon[i]); d = Math.max(d, lat[i]); }
  if (!Number.isFinite(a)) return [87.95, 21.5, 89.2, 22.7];
  return [a - pad, b - pad, c + pad, d + pad];
}
