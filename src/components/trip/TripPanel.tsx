"use client";
/** Smart trip panel: the places (search, pick on the map, your location), how you travel, the plan with a timetable,
 *  the tide for each hop and the rivers on the way, exports, help numbers and the live 3D trip. */
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRightLeft, Bookmark, Box, CalendarClock, Check, ChevronDown, Clock3, Copy, Crosshair, Download, ExternalLink, FileJson, FileSpreadsheet, FileText,
  Flag, Footprints, GripVertical, House, LocateFixed, Phone, Repeat, Route, Ship, Shuffle, Siren, Trash2, X, ArrowUp, ArrowDown, Waypoints } from "@/components/icons";
import { useApp } from "@/lib/app-context";
import { getMap, getState, mapPadding, setState, startPick, useMapState } from "@/lib/map/store";
import { whatIsHere } from "@/lib/data/entities";
import { useMyData } from "@/lib/data/storage";
import { fmt, fmtDuration, fmtKm } from "@/lib/format";
import { downloadBlob, safeName } from "@/lib/map/export";
import SearchBox from "@/components/SearchBox";
import { cx, Popover, Segmented, Toggle } from "@/components/ui";
import { Note, PanelHeader } from "@/components/panels/common";
import { addStop, clearTrip, getTrip, launched, moveStop, removeStop, replan, setSettings, setStops, stopId, updateStop, useTrip } from "@/lib/trip/store";
import { allLegs, decodeTrip, nextQuarter, type TripPlan, type TripStop } from "@/lib/trip/plan";
import { buildTimeline, split } from "@/lib/trip/timeline";
import { bboxOf, type LL } from "@/lib/trip/geo";
import { clock, dayLabel, legEnd, MODE_COLOUR, SOS_NUMBERS, tideName, useTW, vesselName, type TripWord } from "@/lib/trip/text";
import { googleMapsUrl, shareUrl, tripGeoJSON, tripGpx } from "@/lib/trip/export";
import { nearestOf } from "@/lib/trip/nearby";
import type { TKey } from "@/lib/i18n";
import TripBar from "./TripBar";

const Trip3D = dynamic(() => import("./Trip3D"), { ssr: false });
const STAYS = [0, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];
/** ready trips on the rivers (checked to route at low tide by motor boat) */
const READY: { k: TripWord; stops: [string, number, number, string][] }[] = [
  { k: "r1", stops: [["Sonakhali Ferry Ghat", 88.71112, 22.20451, "jetty"], ["Gosaba", 88.81789, 22.16948, "village"], ["Pakhiralay", 88.83216, 22.13912, "village"], ["Sajnekhali", 88.83032, 22.12417, "place"]] },
  { k: "r2", stops: [["Canning", 88.6579, 22.31037, "place"], ["Basanti", 88.71391, 22.19833, "place"], ["Jharkhali", 88.66874, 22.04971, "place"]] },
  { k: "r3", stops: [["Per Hasnabad ferry ghat", 88.91283, 22.56442, "jetty"], ["Hingalganj", 88.98711, 22.47275, "place"], ["Sandeshkhali", 88.88557, 22.35722, "place"]] },
];
export const PIN = { start: "#123D32", stop: "#eb6834", end: "#e34948" };

async function placeName(lon: number, lat: number) {
  const w = await whatIsHere(lon, lat).catch(() => null);
  return w?.village?.name || w?.island?.name || w?.hexId || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}
const parseLL = (s: string | null): LL | null => {
  if (!s) return null;
  const [a, b] = s.split(",").map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
};
const toLocalInput = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** what the main map shows for the trip: numbered pins and the legs by mode */
export function showOnMap(stops: TripStop[], plan: TripPlan | null, fit = false, padBottom = 0) {
  const n = stops.length;
  const back = plan && plan.stops[plan.stops.length - 1]?.id.endsWith("-back");
  setState({
    pins: stops.map((s, i) => ({ lon: s.lon, lat: s.lat, size: 32, title: s.name,
      colour: i === 0 ? PIN.start : i === n - 1 && n > 1 && !back ? PIN.end : PIN.stop,
      inner: i === 0 ? { icon: "home" } : i === n - 1 && n > 1 && !back ? { icon: "flag" } : { text: String(i) } })),
    routes: plan && plan.hops.length ? { list: [{ legs: allLegs(plan), km: plan.totals.km, min: plan.totals.min, transfers: plan.totals.changes }], active: 0 } : null,
    markers: {},
  });
  if (!fit) return;
  const coords: LL[] = plan && plan.hops.length ? plan.hops.flatMap((h) => h.legs.flatMap((l) => l.coords as LL[])) : stops.map((s) => [s.lon, s.lat] as LL);
  if (!coords.length) return;
  const m = getMap();
  if (!m) return;
  const b = bboxOf(coords, coords.length === 1 ? 0.02 : 0.006);
  const small = window.matchMedia("(max-width: 767px)").matches;
  try { m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: mapPadding(small ? 0 : padBottom), maxZoom: 14, duration: 900 }); } catch { /* window too small */ }
}

export default function TripPanel() {
  const { t, lang } = useApp();
  const tw = useTW();
  const qs = useSearchParams();
  const router = useRouter();
  const my = useMyData();
  const stops = useTrip((s) => s.stops);
  const settings = useTrip((s) => s.settings);
  const plan = useTrip((s) => s.plan);
  const stale = useTrip((s) => s.stale);
  const busy = useTrip((s) => s.busy);
  const error = useTrip((s) => s.error);
  const [run3d, setRun3d] = useState<{ plan: TripPlan; live: boolean } | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sos, setSos] = useState(false);
  const [bar, setBar] = useState(true);
  const dragFrom = useRef<number | null>(null);
  const pick = useMapState((s) => s.pick);

  // links: ?trip= (shared trip), ?from= / ?to= (from a place card)
  useEffect(() => {
    const code = qs.get("trip"), f = parseLL(qs.get("from")), d = parseLL(qs.get("to"));
    if (!code && !f && !d) return;
    (async () => {
      if (code) {
        const x = decodeTrip(code);
        if (x) { setStops(x.stops); setSettings(x.settings); }
      }
      if (f) {
        const s: TripStop = { id: stopId(), name: await placeName(f[0], f[1]), lon: f[0], lat: f[1], type: "point", stay: 0 };
        const cur = getTrip().stops;
        setStops(cur.length ? [s, ...cur.slice(1)] : [s]);
      }
      if (d) addStop({ name: await placeName(d[0], d[1]), lon: d[0], lat: d[1], type: "point" });
      router.replace("/");
      const st = getTrip();
      if (code && st.stops.length >= 2) replan().then((p) => p && showOnMap(getTrip().stops, p, true, 170));
      else showOnMap(st.stops, null, true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  // the main map follows the trip
  useEffect(() => { showOnMap(stops, stale ? null : plan); }, [stops, plan, stale]);
  useEffect(() => () => setState({ pins: [], routes: null, markers: {} }), []);
  useEffect(() => { const st = getTrip(); if (st.stops.length) showOnMap(st.stops, st.stale ? null : st.plan, true, st.plan && !st.stale ? 170 : 0); /* first view */ }, []);

  // the assistant can open the 3D trip ("start the 3D trip", "live tracking")
  const launch = useTrip((s) => s.launch);
  useEffect(() => {
    if (!launch) return;
    const st = getTrip();
    launched();
    if (st.plan && !st.stale && !st.plan.failed && st.plan.hops.length) setRun3d({ plan: st.plan, live: launch.live });
  }, [launch]);

  const tl = useMemo(() => (plan && plan.hops.length ? buildTimeline(plan) : null), [plan]);
  const sp = useMemo(() => (tl ? split(tl) : null), [tl]);
  const last = stops.length - 1;
  const ready = !!plan && !stale && !!tl && !plan.failed;
  const title = stops.length >= 2 ? `${stops[0].name} → ${stops[last].name}` : tw("title");
  const flash = (s: string) => { setNote(s); setTimeout(() => setNote(null), 2200); };

  const doPlan = async () => {
    const p = await replan();
    if (p) showOnMap(getTrip().stops, p, true, 170);
    setBar(true);
  };
  const addFromMap = () => startPick("point", async (ll) => addStop({ name: await placeName(ll[0], ll[1]), lon: ll[0], lat: ll[1], type: "point" }));
  const addMe = () => navigator.geolocation?.getCurrentPosition((g) => {
    const s = { name: lang === "bn" ? "আমার অবস্থান" : "My location", lon: +g.coords.longitude.toFixed(6), lat: +g.coords.latitude.toFixed(6), type: "me" };
    addStop(s, getTrip().stops.length ? undefined : 0);
  }, () => flash(tw("l_denied")), { enableHighAccuracy: true, timeout: 15000 });

  const report = async (format: "pdf" | "docx" | "xlsx", p = plan) => {
    if (!p) return;
    setMaking(format);
    try {
      const { tripReport } = await import("@/lib/trip/report");
      const { exportReport } = await import("@/lib/report");
      await exportReport(await tripReport(p, lang), format);
    } catch (e) { flash(`${t("common.error")}: ${(e as Error).message}`); } finally { setMaking(null); }
  };
  const exportAs = async (k: string) => {
    if (!plan) return;
    if (k === "gpx") downloadBlob(new Blob([tripGpx(plan, title)], { type: "application/gpx+xml" }), `${safeName(`DISHARI_trip_${title}`)}.gpx`);
    if (k === "geojson") downloadBlob(new Blob([JSON.stringify(tripGeoJSON(plan))], { type: "application/geo+json" }), `${safeName(`DISHARI_trip_${title}`)}.geojson`);
    if (k === "gmaps") window.open(googleMapsUrl(plan.stops), "_blank", "noopener");
    if (k === "link") { try { await navigator.clipboard.writeText(shareUrl(stops, settings)); flash(tw("copied")); } catch { flash(shareUrl(stops, settings)); } }
    if (k === "save") {
      my.addJourney({ name: title, mode: settings.mode, tide: settings.tide, km: plan.totals.km, min: plan.totals.min, from: stops[0].name, to: stops[last].name,
        geometry: plan.hops.flatMap((h) => h.legs.map((l) => l.coords)), trip: shareUrl(stops, settings).split("trip=")[1], stops: stops.length });
      flash(tw("savedOk"));
    }
  };
  const replanFrom = async (here: LL, next: number) => {
    const P = getTrip().plan;
    if (!P) return;
    const rest = P.stops.slice(next).map((s) => ({ ...s, id: s.id.endsWith("-back") ? stopId() : s.id }));
    setStops([{ id: stopId(), name: lang === "bn" ? "আমার অবস্থান" : "My location", lon: here[0], lat: here[1], type: "me", stay: 0 }, ...rest]);
    setSettings({ leaveAt: Date.now(), bestOrder: false, returnToStart: false });
    const p = await replan();
    if (p && !p.failed) setRun3d({ plan: p, live: true });
  };

  /* ------------------------------------------------------------------ stops editor */
  const stopRow = (s: TripStop, i: number) => {
    const isStart = i === 0, isEnd = i === last && last > 0;
    const col = isStart ? PIN.start : isEnd ? PIN.end : PIN.stop;
    return (
      <li key={s.id} draggable onDragStart={() => { dragFrom.current = i; }} onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const a = dragFrom.current; dragFrom.current = null; if (a === null || a === i) return; const arr = [...getTrip().stops]; const [m] = arr.splice(a, 1); arr.splice(i, 0, m); setStops(arr); }}
        className="group relative flex items-center gap-2 py-1.5 pl-0.5">
        {i < last && <span className="absolute left-[14.5px] top-[30px] h-[calc(100%-14px)] w-[3px] rounded bg-line" aria-hidden="true" />}
        <span className="relative z-[1] grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-xs font-extrabold text-white shadow-float ring-2 ring-raised" style={{ background: col }}>
          {isStart ? <House size={14} /> : isEnd ? <Flag size={14} /> : fmt(i, lang, 0)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold leading-tight" title={s.name}>{s.name}</p>
          <p className="text-2xs text-muted">{isStart ? tw("start") : isEnd ? tw("finish") : tw("stopN", { n: fmt(i, lang, 0) })}</p>
        </div>
        {i > 0 && !isEnd && (
          <label className="flex items-center gap-1 text-2xs text-muted" title={tw("stay")}>
            <Clock3 size={12} />
            <select className="rounded-lg border border-line bg-raised px-1 py-0.5 text-2xs text-ink" value={s.stay} aria-label={`${tw("stay")} — ${s.name}`}
              onChange={(e) => updateStop(i, { stay: Number(e.target.value) })}>
              {STAYS.map((m) => <option key={m} value={m}>{m ? fmtDuration(m, lang) : tw("noStay")}</option>)}
            </select>
          </label>
        )}
        <div className="flex shrink-0 items-center opacity-70 group-hover:opacity-100">
          <button className="icon-btn h-7 w-7" disabled={i === 0} onClick={() => moveStop(i, -1)} aria-label={`${tw("up")} — ${s.name}`} title={tw("up")}><ArrowUp size={13} /></button>
          <button className="icon-btn h-7 w-7" disabled={i === last} onClick={() => moveStop(i, 1)} aria-label={`${tw("down")} — ${s.name}`} title={tw("down")}><ArrowDown size={13} /></button>
          <button className="icon-btn h-7 w-7 text-risk" onClick={() => removeStop(i)} aria-label={`${tw("remove")} — ${s.name}`} title={tw("remove")}><X size={14} /></button>
          <span className="hidden cursor-grab text-faint md:inline" aria-hidden="true"><GripVertical size={14} /></span>
        </div>
      </li>
    );
  };

  /* ------------------------------------------------------------------ result */
  const kpi = (label: string, value: string, sub?: string, icon?: ReactNode, colour?: string) => (
    <div className="rounded-xl border border-line bg-raised px-2.5 py-2">
      <div className="flex items-center gap-1 text-2xs font-semibold text-muted">{icon && <span style={{ color: colour }}>{icon}</span>}{label}</div>
      <div className="mt-0.5 text-[15px] font-bold leading-tight tabular-nums">{value}</div>
      {sub && <div className="truncate text-2xs text-muted">{sub}</div>}
    </div>
  );
  const splitBar = () => {
    if (!sp || !tl) return null;
    const keys = (["boat", "walk", "change", "stay"] as const).filter((k) => sp[k] > 0.5);
    const tot = keys.reduce((a, k) => a + sp[k], 0) || 1;
    const lab: Record<string, TripWord> = { boat: "s_boat", walk: "s_walk", change: "s_change", stay: "s_stay" };
    return (
      <div>
        <p className="section-title mb-1.5">{tw("split")}</p>
        <div className="flex h-3.5 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={keys.map((k) => `${tw(lab[k])} ${Math.round((100 * sp[k]) / tot)}%`).join(", ")}>
          {keys.map((k) => <i key={k} className={cx("block h-full", k === "change" && "bg-stripes")} style={{ width: `${(100 * sp[k]) / tot}%`, backgroundColor: MODE_COLOUR[k] }} />)}
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {keys.map((k) => (
            <div key={k} className="flex items-center gap-1.5 text-2xs"><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: MODE_COLOUR[k] }} />
              <span className="font-semibold">{tw(lab[k])}</span><span className="ml-auto tabular-nums text-muted">{fmtDuration(sp[k], lang)} · {fmt(Math.round((100 * sp[k]) / tot), lang, 0)}%</span></div>
          ))}
        </div>
      </div>
    );
  };

  const legLine = (h: TripPlan["hops"][number], l: TripPlan["hops"][number]["legs"][number], k: number) => {
    const boat = l.mode === "boat";
    return (
      <div key={k}>
        {k > 0 && (
          <div className="my-1 flex items-center gap-1.5 pl-1 text-2xs font-semibold text-muted"><ArrowRightLeft size={12} /> {tw("changeAt", { g: l.fromName || h.legs[k - 1].toName ? legEnd(l, "from", lang) : legEnd(h.legs[k - 1], "to", lang) })}
            <span className="tabular-nums">· {fmtDuration((l.t0 - h.legs[k - 1].t1) / 60000, lang)}</span></div>
        )}
        <div className="flex gap-2 rounded-xl border bg-raised p-2" style={{ borderColor: boat ? "rgb(42 120 214 / 0.35)" : "rgb(var(--line))" }}>
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: boat ? MODE_COLOUR.boat : MODE_COLOUR.walk }}>
            {boat ? <Ship size={15} /> : <Footprints size={15} />}</span>
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold leading-snug">{boat ? tw("boatTo", { vessel: vesselName(settings.vessel, lang), to: legEnd(l, "to", lang) }) : tw("walkTo", { to: legEnd(l, "to", lang) })}</p>
            <p className="tabular-nums text-muted">{clock(l.t0, lang)} → {clock(l.t1, lang)} · {fmtKm(l.km * 1000, lang)} · {fmtDuration(l.min, lang)}</p>
            {boat && l.rivers.length > 0 && <p className="text-muted">{tw("via", { r: l.rivers.join(", ") })}</p>}
            {boat && (l.creekKm > 0.05 || l.permitKm > 0.05) && (
              <p className="text-2xs text-faint">{[l.creekKm > 0.05 ? tw("creeks", { d: fmtKm(l.creekKm * 1000, lang) }) : "", l.permitKm > 0.05 ? tw("permit", { d: fmtKm(l.permitKm * 1000, lang) }) : ""].filter(Boolean).join(" · ")}</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const itinerary = () => {
    if (!plan || !tl) return null;
    const P = plan;
    const n = P.stops.length - 1;
    const back = P.stops[n].id.endsWith("-back");
    return (
      <ol className="space-y-2">
        {P.stops.map((s, i) => {
          if (i > P.hops.length) return null;
          const hIn = P.hops[i - 1], hOut = P.hops[i];
          const isStart = i === 0, isEnd = i === P.hops.length;
          const col = isStart || (isEnd && back) ? PIN.start : isEnd ? PIN.end : PIN.stop;
          const time = isStart ? tw("leave", { t: clock(P.start, lang) }) : isEnd || !hOut ? tw("arrive", { t: clock(hIn.arrive, lang) })
            : tw("window", { a: clock(hIn.arrive, lang), b: clock(hOut.depart, lang), m: fmtDuration((hOut.depart - hIn.arrive) / 60000, lang) });
          return (
            <li key={`${s.id}-${i}`}>
              {hIn && (
                <div className="mb-2 ml-[14px] border-l-[3px] pl-4" style={{ borderColor: hIn.legs.some((l) => l.mode === "boat") ? "rgb(42 120 214 / 0.45)" : "rgb(var(--line))" }}>
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-2xs text-muted">
                    <span className="font-bold text-ink">{tw("hop", { n: fmt(i, lang, 0) })}</span>
                    <span className="tabular-nums">{fmtKm(hIn.km * 1000, lang)} · {fmtDuration(hIn.min, lang)}</span>
                    {hIn.legs.some((l) => l.mode === "boat") && (
                      <span className={cx("chip border-0 px-1.5 font-semibold", hIn.tide === "high" ? "bg-[#2a78d6]/15 text-[#1c5aa6]" : "bg-[#eda100]/15 text-[#8a5d00]")}>
                        {tideName(hIn.tide, lang)} · {tw(hIn.tideSource === "forecast" ? "forecast" : hIn.tideSource === "chosen" ? "chosen" : "usual")}</span>
                    )}
                  </div>
                  <div className="space-y-0.5">{hIn.legs.map((l, k) => legLine(hIn, l, k))}</div>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-xs font-extrabold text-white shadow-float" style={{ background: col }}>
                  {isStart || (isEnd && back) ? <House size={14} /> : isEnd ? <Flag size={14} /> : fmt(i, lang, 0)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold leading-tight">{s.name}</p>
                  <p className="text-2xs tabular-nums text-muted">{time}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    );
  };

  const reason = plan?.failed ? (plan.failed.reason ? t(`route.reason.${plan.failed.reason}` as TKey) : "") : "";
  const failedText = plan?.failed ? tw("failed", { a: plan.stops[plan.failed.hop]?.name || "—", b: plan.stops[plan.failed.hop + 1]?.name || "—" }) : "";

  return (
    <div>
      <PanelHeader icon={<Route size={18} />} title={tw("title")} sub={tw("sub")} accent="#256abf" />

      {/* places */}
      <section className="px-4 pt-3" aria-label={tw("stops")}>
        <div className="mb-1 flex items-center justify-between">
          <p className="section-title">{tw("stops")}</p>
          {stops.length > 0 && <button className="btn-ghost px-1.5 py-0.5 text-2xs text-muted" onClick={() => { clearTrip(); setState({ pins: [], routes: null }); }}><Trash2 size={12} /> {tw("clear")}</button>}
        </div>
        {stops.length ? <ul>{stops.map(stopRow)}</ul> : <p className="rounded-xl bg-sunken px-3 py-2.5 text-xs text-muted">{tw("empty")}</p>}
        {!stops.length && (
          <div className="mt-3">
            <p className="section-title">{tw("ready")}</p>
            <p className="mb-1.5 text-2xs text-muted">{tw("readySub")}</p>
            <div className="grid grid-cols-1 gap-1.5">
              {READY.map((r) => (
                <button key={r.k} className="group flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-line bg-raised px-3 py-2 text-left transition-colors hover:border-water/60 hover:bg-water/5"
                  onClick={async () => {
                    setStops(r.stops.map(([name, lon, lat, type], i) => ({ id: stopId(), name, lon, lat, type, stay: i ? 30 : 0 })));
                    setSettings({ mode: "boat", vessel: "motor_boat", prefer: "safe", tide: "auto", leaveAt: nextQuarter(), bestOrder: false, returnToStart: false });
                    await doPlan();
                  }}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#2a78d6]/10 text-[#1c5aa6]"><Ship size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[13px] leading-tight">{tw(r.k)}</b>
                    <span className="block truncate text-2xs text-muted">{r.stops.map((s) => s[0]).join(" → ")}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-2xs font-semibold text-muted">{fmt(r.stops.length, lang, 0)} · {tw("byBoat")}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          <div className="min-w-0 flex-1"><SearchBox size="sm" placeholder={tw("addPh")} onPick={(p) => addStop({ name: p.name, lon: p.lon, lat: p.lat, type: p.type, ref: p.id })} /></div>
          <button className={cx("icon-btn h-9 w-9 border border-line", pick === "point" && "bg-water/15 text-water")} onClick={addFromMap} title={tw("pickMap")} aria-label={tw("pickMap")}><Crosshair size={15} /></button>
          <button className="icon-btn h-9 w-9 border border-line" onClick={addMe} title={tw("myLoc")} aria-label={tw("myLoc")}><LocateFixed size={15} /></button>
        </div>
        {stops.length === 1 && <p className="mt-1.5 text-2xs text-muted">{tw("oneMore")}</p>}
      </section>

      {/* how */}
      <section className="mt-3 space-y-2.5 border-t border-line px-4 pt-3" aria-label={tw("how")}>
        <p className="section-title">{tw("how")}</p>
        <Segmented value={settings.mode} onChange={(m) => setSettings({ mode: m })} label={tw("travel")}
          options={[{ key: "multimodal", label: t("route.multimodal") }, { key: "boat", label: t("route.boat") }, { key: "walk", label: t("route.walk") }]} />
        {settings.mode !== "walk" && (
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">{t("route.vessel")}</span><select className="field py-1.5 text-xs" value={settings.vessel} onChange={(e) => setSettings({ vessel: e.target.value as typeof settings.vessel })}>
              <option value="motor_boat">{t("route.motor")}</option><option value="country_boat">{t("route.country")}</option></select></label>
            <label><span className="label">{t("route.prefer")}</span><select className="field py-1.5 text-xs" value={settings.prefer} onChange={(e) => setSettings({ prefer: e.target.value as typeof settings.prefer })}>
              <option value="safe">{t("route.safe")}</option><option value="main">{t("route.main")}</option><option value="shortest">{t("route.shortest")}</option></select></label>
          </div>
        )}
        {settings.mode !== "walk" && (
          <div><span className="label">{t("route.tide")}</span>
            <Segmented value={settings.tide} onChange={(v) => setSettings({ tide: v })} label={t("route.tide")}
              options={[{ key: "auto", label: tw("tideAuto") }, { key: "low", label: t("route.low") }, { key: "high", label: t("route.high") }]} />
            {settings.tide === "auto" && <p className="mt-1 text-2xs text-muted">{tw("tideAutoSub")}</p>}
          </div>
        )}
        <div><span className="label">{tw("leaveAt")}</span>
          <div className="flex gap-1.5">
            <label className="relative flex-1"><CalendarClock size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input type="datetime-local" className="field py-1.5 pl-8 text-xs tabular-nums" value={toLocalInput(settings.leaveAt)} aria-label={tw("leaveAt")}
                onChange={(e) => { const v = new Date(e.target.value).getTime(); if (Number.isFinite(v)) setSettings({ leaveAt: v }); }} /></label>
            <button className="btn-outline px-2.5 py-1.5 text-xs" onClick={() => setSettings({ leaveAt: nextQuarter() })}>{tw("now")}</button>
          </div>
        </div>
        <label className="flex items-start justify-between gap-3 text-xs"><span className="flex items-start gap-1.5"><Shuffle size={14} className="mt-0.5 text-muted" />
          <span><b className="font-semibold">{tw("bestOrder")}</b><span className="block text-2xs text-muted">{tw("bestOrderSub")}</span></span></span>
          <Toggle checked={settings.bestOrder} onChange={(b) => setSettings({ bestOrder: b })} label={tw("bestOrder")} disabled={stops.length < 4} /></label>
        <label className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-1.5"><Repeat size={14} className="text-muted" /><b className="font-semibold">{tw("back")}</b></span>
          <Toggle checked={settings.returnToStart} onChange={(b) => setSettings({ returnToStart: b })} label={tw("back")} /></label>
        <button className="btn-primary w-full" disabled={stops.length < 2 || !!busy} onClick={doPlan}>
          <Waypoints size={16} /> {busy ? (busy.phase === "order" ? tw("ordering", { a: fmt(busy.done, lang, 0), b: fmt(busy.total, lang, 0) }) : tw("planning", { a: fmt(Math.min(busy.done + 1, busy.total), lang, 0), b: fmt(busy.total, lang, 0) }))
            : plan ? tw("replan") : tw("plan")}</button>
        {busy && <div className="h-1 overflow-hidden rounded-full bg-sunken"><i className="block h-full bg-water transition-all" style={{ width: `${(100 * busy.done) / Math.max(1, busy.total)}%` }} /></div>}
        {error === "need2" && <p className="text-xs text-muted">{tw("oneMore")}</p>}
      </section>

      {/* the plan */}
      {plan && stale && !busy && <div className="mx-4 mt-3"><Note>{tw("stale")}</Note></div>}
      {plan?.failed && !stale && (
        <div className="mx-4 mt-3 rounded-xl border border-line bg-sunken p-3 text-sm"><b>{failedText}</b>{reason && <p className="mt-1 text-xs text-muted">{reason}</p>}</div>
      )}
      {ready && plan && tl && (
        <section className="mt-3 space-y-3 border-t border-line px-4 pb-4 pt-3" aria-label={tw("yourTrip")}>
          <div className="flex items-baseline justify-between"><p className="section-title">{tw("yourTrip")}</p>
            <p className="text-2xs text-muted">{dayLabel(plan.start, lang)} · {clock(plan.start, lang)} → {clock(plan.end, lang)}</p></div>
          {plan.reordered && <Note>{tw("reordered")}</Note>}
          <div className="grid grid-cols-3 gap-1.5">
            {kpi(tw("k_total"), fmtDuration(plan.totals.min, lang), tw("k_moving", { m: fmtDuration(plan.totals.moveMin, lang) }), <Clock3 size={12} />, "#2a78d6")}
            {kpi(tw("k_finish"), clock(plan.end, lang), tw("k_leave", { t: clock(plan.start, lang) }), <Flag size={12} />, PIN.end)}
            {kpi(tw("k_dist"), fmtKm(plan.totals.km * 1000, lang), tw("k_hops", { n: fmt(plan.hops.length, lang, 0) }), <Route size={12} />, "#6250d6")}
            {kpi(tw("k_boat"), fmtKm(plan.totals.boatKm * 1000, lang), vesselName(settings.vessel, lang), <Ship size={12} />, MODE_COLOUR.boat)}
            {kpi(tw("k_walk"), fmtKm(plan.totals.walkKm * 1000, lang), undefined, <Footprints size={12} />, MODE_COLOUR.walk)}
            {kpi(tw("k_changes"), fmt(plan.totals.changes, lang, 0), tw("k_atGhats", { m: fmtDuration(plan.totals.changeMin, lang) }), <ArrowRightLeft size={12} />, MODE_COLOUR.change)}
          </div>
          {splitBar()}
          <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
            <button className="btn-primary py-2.5 text-sm shadow-float" onClick={() => setRun3d({ plan, live: false })}><Box size={17} /> {tw("start3d")}</button>
            <Popover align="up" trigger={({ toggle, open }) => <button className={cx("btn-outline h-full px-3 text-xs", open && "bg-sunken")} onClick={toggle} aria-expanded={open}><FileText size={15} /> {tw("report")}<ChevronDown size={13} /></button>}>
              {(close) => (<div className="w-52">
                {([["pdf", "ex_pdf", FileText], ["docx", "ex_word", FileText], ["xlsx", "ex_xlsx", FileSpreadsheet]] as const).map(([k, l, I]) => (
                  <button key={k} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-sunken" disabled={!!making} onClick={async () => { await report(k); close(); }}>
                    <I size={15} /> {making === k ? tw("making") : tw(l)}</button>))}
              </div>)}
            </Popover>
            <Popover align="up" trigger={({ toggle, open }) => <button className={cx("btn-outline h-full px-3 text-xs", open && "bg-sunken")} onClick={toggle} aria-expanded={open} aria-label={tw("export")}><Download size={15} /><ChevronDown size={13} /></button>}>
              {(close) => (<div className="w-56">
                {([["gpx", "ex_gpx", Route], ["geojson", "ex_geojson", FileJson], ["gmaps", "ex_gmaps", ExternalLink], ["link", "ex_link", Copy], ["save", "ex_save", Bookmark]] as const).map(([k, l, I]) => (
                  <button key={k} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-sunken" onClick={() => { exportAs(k); close(); }}><I size={15} /> {tw(l)}</button>))}
              </div>)}
            </Popover>
          </div>
          <button className="btn-ghost w-full border border-[#e34948]/30 py-1.5 text-xs text-[#c0302f]" onClick={() => setSos((v) => !v)}><Siren size={14} /> {tw("sosTitle")}</button>
          {sos && <SosList stops={plan.stops} />}
          {note && <p className="flex items-center gap-1.5 rounded-lg bg-ok/10 px-2.5 py-1.5 text-xs font-semibold text-ok" role="status"><Check size={13} /> {note}</p>}
          <div>
            <p className="section-title mb-2">{tw("itin")}</p>
            {itinerary()}
          </div>
        </section>
      )}
      {!plan && stops.length >= 2 && !busy && (
        <div className="px-4 pb-4 pt-3"><Note>{lang === "bn"
          ? "নৌপথ ১০০ মিটার জলের গ্রিডে খোঁজা হয় (ভাটা ও জোয়ারের নৌচলাচলযোগ্য জল, জাতীয় উদ্যানের কোর বাদে); হাঁটার পথ ওপেনস্ট্রিটম্যাপের রাস্তায়। ঘাটে বদলের জন্য ১০ মিনিট ধরা হয়।"
          : "Boat routes are found on a 100 m water grid (navigable water at low and high tide, National Park core excluded); walking uses OpenStreetMap roads and paths. Changing at a ghat counts 10 minutes."}</Note></div>
      )}
      {note && !ready && <p className="mx-4 mb-3 rounded-lg bg-sunken px-2.5 py-1.5 text-xs" role="status">{note}</p>}
      <div className="h-2" />

      {ready && plan && tl && bar && <TripBar plan={plan} tl={tl} onStart={() => setRun3d({ plan, live: false })} onClose={() => setBar(false)} onExport={(k) => (k === "pdf" || k === "docx" || k === "xlsx" ? report(k) : exportAs(k))} making={making} />}
      {run3d && <Trip3D plan={run3d.plan} autoLive={run3d.live} onClose={() => { setRun3d(null); showOnMap(getTrip().stops, getTrip().plan, true, 170); }} onReport={() => report("pdf", run3d.plan)} onReplan={replanFrom} />}
    </div>
  );
}

/** help numbers and the nearest health and help points to the start of the trip */
function SosList({ stops }: { stops: TripStop[] }) {
  const { lang } = useApp();
  const tw = useTW();
  const [near, setNear] = useState<{ name: string; sub: string; km: number }[] | null>(null);
  useEffect(() => {
    nearestOf([stops[0].lon, stops[0].lat], ["health", "emergency", "shelter"], 3).then((xs) => setNear(xs.map(({ s, d }) => ({ name: s.name || s.category || "", sub: (s.amenity || s.category || "").replace(/_/g, " "), km: d / 1000 }))));
  }, [stops]);
  return (
    <div className="rounded-xl border border-[#e34948]/25 bg-[#e34948]/[0.04] p-2.5">
      <div className="grid grid-cols-3 gap-1">
        {SOS_NUMBERS.map((n) => (
          <a key={n} href={`tel:${n}`} className="rounded-lg bg-raised px-1.5 py-1.5 text-center shadow-sm ring-1 ring-line hover:ring-[#e34948]/40">
            <b className="flex items-center justify-center gap-1 text-sm tabular-nums text-[#c0302f]"><Phone size={11} />{n}</b>
            <span className="block truncate text-[10px] leading-tight text-muted">{tw(`n${n}` as TripWord)}</span></a>
        ))}
      </div>
      <p className="mt-2 text-2xs font-semibold text-muted">{tw("sosNear")} · {tw("sosFrom", { p: stops[0].name })}</p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {(near || []).map((x, k) => <li key={k} className="flex justify-between gap-2"><span className="truncate"><b>{x.name}</b> <span className="text-muted">{x.sub}</span></span><span className="shrink-0 tabular-nums">{fmtKm(x.km * 1000, lang)}</span></li>)}
      </ul>
    </div>
  );
}
