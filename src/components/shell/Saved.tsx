"use client";
/** Saved places, trips and field notes — kept in this browser only. */
import { useState } from "react";
import { Bookmark, Download, LocateFixed, NotebookPen, Route, Save, Trash2 } from "@/components/icons";
import { useApp } from "@/lib/app-context";
import { uid, useMyData, type FieldNote } from "@/lib/data/storage";
import { fmt, fmtDate, fmtDuration, fmtKm } from "@/lib/format";
import { exportGeoJSON, exportTable } from "@/lib/report";
import { flyTo, setState } from "@/lib/map/store";
import { decodeTrip } from "@/lib/trip/plan";
import { replan, setSettings, setStops } from "@/lib/trip/store";
import { openDrawer } from "@/lib/ui";

const blank: FieldNote = { id: "", title: "", text: "", lon: null, lat: null, time: "", category: "observation" };
export default function Saved() {
  const { lang, L } = useApp();
  const my = useMyData();
  const [note, setNote] = useState<FieldNote>(blank);
  const save = () => { if (!note.title.trim() && !note.text.trim()) return; my.saveNote({ ...note, id: note.id || uid(), time: note.time || new Date().toISOString() }); setNote(blank); };
  const openTrip = async (code: string) => { const x = decodeTrip(code); if (!x) return; setStops(x.stops); setSettings(x.settings); openDrawer("trip"); await replan(); };
  const exportAll = () => exportGeoJSON("DISHARI_my_data", { type: "FeatureCollection", features: [
    ...my.places.map((p) => ({ type: "Feature" as const, properties: { kind: "place", name: p.name, type: p.type, saved: p.saved }, geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] } })),
    ...my.notes.filter((n) => n.lon !== null && n.lat !== null).map((n) => ({ type: "Feature" as const, properties: { kind: "note", title: n.title, text: n.text, time: n.time }, geometry: { type: "Point" as const, coordinates: [n.lon!, n.lat!] } })),
    ...my.journeys.map((j) => ({ type: "Feature" as const, properties: { kind: "trip", name: j.name, mode: j.mode, km: j.km, min: j.min, saved: j.saved }, geometry: { type: "MultiLineString" as const, coordinates: j.geometry } })),
  ] });
  return (
    <div className="space-y-4 px-4 pb-5">
      <section><p className="grp mb-1.5 flex items-center gap-1.5"><Route size={12} /> {L("Saved trips", "রাখা যাত্রা")} · {fmt(my.journeys.length, lang, 0)}</p>
        {!my.journeys.length && <p className="text-xs text-muted">{L("Plan a trip and press Save — it appears here.", "যাত্রা পরিকল্পনা করে ‘রাখুন’ চাপুন — এখানে দেখা যাবে।")}</p>}
        <ul className="space-y-1.5">{my.journeys.map((j) => (
          <li key={j.id} className="flex items-center gap-2 rounded-xl border border-line bg-sunken/30 px-2.5 py-2">
            <button className="min-w-0 flex-1 text-left" disabled={!j.trip} onClick={() => j.trip && openTrip(j.trip)}>
              <span className="block truncate text-[12.5px] font-bold">{j.name}</span>
              <span className="block truncate text-2xs text-muted">{fmtKm(j.km * 1000, lang)} · {fmtDuration(j.min, lang)}{j.stops ? ` · ${fmt(j.stops, lang, 0)} ${L("places", "জায়গা")}` : ""} · {fmtDate(j.saved, lang)}</span></button>
            {j.trip && <button className="rounded-lg bg-accent px-2 py-1 text-2xs font-bold text-on-accent" onClick={() => openTrip(j.trip!)}>{L("Open", "খুলুন")}</button>}
            <button className="icon-btn h-7 w-7" onClick={() => my.removeJourney(j.id)} aria-label={L("Delete", "মুছুন")}><Trash2 size={13} /></button></li>))}</ul></section>
      <section><p className="grp mb-1.5 flex items-center gap-1.5"><Bookmark size={12} /> {L("Saved places", "রাখা জায়গা")} · {fmt(my.places.length, lang, 0)}</p>
        {!my.places.length && <p className="text-xs text-muted">{L("Touch a place on the map and press Save.", "মানচিত্রে জায়গায় ছুঁয়ে ‘রাখুন’ চাপুন।")}</p>}
        <ul className="space-y-1.5">{my.places.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-xl border border-line bg-sunken/30 px-2.5 py-1.5">
            <button className="min-w-0 flex-1 truncate text-left text-[12.5px] font-bold" onClick={() => { flyTo(p.lon, p.lat, 14); setState({ selection: /^\d+$/.test(p.ref) && p.type !== "point" ? { lon: p.lon, lat: p.lat, entity: { type: p.type, id: p.ref } } : { lon: p.lon, lat: p.lat } }); }}>{p.name}</button>
            <button className="icon-btn h-7 w-7" onClick={() => my.removePlace(p.id)} aria-label={L("Delete", "মুছুন")}><Trash2 size={13} /></button></li>))}</ul></section>
      <section><p className="grp mb-1.5 flex items-center gap-1.5"><NotebookPen size={12} /> {L("Notes", "নোট")} · {fmt(my.notes.length, lang, 0)}</p>
        <input className="field mb-1.5 text-xs" placeholder={L("Title", "শিরোনাম")} value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} />
        <textarea className="field min-h-[64px] text-xs" placeholder={L("What did you see or want to remember?", "কী দেখলেন বা মনে রাখতে চান?")} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />
        <div className="mt-1.5 flex items-center gap-1.5">
          <button className="btn-outline px-2.5 py-1.5 text-2xs" onClick={() => navigator.geolocation?.getCurrentPosition((g) => setNote((x) => ({ ...x, lon: +g.coords.longitude.toFixed(6), lat: +g.coords.latitude.toFixed(6) })))}><LocateFixed size={12} /> GPS</button>
          {note.lat !== null && <span className="text-2xs tabular-nums text-muted">{note.lat}, {note.lon}</span>}
          <button className="btn-primary ml-auto px-3 py-1.5 text-2xs" onClick={save}><Save size={12} /> {L("Save note", "নোট রাখুন")}</button></div>
        <ul className="mt-2 divide-y divide-line/60">{my.notes.map((x) => (
          <li key={x.id} className="flex items-start gap-2 py-1.5">
            <button className="min-w-0 flex-1 text-left" onClick={() => { if (x.lat !== null && x.lon !== null) flyTo(x.lon, x.lat, 15); setNote(x); }}>
              <span className="block text-[12.5px] font-bold">{x.title || "—"}</span>{x.text && <span className="block whitespace-pre-wrap text-2xs text-muted">{x.text}</span>}
              <span className="block text-2xs text-faint">{fmtDate(x.time, lang, true)}</span></button>
            <button className="icon-btn h-7 w-7" onClick={() => my.removeNote(x.id)} aria-label={L("Delete", "মুছুন")}><Trash2 size={13} /></button></li>))}</ul></section>
      <div className="flex gap-1.5">
        <button className="btn-outline flex-1 py-1.5 text-2xs" onClick={exportAll}><Download size={12} /> {L("Everything (GeoJSON)", "সব কিছু (GeoJSON)")}</button>
        {my.notes.length > 0 && <button className="btn-outline flex-1 py-1.5 text-2xs" onClick={() => exportTable("DISHARI_notes", ["title", "text", "time", "lat", "lon"], my.notes.map((x) => [x.title, x.text, x.time, x.lat, x.lon]), "csv")}><Download size={12} /> {L("Notes (CSV)", "নোট (CSV)")}</button>}
      </div>
      <p className="text-2xs text-faint">{L("Kept only in this browser on this device.", "শুধু এই যন্ত্রের এই ব্রাউজারে থাকে।")}</p>
    </div>
  );
}
