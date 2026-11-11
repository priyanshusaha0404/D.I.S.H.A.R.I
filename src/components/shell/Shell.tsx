"use client";
/** The whole site on one screen: a full map with a floating search bar, a rail of tools, drawers (smart trip, nearby,
 *  dashboard, saved), base-map and layer switches, the place card and the assistant. */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Bookmark, Box, House, Landmark, Layers, LocateFixed, MapPin, Minus, Moon, Plus, Route, Sun, X } from "@/components/icons";
import { useApp } from "@/lib/app-context";
import SearchBox, { type PickedPlace } from "@/components/SearchBox";
import { LogoMark, cx } from "@/components/ui";
import { applyPreset, fitBounds, flyTo, getMap, getState, hasLayer, HOME_BOUNDS, setMapInset, setState, toggleLayer, useMapState } from "@/lib/map/store";
import { useAssistant } from "@/lib/assistant/store";
import { useTrip } from "@/lib/trip/store";
import { openDrawer, setLayersOpen, toast, toggleDrawer, useUI, type Drawer } from "@/lib/ui";
import AssistantHost from "@/components/assistant/AssistantHost";
import TigerFab from "@/components/assistant/TigerFab";
import { ZONES, ZONE_META, type Zone } from "@/lib/zones";
import InfoCard from "./InfoCard";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false, loading: () => <div className="absolute inset-0 bg-surface" /> });
const TripPanel = dynamic(() => import("@/components/trip/TripPanel"), { ssr: false });
const Nearby = dynamic(() => import("./Nearby"), { ssr: false });
const Dash = dynamic(() => import("./Dash"), { ssr: false });
const Saved = dynamic(() => import("./Saved"), { ssr: false });
const Pois = dynamic(() => import("./Pois"), { ssr: false });

const BASES: { id: string; en: string; bn: string; th: string }[] = [
  { id: "osm", en: "OSM", bn: "OSM", th: "linear-gradient(135deg,#dfe8d8,#f3e9d2)" },
  { id: "esri_streets", en: "Esri Streets", bn: "Esri রাস্তা", th: "linear-gradient(135deg,#f0ead8,#c9d6ea)" },
  { id: "esri_imagery", en: "Esri Satellite", bn: "Esri উপগ্রহ", th: "linear-gradient(135deg,#1d3a28,#3d2f1d)" },
  { id: "esri_topo", en: "Esri Topo", bn: "Esri টোপো", th: "linear-gradient(135deg,#3d4d35,#a89a6a)" },
];
const START = [{ type: "ref" as const, key: "blocks" }];
const WIDTH: Record<string, number> = { trip: 408, pois: 392, near: 360, dash: 760, saved: 380 };

function LayersPop() {
  const { lang, L } = useApp();
  const basemap = useMapState((s) => s.basemap);
  const zones = useMapState((s) => s.zones);
  useMapState((s) => s.layers);
  const tz = (z: Zone) => setState({ zones: zones.includes(z) ? zones.filter((x) => x !== z) : [...zones, z] });
  return (
    <div className="glass fixed right-3 top-[124px] z-40 w-[272px] rounded-2xl p-3.5 md:right-4" role="dialog" aria-label={L("Map layers", "মানচিত্রের স্তর")}>
      <p className="grp mb-2">{L("Base map", "ভিত্তি মানচিত্র")}</p>
      <div className="grid grid-cols-3 gap-1.5">{BASES.map((b) => (
        <button key={b.id} onClick={() => setState({ basemap: b.id })} aria-pressed={basemap === b.id}
          className={cx("flex flex-col items-center gap-1 rounded-xl border-[1.5px] p-1.5 text-[10.5px] font-bold", basemap === b.id ? "border-accent text-accent" : "border-line text-muted hover:text-ink")}>
          <span className="h-8 w-full rounded-lg" style={{ background: b.th }} />{lang === "bn" ? b.bn : b.en}</button>))}</div>
      <p className="grp mb-1 mt-3.5">{L("Show on the map", "মানচিত্রে দেখান")}</p>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[12.5px] hover:bg-sunken/60">
        <input type="checkbox" className="h-[15px] w-[15px] accent-[rgb(var(--accent))]" checked={hasLayer("ref", "blocks")} onChange={() => toggleLayer("ref", "blocks")} />
        <i className="h-0.5 w-5 rounded bg-sky-300" />{L("Block boundaries", "ব্লকের সীমানা")}</label>
      {ZONES.map((z) => (
        <label key={z} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[12.5px] hover:bg-sunken/60">
          <input type="checkbox" className="h-[15px] w-[15px] accent-[rgb(var(--accent))]" checked={zones.includes(z)} onChange={() => tz(z)} />
          <i className="h-2.5 w-5 rounded-full" style={{ background: `linear-gradient(90deg,${ZONE_META[z].ramp[1]},${ZONE_META[z].ramp[3]})` }} />
          <span className="flex-1">{lang === "bn" ? ZONE_META[z].bn : ZONE_META[z].en}</span></label>))}
      <p className="mt-1.5 px-1.5 text-2xs leading-snug text-faint">{L("Zones are density maps from the D.I.S.H.A.R.I models — brighter means more likely.", "এলাকাগুলি D.I.S.H.A.R.I মডেলের ঘনত্ব মানচিত্র — যত উজ্জ্বল তত সম্ভাবনা বেশি।")}</p>
      <ZoneReport zones={zones as Zone[]} />
    </div>
  );
}

/** report of the selected zones: one section per zone, every block, charts and a map */
function ZoneReport({ zones }: { zones: Zone[] }) {
  const { lang, L } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (f: "pdf" | "docx" | "xlsx") => {
    if (!zones.length || busy) return;
    setBusy(f);
    try {
      const [{ zoneReport }, { exportReport }] = await Promise.all([import("@/lib/report/zones"), import("@/lib/report")]);
      await exportReport(await zoneReport(zones, lang), f);
      toast(L("Report downloaded", "রিপোর্ট ডাউনলোড হয়েছে"));
    } catch (e) { console.error(e); toast(L("Could not make the report", "রিপোর্ট তৈরি করা গেল না")); }
    finally { setBusy(null); }
  };
  return (
    <div className="mt-2 rounded-xl border border-line bg-sunken/50 p-2">
      <p className="px-0.5 text-2xs font-bold text-muted">{zones.length ? L(`Report of the selected zones (${zones.length})`, `নির্বাচিত এলাকার রিপোর্ট (${zones.length})`) : L("Tick a zone to get its report", "রিপোর্টের জন্য একটি এলাকা বেছে নিন")}</p>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {(["pdf", "docx", "xlsx"] as const).map((f) => (
          <button key={f} disabled={!zones.length || !!busy} onClick={() => run(f)} className="rounded-lg bg-accent px-2 py-1.5 text-2xs font-bold text-on-accent disabled:opacity-40">
            {busy === f ? "…" : f === "pdf" ? "PDF" : f === "docx" ? "Word" : "Excel"}</button>))}
      </div>
    </div>
  );
}

function ZoneLegend() {
  const { lang, L } = useApp();
  const zones = useMapState((s) => s.zones) as Zone[];
  if (!zones.length) return null;
  return (
    <div className="glass fixed bottom-[76px] right-3 z-20 w-[212px] space-y-1.5 rounded-xl px-3 py-2.5 md:bottom-[100px] md:left-[124px] md:right-auto">
      {zones.map((z) => (
        <div key={z}><div className="mb-0.5 text-2xs font-bold">{lang === "bn" ? ZONE_META[z].bn : ZONE_META[z].en}</div>
          <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg,${ZONE_META[z].ramp.slice(1).join(",")})` }} />
          <div className="mt-0.5 flex justify-between text-[10px] text-muted"><span>{L("Low", "কম")}</span><span>{L("High", "বেশি")}</span></div></div>))}
    </div>
  );
}

export default function Shell() {
  const { lang, setLang, theme, setTheme, L } = useApp();
  const drawer = useUI((s) => s.drawer);
  const layers = useUI((s) => s.layers);
  const msg = useUI((s) => s.toast);
  const chat = useAssistant((s) => s.open);
  const stops = useTrip((s) => s.stops.length);
  const v3d = useMapState((s) => s.view3d);
  const seen = useRef<Set<string>>(new Set());
  if (drawer) seen.current.add(drawer);

  useEffect(() => {
    applyPreset(START);
    if (/[?&](trip|from|to)=/.test(window.location.search)) openDrawer("trip");
  }, []);
  // tell the map and the trip bar how much of the left side the rail and the drawer cover
  useEffect(() => {
    const left = 108 + (drawer ? WIDTH[drawer] + 12 : 0);
    setMapInset({ left });
    document.documentElement.style.setProperty("--bar-left", `${Math.min(left + 12, window.innerWidth - 420)}px`);
  }, [drawer]);
  useEffect(() => {
    const upd = () => {
      const right = chat && window.innerWidth >= 768 ? 444 : 92, left = 108 + (drawer ? WIDTH[drawer] + 12 : 0) + 12;
      const r = document.documentElement;
      r.style.setProperty("--bar-right", `${right}px`);
      if (window.innerWidth - left - right < 620) r.setAttribute("data-narrowbar", ""); else r.removeAttribute("data-narrowbar");
    };
    upd();
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, [chat, drawer]);

  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    const b = getState().basemap;
  };
  const pick = (p: PickedPlace) => {
    if (p.bbox && (p.type === "block" || p.type === "district" || p.type === "island")) fitBounds(p.bbox, 12.5); else flyTo(p.lon, p.lat, 14);
    setState({ selection: p.type === "point" || p.type === "hex" || p.type === "district" ? { lon: p.lon, lat: p.lat } : { lon: p.lon, lat: p.lat, entity: { type: p.type, id: p.id } } });
  };
  const locate = () => navigator.geolocation?.getCurrentPosition((g) => { const me: [number, number] = [g.coords.longitude, g.coords.latitude]; setState({ me }); flyTo(me[0], me[1], 14); },
    () => toast(L("Location is not available — allow it for this site", "অবস্থান পাওয়া যাচ্ছে না — এই সাইটে অনুমতি দিন")), { enableHighAccuracy: true, timeout: 12000 });
  const TITLES: Record<string, [string, string]> = { pois: [L("Points of interest", "গুরুত্বপূর্ণ স্থান"), ""], trip: [L("Smart trip", "স্মার্ট ট্রিপ"), ""], near: [L("Nearby", "কাছাকাছি"), ""], dash: [L("Dashboard", "ড্যাশবোর্ড"), ""], saved: [L("Saved", "রাখা তথ্য"), ""] };
  const RAIL: [Exclude<Drawer, null>, string, ReactNode][] = [["trip", L("Trip", "যাত্রা"), <Route key="t" size={21} />], ["pois", "POIs", <Landmark key="p" size={21} />], ["near", L("Nearby", "কাছে"), <MapPin key="n" size={21} />],
    ["dash", L("Dashboard", "ড্যাশবোর্ড"), <BarChart3 key="d" size={21} />], ["saved", L("Saved", "রাখা"), <Bookmark key="s" size={21} />]];
  const mapBtn = "glass flex h-[44px] w-[44px] items-center justify-center rounded-full text-ink transition-colors hover:text-accent";

  return (
    <div className="fixed inset-0 overflow-hidden bg-surface">
      <MapView />

      {/* top bar */}
      <header className="pointer-events-none fixed inset-x-3 top-3 z-40 flex items-start gap-2 md:inset-x-3.5 md:top-3.5 md:gap-3">
        <div className="pointer-events-auto -mt-0.5 flex h-[58px] shrink-0 items-center gap-3 pr-1" title="D.I.S.H.A.R.I">
          <span className="rounded-full shadow-[0_6px_20px_rgba(0,0,0,.45)] ring-2 ring-white/80"><LogoMark size={58} /></span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wordmark.png" alt="D.I.S.H.A.R.I" className="brand-mark hidden md:block" />
        </div>
        <div className="pointer-events-auto min-w-0 max-w-[600px] flex-1">
          <SearchBox size="hero" onPick={pick} placeholder={L("Search a village, ghat, block, island…", "গ্রাম, ঘাট, ব্লক, দ্বীপ খুঁজুন…")} />
        </div>
        <span className="hidden flex-1 md:block" />
        <div className="glass pointer-events-auto flex h-[52px] shrink-0 items-center rounded-full p-1 text-xs font-bold" role="group" aria-label={L("Language", "ভাষা")}>
          {(["en", "bn"] as const).map((l) => <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={cx("h-full rounded-full px-2.5 md:px-3.5", lang === l ? "bg-accent text-on-accent" : "text-muted hover:text-ink")}>{l === "en" ? "EN" : "বাং"}</button>)}
        </div>
        <button className={cx(mapBtn, "pointer-events-auto hidden !h-[52px] !w-[52px] shrink-0 md:flex")} onClick={flipTheme} aria-label={L("Light or dark", "লাইট বা ডার্ক")} title={L("Light or dark", "লাইট বা ডার্ক")}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
      </header>

      {/* rail: left on desktop, bottom on phones */}
      <nav className="glass fixed inset-x-2 bottom-2 z-40 flex justify-around gap-1 rounded-2xl p-1.5 md:inset-x-auto md:bottom-auto md:left-3.5 md:top-1/2 md:-translate-y-1/2 md:flex-col md:justify-start md:gap-1.5 md:p-2" aria-label={L("Tools", "সরঞ্জাম")}>
        {RAIL.map(([k, label, icon]) => (
          <button key={k} className={cx("rail-btn relative", drawer === k && "on")} onClick={() => toggleDrawer(k)} aria-pressed={drawer === k} title={label}>
            {icon}<span>{label}</span>
            {k === "trip" && stops > 0 && drawer !== "trip" && <i className="absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-risk px-1 text-[9px] font-extrabold not-italic text-white">{stops}</i>}
          </button>))}
      </nav>

      {/* drawer */}
      <aside className={cx("glass fixed z-30 flex flex-col overflow-hidden rounded-2xl transition-[transform,opacity] duration-300 ease-soft",
        "inset-x-2 bottom-[68px] top-[34dvh] md:inset-x-auto md:bottom-[18px] md:left-[108px] md:top-[78px]",
        drawer ? "translate-x-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0 md:-translate-x-6 md:translate-y-0")}
        style={{ width: undefined, ["--dw" as string]: `${drawer ? WIDTH[drawer] : 380}px` }} aria-hidden={!drawer}>
        <style>{`@media (min-width:768px){aside[style*="--dw"]{width:min(var(--dw),calc(100vw - 126px))}}`}</style>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-extrabold">{drawer ? TITLES[drawer][0] : ""}</h2>
          <button className="icon-btn h-8 w-8" onClick={() => openDrawer(null)} aria-label={L("Close", "বন্ধ")}><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pt-3 scroll-thin">
          {seen.current.has("trip") && <div className={drawer === "trip" ? "" : "hidden"}><TripPanel /></div>}
          {drawer === "pois" && <Pois />}
          {drawer === "near" && <Nearby active />}
          {drawer === "dash" && <Dash />}
          {drawer === "saved" && <Saved />}
        </div>
      </aside>

      {/* map buttons */}
      <div className="fixed right-3 top-[70px] z-30 flex flex-col gap-2 md:right-4 md:top-[74px]">
        <button className={cx(mapBtn, layers && "!text-accent")} onClick={() => setLayersOpen(!layers)} aria-expanded={layers} aria-label={L("Base map and layers", "ভিত্তি মানচিত্র ও স্তর")} title={L("Base map and layers", "ভিত্তি মানচিত্র ও স্তর")}><Layers size={20} /></button>
        <button className={mapBtn} onClick={locate} aria-label={L("My location", "আমার অবস্থান")} title={L("My location", "আমার অবস্থান")}><LocateFixed size={19} /></button>
        <button className={mapBtn} onClick={() => { setState({ selection: null, highlight: null }); fitBounds(HOME_BOUNDS); }} aria-label={L("Whole Sundarbans", "পুরো সুন্দরবন")} title={L("Whole Sundarbans", "পুরো সুন্দরবন")}><House size={18} /></button>
        <button className={cx(mapBtn, v3d && "!text-accent")} onClick={() => { const m = getMap(); const on = !v3d; setState({ view3d: on }); m?.easeTo({ pitch: on ? 55 : 0, duration: 600 }); }} aria-pressed={v3d} aria-label={L("Tilt the map", "মানচিত্র কাত করুন")} title={L("Tilt the map", "মানচিত্র কাত করুন")}><Box size={18} /></button>
        <button className={cx(mapBtn, "hidden md:flex")} onClick={() => getMap()?.zoomIn()} aria-label={L("Zoom in", "বড় করুন")}><Plus size={19} /></button>
        <button className={cx(mapBtn, "hidden md:flex")} onClick={() => getMap()?.zoomOut()} aria-label={L("Zoom out", "ছোট করুন")}><Minus size={19} /></button>
        <button className={cx(mapBtn, "md:hidden")} onClick={flipTheme} aria-label={L("Light or dark", "লাইট বা ডার্ক")}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
      </div>
      {layers && <LayersPop />}
      <ZoneLegend />

      <InfoCard />

      {/* assistant */}
      <TigerFab />
      <AssistantHost />
      {msg && <div className="toast glass" role="status">{msg}</div>}
    </div>
  );
}
