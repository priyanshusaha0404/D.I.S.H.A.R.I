"use client";
/** Shared state of the map workspace (layers, basemap, selection, tools). Panels change it; the map view follows it. */
import { useSyncExternalStore } from "react";
import type maplibregl from "maplibre-gl";
import type { Symbology } from "../symbology";
import type { RouteResult } from "../routing/client";

export type LayerType = "hex" | "raster" | "ref" | "result";
export interface LayerItem {
  id: string;
  type: LayerType;
  key: string;                 // variable key, raster key or reference-layer key
  opacity: number;
  visible: boolean;
  sym?: Symbology;             // hex layers
  /** analysis result layers: values per hexagon + explicit classes */
  result?: { title: string; values: Float32Array; classes: { v: number; colour: string; label: string }[] };
}
export type Pick = null | "origin" | "dest" | "measure-line" | "measure-area" | "point";
export interface Selection { lon: number; lat: number; entity?: { type: string; id: string } }

export interface MapState {
  basemap: string;
  labels: boolean;
  hexOutline: boolean;
  layers: LayerItem[];
  selection: Selection | null;
  highlight: { layer: string; ids: (number | string)[] } | null;
  routes: { list: RouteResult[]; active: number } | null;
  markers: { origin?: [number, number]; dest?: [number, number]; point?: [number, number] };
  /** numbered glossy pins (smart-trip stops, ghats where you change) */
  pins: { lon: number; lat: number; colour: string; inner?: { text?: string; icon?: string }; size?: number; title?: string; onClick?: () => void }[];
  /** spots the models suggest (honey, fish, crab, tiger) — tap one to add it to the trip */
  spots: { lon: number; lat: number; colour: string; inner?: { text?: string; icon?: string }; size?: number; title?: string; onClick?: () => void }[];
  /** tilted map with 3D hexagon columns */
  view3d: boolean;
  pick: Pick;
  pickHandler: ((lngLat: [number, number]) => void) | null;
  measure: [number, number][];
  compare: null | { left: string; right: string; pos: number };
  layerPanel: boolean;
  gallery: boolean;
  me: [number, number] | null;
  /** density maps of where the models put tiger, fish, honey and crab */
  zones: string[];
  /** point-of-interest categories drawn on the map */
  pois: string[];
}

const initial: MapState = {
  basemap: "esri_imagery", labels: true, hexOutline: false, layers: [], selection: null, highlight: null, routes: null, markers: {}, pins: [], spots: [], view3d: false,
  pick: null, pickHandler: null, measure: [], compare: null, layerPanel: false, gallery: false, me: null, zones: [], pois: [],
};

let state: MapState = initial;
const subs = new Set<() => void>();
let mapRef: maplibregl.Map | null = null;

function emit() { subs.forEach((f) => f()); }
export function getState() { return state; }
export function setState(p: Partial<MapState> | ((s: MapState) => Partial<MapState>)) {
  const patch = typeof p === "function" ? p(state) : p;
  state = { ...state, ...patch };
  emit();
}
export function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
export function useMapState<T>(sel: (s: MapState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(initial));
}

let pending: (() => void) | null = null;
let loaded = false;
export function setMap(m: maplibregl.Map | null) { mapRef = m; loaded = false; }
/** called by the map once its style has loaded: runs a camera move requested before the map existed */
export function mapLoaded() { loaded = true; const p = pending; pending = null; p?.(); }
export function getMap() { return mapRef; }
/** true once the map exists and its style has loaded (camera moves then apply at once) */
export const isMapLoaded = () => !!mapRef && loaded;

/* ------------------------------------------------------------------ layer actions */
let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;

export function addLayer(type: LayerType, key: string, opts: Partial<LayerItem> = {}) {
  setState((s) => {
    if (type !== "result" && s.layers.some((l) => l.type === type && l.key === key)) {
      return { layers: s.layers.map((l) => (l.type === type && l.key === key ? { ...l, visible: true } : l)) };
    }
    const item: LayerItem = { id: nextId(type), type, key, opacity: type === "ref" ? 1 : type === "raster" ? 0.9 : 0.78, visible: true, ...opts };
    return { layers: [item, ...s.layers] };
  });
}
export function removeLayer(id: string) { setState((s) => ({ layers: s.layers.filter((l) => l.id !== id) })); }
export function updateLayer(id: string, p: Partial<LayerItem>) { setState((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, ...p } : l)) })); }
export function moveLayer(id: string, dir: -1 | 1) {
  setState((s) => {
    const i = s.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.layers.length) return {};
    const a = [...s.layers];
    [a[i], a[j]] = [a[j], a[i]];
    return { layers: a };
  });
}
export function hasLayer(type: LayerType, key: string) { return state.layers.some((l) => l.type === type && l.key === key && l.visible); }
export function toggleLayer(type: LayerType, key: string) {
  const ex = state.layers.find((l) => l.type === type && l.key === key);
  if (ex) removeLayer(ex.id); else addLayer(type, key);
}

/** Replace the thematic layers with a preset (used when a theme page opens). Reference layers chosen by the user stay. */
export function applyPreset(items: { type: LayerType; key: string; visible?: boolean; opacity?: number }[]) {
  setState((s) => {
    const keep = s.layers.filter((l) => l.type === "ref" && !items.some((i) => i.type === "ref" && i.key === l.key));
    const fresh: LayerItem[] = items.map((i) => ({ id: nextId(i.type), type: i.type, key: i.key, visible: i.visible ?? true,
      opacity: i.opacity ?? (i.type === "ref" ? 1 : i.type === "raster" ? 0.9 : 0.78) }));
    return { layers: [...fresh, ...keep], compare: null };
  });
}
/** Show one hexagon variable as the main thematic layer (keeps other layers). */
export function showVariable(key: string) {
  setState((s) => {
    const others = s.layers.filter((l) => l.type !== "hex" || l.key === key);
    const ex = others.find((l) => l.type === "hex" && l.key === key);
    if (ex) return { layers: [{ ...ex, visible: true }, ...others.filter((l) => l !== ex)] };
    return { layers: [{ id: nextId("hex"), type: "hex", key, visible: true, opacity: 0.78 }, ...others] };
  });
}
export function showResult(title: string, values: Float32Array, classes: { v: number; colour: string; label: string }[]) {
  setState((s) => ({ layers: [{ id: nextId("result"), type: "result", key: title, visible: true, opacity: 0.85, result: { title, values, classes } },
    ...s.layers.filter((l) => l.type !== "result")] }));
}

/* ------------------------------------------------------------------ camera helpers */
export const HOME_BOUNDS: [number, number, number, number] = [87.95, 21.5, 89.2, 22.7];
/** screen space covered by a floating window (the assistant): camera moves keep places out from under it */
let inset = { right: 0, bottom: 0, left: 108 };
export function setMapInset(p: Partial<typeof inset>) { inset = { ...inset, ...p }; }
/** padding for camera fits: the side panel on the left (bottom sheet on phones) and any floating window */
export function mapPadding(extraBottom = 0) {
  const small = window.matchMedia("(max-width: 767px)").matches;
  const w = window.innerWidth, h = window.innerHeight;
  const left = (small ? 0 : Math.min(inset.left, w * 0.5)) + 40;
  const right = Math.max(60, Math.min(60 + inset.right, w - left - 300));
  const bottom = Math.min(Math.max(small ? Math.round(h * 0.45) : 60, inset.bottom + 20) + extraBottom, h - 200);
  return { top: 60, bottom, left, right };
}
export function fitBounds(b: [number, number, number, number] | null | undefined, maxZoom = 13) {
  const m = getMap();
  if (!b) return;
  if (!m || !loaded) { pending = () => fitBounds(b, maxZoom); return; }
  m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: mapPadding(), maxZoom, duration: 900 });
}
export function flyTo(lon: number, lat: number, zoom = 13) {
  const m = getMap();
  if (!m || !loaded) { pending = () => flyTo(lon, lat, zoom); return; }
  const small = window.matchMedia("(max-width: 767px)").matches;
  const left = small ? 0 : Math.min(inset.left, window.innerWidth * 0.5);
  const right = Math.min(inset.right, Math.max(0, window.innerWidth - left - 300));
  m.flyTo({ center: [lon, lat], zoom: Math.max(zoom, m.getZoom()), duration: 900,
    offset: small ? [0, -Math.round(Math.max(window.innerHeight * 0.36, inset.bottom) / 2)] : [Math.round((left - right) / 2), 0] });
}

/** Start a one-shot map pick (route ends, finder centre, notes). Esc or a second call cancels. */
export function startPick(kind: Exclude<Pick, null | "measure-line" | "measure-area">, handler: (ll: [number, number]) => void) {
  setState({ pick: kind, pickHandler: handler });
}
export function cancelPick() { setState({ pick: null, pickHandler: null }); }
