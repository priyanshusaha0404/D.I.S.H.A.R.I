"use client";
/** What is near: ghats, hospitals, police, shelters, banks, markets, schools — from your location, the map centre or the
 *  place you last touched. Each result can be shown, added to the trip or routed to. */
import { useEffect, useState } from "react";
import { LocateFixed, MapPin, Navigation, Plus, Crosshair } from "@/components/icons";
import { useApp } from "@/lib/app-context";
import { fmt, fmtKm } from "@/lib/format";
import { fitBounds, flyTo, getMap, getState, setState, useMapState } from "@/lib/map/store";
import { CAT_COLOUR, CAT_NAME, nearestPts, type Pt } from "@/lib/blockinfo";
import { addStop, replan, setSettings, setStops, stopId } from "@/lib/trip/store";
import { nextQuarter } from "@/lib/trip/plan";
import { openDrawer, toast } from "@/lib/ui";
import { cx } from "@/components/ui";

const CHIPS = ["jetty", "health", "emergency", "shelter", "finance", "market", "education", "religious"];
type From = "centre" | "me" | "sel";

export default function Nearby({ active }: { active: boolean }) {
  const { lang, L } = useApp();
  const sel = useMapState((s) => s.selection);
  const [cat, setCat] = useState("jetty");
  const [from, setFrom] = useState<From>("centre");
  const [ref, setRef] = useState<[number, number] | null>(null);
  const [list, setList] = useState<{ p: Pt; km: number }[]>([]);
  const locate = () => navigator.geolocation?.getCurrentPosition((g) => { const me: [number, number] = [g.coords.longitude, g.coords.latitude]; setState({ me }); setRef(me); flyTo(me[0], me[1], 13); },
    () => { toast(L("Location is not available", "অবস্থান পাওয়া যাচ্ছে না")); setFrom("centre"); }, { enableHighAccuracy: true, timeout: 12000 });
  useEffect(() => {
    if (!active) return;
    if (from === "me") { const me = getState().me; if (me) setRef(me); else locate(); }
    else if (from === "sel" && sel) setRef([sel.lon, sel.lat]);
    else { const c = getMap()?.getCenter(); setRef(c ? [c.lng, c.lat] : [88.75, 22.1]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, active, sel]);
  useEffect(() => {
    if (!ref || !active) return;
    let live = true;
    nearestPts(ref[0], ref[1], [cat], 8).then((r) => {
      if (!live) return;
      setList(r);
      setState({ pins: r.map((x, k) => ({ lon: x.p.lon, lat: x.p.lat, colour: CAT_COLOUR[cat], inner: { text: String(k + 1) }, size: 28, title: x.p.name })) });
    });
    return () => { live = false; };
  }, [ref, cat, active]);
  const fit = () => { if (!ref || !list.length) return; const xs = [ref[0], ...list.map((x) => x.p.lon)], ys = [ref[1], ...list.map((x) => x.p.lat)];
    fitBounds([Math.min(...xs) - 0.01, Math.min(...ys) - 0.01, Math.max(...xs) + 0.01, Math.max(...ys) + 0.01], 14); };
  const go = async (p: Pt, km: number) => {
    if (!ref) return;
    setStops([{ id: stopId(), name: from === "me" ? L("My location", "আমার অবস্থান") : L("Start", "শুরু"), lon: ref[0], lat: ref[1], type: "point", stay: 0 }, { id: stopId(), name: p.name, lon: p.lon, lat: p.lat, type: p.type, ref: p.id, stay: 30 }]);
    setSettings({ leaveAt: nextQuarter(), mode: km < 2.5 ? "walk" : "multimodal", tide: "auto", returnToStart: false, bestOrder: false });
    openDrawer("trip");
    await replan();
  };
  return (
    <div className="space-y-3 px-4 pb-4">
      <div><p className="grp mb-1.5">{L("Near", "কাছে")}</p>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-sunken/50 p-0.5 text-2xs font-bold">
          {([["centre", L("Map centre", "মানচিত্রের কেন্দ্র"), Crosshair], ["me", L("My location", "আমার অবস্থান"), LocateFixed], ["sel", L("Touched place", "ছোঁয়া জায়গা"), MapPin]] as const).map(([k, label, I]) => (
            <button key={k} disabled={k === "sel" && !sel} onClick={() => setFrom(k)} className={cx("flex items-center justify-center gap-1 rounded-[10px] px-1 py-1.5 disabled:opacity-40", from === k ? "bg-accent text-on-accent" : "text-muted")}><I size={12} />{label}</button>))}
        </div></div>
      <div><p className="grp mb-1.5">{L("Find", "খুঁজুন")}</p>
        <div className="flex flex-wrap gap-1.5">{CHIPS.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cx("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-bold", cat === c ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-ink")}>
            <i className="h-2 w-2 rounded-full" style={{ background: CAT_COLOUR[c] }} />{CAT_NAME[c][lang === "bn" ? 1 : 0]}</button>))}</div></div>
      <div className="flex items-center gap-2"><p className="grp flex-1">{CAT_NAME[cat][lang === "bn" ? 1 : 0]} · {fmt(list.length, lang, 0)}</p>
        <button className="rounded-lg border border-line px-2 py-1 text-2xs font-bold text-muted hover:text-ink" onClick={fit}>{L("Show all", "সব দেখাও")}</button></div>
      <ul className="space-y-1.5">{list.map((x, k) => (
        <li key={x.p.type + x.p.id} className="flex items-center gap-2 rounded-xl border border-line bg-sunken/30 px-2.5 py-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-extrabold text-white" style={{ background: CAT_COLOUR[cat] }}>{fmt(k + 1, lang, 0)}</span>
          <button className="min-w-0 flex-1 text-left" onClick={() => { flyTo(x.p.lon, x.p.lat, 15); setState({ selection: { lon: x.p.lon, lat: x.p.lat, entity: { type: x.p.type, id: x.p.id } } }); }}>
            <span className="block truncate text-[12.5px] font-bold">{x.p.name}</span><span className="block truncate text-2xs capitalize text-muted">{x.p.sub} · {fmtKm(x.km * 1000, lang)}</span></button>
          <button className="rounded-lg border border-line p-1.5 text-water hover:bg-sunken" title={L("Add to trip", "যাত্রায় যোগ")} onClick={() => { addStop({ name: x.p.name, lon: x.p.lon, lat: x.p.lat, type: x.p.type, ref: x.p.id }); toast(L("Added to the trip", "যাত্রায় যোগ হয়েছে")); }}><Plus size={13} /></button>
          <button className="rounded-lg bg-accent p-1.5 text-on-accent" title={L("Go there", "সেখানে যান")} onClick={() => go(x.p, x.km)}><Navigation size={13} /></button>
        </li>))}</ul>
      {!list.length && <p className="text-xs text-muted">{L("Looking…", "খোঁজা হচ্ছে…")}</p>}
    </div>
  );
}
