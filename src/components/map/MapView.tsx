"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { useApp } from "@/lib/app-context";
import { MapController } from "./controller";
import { getState, setState, subscribe } from "@/lib/map/store";
import { fmt } from "@/lib/format";
import { varLabel, varUnit } from "@/lib/data/catalog";
import { refByKey } from "@/lib/map/overlays";
import { pinEl } from "@/lib/trip/pins";

const POINT_LAYERS = ["poi-c", "ref-jetties-c", "ref-services-c", "ref-places-c"];

function markerEl(kind: "origin" | "dest" | "point" | "me") {
  const el = document.createElement("div");
  if (kind === "me") {
    el.className = "h-4 w-4 rounded-full border-[3px] border-white bg-[#2a78d6] shadow-[0_0_0_6px_rgba(42,120,214,0.25)]";
    return el;
  }
  const colour = kind === "origin" ? "#008300" : kind === "dest" ? "#e34948" : "#eda100";
  const letter = kind === "origin" ? "A" : kind === "dest" ? "B" : "";
  el.innerHTML = `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39C15 39 28 23.5 28 14A13 13 0 0 0 2 14C2 23.5 15 39 15 39Z" fill="${colour}" stroke="#fff" stroke-width="2"/>
    ${letter ? `<text x="15" y="19" text-anchor="middle" font-family="Inter Variable,sans-serif" font-size="13" font-weight="700" fill="#fff">${letter}</text>` : `<circle cx="15" cy="14" r="4.5" fill="#fff"/>`}</svg>`;
  return el;
}

export default function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const ctl = useRef<MapController | null>(null);
  const { theme, lang } = useApp();
  const live = useRef({ theme, lang });
  live.current = { theme, lang };
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = new MapController(el.current, live.current.theme);
    c.onError = (e) => setErr(String((e as Error)?.message || e));
    ctl.current = c;
    const m = c.map;
    const markers: Record<string, maplibregl.Marker | undefined> = {};
    let pinMarkers: maplibregl.Marker[] = [];
    let lastPins: unknown = null;
    let spotMarkers: maplibregl.Marker[] = [];
    let lastSpots: unknown = null;
    let lastSel: unknown = null, lastMarkers: unknown = null, lastMe: unknown = null, lastLayers: unknown = null, lastBm = "", lastLabels: unknown = null,
      lastOutline: unknown = null, lastHl: unknown = null, lastRoutes: unknown = null, lastMeasure: unknown = null, lastPick: unknown = null, lastV3d: unknown = null, lastZones: unknown = null, lastPois: unknown = null;
    const unsub = subscribe(() => {
      const s = getState();
      if (s.layers !== lastLayers || s.basemap !== lastBm || s.labels !== lastLabels || s.hexOutline !== lastOutline || s.highlight !== lastHl
        || s.routes !== lastRoutes || s.measure !== lastMeasure || s.pick !== lastPick || s.view3d !== lastV3d || s.zones !== lastZones || s.pois !== lastPois) {
        lastLayers = s.layers; lastBm = s.basemap; lastLabels = s.labels; lastOutline = s.hexOutline; lastHl = s.highlight; lastRoutes = s.routes;
        lastMeasure = s.measure; lastPick = s.pick; lastV3d = s.view3d; lastZones = s.zones; lastPois = s.pois;
        c.sync(live.current.theme, live.current.lang);
      }
      if (s.spots !== lastSpots) {
        lastSpots = s.spots;
        spotMarkers.forEach((mk) => mk.remove());
        spotMarkers = s.spots.map((p) => {
          const el = pinEl(p.colour, p.inner, p.size || 28);
          el.classList.add("spot-pin");
          if (p.title) el.title = p.title;
          if (p.onClick) { el.style.cursor = "pointer"; el.addEventListener("click", (e) => { e.stopPropagation(); p.onClick!(); }); }
          return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(m);
        });
      }
      if (s.pins !== lastPins) {
        lastPins = s.pins;
        pinMarkers.forEach((mk) => mk.remove());
        pinMarkers = s.pins.map((p) => {
          const el = pinEl(p.colour, p.inner, p.size || 30);
          if (p.title) el.title = p.title;
          if (p.onClick) { el.style.cursor = "pointer"; el.addEventListener("click", (e) => { e.stopPropagation(); p.onClick!(); }); }
          return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(m);
        });
      }
      if (s.markers !== lastMarkers || s.me !== lastMe || s.selection !== lastSel) {
        lastMarkers = s.markers; lastMe = s.me; lastSel = s.selection;
        const want: Record<string, [number, number] | undefined> = { origin: s.markers.origin, dest: s.markers.dest,
          point: s.markers.point ?? (s.selection && !s.selection.entity ? [s.selection.lon, s.selection.lat] : undefined), me: s.me ?? undefined };
        for (const k of Object.keys(want) as ("origin" | "dest" | "point" | "me")[]) {
          const p = want[k];
          if (!p) { markers[k]?.remove(); markers[k] = undefined; continue; }
          if (!markers[k]) markers[k] = new maplibregl.Marker({ element: markerEl(k), anchor: k === "me" ? "center" : "bottom" }).setLngLat(p).addTo(m);
          else markers[k]!.setLngLat(p);
        }
      }
    });
    c.sync(live.current.theme, live.current.lang);

    // ------------------------------------------------------------------ hover tooltip
    let raf = 0;
    let hoverVillage: string | number | null = null;
    const onMove = (e: maplibregl.MapMouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const s = getState();
        const t = tip.current;
        if (!t || s.pick) { if (t) t.style.opacity = "0"; return; }
        const pts = m.queryRenderedFeatures(e.point, { layers: POINT_LAYERS.filter((id) => m.getLayer(id)) });
        let html = "";
        if (pts.length) {
          const p = pts[0].properties as Record<string, string>;
          html = `<b>${p.name || ""}</b>`;
        }
        const hexIds = c.hexLayerIds();
        const vis = s.layers.filter((l) => (l.type === "hex" || l.type === "result") && l.visible);
        let hexIdx: number | null = null;
        if (!html && hexIds.length && vis.length) {
          const f = m.queryRenderedFeatures(e.point, { layers: hexIds })[0];
          if (f && typeof f.id === "number") {
            hexIdx = f.id;
            const hx = c.store();
            if (hx) {
              const L = vis[0];
              const { lang: lg } = live.current;
              if (L.type === "result") {
                const v = L.result!.values[hexIdx];
                const cl = L.result!.classes.find((x) => x.v === Math.round(v));
                html = `<div class="text-faint">${L.result!.title}</div><b>${cl ? cl.label : "—"}</b>`;
              } else {
                const def = hx.def(L.key)!;
                const v = hx.value(L.key, hexIdx);
                const cls = def.classes?.find((x) => x.v === Math.round(v));
                const val = Number.isNaN(v) ? "—" : cls ? (lg === "bn" ? cls.bn : cls.en) : `${fmt(v, lg, def.digits)} ${varUnit(def, lg)}`;
                html = `<div class="text-faint">${varLabel(def, lg)}</div><b>${val}</b>`;
              }
              const blk = hx.meta.blocks[hx.meta.block[hexIdx]];
              html += `<div class="text-faint">${hx.meta.id[hexIdx]}${blk ? " · " + blk : ""}</div>`;
            }
          }
        }
        c.setHover(hexIdx);
        // village hover outline
        const vl = m.getLayer("ref-villages-f") ? m.queryRenderedFeatures(e.point, { layers: ["ref-villages-f"] })[0] : undefined;
        const vid = vl?.id ?? null;
        if (vid !== hoverVillage) {
          if (hoverVillage !== null) m.setFeatureState({ source: "ref-villages", id: hoverVillage }, { hover: false });
          if (vid !== null) m.setFeatureState({ source: "ref-villages", id: vid }, { hover: true });
          hoverVillage = vid;
        }
        if (!html && vl) html = `<b>${(vl.properties as { name?: string }).name || ""}</b>`;
        m.getCanvas().style.cursor = s.pick ? "crosshair" : pts.length ? "pointer" : "";
        if (html) {
          t.innerHTML = html;
          t.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
          t.style.opacity = "1";
        } else t.style.opacity = "0";
      });
    };
    const onLeave = () => { if (tip.current) tip.current.style.opacity = "0"; c.setHover(null); };

    // ------------------------------------------------------------------ click
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const s = getState();
      const ll: [number, number] = [+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)];
      if (s.pick === "measure-line" || s.pick === "measure-area") { setState({ measure: [...s.measure, ll] }); return; }
      if (s.pick && s.pickHandler) { const h = s.pickHandler; setState({ pick: null, pickHandler: null }); h(ll); return; }
      const pts = m.queryRenderedFeatures(e.point, { layers: POINT_LAYERS.filter((id) => m.getLayer(id)) });
      if (pts.length) {
        const f = pts[0];
        if (f.layer.id === "poi-c") {
          const pp = f.properties as { t: string; id: string };
          const gg = f.geometry as GeoJSON.Point;
          setState({ selection: { lon: gg.coordinates[0], lat: gg.coordinates[1], entity: { type: pp.t, id: String(pp.id) } } });
          return;
        }
        const key = f.layer.id.replace(/^ref-/, "").replace(/-c$/, "");
        const def = refByKey(key);
        const p = f.properties as Record<string, unknown>;
        if (def?.entity) {
          const type = typeof def.entity.type === "function" ? def.entity.type(p) : def.entity.type;
          const g = f.geometry as GeoJSON.Point;
          setState({ selection: { lon: g.coordinates[0], lat: g.coordinates[1], entity: { type, id: String(p[def.entity.prop]) } } });
          return;
        }
      }
      setState({ selection: { lon: ll[0], lat: ll[1] } });
    };
    const onDbl = (e: maplibregl.MapMouseEvent) => {
      const s = getState();
      if (s.pick === "measure-line" || s.pick === "measure-area") { e.preventDefault(); setState({ pick: null }); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && getState().pick) setState({ pick: null, pickHandler: null }); };
    m.on("mousemove", onMove);
    m.on("mouseout", onLeave);
    m.on("click", onClick);
    m.on("dblclick", onDbl);
    window.addEventListener("keydown", onKey);
    return () => {
      unsub(); cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      Object.values(markers).forEach((mk) => mk?.remove());
      pinMarkers.forEach((mk) => mk.remove()); spotMarkers.forEach((mk) => mk.remove());
      c.destroy();
      ctl.current = null;
    };
  }, []);

  useEffect(() => { ctl.current?.sync(theme, lang); }, [theme, lang]);

  return (
    <div className="absolute inset-0">
      <div ref={el} className="absolute inset-0" aria-label="Map" role="region" />
      <div ref={tip} className="pointer-events-none absolute left-0 top-0 z-10 max-w-[240px] rounded-lg border border-line bg-raised/95 px-2 py-1 text-xs leading-snug text-ink shadow-float transition-opacity duration-100"
        style={{ opacity: 0 }} />
      {err && <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-lg bg-risk px-3 py-1.5 text-xs text-white">{err}</div>}
    </div>
  );
}
