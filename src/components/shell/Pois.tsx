"use client";
/** Points of interest in priority order: switch each kind on the map, look through the list, download what is shown
 *  as GeoJSON, Shapefile, KML or CSV. */
import { useMemo, useState } from "react";
import { ChevronDown, Download, Eye, EyeOff, Search } from "@/components/icons";
import { useApp, useAsync } from "@/lib/app-context";
import { fmt } from "@/lib/format";
import { downloadBlob } from "@/lib/map/export";
import { fitBounds, flyTo, setState, useMapState } from "@/lib/map/store";
import { loadPois, POI_CATS, poiGeoJSON, poiKML, poiShapefileZip, type Poi } from "@/lib/pois";
import { addStop } from "@/lib/trip/store";
import { toast } from "@/lib/ui";
import { cx, Spinner } from "@/components/ui";

export default function Pois() {
  const { lang, L } = useApp();
  const { data } = useAsync(loadPois, []);
  const on = useMapState((s) => s.pois);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [block, setBlock] = useState("all");
  const blocks = useMemo(() => [...new Set((data || []).map((p) => p.block).filter(Boolean))].sort(), [data]);
  const list = useMemo(() => (data || []).filter((p) => (block === "all" || p.block === block) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))), [data, block, q]);
  const by = useMemo(() => { const m = new Map<string, Poi[]>(); list.forEach((p) => (m.get(p.cat) || m.set(p.cat, []).get(p.cat)!).push(p)); return m; }, [list]);
  if (!data) return <div className="p-6"><Spinner /></div>;
  const toggle = (k: string) => setState({ pois: on.includes(k) ? on.filter((x) => x !== k) : [...on, k] });
  const shown = list.filter((p) => on.includes(p.cat));
  const fit = (ps: Poi[]) => { if (!ps.length) return; const xs = ps.map((p) => p.lon), ys = ps.map((p) => p.lat); fitBounds([Math.min(...xs) - 0.02, Math.min(...ys) - 0.02, Math.max(...xs) + 0.02, Math.max(...ys) + 0.02], 14); };
  const base = `DISHARI_POIs${block !== "all" ? `_${block.replace(/\W+/g, "_")}` : ""}`;
  const dl = async (f: "geojson" | "shp" | "kml" | "csv") => {
    if (!shown.length) { toast(L("Switch on at least one kind first", "আগে অন্তত একটি ধরন চালু করুন")); return; }
    if (f === "geojson") downloadBlob(new Blob([JSON.stringify(poiGeoJSON(shown))], { type: "application/geo+json" }), `${base}.geojson`);
    else if (f === "kml") downloadBlob(new Blob([poiKML(shown, "D.I.S.H.A.R.I — POIs")], { type: "application/vnd.google-earth.kml+xml" }), `${base}.kml`);
    else if (f === "shp") downloadBlob(await poiShapefileZip(shown, base), `${base}_shapefile.zip`);
    else {
      const rows = [["name", "category", "kind", "block", "lat", "lon"], ...shown.map((p) => [p.name, p.cat, p.sub, p.block, p.lat.toFixed(6), p.lon.toFixed(6)])];
      downloadBlob(new Blob(["﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" }), `${base}.csv`);
    }
    toast(L(`${fmt(shown.length, "en", 0)} points downloaded`, `${fmt(shown.length, "bn", 0)}টি বিন্দু ডাউনলোড হয়েছে`));
  };
  return (
    <div className="space-y-3 px-4 pb-5">
      <div className="flex gap-1.5">
        <label className="relative min-w-0 flex-1"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="field py-1.5 pl-8 text-xs" placeholder={L("Find by name", "নাম দিয়ে খুঁজুন")} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select className="field w-[42%] py-1.5 text-xs" value={block} onChange={(e) => setBlock(e.target.value)} aria-label={L("Block", "ব্লক")}>
          <option value="all">{L("All blocks", "সব ব্লক")}</option>{blocks.map((b) => <option key={b} value={b}>{b}</option>)}</select>
      </div>
      <div className="flex items-center gap-1.5">
        <p className="grp flex-1">{L("In order of need", "প্রয়োজনের ক্রমে")}</p>
        <button className="rounded-lg border border-line px-2 py-1 text-2xs font-bold text-muted hover:text-ink" onClick={() => setState({ pois: POI_CATS.filter((c) => c.key !== "village").map((c) => c.key) })}>{L("All on", "সব চালু")}</button>
        <button className="rounded-lg border border-line px-2 py-1 text-2xs font-bold text-muted hover:text-ink" onClick={() => setState({ pois: [] })}>{L("All off", "সব বন্ধ")}</button>
      </div>
      <ul className="space-y-1">
        {POI_CATS.map((c, i) => {
          const items = by.get(c.key) || [];
          const isOn = on.includes(c.key);
          return (
            <li key={c.key} className={cx("overflow-hidden rounded-xl border transition-colors", isOn ? "border-line bg-sunken/50" : "border-line/60")}>
              <div className="flex items-center gap-2 px-2.5 py-2">
                <span className="w-4 text-center text-2xs font-bold text-faint">{fmt(i + 1, lang, 0)}</span>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-[#0b1020]" style={{ background: c.colour }}>{c.icon}</span>
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === c.key ? null : c.key)} aria-expanded={open === c.key}>
                  <span className="block truncate text-[12.5px] font-bold">{lang === "bn" ? c.bn : c.en}</span>
                  <span className="block text-2xs text-muted">{fmt(items.length, lang, 0)} {L("places", "টি")}</span></button>
                <ChevronDown size={13} className={cx("shrink-0 text-faint transition-transform", open === c.key && "rotate-180")} />
                <button onClick={() => { toggle(c.key); if (!isOn) fit(items); }} aria-pressed={isOn} title={isOn ? L("Hide on map", "মানচিত্রে লুকাও") : L("Show on map", "মানচিত্রে দেখাও")}
                  className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", isOn ? "border-transparent bg-accent text-on-accent" : "border-line text-muted hover:text-ink")}>{isOn ? <Eye size={15} /> : <EyeOff size={15} />}</button>
              </div>
              {open === c.key && (
                <ul className="max-h-64 divide-y divide-line/50 overflow-y-auto border-t border-line px-2.5 scroll-thin">
                  {items.slice(0, 300).map((p) => (
                    <li key={p.type + p.id} className="flex items-center gap-2 py-1.5">
                      <button className="min-w-0 flex-1 text-left" onClick={() => { if (!on.includes(c.key)) toggle(c.key); flyTo(p.lon, p.lat, 15); setState({ selection: { lon: p.lon, lat: p.lat, entity: { type: p.type, id: p.id } } }); }}>
                        <span className="block truncate text-[12.5px] font-semibold hover:text-accent">{p.name}</span>
                        <span className="block truncate text-2xs capitalize text-muted">{p.sub}{p.block ? ` · ${p.block}` : ""}</span></button>
                      <button className="shrink-0 rounded-lg border border-line px-2 py-1 text-2xs font-bold text-water hover:bg-sunken" onClick={() => { addStop({ name: p.name, lon: p.lon, lat: p.lat, type: p.type, ref: p.id }); toast(L("Added to the trip", "যাত্রায় যোগ হয়েছে")); }}>+ {L("Trip", "যাত্রা")}</button>
                    </li>))}
                  {items.length > 300 && <li className="py-1.5 text-2xs text-muted">{L(`…and ${items.length - 300} more — narrow by block or name`, `…আরও ${items.length - 300}টি — ব্লক বা নাম দিয়ে ছোট করুন`)}</li>}
                  {!items.length && <li className="py-2 text-2xs text-muted">{L("None here.", "এখানে নেই।")}</li>}
                </ul>)}
            </li>);
        })}
      </ul>
      <div className="rounded-xl border border-line p-3">
        <p className="grp mb-1">{L("Download what is switched on", "যা চালু আছে তা ডাউনলোড")}</p>
        <p className="mb-2 text-2xs text-muted">{fmt(shown.length, lang, 0)} {L("points", "বিন্দু")}{block !== "all" ? ` · ${block}` : ""} · WGS 84</p>
        <div className="grid grid-cols-4 gap-1.5">
          {(["geojson", "shp", "kml", "csv"] as const).map((f) => <button key={f} className="btn-outline px-1 py-1.5 text-2xs" onClick={() => dl(f)}><Download size={12} />{f === "shp" ? "SHP" : f.toUpperCase()}</button>)}
        </div>
      </div>
      <p className="text-2xs text-faint">{L("Services and ghats: OpenStreetMap. Villages and towns: Census of India 2011.", "পরিষেবা ও ঘাট: ওপেনস্ট্রিটম্যাপ। গ্রাম ও শহর: ভারতের জনগণনা ২০১১।")}</p>
    </div>
  );
}
