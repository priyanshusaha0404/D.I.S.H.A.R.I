"use client";
/** The 3D trip: a tilted map of the delta with the journey drawn by mode, the places as standing pins and a traveller
 *  that follows the plan (or your real position, with live GPS). Pause anywhere to see what is within 1 km —
 *  help points, ghats, villages, services — and walk to one; resume carries on. A voice guide reads each step. */
import maplibregl, { type GeoJSONSource, type LayerSpecification, type StyleSpecification } from "maplibre-gl";
import { buildBasemap, deltaData, PALETTE } from "@/lib/map/basemaps";
import { labelLayers } from "@/lib/map/overlays";
import { loadJSON } from "@/lib/data/fetch";
import { addPinImage, travellerHTML } from "@/lib/trip/pins";
import { at, bboxOf, bearing, circle, metres, snap, type LL } from "@/lib/trip/geo";
import { buildTimeline, segAt, type Timeline, type TSeg } from "@/lib/trip/timeline";
import type { TripPlan } from "@/lib/trip/plan";
import { around, GROUP_STYLE, iconFor, type NearGroup, type NearItem } from "@/lib/trip/nearby";
import { phrase, say, spokenKm, spokenMin, stopVoice, voiceFor, voiceOk } from "@/lib/trip/voice";
import { planRoute } from "@/lib/routing/client";
import { legEnd, MODE_COLOUR } from "@/lib/trip/text";
import type { Lang } from "@/lib/i18n";

export type BaseKey = "delta" | "sat" | "streets";
export const BASES: BaseKey[] = ["sat", "streets", "delta"];
export const SPEEDS = [1, 2, 5, 10, 30, 60];
export const AROUND_M = 1000;

export interface AroundState {
  here: LL; t: number; r: number; items: NearItem[]; loaded: boolean; group: NearGroup; q: string; sel: number | null;
  going: null | { i: number; busy: boolean; min?: number; m?: number };
}
export interface LiveState { status: "wait" | "ok" | "denied"; acc?: number; off?: number; kmh?: number; here?: LL }
export interface UIState {
  ready: boolean; error: string | null; playing: boolean; speed: number; follow: boolean; view3d: boolean; base: BaseKey; voice: boolean;
  pos: number; seg: number; done: boolean; card: null | { stop: number; final: boolean };
  around: AroundState | null; live: LiveState | null;
}

const VOICE_KEY = "dishari.voice";
const readVoice = () => { try { return localStorage.getItem(VOICE_KEY) !== "0"; } catch { return true; } };
const PIN_COL = { start: "#123D32", stop: "#eb6834", end: "#e34948", ghat: "#256abf" };

/** words people can search for in the pause panel, beyond the names */
const KIND_WORDS: Record<string, string> = {
  health: "health hospital doctor clinic medicine pharmacy ambulance স্বাস্থ্য হাসপাতাল ডাক্তার ওষুধ",
  emergency: "emergency police fire help জরুরি পুলিশ দমকল", shelter: "shelter cyclone flood আশ্রয় সাইক্লোন",
  finance: "bank atm money post office ব্যাংক টাকা ডাকঘর", market: "market shop bazar haat বাজার দোকান হাট",
  education: "school college শিক্ষা স্কুল", religious: "temple mosque church মন্দির মসজিদ", transport: "bus ferry transport বাস পরিবহন",
  government: "office panchayat government সরকারি অফিস পঞ্চায়েত", jetty: "ghat jetty ferry boat ঘাট জেটি নৌকা", ferry_terminal: "ghat ferry ঘাট ফেরি",
  village: "village gram গ্রাম", town: "town shohor শহর",
};
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export class TripEngine {
  map: maplibregl.Map | null = null;
  tl: Timeline;
  ui: UIState;
  private raf = 0;
  private lastTs = 0;
  private holdUntil = 0;
  private reached = new Set<number>();
  private segIdx = -1;
  private brg = 0;
  private marker: maplibregl.Marker | null = null;
  private markerMode: "boat" | "walk" = "boat";
  private pulseRaf = 0;
  private popup: maplibregl.Popup | null = null;
  private watch: number | null = null;
  private lastEmit = 0;
  private vq: string[] = [];
  private destroyed = false;
  private userZoom = false;
  private keyFn: (e: KeyboardEvent) => void;
  vLang: Lang;
  /** called when "Plan again from here" is chosen (live GPS, off the route) */
  onReplan?: (here: LL, nextStop: number) => void;

  constructor(private el: HTMLElement, public plan: TripPlan, public lang: Lang, private emit: (u: UIState) => void, private dark = false) {
    this.tl = buildTimeline(plan);
    const span = this.tl.total;
    this.ui = { ready: false, error: null, playing: false, speed: span > 300 ? 5 : 2, follow: true, view3d: true, base: "sat", voice: voiceOk() && readVoice(),
      pos: 0, seg: 0, done: false, card: null, around: null, live: null };
    this.vLang = this.speakLang();
    this.keyFn = (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " ") { e.preventDefault(); this.toggle(); }
    };
    window.addEventListener("keydown", this.keyFn);
  }

  private speakLang(): Lang { return this.lang === "bn" && !voiceFor("bn") ? "en" : this.lang; }
  private set(p: Partial<UIState>, force = true) {
    this.ui = { ...this.ui, ...p };
    const now = performance.now();
    if (force || now - this.lastEmit > 110) { this.lastEmit = now; this.emit(this.ui); }
  }
  setLang(l: Lang) { this.lang = l; this.vLang = this.speakLang(); }

  /* ================================================================== map */
  private async style(base: BaseKey): Promise<StyleSpecification> {
    const id = base === "sat" ? (navigator.onLine ? "esri_imagery" : "landsat_2025") : base === "streets" ? (navigator.onLine ? "osm" : "delta") : this.dark ? "delta_dark" : "delta";
    const b = await buildBasemap(id, this.dark ? "dark" : "light");
    const layers: LayerSpecification[] = [{ id: "bg", type: "background", paint: { "background-color": b.background } }, ...b.base];
    const sources = { ...b.sources };
    if (base === "delta") {
      // the delta in relief: land a little above the water, the mangrove forest standing tall
      const d = await deltaData();
      const c = this.dark ? PALETTE.dark : PALETTE.light;
      sources["x-land"] = { type: "geojson", data: d.land };
      sources["x-mangrove"] = { type: "geojson", data: d.mangrove, tolerance: 0.6 };
      sources["x-vil"] = { type: "geojson", data: await loadJSON<GeoJSON.FeatureCollection>("vector/villages.geojson") };
      const iBank = layers.findIndex((l) => l.id === "bm-water");
      layers.splice(iBank + 1, 0,
        { id: "x-vil", type: "line", source: "x-vil", minzoom: 11, paint: { "line-color": this.dark ? "#3c4f47" : "#d6cbb4", "line-width": 1, "line-dasharray": [3, 2] } },
        { id: "x-land", type: "fill-extrusion", source: "x-land", minzoom: 9, paint: { "fill-extrusion-color": c.land, "fill-extrusion-height": 6, "fill-extrusion-opacity": 0.92 } },
        { id: "x-mangrove", type: "fill-extrusion", source: "x-mangrove", minzoom: 9, paint: {
          "fill-extrusion-color": this.dark ? "#2c5a40" : "#6fa769", "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 9, 60, 13, 34, 16, 22],
          "fill-extrusion-opacity": 0.9, "fill-extrusion-vertical-gradient": true } });
    }
    layers.push(...b.top);
    sources["ov-labels"] = { type: "geojson", data: await loadJSON<GeoJSON.FeatureCollection>("vector/labels.geojson") };
    layers.push(...labelLayers(this.dark || base === "sat"));
    return { version: 8, glyphs: `${location.origin}/glyphs/{fontstack}/{range}.pbf`, sources, layers };
  }

  async start() {
    try {
      await this.mount();
      if (this.destroyed) return;
      this.set({ ready: true });
      await this.intro();
      if (this.destroyed) return;
      this.queue(phrase("start", this.vLang, { from: this.plan.stops[0].name }));
      this.update(true);
      this.play();
    } catch (e) {
      this.set({ error: (e as Error).message || "3D" });
    }
  }

  private async mount() {
    if (this.map) { this.marker?.remove(); this.marker = null; this.map.remove(); this.map = null; }
    const style = await this.style(this.ui.base);
    if (this.destroyed) return;
    const p0 = this.tl.pts[0];
    const map = new maplibregl.Map({
      container: this.el, style, center: [p0.lon, p0.lat], zoom: 14, pitch: this.ui.view3d ? 62 : 0, bearing: 0, maxPitch: 78,
      attributionControl: { compact: true }, minZoom: 7, maxZoom: 18.5, fadeDuration: 0,
    } as maplibregl.MapOptions);
    this.map = map;
    await new Promise<void>((ok, err) => {
      const to = setTimeout(() => ok(), 15000);
      map.once("load", () => { clearTimeout(to); ok(); });
      map.once("error", (e) => { if (!map.loaded() && !(e as { tile?: unknown }).tile && !(e as { sourceId?: string }).sourceId) { clearTimeout(to); err(e.error || new Error("map")); } });
    });
    if (this.destroyed || this.map !== map) return;
    try { map.setSky({ "sky-color": this.dark ? "#0b1b24" : "#9fc8e6", "horizon-color": this.dark ? "#1a2c33" : "#e6f0f2", "fog-color": this.dark ? "#13221d" : "#eef2ec",
      "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.35, "atmosphere-blend": 0.8 } as never); } catch { /* older engines */ }
    map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.38, position: [1.6, 200, 35] });
    await this.decorate(map);
    map.on("dragstart", () => { if (this.ui.follow) this.set({ follow: false }); });
    map.on("zoomstart", (e) => { if ((e as { originalEvent?: unknown }).originalEvent) this.userZoom = true; });
  }

  private async decorate(map: maplibregl.Map) {
    const P = this.plan;
    // the journey, by mode, with a white casing; walking dotted; the part already done in gold
    const legs: GeoJSON.Feature[] = P.hops.flatMap((h) => h.legs.map((l) => ({ type: "Feature", properties: { mode: l.mode }, geometry: { type: "LineString", coordinates: l.coords } } as GeoJSON.Feature)));
    map.addSource("trip", { type: "geojson", data: { type: "FeatureCollection", features: legs } });
    map.addLayer({ id: "trip-case", type: "line", source: "trip", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 15, 15], "line-opacity": 0.95 } });
    map.addLayer({ id: "trip-boat", type: "line", source: "trip", filter: ["==", ["get", "mode"], "boat"], layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": MODE_COLOUR.boat, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 15, 9] } });
    map.addLayer({ id: "trip-walk", type: "line", source: "trip", filter: ["==", ["get", "mode"], "walk"], layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": MODE_COLOUR.walk, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 15, 8], "line-dasharray": [0.1, 1.7] } });
    map.addSource("done", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
    map.addLayer({ id: "trip-done", type: "line", source: "done", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": MODE_COLOUR.done, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 15, 5], "line-opacity": 0.95 } });
    // pause tools (empty until paused)
    const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    map.addSource("buf", { type: "geojson", data: empty });
    map.addSource("bufp", { type: "geojson", data: empty });
    map.addSource("goto", { type: "geojson", data: empty });
    map.addSource("poipts", { type: "geojson", data: empty });
    map.addLayer({ id: "buf-fill", type: "fill", source: "buf", paint: { "fill-color": "#eda100", "fill-opacity": 0.12 } });
    map.addLayer({ id: "buf-line", type: "line", source: "buf", paint: { "line-color": "#b07800", "line-width": 2.5, "line-dasharray": [2, 1.5] } });
    map.addLayer({ id: "buf-pulse", type: "line", source: "bufp", paint: { "line-color": "#e34948", "line-width": 3.5, "line-opacity": 0.8 } });
    map.addLayer({ id: "goto-case", type: "line", source: "goto", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 9 } });
    map.addLayer({ id: "goto", type: "line", source: "goto", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1f6fd1", "line-width": 5, "line-dasharray": [0.3, 1.6] } });
    // glossy standing pins: the places (numbered), the ghats where you change
    const L0 = { "icon-image": ["get", "img"], "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-ignore-placement": true,
      "icon-pitch-alignment": "viewport", "icon-rotation-alignment": "viewport", "symbol-z-order": "viewport-y" } as Record<string, unknown>;
    const stops = P.stops;
    const last = stops.length - 1;
    const back = last > 0 && stops[last].id.endsWith("-back");
    const sf = await Promise.all(stops.map(async (s, i) => {
      if (back && i === last) return null;
      const inner = i === 0 ? { icon: "home" } : i === last ? { icon: "flag" } : { text: String(i) };
      const col = i === 0 ? PIN_COL.start : i === last ? PIN_COL.end : PIN_COL.stop;
      const id = await addPinImage(map, `stop-${col}-${inner.icon || inner.text}`, col, inner, 40);
      return { type: "Feature", properties: { img: id, i, name: s.name }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } } as GeoJSON.Feature;
    }));
    const ghats: GeoJSON.Feature[] = [];
    const gid = await addPinImage(map, `ghat-${PIN_COL.ghat}`, PIN_COL.ghat, { icon: "anchor" }, 28);
    P.hops.forEach((h) => h.legs.forEach((l, k) => {
      if (k === 0) return;
      const c = l.coords[0];
      ghats.push({ type: "Feature", properties: { img: gid, name: legEnd(l, "from", this.lang) }, geometry: { type: "Point", coordinates: c } });
    }));
    if (this.map !== map) return;
    map.addSource("ghatpins", { type: "geojson", data: { type: "FeatureCollection", features: ghats } });
    map.addSource("stoppins", { type: "geojson", data: { type: "FeatureCollection", features: sf.filter(Boolean) as GeoJSON.Feature[] } });
    map.addLayer({ id: "pins-ghat", type: "symbol", source: "ghatpins", minzoom: 11, layout: L0 as never });
    map.addLayer({ id: "pins-stops", type: "symbol", source: "stoppins", layout: { ...L0, "text-field": ["get", "name"], "text-font": ["Noto Sans Medium"], "text-size": 12.5,
      "text-anchor": "left", "text-offset": [1.4, -2.6], "text-optional": true, "text-allow-overlap": false } as never,
      paint: this.dark || this.ui.base === "sat" ? { "text-color": "#f4f7f5", "text-halo-color": "rgba(8,16,13,0.92)", "text-halo-width": 1.6 }
        : { "text-color": "#16201c", "text-halo-color": "rgba(255,255,255,0.95)", "text-halo-width": 1.6 } });
    map.addLayer({ id: "poi-pins", type: "symbol", source: "poipts", layout: { ...L0, "icon-size": ["case", ["==", ["get", "sel"], 1], 1.3, 1] } as never });
    map.on("click", "poi-pins", (e) => { const f = e.features?.[0]; if (f) this.selectNear(Number(f.properties?.i)); });
    map.on("click", "pins-stops", (e) => {
      const f = e.features?.[0]; if (!f || this.ui.around) return;
      new maplibregl.Popup({ closeButton: true, offset: [0, -50], className: "t3-pop" }).setLngLat((f.geometry as GeoJSON.Point).coordinates as LL)
        .setHTML(`<b>${String(f.properties?.name || "").replace(/</g, "&lt;")}</b>`).addTo(map);
    });
    for (const id of ["poi-pins", "pins-stops"]) {
      map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
    }
    // the traveller
    const el = document.createElement("div");
    el.className = "trav";
    const p0 = this.tl.pts[0];
    this.markerMode = (this.plan.hops[0]?.legs[0]?.mode as "boat" | "walk") || "boat";
    el.innerHTML = travellerHTML(this.markerMode);
    this.marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([p0.lon, p0.lat]).addTo(map);
  }

  private async intro() {
    const m = this.map;
    if (!m) return;
    const b = bboxOf(this.tl.pts.map((p) => [p.lon, p.lat] as LL), 0.01);
    const small = window.innerWidth < 768;
    m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: small ? { top: 110, bottom: 150, left: 30, right: 80 } : { top: 120, bottom: 120, left: 80, right: 140 },
      pitch: this.ui.view3d ? 48 : 0, bearing: this.ui.view3d ? -14 : 0, duration: 0, maxZoom: 14 });
    await new Promise((r) => setTimeout(r, 1300));
    if (this.destroyed || !this.map) return;
    const p = at(this.tl.pts, 0);
    const p2 = at(this.tl.pts, Math.min(this.tl.total, 3));
    this.brg = bearing([p.lon, p.lat], [p2.lon, p2.lat]) || 0;
    await new Promise<void>((ok) => {
      m.once("moveend", () => ok());
      m.easeTo({ center: [p.lon, p.lat], zoom: this.zoomFor(this.tl.segs[0]), pitch: this.ui.view3d ? 62 : 0, bearing: this.ui.view3d ? this.brg : 0, duration: 2200 });
      setTimeout(ok, 2600);
    });
  }

  private zoomFor(seg?: TSeg) { return !seg ? 14.2 : seg.kind === "boat" ? 13.7 : seg.kind === "walk" ? 15 : 14.5; }

  /* ================================================================== playback */
  play() {
    if (this.ui.live) return;
    if (this.ui.around) this.clearAround();
    if (this.ui.pos >= this.tl.total - 1e-6) { this.ui.pos = 0; this.reached.clear(); this.segIdx = -1; this.set({ done: false }); }
    cancelAnimationFrame(this.raf);
    this.lastTs = 0;
    this.set({ playing: true, follow: true, card: null });
    this.raf = requestAnimationFrame((ts) => this.tick(ts));
  }
  private halt() { cancelAnimationFrame(this.raf); this.set({ playing: false }); }
  private held = false;
  /** stop the clock while a sheet is open (help numbers); carry on when it closes */
  hold(on: boolean) {
    if (on) { this.held = this.ui.playing; if (this.ui.playing) this.halt(); }
    else if (this.held) { this.held = false; this.play(); }
  }
  pause() {
    this.halt();
    this.showAround();
    if (this.ui.voice) say(phrase("paused", this.vLang), this.vLang, { flush: true });
  }
  resume() { this.set({ follow: true }); this.play(); }
  toggle() { if (this.ui.live) return; if (this.ui.playing) this.pause(); else this.resume(); }

  private tick(ts: number) {
    if (!this.ui.playing || this.destroyed) return;
    const dt = this.lastTs ? Math.min(0.1, (ts - this.lastTs) / 1000) : 0;
    this.lastTs = ts;
    if (ts < this.holdUntil) { this.raf = requestAnimationFrame((x) => this.tick(x)); return; }
    const seg = segAt(this.tl, this.ui.pos);
    // time at a place passes quickly (the card already showed it); changing at a ghat runs a little faster
    const k = seg?.kind === "stay" ? 12 : seg?.kind === "change" ? 4 : 1;
    this.ui.pos = Math.min(this.tl.total, this.ui.pos + dt * this.ui.speed * k);
    this.update();
    if (this.ui.pos >= this.tl.total - 1e-6) { this.arrive(this.tl.arrive.length - 1, true); return; }
    this.raf = requestAnimationFrame((x) => this.tick(x));
  }

  /** draw the traveller at the current position; announce new segments and arrivals */
  update(force = false, liveLL?: LL) {
    const T = this.tl, pos = this.ui.pos;
    const p = at(T.pts, pos);
    const seg = segAt(T, pos);
    const si = seg ? T.segs.indexOf(seg) : 0;
    // arrivals
    T.arrive.forEach((a, k) => {
      if (pos >= a.t - 1e-6 && !this.reached.has(k) && k < T.arrive.length - 1) this.arrive(k, false);
    });
    const m = this.map;
    if (m && this.marker) {
      const ll: LL = liveLL || [p.lon, p.lat];
      this.marker.setLngLat(ll);
      const mode = seg?.kind === "walk" ? "walk" : seg?.kind === "boat" ? "boat" : this.markerMode;
      if (mode !== this.markerMode) { this.markerMode = mode; this.marker.getElement().innerHTML = travellerHTML(mode); }
      const moving = seg && (seg.kind === "boat" || seg.kind === "walk");
      if (moving) { const d = ((p.brg - this.brg + 540) % 360) - 180; this.brg = (this.brg + d * (this.ui.live ? 0.6 : 0.08) + 360) % 360; }
      const dir = this.marker.getElement().querySelector<HTMLElement>(".trav-dir");
      if (dir) dir.style.transform = `rotate(${(moving ? p.brg : this.brg) - m.getBearing()}deg)`;
      const done = T.pts.slice(0, p.i + 1).map((q) => [q.lon, q.lat]).concat([[p.lon, p.lat]]);
      (m.getSource("done") as GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: done } });
      if (this.ui.follow && !this.ui.around) {
        const zoom = this.userZoom ? m.getZoom() : force ? this.zoomFor(seg) : m.getZoom() + (this.zoomFor(seg) - m.getZoom()) * 0.04;
        const cam = { center: ll, bearing: this.ui.view3d ? this.brg : 0, pitch: this.ui.view3d ? 62 : 0, zoom };
        if (this.ui.live) m.easeTo({ ...cam, zoom: this.userZoom ? m.getZoom() : this.zoomFor(seg), duration: 950, easing: (x) => x });
        else m.jumpTo(cam);
      }
    }
    if (seg && (si !== this.segIdx || force)) {
      const changed = si !== this.segIdx;
      this.segIdx = si;
      if (changed) this.queue(this.segSpeech(seg));
      this.set({ seg: si, pos });
    } else this.set({ pos }, false);
    this.flush();
  }

  private arrive(k: number, final: boolean) {
    this.reached.add(k);
    const a = this.tl.arrive[k];
    const s = this.plan.stops[a.stop];
    const stay = Math.round(a.leave - a.t);
    this.queue(final ? phrase("done", this.vLang, { name: s.name }) : stay > 0 ? phrase("arrive", this.vLang, { name: s.name, m: spokenMin(stay, this.vLang) }) : phrase("arriveNoStay", this.vLang, { name: s.name }));
    if (final) {
      this.ui.pos = this.tl.total;
      this.flush();
      this.halt();
      this.set({ card: { stop: a.stop, final: true }, done: true, pos: this.tl.total });
      return;
    }
    this.set({ card: { stop: a.stop, final: false } });
    if (!this.ui.live) {
      this.holdUntil = performance.now() + 4800;
      setTimeout(() => {
        if (this.destroyed || this.ui.card?.stop !== a.stop) return;
        if (performance.now() >= this.holdUntil - 60) this.set({ card: null });
      }, 4900);
    }
  }
  continueTrip() {
    this.holdUntil = 0;
    const c = this.ui.card;
    if (c && !c.final && !this.ui.live) {
      const a = this.tl.arrive.find((x) => x.stop === c.stop);
      if (a && this.ui.pos < a.leave) this.ui.pos = a.leave - 0.01;
    }
    this.set({ card: null });
    if (!this.ui.playing && !this.ui.live) this.resume();
  }

  /** jump to any moment of the trip (the strip under the map) */
  seek(t: number) {
    if (this.ui.live) return;
    if (this.ui.around) this.clearAround();
    const pos = Math.max(0, Math.min(this.tl.total, t));
    this.ui.pos = pos;
    this.reached = new Set(this.tl.arrive.map((a, k) => (a.t <= pos + 1e-6 ? k : -1)).filter((k) => k >= 0));
    this.holdUntil = 0;
    const seg = segAt(this.tl, pos);
    this.segIdx = seg ? this.tl.segs.indexOf(seg) : -1;
    this.userZoom = false;
    this.set({ card: null, done: false, follow: true, seg: Math.max(0, this.segIdx), pos });
    this.update(true);
  }

  /* ================================================================== voice */
  private queue(s: string) { if (s) this.vq.push(s); }
  private flush() {
    const q = this.vq; this.vq = [];
    if (!q.length || !this.ui.voice) return;
    const hold = !!this.ui.card && !this.ui.card.final && !this.ui.live;
    const text = q.join(" ");
    // wait at a place while its name is read out (about as long as the sentence takes; never stuck if the voice is silent)
    if (hold) this.holdUntil = performance.now() + Math.min(12000, Math.max(4800, 1200 + text.length * (this.vLang === "bn" ? 90 : 70)));
    say(text, this.vLang, { flush: true, onend: hold ? () => { this.holdUntil = Math.min(this.holdUntil, performance.now() + 900); } : undefined });
  }
  private segSpeech(seg: TSeg): string {
    const L = this.vLang, P = this.plan;
    if (seg.kind === "stay") return "";
    const h = P.hops[seg.hop];
    if (seg.kind === "change") {
      const a = h.legs[seg.leg - 1], b = h.legs[seg.leg];
      if (!a || !b) return "";
      const nm = (m: string) => (m === "boat" ? (L === "bn" ? "নৌকা" : "boat") : (L === "bn" ? "হাঁটা" : "walking"));
      return phrase("change", L, { at: b.fromName || a.toName || legEnd(b, "from", L), a: nm(a.mode), b: nm(b.mode) });
    }
    const l = h.legs[seg.leg];
    if (!l) return "";
    const to = legEnd(l, "to", L);
    if (l.mode === "walk") return phrase("walk", L, { d: spokenKm(l.km, L), to, m: spokenMin(l.min, L) });
    const vessel = P.settings.vessel === "country_boat" ? (L === "bn" ? "দেশি নৌকা" : "country boat") : (L === "bn" ? "মোটর নৌকা" : "motor boat");
    const via = l.rivers.length ? (L === "bn" ? `${l.rivers.join(", ")} হয়ে ` : ` along ${l.rivers.join(", ")}`) : "";
    return phrase("boat", L, { vessel, d: spokenKm(l.km, L), via, to, m: spokenMin(l.min, L) });
  }
  toggleVoice() {
    const v = !this.ui.voice;
    try { localStorage.setItem(VOICE_KEY, v ? "1" : "0"); } catch { /* storage blocked */ }
    this.set({ voice: v });
    if (!v) stopVoice();
    else { this.vLang = this.speakLang(); const s = this.tl.segs[this.segIdx]; if (s) { this.queue(this.segSpeech(s)); this.flush(); } }
  }

  /* ================================================================== controls */
  cycleSpeed() { const i = SPEEDS.indexOf(this.ui.speed); this.set({ speed: SPEEDS[(i + 1) % SPEEDS.length] }); }
  toggleView() {
    const v = !this.ui.view3d;
    this.set({ view3d: v });
    const m = this.map;
    if (!m) return;
    if (this.ui.around) m.easeTo({ pitch: v ? 45 : 0, bearing: v ? m.getBearing() : 0, duration: 700 });
    else { this.set({ follow: true }); m.easeTo({ pitch: v ? 62 : 0, bearing: v ? this.brg : 0, duration: 700 }); }
  }
  followNow() { this.userZoom = false; this.set({ follow: true }); this.update(true, this.ui.live?.here && this.ui.live.off ? this.ui.live.here : undefined); }
  async cycleBase() {
    const next = BASES[(BASES.indexOf(this.ui.base) + 1) % BASES.length];
    const was = this.ui.playing, hadAround = this.ui.around;
    if (hadAround) this.clearAround();
    this.halt();
    this.set({ base: next, ready: false });
    await this.mount();
    if (this.destroyed) return;
    this.set({ ready: true });
    this.update(true);
    if (was) this.play(); else if (hadAround) this.showAround();
  }

  /* ================================================================== pause: what is around */
  private async showAround() {
    const p = at(this.tl.pts, this.ui.pos);
    const here: LL = this.ui.live?.here || [p.lon, p.lat];
    const A: AroundState = { here, t: this.ui.pos, r: AROUND_M, items: [], loaded: false, group: "help", q: "", sel: null, going: null };
    this.set({ around: A, follow: false, card: null });
    this.drawBuffer(here, AROUND_M);
    // 1 km first; in the forest and on the rivers the circle widens until there is something to show
    const all = await around(here, 5000, this.lang).catch(() => [] as NearItem[]);
    if (this.ui.around?.here !== here) return;
    const r = [1000, 2000, 3000, 5000].find((x) => all.filter((y) => y.d <= x).length >= 4) || 5000;
    const items = all.filter((y) => y.d <= r);
    const group: NearGroup = items.some((y) => y.group === "help") ? "help" : (["ghats", "villages", "services", "places"] as NearGroup[]).find((g) => items.some((y) => y.group === g)) || "help";
    this.set({ around: { ...this.ui.around, r, items, group, loaded: true } });
    if (r !== AROUND_M) this.drawBuffer(here, r);
    this.drawPois(true);
  }
  filtered(A = this.ui.around): NearItem[] {
    if (!A) return [];
    if (A.q.trim()) {
      const ws = norm(A.q).split(" ").filter(Boolean);
      return A.items.filter((x) => { const hay = norm(`${x.name} ${x.sub} ${x.group} ${x.kind} ${KIND_WORDS[x.kind] || ""} ${GROUP_STYLE[x.group].en} ${GROUP_STYLE[x.group].bn}`); return ws.every((w) => hay.includes(w)); });
    }
    return A.items.filter((x) => x.group === A.group);
  }
  setNearGroup(g: NearGroup) { if (!this.ui.around) return; this.set({ around: { ...this.ui.around, group: g, q: "" } }); this.drawPois(true); }
  setNearQuery(q: string) { if (!this.ui.around) return; this.set({ around: { ...this.ui.around, q } }); this.drawPois(true); }

  private drawBuffer(here: LL, R: number) {
    const m = this.map;
    if (!m) return;
    (m.getSource("buf") as GeoJSONSource)?.setData(circle(here, R));
    (m.getSource("goto") as GeoJSONSource)?.setData({ type: "FeatureCollection", features: [] });
    const z = Math.log2((156543 * Math.cos((here[1] * Math.PI) / 180) * Math.min(window.innerWidth, window.innerHeight)) / (R * 2.9));
    const small = window.innerWidth < 768;
    m.easeTo({ center: here, zoom: Math.min(16, z), pitch: this.ui.view3d ? 45 : 0, duration: 900, padding: small ? { top: 0, bottom: window.innerHeight * 0.45, left: 0, right: 0 } : { left: 380, right: 0, top: 0, bottom: 0 } });
    cancelAnimationFrame(this.pulseRaf);
    const t0 = performance.now();
    const step = (ts: number) => {
      if (!this.ui.around || !this.map) return;
      const f = ((ts - t0) % 2200) / 2200;
      (this.map.getSource("bufp") as GeoJSONSource)?.setData(circle(here, Math.max(1, R * f)));
      if (this.map.getLayer("buf-pulse")) this.map.setPaintProperty("buf-pulse", "line-opacity", 0.85 * (1 - f));
      this.pulseRaf = requestAnimationFrame(step);
    };
    this.pulseRaf = requestAnimationFrame(step);
  }
  private async drawPois(pop = false) {
    const A = this.ui.around, m = this.map;
    if (!A || !m) return;
    const show = new Map<number, NearItem>();
    A.items.filter((x) => x.group === "help").forEach((x) => show.set(x.i, x));
    this.filtered(A).slice(0, 120).forEach((x) => show.set(x.i, x));
    const items = [...show.values()];
    const ids = await Promise.all(items.map((x) => { const col = GROUP_STYLE[x.group].color; return addPinImage(m, `poi-${x.group}-${iconFor(x)}`, col, { icon: iconFor(x) }, x.group === "help" ? 34 : 29); }));
    if (this.ui.around !== A && this.ui.around?.here !== A.here) return;
    const sel = this.ui.around?.sel ?? null;
    (m.getSource("poipts") as GeoJSONSource)?.setData({ type: "FeatureCollection", features: items.map((x, k) => ({ type: "Feature", properties: { img: ids[k], i: x.i, sel: sel === x.i ? 1 : 0 },
      geometry: { type: "Point", coordinates: [x.lon, x.lat] } })) });
    if (pop) {
      const t0 = performance.now();
      const step = (ts: number) => {
        if (!this.map || !this.map.getLayer("poi-pins")) return;
        const f = Math.min(1, (ts - t0) / 420), k = f < 1 ? 0.25 + 0.9 * f - 0.15 * Math.sin(f * Math.PI) : 1;
        this.map.setLayoutProperty("poi-pins", "icon-size", ["case", ["==", ["get", "sel"], 1], 1.3 * k, k]);
        if (f < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }
  selectNear(i: number) {
    const A = this.ui.around, m = this.map;
    if (!A || !m) return;
    const x = A.items.find((y) => y.i === i);
    if (!x) return;
    this.set({ around: { ...A, sel: i } });
    this.drawPois();
    this.popup?.remove();
    const el = document.createElement("div");
    el.innerHTML = `<b>${x.name.replace(/</g, "&lt;")}</b><small>${x.sub.replace(/</g, "&lt;")} · ${x.d < 1000 ? `${Math.round(x.d)} m` : `${(x.d / 1000).toFixed(1)} km`}</small>`;
    this.popup = new maplibregl.Popup({ closeButton: false, offset: [0, -48], className: "t3-pop" }).setLngLat([x.lon, x.lat]).setDOMContent(el).addTo(m);
    m.easeTo({ center: [x.lon, x.lat], duration: 600 });
  }
  async goNear(i: number) {
    const A = this.ui.around, m = this.map;
    const x = A?.items.find((y) => y.i === i);
    if (!A || !x || !m) return;
    this.set({ around: { ...A, sel: i, going: { i, busy: true } } });
    let coords: LL[] = [A.here, [x.lon, x.lat]], min = (x.d * 1.3) / 75, dm = x.d * 1.3;
    try {
      const r = await planRoute({ origin: A.here, dest: [x.lon, x.lat], mode: "walk", tide: "low", vessel: "motor_boat", prefer: "main", alternatives: false });
      if (r.status === "ok" && r.routes[0]) { coords = [A.here, ...r.routes[0].legs.flatMap((l) => l.coords as LL[]), [x.lon, x.lat]]; min = r.routes[0].min; dm = r.routes[0].km * 1000; }
    } catch { /* straight line */ }
    if (!this.ui.around || this.ui.around.here !== A.here) return;
    (m.getSource("goto") as GeoJSONSource)?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
    const b = bboxOf(coords, 0.001);
    const small = window.innerWidth < 768;
    m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: small ? { top: 120, bottom: window.innerHeight * 0.5, left: 40, right: 80 } : { top: 130, bottom: 90, left: 420, right: 120 },
      maxZoom: 17, pitch: this.ui.view3d ? 45 : 0, duration: 800 });
    this.set({ around: { ...this.ui.around, going: { i, busy: false, min, m: dm } } });
  }
  private clearAround() {
    cancelAnimationFrame(this.pulseRaf);
    this.popup?.remove(); this.popup = null;
    const m = this.map;
    if (m) {
      const e: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      for (const id of ["buf", "bufp", "goto", "poipts"]) (m.getSource(id) as GeoJSONSource | undefined)?.setData(e);
    }
    this.set({ around: null });
  }

  /* ================================================================== live GPS */
  toggleLive() {
    if (this.ui.live) { this.stopLive(); return; }
    if (!navigator.geolocation) { this.set({ live: { status: "denied" } }); return; }
    this.halt();
    if (this.ui.around) this.clearAround();
    this.set({ live: { status: "wait" }, follow: true, card: null });
    if (this.ui.voice) say(phrase("live", this.vLang), this.vLang, { flush: true });
    this.watch = navigator.geolocation.watchPosition((g) => this.onFix(g), (err) => {
      if (err.code === err.PERMISSION_DENIED) { this.stopWatch(); this.set({ live: { status: "denied" } }); }
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 25000 });
  }
  private stopWatch() { if (this.watch !== null) { navigator.geolocation.clearWatch(this.watch); this.watch = null; } }
  stopLive() { this.stopWatch(); this.set({ live: null }); }
  private lastFix: { ll: LL; ts: number } | null = null;
  private wasOff = false;
  private onFix(g: GeolocationPosition) {
    const ll: LL = [g.coords.longitude, g.coords.latitude];
    const acc = g.coords.accuracy;
    let kmh = g.coords.speed != null && g.coords.speed >= 0 ? g.coords.speed * 3.6 : undefined;
    if (kmh === undefined && this.lastFix) { const dt = (g.timestamp - this.lastFix.ts) / 3600e3; if (dt > 0) kmh = metres(this.lastFix.ll, ll) / 1000 / dt; }
    this.lastFix = { ll, ts: g.timestamp };
    const s = snap(this.tl.pts, ll);
    const tol = Math.max(180, Math.min(600, acc * 1.6));
    const off = s.d > tol ? s.d : 0;
    if (off && !this.wasOff && this.ui.voice) say(phrase("off", this.vLang), this.vLang, { flush: true });
    this.wasOff = !!off;
    if (!off) {
      const t = Math.max(0, Math.min(this.tl.total, s.t));
      // starting live tracking part-way: the places already behind you are not announced again
      this.tl.arrive.forEach((a, k) => { if (a.t < t - 3 && !this.reached.has(k)) this.reached.add(k); });
      this.ui.pos = t;
    }
    this.set({ live: { status: "ok", acc, off: off || undefined, kmh: kmh !== undefined && Number.isFinite(kmh) ? kmh : undefined, here: ll } });
    this.update(false, off ? ll : [s.lon, s.lat]);
    if (!off && this.ui.pos >= this.tl.total - 0.5 && !this.reached.has(this.tl.arrive.length - 1)) this.arrive(this.tl.arrive.length - 1, true);
  }
  replanFromHere() {
    const L = this.ui.live;
    if (!L?.here) return;
    const next = this.tl.arrive.findIndex((a, k) => !this.reached.has(k));
    this.onReplan?.(L.here, next >= 0 ? this.tl.arrive[next].stop : this.plan.stops.length - 1);
  }

  /* ================================================================== the clock at the traveller */
  clockAt(pos = this.ui.pos) { return this.ui.live ? Date.now() : this.tl.start + pos * 60000; }
  etaAt(pos = this.ui.pos) { return this.ui.live ? Date.now() + (this.tl.total - pos) * 60000 : this.tl.start + this.tl.total * 60000; }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf); cancelAnimationFrame(this.pulseRaf);
    this.stopWatch();
    stopVoice();
    window.removeEventListener("keydown", this.keyFn);
    this.popup?.remove();
    this.marker?.remove();
    this.map?.remove();
    this.map = null;
  }
}
