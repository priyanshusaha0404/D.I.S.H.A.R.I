"use client";
/** Imperative bridge between the map store and MapLibre: basemap swaps, thematic hexagon layers (feature-state colouring),
 *  raster overlays, reference layers, labels, highlights, routes and measurements. */
import maplibregl, { type GeoJSONSource, type LayerSpecification, type StyleSpecification, type ExpressionSpecification } from "maplibre-gl";
import { buildBasemap, basemapById } from "@/lib/map/basemaps";
import { ZONES, ZONE_META, zonePoints } from "@/lib/zones";
import { loadPois, poiGeoJSON, POI_CATS } from "@/lib/pois";
import { labelLayers, REF_LAYERS, refByKey, UI } from "@/lib/map/overlays";
import { getState, mapLoaded, setMap, type LayerItem, type MapState } from "@/lib/map/store";
import { hexStore, loadHexGeometry, type HexStore } from "@/lib/data/hex";
import { dataUrl, loadJSON } from "@/lib/data/fetch";
import { loadRasters, type RasterDef } from "@/lib/data/catalog";
import { classify, colourOf, defaultSymFor, fillExpression } from "@/lib/symbology";
import type { Lang } from "@/lib/i18n";

const ANCHORS = ["anchor-basemap", "anchor-thematic", "anchor-ref", "anchor-bmtop", "anchor-labels", "anchor-ui"];
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const abs = (u: string) => new URL(u, window.location.href).href;

/** block lines, and the highlighted block (a colour that never matches the block lines), for every basemap */
const BLOCK_STYLE: Record<string, { line: string; casing: string; text: string; hl: string; hlCasing: string }> = {
  carto_dark: { line: "#7dd3fc", casing: "rgba(2,6,23,.75)", text: "#e0f2fe", hl: "#fb923c", hlCasing: "rgba(2,6,23,.85)" },
  delta_dark: { line: "#7dd3fc", casing: "rgba(2,6,23,.75)", text: "#e0f2fe", hl: "#fb923c", hlCasing: "rgba(2,6,23,.85)" },
  carto_positron: { line: "#1e3a8a", casing: "rgba(255,255,255,.9)", text: "#1e3a8a", hl: "#ea580c", hlCasing: "rgba(255,255,255,.95)" },
  delta: { line: "#1e3a8a", casing: "rgba(255,255,255,.9)", text: "#1e3a8a", hl: "#ea580c", hlCasing: "rgba(255,255,255,.95)" },
  osm: { line: "#6d28d9", casing: "rgba(255,255,255,.95)", text: "#4c1d95", hl: "#ea580c", hlCasing: "rgba(255,255,255,.95)" },
  esri_streets: { line: "#be185d", casing: "rgba(255,255,255,.95)", text: "#831843", hl: "#0284c7", hlCasing: "rgba(255,255,255,.95)" },
  esri_imagery: { line: "#fde047", casing: "rgba(0,0,0,.8)", text: "#fef9c3", hl: "#22d3ee", hlCasing: "rgba(0,0,0,.85)" },
  esri_topo: { line: "#0f172a", casing: "rgba(255,255,255,.9)", text: "#0f172a", hl: "#e11d48", hlCasing: "rgba(255,255,255,.95)" },
};

export class MapController {
  map: maplibregl.Map;
  private hx: HexStore | null = null;
  private geo: GeoJSON.FeatureCollection | null = null;
  private rasters: Record<string, RasterDef> | null = null;
  private applied = new Map<string, string>();          // layer id -> signature of what is drawn
  private refLoaded = new Set<string>();
  private basemapKey = "";
  private labelKey = "";
  private chain: Promise<void> = Promise.resolve();
  private theme: "light" | "dark" = "light";
  private lang: Lang = "en";
  private hoverId: number | null = null;
  ready: Promise<void>;
  onError?: (e: unknown) => void;

  constructor(container: HTMLElement, theme: "light" | "dark") {
    this.theme = theme;
    const style: StyleSpecification = {
      version: 8,
      glyphs: `${window.location.origin}/glyphs/{fontstack}/{range}.pbf`,
      sources: { hex: { type: "geojson", data: EMPTY }, "ui-hl": { type: "geojson", data: EMPTY }, "ui-route": { type: "geojson", data: EMPTY },
        "ui-measure": { type: "geojson", data: EMPTY }, "ov-labels": { type: "geojson", data: EMPTY } },
      layers: [
        { id: "background", type: "background", paint: { "background-color": theme === "dark" ? "#141a18" : "#e7e5de" } },
        ...ANCHORS.map((id) => ({ id, type: "background", layout: { visibility: "none" }, paint: { "background-opacity": 0 } } as LayerSpecification)),
      ],
    };
    // a fresh page always starts at home, focused on the Sundarbans (no remembered view in the address)
    if (location.hash || location.pathname !== "/") history.replaceState(null, "", "/");
    this.map = new maplibregl.Map({
      container, style, bounds: [87.95, 21.5, 89.2, 22.7], minZoom: 6, maxZoom: 18.5,
      fitBoundsOptions: { padding: window.innerWidth >= 768 ? { left: Math.min(430, window.innerWidth * 0.4), right: 70, top: 30, bottom: 30 } : { left: 20, right: 60, top: 20, bottom: Math.round(window.innerHeight * 0.45) } },
      maxBounds: [[83.5, 15.5], [93.5, 25.5]], attributionControl: false, dragRotate: true, pitchWithRotate: false,
    });
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    this.map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-left");
    this.map.touchZoomRotate.disableRotation();
    setMap(this.map);
    this.ready = new Promise((ok) => this.map.once("load", () => ok()));
    this.ready.then(() => {
      this.initUi(); mapLoaded();
      // the ⓘ stays closed; it opens only when the person taps it
      const at = container.querySelector(".maplibregl-ctrl-attrib");
      at?.classList.remove("maplibregl-compact-show");
      at?.querySelector(".maplibregl-ctrl-attrib-button")?.addEventListener("click", () => at.classList.toggle("user-open"));
    });
  }

  destroy() { setMap(null); this.map.remove(); }

  /** Queue a full sync (calls are serialised so async loads never interleave). */
  sync(theme: "light" | "dark", lang: Lang) {
    this.theme = theme; this.lang = lang;
    this.chain = this.chain.then(() => this.ready).then(() => this.doSync(getState())).catch((e) => this.onError?.(e));
    return this.chain;
  }

  private async doSync(s: MapState) {
    const m = this.map;
    if (!this.hx) {
      const [hx, geo, ras, labels] = await Promise.all([hexStore(), loadHexGeometry(), loadRasters(), loadJSON<GeoJSON.FeatureCollection>("vector/labels.geojson")]);
      this.hx = hx; this.rasters = ras; this.geo = geo;
      (m.getSource("hex") as GeoJSONSource).setData(geo);
      (m.getSource("ov-labels") as GeoJSONSource).setData(labels);
    }
    await this.syncBasemap(s);
    this.syncLabels(s);
    await this.syncLayers(s);
    await this.syncZones(s);
    await this.syncPois(s);
    this.styleBlocks(s);
    this.syncUi(s);
  }

  /* ------------------------------------------------------------------ density maps of the tiger / fish / honey / crab zones */
  private zoneDrawn = new Set<string>();
  private async syncZones(s: MapState) {
    const m = this.map;
    for (const z of ZONES) {
      const id = `zone-${z}`, on = s.zones.includes(z);
      if (on && !m.getSource(id)) {
        m.addSource(id, { type: "geojson", data: await zonePoints(z) });
        const r = ZONE_META[z].ramp;
        m.addLayer({ id, type: "heatmap", source: id, maxzoom: 15, paint: {
          "heatmap-weight": ["get", "w"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 7, 0.55, 10, 1.1, 13, 1.8],
          "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 7, 5, 9, 14, 11, 46, 13, 150, 15, 420],
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, r[0], 0.15, r[1], 0.4, r[2], 0.7, r[3], 1, r[4]],
          "heatmap-opacity": 0.72 } }, "anchor-thematic");
        this.zoneDrawn.add(id);
      }
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    }
  }

  /* ------------------------------------------------------------------ points of interest by category */
  private poiLoaded = false;
  private async syncPois(s: MapState) {
    const m = this.map;
    if (!s.pois.length && !this.poiLoaded) return;
    if (!this.poiLoaded) {
      const list = await loadPois();
      m.addSource("poi", { type: "geojson", data: poiGeoJSON(list) });
      const colour = ["match", ["get", "cat"], ...POI_CATS.flatMap((c) => [c.key, c.colour]), "#a1a1aa"] as unknown as ExpressionSpecification;
      void colour;
      // a dropped pin for every category, drawn once
      for (const c of [...POI_CATS.map((x) => ({ key: x.key, colour: x.colour })), { key: "other", colour: "#a1a1aa" }]) {
        const id = `pin-${c.key}`;
        if (m.hasImage(id)) continue;
        const cv = document.createElement("canvas"); cv.width = 48; cv.height = 64;
        const g = cv.getContext("2d")!;
        g.beginPath(); g.moveTo(24, 62); g.bezierCurveTo(20, 50, 6, 40, 6, 23); g.arc(24, 23, 18, Math.PI, 0); g.bezierCurveTo(42, 40, 28, 50, 24, 62); g.closePath();
        g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 4; g.shadowOffsetY = 2;
        g.fillStyle = c.colour; g.fill(); g.shadowColor = "transparent";
        g.lineWidth = 3; g.strokeStyle = "#ffffff"; g.stroke();
        g.beginPath(); g.arc(24, 23, 7, 0, Math.PI * 2); g.fillStyle = "#ffffff"; g.fill();
        m.addImage(id, g.getImageData(0, 0, 48, 64), { pixelRatio: 2 });
      }
      m.addLayer({ id: "poi-c", type: "symbol", source: "poi", layout: {
        "icon-image": ["coalesce", ["image", ["concat", "pin-", ["get", "cat"]]], ["image", "pin-other"]] as unknown as ExpressionSpecification,
        "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-ignore-placement": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, ["match", ["get", "cat"], "village", 0.45, 0.75], 13, ["match", ["get", "cat"], "village", 0.75, 1.1]],
        "symbol-sort-key": ["match", ["get", "cat"], "village", 10, 0] } }, "anchor-labels");
      m.addLayer({ id: "poi-t", type: "symbol", source: "poi", minzoom: 12, layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11,
        "text-offset": [0, 0.35], "text-anchor": "top", "text-optional": true }, paint: { "text-color": "#e5e7eb", "text-halo-color": "rgba(10,15,30,.9)", "text-halo-width": 1.3 } }, "anchor-labels");
      this.poiLoaded = true;
    }
    const f = ["in", ["get", "cat"], ["literal", s.pois]] as unknown as ExpressionSpecification;
    for (const id of ["poi-c", "poi-t"]) { m.setFilter(id, f); m.setLayoutProperty(id, "visibility", s.pois.length ? "visible" : "none"); }
    const dark = this.darkBasemap(s) || /imagery|carto_dark/.test(s.basemap);
    m.setPaintProperty("poi-t", "text-color", dark ? "#e5e7eb" : "#111827");
    m.setPaintProperty("poi-t", "text-halo-color", dark ? "rgba(10,15,30,.9)" : "rgba(255,255,255,.95)");
  }

  /** block lines in a colour that stands out on the chosen basemap */
  private styleBlocks(s: MapState) {
    const m = this.map;
    const st = BLOCK_STYLE[s.basemap] || (this.darkBasemap(s) ? BLOCK_STYLE.carto_dark : BLOCK_STYLE.carto_positron);
    if (m.getLayer("ref-blocks-c")) { m.setPaintProperty("ref-blocks-c", "line-color", st.casing); }
    if (m.getLayer("ref-blocks-l")) m.setPaintProperty("ref-blocks-l", "line-color", st.line);
    if (m.getLayer("ref-blocks-t")) { m.setPaintProperty("ref-blocks-t", "text-color", st.text); m.setPaintProperty("ref-blocks-t", "text-halo-color", st.casing); }
    if (m.getLayer("ui-hl-line")) {
      m.setPaintProperty("ui-hl-line", "line-color", st.hl); m.setPaintProperty("ui-hl-line", "line-width", 3.6);
      m.setPaintProperty("ui-hl-casing", "line-color", st.hlCasing); m.setPaintProperty("ui-hl-casing", "line-width", 7.5); m.setPaintProperty("ui-hl-casing", "line-opacity", 0.6);
      m.setPaintProperty("ui-hl-fill", "fill-color", st.hl); m.setPaintProperty("ui-hl-fill", "fill-opacity", 0.2);
    }
  }

  /* ------------------------------------------------------------------ basemap */
  private darkBasemap(s: MapState) { return basemapById(s.basemap).dark ?? this.theme === "dark"; }
  private async syncBasemap(s: MapState) {
    const key = `${s.basemap}|${this.theme}`;
    if (key === this.basemapKey) return;
    const b = await buildBasemap(s.basemap, this.theme);
    const m = this.map;
    for (const l of m.getStyle().layers) if (l.id.startsWith("bm-")) m.removeLayer(l.id);
    for (const id of Object.keys(m.getStyle().sources)) if (id.startsWith("bm-")) m.removeSource(id);
    for (const [id, src] of Object.entries(b.sources)) m.addSource(id, src);
    for (const l of b.base) m.addLayer(l, "anchor-basemap");
    for (const l of b.top) m.addLayer(l, "anchor-bmtop");
    m.setPaintProperty("background", "background-color", b.background);
    this.basemapKey = key;
    this.labelKey = "";      // label colours depend on the basemap
  }

  private syncLabels(s: MapState) {
    const dark = this.darkBasemap(s);
    const key = `${dark}`;
    const m = this.map;
    if (key !== this.labelKey) {
      for (const l of m.getStyle().layers) if (l.id.startsWith("ov-lab-")) m.removeLayer(l.id);
      for (const l of labelLayers(dark)) m.addLayer(l, "anchor-labels");
      this.labelKey = key;
    }
    for (const l of m.getStyle().layers) if (l.id.startsWith("ov-lab-")) m.setLayoutProperty(l.id, "visibility", s.labels ? "visible" : "none");
  }

  /* ------------------------------------------------------------------ thematic + reference layers */
  private async syncLayers(s: MapState) {
    const m = this.map, hx = this.hx!;
    const wanted = new Set<string>();
    const dark = this.darkBasemap(s);
    for (const L of s.layers) {
      if (L.type === "hex" || L.type === "result") { this.drawHex(L); wanted.add(`hex-${L.id}`); }
      else if (L.type === "raster") { this.drawRaster(L); wanted.add(`ras-${L.id}`); }
      else if (L.type === "ref") { await this.drawRef(L, dark); refByKey(L.key)?.layers(dark).forEach((x) => wanted.add(`ref-${L.key}-${x.id}`)); }
    }
    // remove what is no longer wanted
    for (const l of m.getStyle().layers) {
      if (/^(hex|ras|ref)-/.test(l.id) && !wanted.has(l.id) && l.id !== "hex-outline" && l.id !== "hex-hover") {
        m.removeLayer(l.id);
        this.applied.delete(l.id);
        if (l.id.startsWith("ras-") && m.getSource(l.id)) m.removeSource(l.id);
      }
    }
    // order: first item in the list is drawn on top of its band
    const bands: [LayerItem[], string, (L: LayerItem) => string[]][] = [
      [s.layers.filter((l) => l.type !== "ref"), "anchor-thematic", (L) => [L.type === "raster" ? `ras-${L.id}` : `hex-${L.id}`]],
      [s.layers.filter((l) => l.type === "ref"), "anchor-ref", (L) => (refByKey(L.key)?.layers(dark) || []).map((x) => `ref-${L.key}-${x.id}`)],
    ];
    for (const [items, anchor, ids] of bands) {
      for (const L of [...items].reverse()) for (const id of ids(L)) if (m.getLayer(id)) m.moveLayer(id, anchor);
    }
    if (m.getLayer("hex-outline")) m.setLayoutProperty("hex-outline", "visibility", s.hexOutline ? "visible" : "none");
    this.sync3d(s);
    void hx;
  }

  /** 3D view: the top hexagon layer stands up as columns (colour as on the map, height = value), the map tilts */
  private last3d = false;
  private v3Key = "";
  private sync3d(s: MapState) {
    const m = this.map, hx = this.hx!;
    const top = s.layers.find((l) => (l.type === "hex" || l.type === "result") && l.visible);
    for (const L of s.layers) {
      if ((L.type === "hex" || L.type === "result") && m.getLayer(`hex-${L.id}`))
        m.setPaintProperty(`hex-${L.id}`, "fill-opacity", s.view3d && top && L.id === top.id ? Math.min(0.2, L.opacity) : L.opacity);
    }
    const key = s.view3d && top ? `${top.id}|${this.applied.get(`hex-${top.id}`) || ""}|${top.type === "result" ? top.result!.title : ""}` : "";
    if (key !== this.v3Key) {
      this.v3Key = key;
      if (m.getLayer("hex3d")) m.removeLayer("hex3d");
      if (m.getSource("hex3d")) m.removeSource("hex3d");
      if (key && top && this.geo) {
        const values = top.type === "result" ? top.result!.values : hx.get(top.key);
        let colour: (v: number) => string | null;
        let height: (v: number) => number;
        if (top.type === "result") {
          const cls = top.result!.classes;
          colour = (v) => cls.find((c) => c.v === Math.round(v))?.colour ?? null;
          height = (v) => (cls.findIndex((c) => c.v === Math.round(v)) + 1) * 1400;
        } else {
          const def = hx.def(top.key)!;
          const c = classify(def, values, top.sym || defaultSymFor(def), this.lang);
          colour = (v) => colourOf(c, v);
          if (def.classes) { const order = def.classes.map((x) => x.v); height = (v) => (order.indexOf(Math.round(v)) + 1) * 1400; }
          else {
            const div = def.ramp.startsWith("div_");
            let lo = Infinity, hi = -Infinity;
            for (const v of values) if (!Number.isNaN(v)) { const x = div ? Math.abs(v) : v; if (x < lo) lo = x; if (x > hi) hi = x; }
            if (div) lo = 0;
            height = (v) => (hi > lo ? (((div ? Math.abs(v) : v) - lo) / (hi - lo)) * 9000 : 1500);
          }
        }
        const feats: GeoJSON.Feature[] = [];
        for (const f of this.geo.features) {
          const i = f.id as number, v = values[i];
          if (v === undefined || Number.isNaN(v)) continue;
          const c = colour(v);
          if (!c) continue;
          feats.push({ type: "Feature", id: i, properties: { c, h: Math.max(80, height(v)) }, geometry: f.geometry });
        }
        m.addSource("hex3d", { type: "geojson", data: { type: "FeatureCollection", features: feats } });
        m.addLayer({ id: "hex3d", type: "fill-extrusion", source: "hex3d", paint: {
          "fill-extrusion-color": ["get", "c"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.93,
        } }, "anchor-thematic");
      }
    }
    if (s.view3d !== this.last3d) {
      this.last3d = s.view3d;
      m.easeTo(s.view3d ? { pitch: 58, bearing: m.getBearing() || -17, duration: 1100 } : { pitch: 0, bearing: 0, duration: 900 });
    }
  }

  private drawHex(L: LayerItem) {
    const m = this.map, hx = this.hx!;
    const id = `hex-${L.id}`;
    const def = L.type === "hex" ? hx.def(L.key) : undefined;
    const values = L.type === "result" ? L.result!.values : hx.get(L.key);
    const sym = L.sym || defaultSymFor(def);
    const sig = `${L.key}|${sym.method}|${sym.k}|${sym.reverse}|${sym.ramp || ""}|${this.lang}|${L.type === "result" ? L.result!.title : ""}`;
    const stateKey = `v_${L.id.replace(/\W/g, "_")}`;
    if (this.applied.get(id) !== sig) {
      let expr: unknown;
      if (L.type === "result") {
        const match: unknown[] = ["match", ["round", ["feature-state", stateKey]]];
        for (const c of L.result!.classes) match.push(c.v, c.colour);
        match.push("rgba(0,0,0,0)");
        expr = ["case", ["==", ["typeof", ["feature-state", stateKey]], "number"], match, "rgba(0,0,0,0)"];
      } else expr = fillExpression(classify(def!, values, sym, this.lang), stateKey);
      if (!m.getLayer(id)) {
        m.addLayer({ id, type: "fill", source: "hex", paint: { "fill-color": expr as never, "fill-opacity": L.opacity, "fill-outline-color": "rgba(0,0,0,0)" } }, "anchor-thematic");
      } else m.setPaintProperty(id, "fill-color", expr as never);
      if (!this.applied.has(id) || this.applied.get(id)!.split("|")[0] !== L.key || L.type === "result") {
        for (let i = 0; i < values.length; i++) {
          const v = values[i];
          m.setFeatureState({ source: "hex", id: i }, { [stateKey]: Number.isNaN(v) ? null : v });
        }
      }
      this.applied.set(id, sig);
    }
    m.setPaintProperty(id, "fill-opacity", L.opacity);
    m.setLayoutProperty(id, "visibility", L.visible ? "visible" : "none");
  }

  private drawRaster(L: LayerItem) {
    const m = this.map;
    const id = `ras-${L.id}`;
    const r = this.rasters?.[L.key];
    if (!r) return;
    if (!m.getSource(id)) m.addSource(id, { type: "image", url: abs(dataUrl(r.url)), coordinates: r.coordinates });
    if (!m.getLayer(id)) m.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": L.opacity, "raster-fade-duration": 0,
      "raster-resampling": r.legend?.type === "categorical" ? "nearest" : "linear" } }, "anchor-thematic");
    m.setPaintProperty(id, "raster-opacity", L.opacity);
    m.setLayoutProperty(id, "visibility", L.visible ? "visible" : "none");
  }

  private async drawRef(L: LayerItem, dark: boolean) {
    const m = this.map;
    const def = refByKey(L.key);
    if (!def) return;
    const src = `ref-${L.key}`;
    if (!m.getSource(src)) {
      const data = await loadJSON<GeoJSON.FeatureCollection>(def.file);
      if (!m.getSource(src)) m.addSource(src, { type: "geojson", data, promoteId: "id" });
      this.refLoaded.add(L.key);
    }
    const sig = `${dark}`;
    for (const spec of def.layers(dark)) {
      const id = `${src}-${spec.id}`;
      if (m.getLayer(id) && this.applied.get(id) !== sig) m.removeLayer(id);
      if (!m.getLayer(id)) m.addLayer({ ...spec, id, source: src } as LayerSpecification, "anchor-ref");
      this.applied.set(id, sig);
      const op = L.opacity;
      const t = spec.type;
      if (t === "line") m.setPaintProperty(id, "line-opacity", op);
      if (t === "circle") { m.setPaintProperty(id, "circle-opacity", op); m.setPaintProperty(id, "circle-stroke-opacity", op); }
      if (t === "symbol") m.setPaintProperty(id, "text-opacity", op);
      m.setLayoutProperty(id, "visibility", L.visible ? "visible" : "none");
    }
  }

  /* ------------------------------------------------------------------ highlight, routes, measurement */
  private initUi() {
    const m = this.map;
    m.addLayer({ id: "hex-outline", type: "line", source: "hex", layout: { visibility: "none" }, paint: { "line-color": "#6b6556", "line-width": 0.4, "line-opacity": 0.45 } }, "anchor-thematic");
    m.addLayer({ id: "hex-hover", type: "line", source: "hex", paint: { "line-color": "#0b0b0b", "line-width": 2,
      "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.85, 0] } }, "anchor-ref");
    m.addLayer({ id: "ui-hl-fill", type: "fill", source: "ui-hl", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": UI.highlight, "fill-opacity": 0.12 } }, "anchor-ui");
    m.addLayer({ id: "ui-hl-casing", type: "line", source: "ui-hl", paint: { "line-color": UI.casing, "line-width": 5, "line-opacity": 0.45 } }, "anchor-ui");
    m.addLayer({ id: "ui-hl-line", type: "line", source: "ui-hl", paint: { "line-color": UI.highlight, "line-width": 2.6 } }, "anchor-ui");
    m.addLayer({ id: "ui-route-casing", type: "line", source: "ui-route", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": ["case", ["get", "active"], 9, 6], "line-opacity": 0.9 } }, "anchor-ui");
    m.addLayer({ id: "ui-route-alt", type: "line", source: "ui-route", filter: ["!", ["get", "active"]], layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": UI.alt, "line-width": 4 } }, "anchor-ui");
    m.addLayer({ id: "ui-route-boat", type: "line", source: "ui-route", filter: ["all", ["get", "active"], ["==", ["get", "mode"], "boat"]],
      layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": UI.boat, "line-width": 5 } }, "anchor-ui");
    m.addLayer({ id: "ui-route-walk", type: "line", source: "ui-route", filter: ["all", ["get", "active"], ["==", ["get", "mode"], "walk"]],
      layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": UI.walk, "line-width": 4, "line-dasharray": [1.2, 1.4] } }, "anchor-ui");
    m.addLayer({ id: "ui-measure-fill", type: "fill", source: "ui-measure", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": UI.measure, "fill-opacity": 0.12 } }, "anchor-ui");
    m.addLayer({ id: "ui-measure-line", type: "line", source: "ui-measure", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": UI.measure, "line-width": 2.2, "line-dasharray": [2, 1] } }, "anchor-ui");
    m.addLayer({ id: "ui-measure-pt", type: "circle", source: "ui-measure", filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 4.5, "circle-color": "#fff", "circle-stroke-color": UI.measure, "circle-stroke-width": 2 } }, "anchor-ui");
  }

  private hlKey = "";
  private routeKey: unknown = null;
  private measureKey: unknown = null;
  private syncUi(s: MapState) {
    const m = this.map;
    const hk = JSON.stringify(s.highlight);
    if (hk !== this.hlKey) {
      this.hlKey = hk;
      this.setHighlight(s.highlight);
    }
    if (s.routes !== this.routeKey) {
      this.routeKey = s.routes;
      const feats: GeoJSON.Feature[] = [];
      s.routes?.list.forEach((r, k) => r.legs.forEach((leg) => feats.push({ type: "Feature", properties: { active: k === s.routes!.active, mode: leg.mode },
        geometry: { type: "LineString", coordinates: leg.coords } })));
      feats.sort((a, b) => Number(a.properties!.active) - Number(b.properties!.active));
      (m.getSource("ui-route") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    }
    if (s.measure !== this.measureKey || s.pick !== (this as unknown as { lastPick?: string }).lastPick) {
      this.measureKey = s.measure;
      (this as unknown as { lastPick?: string | null }).lastPick = s.pick;
      const pts = s.measure;
      const feats: GeoJSON.Feature[] = pts.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } }));
      if (pts.length >= 2) feats.push({ type: "Feature", properties: {}, geometry: s.pick === "measure-area" && pts.length >= 3
        ? { type: "Polygon", coordinates: [[...pts, pts[0]]] } : { type: "LineString", coordinates: pts } });
      (m.getSource("ui-measure") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    }
    m.getCanvas().style.cursor = s.pick ? "crosshair" : "";
  }

  private async setHighlight(h: MapState["highlight"]) {
    const m = this.map;
    const src = m.getSource("ui-hl") as GeoJSONSource;
    if (!h) { src.setData(EMPTY); return; }
    const ids = new Set(h.ids.map(String));
    let fc: GeoJSON.FeatureCollection;
    if (h.layer === "hex") fc = await loadHexGeometry();
    else {
      const def = REF_LAYERS.find((r) => r.key === h.layer);
      fc = await loadJSON<GeoJSON.FeatureCollection>(def ? def.file : `vector/${h.layer}.geojson`);
    }
    const features = fc.features.filter((f) => ids.has(String(h.layer === "hex" ? f.id : (f.properties as { id?: unknown })?.id ?? f.id)));
    if (JSON.stringify(getState().highlight) === JSON.stringify(h)) src.setData({ type: "FeatureCollection", features });
  }

  /* ------------------------------------------------------------------ hover helper */
  setHover(i: number | null) {
    if (i === this.hoverId) return;
    if (this.hoverId !== null) this.map.setFeatureState({ source: "hex", id: this.hoverId }, { hover: false });
    this.hoverId = i;
    if (i !== null) this.map.setFeatureState({ source: "hex", id: i }, { hover: true });
  }
  hexLayerIds() { return this.map.getStyle().layers.filter((l) => l.id.startsWith("hex-") && l.id !== "hex-outline" && l.id !== "hex-hover").map((l) => l.id); }
  store() { return this.hx; }
}
