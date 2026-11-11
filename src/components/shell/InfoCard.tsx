"use client";
/** Touch the map: everything about that block (people, villages, ghats, services, permit zones, weather) and about the
 *  exact spot (village, legal status, nearest ghat and hospital), with buttons to plan a trip there or download a report. */
import { useEffect, useState } from "react";
import { Anchor, Bookmark, Check, ChevronDown, CloudSun, FileText, MapPin, Navigation, Plus, Sparkles, Users, X } from "@/components/icons";
import { useApp, useAsync } from "@/lib/app-context";
import { getEntity } from "@/lib/data/entities";
import { getSeaLevel, getWeather, wmo } from "@/lib/data/weather";
import { useMyData } from "@/lib/data/storage";
import { fmt, fmtKm } from "@/lib/format";
import { fitBounds, flyTo, setState, useMapState } from "@/lib/map/store";
import { blockById, CATS, CAT_COLOUR, CAT_NAME, pointInfo, type BlockInfo, type PointInfo, type Pt } from "@/lib/blockinfo";
import { addStop, useTrip } from "@/lib/trip/store";
import { askAssistant } from "@/lib/assistant/store";
import { openDrawer, toast } from "@/lib/ui";
import { cx } from "@/components/ui";

interface Info { title: string; kind: string; type: string; ref: string; block: BlockInfo | null; point: PointInfo | null; isBlock: boolean; hl?: { layer: string; ids: (number | string)[] } | null }
const GATE = { 1: ["Open — no permit needed", "উন্মুক্ত — অনুমতি লাগে না", "#2dd4a7"], 2: ["Protected forest — permit needed", "সংরক্ষিত বন — অনুমতি লাগে", "#f5a623"], 3: ["National Park core — no entry", "জাতীয় উদ্যানের কোর — প্রবেশ নিষেধ", "#f0556a"] } as const;
const KIND: Record<string, [string, string]> = { block: ["Block", "ব্লক"], village: ["Village", "গ্রাম"], town: ["Town", "শহর"], jetty: ["Ghat / jetty", "ঘাট / জেটি"], poi: ["Service", "পরিষেবা"], place: ["Place", "জায়গা"],
  island: ["Island", "দ্বীপ"], district: ["District", "জেলা"], river: ["River", "নদী"], point: ["Point on the map", "মানচিত্রের বিন্দু"], forest_unit: ["Forest compartment", "বন কম্পার্টমেন্ট"], protected_area: ["Protected area", "সংরক্ষিত এলাকা"] };

async function describe(sel: { lon: number; lat: number; entity?: { type: string; id: string } }): Promise<Info> {
  if (sel.entity?.type === "block") {
    const [b, e] = await Promise.all([blockById(sel.entity.id), getEntity("block", sel.entity.id).catch(() => null)]);
    return { title: b?.name || e?.name || "", kind: "block", type: "block", ref: sel.entity.id, block: b, point: null, isBlock: true, hl: e?.geom ? { layer: e.geom.layer, ids: e.geom.ids } : null };
  }
  const p = await pointInfo(sel.lon, sel.lat);
  if (sel.entity) {
    const e = await getEntity(sel.entity.type, sel.entity.id).catch(() => null);
    return { title: e?.name || p.village?.name || "", kind: sel.entity.type, type: sel.entity.type, ref: sel.entity.id, block: p.block, point: p, isBlock: false, hl: e?.geom ? { layer: e.geom.layer, ids: e.geom.ids } : null };
  }
  const be = p.block ? await getEntity("block", p.block.id).catch(() => null) : null;
  return { title: p.village?.name || p.island || p.block?.name || `${sel.lat.toFixed(4)}, ${sel.lon.toFixed(4)}`, kind: p.village ? p.village.type : "point", type: p.village ? p.village.type : "point",
    ref: p.village ? p.village.id : "", block: p.block, point: p, isBlock: false, hl: be?.geom ? { layer: be.geom.layer, ids: be.geom.ids } : null };
}

function Weather({ lon, lat }: { lon: number; lat: number }) {
  const { lang, L } = useApp();
  const w = useAsync(async () => { const [a, s] = await Promise.all([getWeather(lat, lon).catch(() => null), getSeaLevel(lat, lon).catch(() => null)]); return { a: a?.data || null, s: s?.data || null }; }, [Math.round(lon * 20), Math.round(lat * 20)]);
  if (w.loading) return <p className="text-2xs text-muted">{L("Loading weather…", "আবহাওয়া আসছে…")}</p>;
  const c = w.data?.a?.current;
  const tide = w.data?.s?.extremes.map((x) => ({ ...x, ms: new Date(x.time.length <= 16 ? `${x.time}:00+05:30` : x.time).getTime() })).find((x) => x.ms > Date.now());
  if (!c && !tide) return <p className="text-2xs text-muted">{L("Weather and tide appear when you are online.", "অনলাইন থাকলে আবহাওয়া ও জোয়ার-ভাটা দেখা যাবে।")}</p>;
  return (
    <div className="grid grid-cols-3 gap-1.5 text-center">
      {c && <div className="rounded-xl bg-sunken/60 px-2 py-1.5"><div className="text-sm font-extrabold tabular-nums">{fmt(c.temp, lang, 0)}°C</div><div className="truncate text-2xs text-muted">{wmo(c.code, lang)}</div></div>}
      {c && <div className="rounded-xl bg-sunken/60 px-2 py-1.5"><div className="text-sm font-extrabold tabular-nums">{fmt(c.wind, lang, 0)} km/h</div><div className="text-2xs text-muted">{L("Wind", "হাওয়া")}</div></div>}
      {tide && <div className="rounded-xl bg-sunken/60 px-2 py-1.5"><div className="text-sm font-extrabold tabular-nums">{new Date(tide.ms).toLocaleTimeString(lang === "bn" ? "bn-IN" : "en-IN", { hour: "numeric", minute: "2-digit" })}</div>
        <div className="text-2xs text-muted">{tide.type === "high" ? L("Next high tide", "পরের জোয়ার") : L("Next low tide", "পরের ভাটা")}</div></div>}
    </div>
  );
}

function PtRow({ p, km }: { p: Pt; km?: number }) {
  const { lang, L } = useApp();
  return (
    <li className="flex items-center gap-2 py-1.5">
      <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: CAT_COLOUR[p.cat] }} />
      <button className="min-w-0 flex-1 text-left" onClick={() => { flyTo(p.lon, p.lat, 15); setState({ selection: { lon: p.lon, lat: p.lat, entity: { type: p.type, id: p.id } } }); }}>
        <span className="block truncate text-[12.5px] font-semibold hover:text-accent">{p.name}</span><span className="block truncate text-2xs capitalize text-muted">{p.sub}</span></button>
      {km !== undefined && <span className="shrink-0 text-2xs font-bold tabular-nums text-muted">{fmtKm(km * 1000, lang)}</span>}
      <button className="shrink-0 rounded-lg border border-line px-1.5 py-1 text-2xs font-bold text-water hover:bg-sunken" title={L("Add to trip", "যাত্রায় যোগ")}
        onClick={() => { addStop({ name: p.name, lon: p.lon, lat: p.lat, type: p.type, ref: p.id }); toast(L(`${p.name} added to the trip`, `${p.name} যাত্রায় যোগ হয়েছে`)); }}><Plus size={12} /></button>
    </li>
  );
}

function BlockBody({ b }: { b: BlockInfo }) {
  const { lang, L } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const n = (v: number | null, d = 0) => (v === null || Number.isNaN(v) ? "—" : fmt(v, lang, d));
  const groups = [{ c: "jetty", list: b.ghats }, ...CATS.map((c) => ({ c: c as string, list: b.services[c] || [] }))].filter((g) => g.list.length);
  const mf = b.male + b.female || 1;
  const kp: [string, string, string?][] = [
    [L("Population", "জনসংখ্যা"), n(b.population), L("Census 2011", "জনগণনা ২০১১")], [L("Households", "পরিবার"), n(b.households), `${n(b.hhSize, 1)} ${L("per home", "জন/পরিবার")}`],
    [L("Villages", "গ্রাম"), n(b.villages), b.towns ? `+ ${n(b.towns)} ${L("towns", "শহর")}` : undefined], [L("Area", "ক্ষেত্রফল"), `${n(b.area)} km²`, b.land !== null ? `${n(b.land)}% ${L("land", "স্থল")}` : undefined],
    [L("People / km²", "জন / বর্গকিমি"), n(b.density)], [L("Women per 1,000 men", "হাজার পুরুষে নারী"), n(b.sexRatio)],
  ];
  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-1.5">
        {kp.map(([k, v, s]) => <div key={k} className="rounded-xl border border-line bg-sunken/40 px-2.5 py-2"><div className="truncate text-2xs text-muted">{k}</div><div className="text-[15px] font-extrabold tabular-nums leading-tight">{v}</div>{s && <div className="truncate text-2xs text-faint">{s}</div>}</div>)}
      </div>
      {b.male > 0 && (
        <div><p className="grp mb-1.5 flex items-center gap-1.5"><Users size={12} /> {L("Men and women", "পুরুষ ও নারী")}</p>
          <div className="zonebar"><i style={{ width: `${(b.male / mf) * 100}%`, background: "#4f8ef7" }} /><i style={{ width: `${(b.female / mf) * 100}%`, background: "#e879a6" }} /></div>
          <div className="mt-1 flex justify-between text-2xs text-muted"><span>{L("Men", "পুরুষ")} <b className="text-ink">{n(b.male)}</b></span><span>{L("Women", "নারী")} <b className="text-ink">{n(b.female)}</b></span></div></div>
      )}
      <div><p className="grp mb-1.5">{L("Forest permit zones", "বনের অনুমতি এলাকা")}</p>
        <div className="zonebar">{([1, 2, 3] as const).map((g) => { const v = g === 1 ? b.zones.open : g === 2 ? b.zones.permit : b.zones.core; return v > 0.5 ? <i key={g} style={{ width: `${v}%`, background: GATE[g][2] }} /> : null; })}</div>
        <ul className="mt-1.5 space-y-0.5">{([1, 2, 3] as const).map((g) => { const v = g === 1 ? b.zones.open : g === 2 ? b.zones.permit : b.zones.core;
          return <li key={g} className="flex items-center gap-2 text-2xs"><i className="h-2 w-2 rounded-full" style={{ background: GATE[g][2] }} /><span className="flex-1 text-muted">{GATE[g][lang === "bn" ? 1 : 0]}</span><b className="tabular-nums">{n(v)}%</b></li>; })}</ul></div>
      <div><p className="grp mb-1.5 flex items-center gap-1.5"><CloudSun size={12} /> {L("Weather and tide now", "এখন আবহাওয়া ও জোয়ার-ভাটা")}</p><Weather lon={b.lon} lat={b.lat} /></div>
      <div><p className="grp mb-1.5 flex items-center gap-1.5"><Anchor size={12} /> {L("Ghats and services", "ঘাট ও পরিষেবা")}</p>
        {!groups.length && <p className="text-2xs text-muted">{L("None mapped in this block.", "এই ব্লকে মানচিত্রে নেই।")}</p>}
        <div className="space-y-1">{groups.map((g) => (
          <div key={g.c} className="overflow-hidden rounded-xl border border-line">
            <button className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12.5px] font-bold hover:bg-sunken/60" onClick={() => setOpen(open === g.c ? null : g.c)} aria-expanded={open === g.c}>
              <i className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLOUR[g.c] }} /><span className="flex-1">{CAT_NAME[g.c][lang === "bn" ? 1 : 0]}</span>
              <span className="rounded-full bg-sunken px-2 text-2xs tabular-nums text-muted">{n(g.list.length)}</span><ChevronDown size={13} className={cx("text-faint transition-transform", open === g.c && "rotate-180")} /></button>
            {open === g.c && <ul className="max-h-56 divide-y divide-line/60 overflow-y-auto border-t border-line px-2.5 scroll-thin">{g.list.map((p) => <PtRow key={p.type + p.id} p={p} />)}</ul>}
          </div>))}</div></div>
      <div><p className="grp mb-1.5">{L("Largest villages and towns", "সবচেয়ে বড় গ্রাম ও শহর")}</p>
        <ul className="divide-y divide-line/60">{b.top.map((v, i) => (
          <li key={v.id} className="flex items-center gap-2 py-1.5 text-[12.5px]">
            <span className="w-4 text-2xs font-bold text-faint">{fmt(i + 1, lang, 0)}</span>
            <button className="min-w-0 flex-1 truncate text-left font-semibold hover:text-accent" onClick={() => { flyTo(v.lon, v.lat, 14); setState({ selection: { lon: v.lon, lat: v.lat, entity: { type: v.type, id: v.id } } }); }}>{v.name}</button>
            <span className="text-2xs tabular-nums text-muted">{n(v.population)}</span></li>))}</ul></div>
    </div>
  );
}

export default function InfoCard() {
  const sel = useMapState((s) => s.selection);
  const pick = useMapState((s) => s.pick);
  const { lang, L } = useApp();
  const my = useMyData();
  const stops = useTrip((s) => s.stops);
  const [info, setInfo] = useState<Info | null>(null);
  const [showBlock, setShowBlock] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!sel) { setInfo(null); return; }
    let live = true;
    describe(sel).then((x) => { if (!live) return; setInfo(x); if (x.hl) setState({ highlight: x.hl }); }).catch(() => live && setInfo(null));
    return () => { live = false; };
  }, [sel]);
  if (!sel || !info || pick) return null;
  const { block: b, point: p } = info;
  const close = () => setState({ selection: null, highlight: null });
  const at = info.isBlock && b ? { lon: b.lon, lat: b.lat } : { lon: sel.lon, lat: sel.lat };
  const inTrip = stops.some((x) => Math.abs(x.lon - at.lon) < 1e-5 && Math.abs(x.lat - at.lat) < 1e-5);
  const report = async (f: "pdf" | "docx" | "xlsx") => {
    if (!b) return;
    setBusy(f);
    try { const [{ blockReport }, { exportReport }] = await Promise.all([import("@/lib/report/lean"), import("@/lib/report")]); await exportReport(blockReport(b, lang), f); toast(L("Report downloaded", "রিপোর্ট ডাউনলোড হয়েছে")); }
    catch { toast(L("Could not make the report", "রিপোর্ট তৈরি করা গেল না")); }
    setBusy(null);
  };
  const kind = KIND[info.kind] || KIND.point;
  return (
    <aside className="glass fixed inset-x-2 bottom-[68px] z-30 flex max-h-[58dvh] flex-col overflow-hidden rounded-2xl md:inset-x-auto md:bottom-auto md:left-[var(--bar-left,120px)] md:top-[82px] md:max-h-[calc(100dvh-112px-var(--bar-h,0px))] md:w-[372px]" role="dialog" aria-label={info.title}>
      <header className="flex items-start gap-2.5 border-b border-line px-3.5 py-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><MapPin size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-extrabold leading-tight">{info.title}</h2>
          <p className="truncate text-2xs text-muted">{kind[lang === "bn" ? 1 : 0]}{!info.isBlock && b ? ` · ${b.name} ${L("block", "ব্লক")}` : ""}{b?.district ? ` · ${b.district}` : ""}</p>
          {!info.isBlock && <p className="text-2xs tabular-nums text-faint">{sel.lat.toFixed(5)}, {sel.lon.toFixed(5)}</p>}
        </div>
        <button className="icon-btn h-8 w-8" onClick={close} aria-label={L("Close", "বন্ধ")}><X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3.5 py-3 scroll-thin">
        <div className="grid grid-cols-2 gap-1.5">
          <button className="btn-primary col-span-2 py-2 text-xs" onClick={() => { addStop({ name: info.title, lon: +at.lon.toFixed(6), lat: +at.lat.toFixed(6), type: info.type, ref: info.ref }); openDrawer("trip"); }} disabled={inTrip}>
            {inTrip ? <Check size={14} /> : <Navigation size={14} />} {inTrip ? L("Already in your trip", "যাত্রায় আছে") : L("Plan a trip here", "এখানে যাত্রা পরিকল্পনা")}{stops.length > 0 && !inTrip ? ` (${fmt(stops.length, lang, 0)})` : ""}</button>
          <button className="btn-outline py-1.5 text-xs" onClick={() => { my.addPlace({ type: info.type, ref: info.ref || `${at.lon},${at.lat}`, name: info.title, lon: at.lon, lat: at.lat }); toast(L("Saved", "রাখা হয়েছে")); }}><Bookmark size={13} /> {L("Save", "রাখুন")}</button>
          <button className="btn-outline py-1.5 text-xs" onClick={() => askAssistant(lang === "bn" ? `${info.title}-এর কাছে হাসপাতাল` : `nearest hospital to ${info.title}`)}><Sparkles size={13} /> {L("Ask assistant", "সহায়ককে বলুন")}</button>
        </div>
        {p && !p.inside && <p className="text-xs text-muted">{L("This point is outside the mapped area.", "এই বিন্দুটি মানচিত্রের এলাকার বাইরে।")}</p>}
        {p && p.inside && (
          <section className="space-y-2">
            <p className="grp">{L("This spot", "এই জায়গা")}</p>
            {p.gate && <p className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold" style={{ background: `${GATE[p.gate][2]}22`, color: GATE[p.gate][2] }}><i className="h-2.5 w-2.5 rounded-full" style={{ background: GATE[p.gate][2] }} />{GATE[p.gate][lang === "bn" ? 1 : 0]}</p>}
            <dl>
              {p.village && <div className="kv !py-1 text-[12.5px]"><dt>{p.village.type === "town" ? L("Town", "শহর") : L("Village", "গ্রাম")}</dt><dd>{p.village.name}</dd></div>}
              {p.village && <div className="kv !py-1 text-[12.5px]"><dt>{L("Population (2011)", "জনসংখ্যা (২০১১)")}</dt><dd>{fmt(p.village.population, lang, 0)}</dd></div>}
              {p.village && p.village.households > 0 && <div className="kv !py-1 text-[12.5px]"><dt>{L("Households", "পরিবার")}</dt><dd>{fmt(p.village.households, lang, 0)}</dd></div>}
              {p.village && p.village.male > 0 && <div className="kv !py-1 text-[12.5px]"><dt>{L("Men / women", "পুরুষ / নারী")}</dt><dd>{fmt(p.village.male, lang, 0)} / {fmt(p.village.female, lang, 0)}</dd></div>}
              {p.village && p.village.area > 0 && <div className="kv !py-1 text-[12.5px]"><dt>{L("Village area", "গ্রামের ক্ষেত্রফল")}</dt><dd>{fmt(p.village.area, lang, 1)} km²</dd></div>}
              {p.island && <div className="kv !py-1 text-[12.5px]"><dt>{L("Island", "দ্বীপ")}</dt><dd>{p.island}</dd></div>}
              {p.forest && <div className="kv !py-1 text-[12.5px]"><dt>{L("Forest", "বন")}</dt><dd>{p.forest}</dd></div>}
            </dl>
            <p className="grp pt-1">{L("Nearest ghats and health", "নিকটতম ঘাট ও স্বাস্থ্যকেন্দ্র")}</p>
            <ul className="divide-y divide-line/60">{[...p.ghats, ...p.health].map((x) => <PtRow key={x.p.type + x.p.id} p={x.p} km={x.km} />)}</ul>
          </section>
        )}
        {b && (
          <section className="space-y-2.5">
            {!info.isBlock && (
              <button className="flex w-full items-center gap-2 rounded-xl bg-sunken/60 px-2.5 py-2 text-left" onClick={() => setShowBlock((s) => !s)} aria-expanded={showBlock}>
                <span className="flex-1 text-[13px] font-extrabold">{b.name} {L("block — all details", "ব্লক — সব তথ্য")}</span><ChevronDown size={14} className={cx("transition-transform", showBlock && "rotate-180")} /></button>
            )}
            {(info.isBlock || showBlock) && <BlockBody b={b} />}
            <div><p className="grp mb-1.5 flex items-center gap-1.5"><FileText size={12} /> {L(`${b.name} block report`, `${b.name} ব্লকের রিপোর্ট`)}</p>
              <div className="grid grid-cols-3 gap-1.5">{(["pdf", "docx", "xlsx"] as const).map((f) => (
                <button key={f} className="btn-outline py-1.5 text-xs" disabled={!!busy} onClick={() => report(f)}>{busy === f ? "…" : f === "pdf" ? "PDF" : f === "docx" ? "Word" : "Excel"}</button>))}</div>
              {!info.isBlock && b.bbox && <button className="btn-ghost mt-1.5 w-full py-1.5 text-xs" onClick={() => { fitBounds(b.bbox, 12); setState({ selection: { lon: b.lon, lat: b.lat, entity: { type: "block", id: b.id } } }); }}>{L(`Show the whole ${b.name} block`, `পুরো ${b.name} ব্লক দেখাও`)}</button>}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
