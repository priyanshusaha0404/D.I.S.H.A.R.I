"use client";
/** Bottom bar on large screens: the whole trip as a line of places and legs, the key numbers, Start 3D trip and Export. */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Box, ChevronDown, Clock3, Download, Flag, Footprints, House, Route, Ship, X, ArrowRightLeft, FileText, FileSpreadsheet, FileJson, ExternalLink, Copy, Bookmark } from "@/components/icons";
import { useApp } from "@/lib/app-context";
import { fmt, fmtDuration, fmtKm } from "@/lib/format";
import type { TripPlan } from "@/lib/trip/plan";
import type { Timeline } from "@/lib/trip/timeline";
import { clock, dayLabel, legEnd, MODE_COLOUR, tideName, useTW, vesselName } from "@/lib/trip/text";
import { flyTo } from "@/lib/map/store";
import { cx, LogoMark, Popover } from "@/components/ui";

export default function TripBar({ plan, tl, onStart, onClose, onExport, making }: {
  plan: TripPlan; tl: Timeline; onStart: () => void; onClose: () => void; onExport: (k: string) => void; making: string | null;
}) {
  const { lang } = useApp();
  const tw = useTW();
  useEffect(() => {
    document.documentElement.style.setProperty("--bar-h", "150px");
    return () => { document.documentElement.style.removeProperty("--bar-h"); };
  }, []);
  const P = plan;
  const n = P.hops.length;
  const back = P.stops[P.stops.length - 1].id.endsWith("-back");
  const node = (i: number) => {
    const s = P.stops[i];
    const isStart = i === 0, isEnd = i === n;
    const col = isStart || (isEnd && back) ? "#123D32" : isEnd ? "#e34948" : "#eb6834";
    const time = isStart ? clock(P.start, lang) : isEnd || !P.hops[i] ? clock(P.hops[i - 1].arrive, lang) : `${clock(P.hops[i - 1].arrive, lang)}–${clock(P.hops[i].depart, lang)}`;
    return (
      <button key={`n${i}`} className="tb-node" onClick={() => flyTo(s.lon, s.lat, 13)} title={s.name}>
        <span className="num" style={{ background: col }}>{isStart || (isEnd && back) ? <House size={13} /> : isEnd ? <Flag size={13} /> : fmt(i, lang, 0)}</span>
        <span className="min-w-0"><b>{s.name}</b><small>{time}</small></span>
      </button>
    );
  };
  const parts: JSX.Element[] = [];
  for (let i = 0; i <= n; i++) {
    parts.push(node(i));
    const h = P.hops[i];
    if (!h) continue;
    h.legs.forEach((l, k) => {
      if (k > 0) parts.push(<span key={`c${i}-${k}`} className="tb-change" title={tw("changeAt", { g: legEnd(l, "from", lang) })}><ArrowRightLeft size={12} /></span>);
      const boat = l.mode === "boat";
      parts.push(
        <div key={`l${i}-${k}`} className={cx("tb-leg", !boat && "walk")} style={{ ["--lc" as string]: boat ? MODE_COLOUR.boat : MODE_COLOUR.walk }}
          title={boat ? `${vesselName(P.settings.vessel, lang)} · ${tideName(h.tide, lang)}${l.rivers.length ? ` · ${tw("via", { r: l.rivers.join(", ") })}` : ""}` : tw("s_walk")}>
          {boat ? <Ship size={16} /> : <Footprints size={16} />}
          <span className="ln" />
          <span className="tx"><b>{fmtDuration(l.min, lang)}</b> · {fmtKm(l.km * 1000, lang)}{boat && l.rivers[0] ? ` · ${l.rivers[0]}` : ""}</span>
        </div>,
      );
    });
  }
  const opts = [["pdf", "ex_pdf", FileText], ["docx", "ex_word", FileText], ["xlsx", "ex_xlsx", FileSpreadsheet], ["gpx", "ex_gpx", Route], ["geojson", "ex_geojson", FileJson],
    ["gmaps", "ex_gmaps", ExternalLink], ["link", "ex_link", Copy], ["save", "ex_save", Bookmark]] as const;
  void tl;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="trip-bar panel" role="region" aria-label={tw("yourTrip")}>
      <div className="flex items-center gap-2.5">
        <LogoMark size={34} />
        <div className="min-w-0">
          <b className="block truncate text-[15px] leading-tight">{P.stops[0].name} → {P.stops[n].name}</b>
          <small className="block text-2xs text-muted">{dayLabel(P.start, lang)} · {tw("k_finish")} {clock(P.end, lang)} · {fmt(n, lang, 0)} {lang === "bn" ? "যাত্রাংশ" : n === 1 ? "hop" : "hops"}</small>
        </div>
      </div>
      <div className="tb-stats">
        <span className="hl"><Clock3 size={15} />{fmtDuration(P.totals.min, lang)}</span>
        <span><Route size={15} />{fmtKm(P.totals.km * 1000, lang)}</span>
        {P.totals.boatKm > 0 && <span><Ship size={15} />{fmtKm(P.totals.boatKm * 1000, lang)}</span>}
        {P.totals.walkKm > 0 && <span><Footprints size={15} />{fmtKm(P.totals.walkKm * 1000, lang)}</span>}
        {P.totals.changes > 0 && <span><ArrowRightLeft size={15} />{fmt(P.totals.changes, lang, 0)}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <button className="btn-primary px-3 py-2 text-sm" onClick={onStart}><Box size={16} /> {tw("start3d")}</button>
        <Popover align="up" trigger={({ toggle, open }) => <button className={cx("btn-outline px-3 py-2 text-sm", open && "bg-sunken")} onClick={toggle} aria-expanded={open}><Download size={15} /> {tw("export")} <ChevronDown size={13} /></button>}>
          {(close) => (<div className="w-56">{opts.map(([k, l, I]) => (
            <button key={k} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-sunken" disabled={!!making} onClick={async () => { await onExport(k); close(); }}>
              <I size={15} /> {making === k ? tw("making") : tw(l)}</button>))}</div>)}
        </Popover>
        <button className="icon-btn h-9 w-9" onClick={onClose} aria-label={tw("t_exit")}><X size={16} /></button>
      </div>
      <div className="tb-line scroll-thin">{parts}</div>
    </div>, document.body);
}
