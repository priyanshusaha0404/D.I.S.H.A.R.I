"use client";
/** The trip report (PDF, Word, Excel): key numbers, the whole trip on the map with numbered places, the day on a
 *  timeline, where the time goes, the tide along the trip, hop by hop, a step-by-step itinerary, help numbers and how
 *  the plan was made. Everything is drawn from the site's own data, so it works offline. */
import type { Block, ReportDoc, Section } from "../report/model";
import { mapPng } from "../report/mapshot";
import { pinSVG } from "./pins";
import { buildTimeline } from "./timeline";
import { timelineChart, splitChart, tideChart, tideStrip, hopsChart } from "./charts";
import { clock, dayLabel, legEnd, MODE_COLOUR, SOS_NUMBERS, tideName, tw, vesselName, type TripWord } from "./text";
import { nearestOf } from "./nearby";
import { bboxOf, type LL } from "./geo";
import type { TripPlan } from "./plan";
import { getSeaLevel } from "../data/weather";
import { hexStore } from "../data/hex";
import { fmt, fmtDuration, fmtKm } from "../format";
import { translate, type Lang, type TKey } from "../i18n";

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function svgImg(svg: string) {
  if (!imgCache.has(svg)) imgCache.set(svg, new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }));
  return imgCache.get(svg)!;
}

async function tripMap(p: TripPlan, lang: Lang) {
  const coords: LL[] = [...p.hops.flatMap((h) => h.legs.flatMap((l) => l.coords as LL[])), ...p.stops.map((s) => [s.lon, s.lat] as LL)];
  const b = bboxOf(coords, 0.008);
  const lines: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: p.hops.flatMap((h) => h.legs.map((l) => ({ type: "Feature" as const,
    properties: { mode: l.mode, colour: l.mode === "boat" ? MODE_COLOUR.boat : MODE_COLOUR.walk }, geometry: { type: "LineString" as const, coordinates: l.coords } }))) };
  const n = p.stops.length - 1;
  const back = p.stops[n].id.endsWith("-back");
  return mapPng({ bounds: b, lines, width: 1000, height: 640, padding: 70, labels: true, draw: async (g, project, s) => {
    // ghats where you change between boat and walking
    const ghat = await svgImg(pinSVG("#256abf", { icon: "anchor" }));
    for (const h of p.hops) for (const [k, l] of h.legs.entries()) {
      if (k === 0 || !ghat) continue;
      const [x, y] = project(l.coords[0] as LL);
      g.drawImage(ghat, x - 10 * s, y - 31 * s, 20 * s, 31.25 * s);
    }
    // the places, numbered, with their names
    const boxes: [number, number, number, number][] = [];
    for (let i = n; i >= 0; i--) {
      if (back && i === n) continue;
      const st = p.stops[i];
      const inner = i === 0 ? { icon: "home" } : i === n ? { icon: "flag" } : { text: String(i) };
      const col = i === 0 ? "#123D32" : i === n ? "#e34948" : "#eb6834";
      const im = await svgImg(pinSVG(col, inner));
      const [x, y] = project([st.lon, st.lat]);
      if (im) g.drawImage(im, x - 15 * s, y - 46.9 * s, 30 * s, 46.9 * s);
    }
    g.textBaseline = "alphabetic";
    for (let i = 0; i <= n; i++) {
      if (back && i === n) continue;
      const st = p.stops[i];
      const [x, y] = project([st.lon, st.lat]);
      g.font = `700 ${12.5 * s}px "Inter Variable", "Noto Sans Bengali", Arial, sans-serif`;
      const label = st.name.length > 34 ? `${st.name.slice(0, 33)}…` : st.name;
      const w = g.measureText(label).width;
      const bx = x + 16 * s, by = y - 30 * s;
      const box: [number, number, number, number] = [bx - 4 * s, by - 14 * s, w + 8 * s, 19 * s];
      if (boxes.some((q) => !(box[0] > q[0] + q[2] || box[0] + box[2] < q[0] || box[1] > q[1] + q[3] || box[1] + box[3] < q[1]))) continue;
      boxes.push(box);
      g.lineWidth = 4 * s; g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineJoin = "round"; g.strokeText(label, bx, by);
      g.fillStyle = "#16201c"; g.fillText(label, bx, by);
    }
    // legend (modes on this map)
    const modes = [...new Set(p.hops.flatMap((h) => h.legs.map((l) => l.mode)))];
    const items: [string, string, boolean][] = modes.map((m) => [m === "boat" ? `${tw(lang, "s_boat")} — ${vesselName(p.settings.vessel, lang)}` : tw(lang, "s_walk"), m === "boat" ? MODE_COLOUR.boat : MODE_COLOUR.walk, m === "walk"]);
    if (p.totals.changes) items.push([tw(lang, "s_change"), "#256abf", false]);
    g.font = `600 ${11.5 * s}px "Inter Variable", "Noto Sans Bengali", Arial, sans-serif`;
    const lw = Math.max(...items.map((it) => g.measureText(it[0]).width)) + 62 * s, lh = 20 * s * items.length + 16 * s;
    const lx = 12 * s, ly = 12 * s;
    g.fillStyle = "rgba(255,255,255,0.94)"; g.fillRect(lx, ly, lw, lh); g.strokeStyle = "#c9c6bb"; g.lineWidth = 1 * s; g.strokeRect(lx, ly, lw, lh);
    items.forEach(([label, col, dotted], k) => {
      const y = ly + 18 * s + k * 20 * s;
      if (k === items.length - 1 && p.totals.changes && label === tw(lang, "s_change")) {
        g.fillStyle = col; g.beginPath(); g.arc(lx + 24 * s, y, 5 * s, 0, 7); g.fill();
      } else {
        g.lineCap = "round"; g.strokeStyle = "#fff"; g.lineWidth = 7 * s; g.setLineDash([]); g.beginPath(); g.moveTo(lx + 10 * s, y); g.lineTo(lx + 38 * s, y); g.stroke();
        g.strokeStyle = col; g.lineWidth = 4 * s; g.setLineDash(dotted ? [0.1, 7 * s] : []); g.beginPath(); g.moveTo(lx + 10 * s, y); g.lineTo(lx + 38 * s, y); g.stroke(); g.setLineDash([]);
      }
      g.fillStyle = "#16201c"; g.textBaseline = "middle"; g.fillText(label, lx + 48 * s, y); g.textBaseline = "alphabetic";
    });
  } });
}

const tideSrc = (h: TripPlan["hops"][number], lang: Lang) => tw(lang, h.tideSource === "forecast" ? "forecast" : h.tideSource === "chosen" ? "chosen" : "usual");

export async function tripReport(p: TripPlan, lang: Lang): Promise<ReportDoc> {
  const T = (k: TKey) => translate(lang, k);
  const W = (k: TripWord, x?: Record<string, string | number>) => tw(lang, k, x);
  if (lang === "bn") { try { await document.fonts.load('600 12px "Noto Sans Bengali"'); } catch { /* fonts API missing */ } }
  const tl = buildTimeline(p);
  const n = p.stops.length - 1;
  const back = p.stops[n].id.endsWith("-back");
  const places = p.stops.length - (back ? 1 : 0);
  const [map, sea, hx, near] = await Promise.all([
    tripMap(p, lang).catch(() => null),
    p.settings.mode !== "walk" ? getSeaLevel(p.stops[0].lat, p.stops[0].lon).then((r) => r.data).catch(() => null) : Promise.resolve(null),
    hexStore().catch(() => null),
    nearestOf([p.stops[0].lon, p.stops[0].lat], ["health", "emergency", "shelter"], 4).catch(() => []),
  ]);
  const timeline = timelineChart(p, tl, lang);
  const sp = splitChart(tl, lang);
  const tide = p.settings.mode !== "walk" ? tideChart(sea, p, lang) : null;
  const strip = p.settings.mode !== "walk" && !tide ? tideStrip(p, tl, lang) : null;
  const hops = hopsChart(p, lang);
  const modeName = p.settings.mode === "boat" ? T("route.boat") : p.settings.mode === "walk" ? T("route.walk") : T("route.multimodal");

  const img = (x: { src: string; w: number; h: number } | null, caption?: string): Block[] => (x ? [{ t: "img", src: x.src, w: 515, h: (515 * x.h) / x.w, caption }] : []);
  const legLine = (h: TripPlan["hops"][number], l: TripPlan["hops"][number]["legs"][number], k: number) => {
    const head = l.mode === "boat" ? W("boatTo", { vessel: vesselName(p.settings.vessel, lang), to: legEnd(l, "to", lang) }) : W("walkTo", { to: legEnd(l, "to", lang) });
    const via = l.mode === "boat" && l.rivers.length ? ` · ${W("via", { r: l.rivers.join(", ") })}` : "";
    const change = k > 0 ? `${W("changeAt", { g: legEnd(l, "from", lang) })} (${fmtDuration((l.t0 - h.legs[k - 1].t1) / 60000, lang)})\n` : "";
    return `${change}${head}\n${clock(l.t0, lang)} → ${clock(l.t1, lang)} · ${fmtKm(l.km * 1000, lang)} · ${fmtDuration(l.min, lang)}${via}`;
  };
  const itinRows: (string | number)[][] = [];
  for (let i = 0; i <= p.hops.length; i++) {
    const s = p.stops[i];
    const hIn = p.hops[i - 1], hOut = p.hops[i];
    const isStart = i === 0, isEnd = i === p.hops.length;
    const time = isStart ? W("r_leaveRow", { t: clock(p.start, lang) }) : isEnd || !hOut ? W("arrive", { t: clock(hIn.arrive, lang) })
      : `${clock(hIn.arrive, lang)}\n${W("r_until", { t: clock(hOut.depart, lang) })}`;
    const what = isStart ? W("start") : isEnd ? W("finish") : `${W("stay")} ${fmtDuration((hOut.depart - hIn.arrive) / 60000, lang)}`;
    const how = isStart ? `${modeName}${p.settings.mode !== "walk" ? ` · ${vesselName(p.settings.vessel, lang)}` : ""}` : hIn.legs.map((l, k) => legLine(hIn, l, k)).join("\n");
    const tideCell = isStart || !hIn.legs.some((l) => l.mode === "boat") ? "—" : `${tideName(hIn.tide, lang)}\n${tideSrc(hIn, lang)}`;
    itinRows.push([isStart || (isEnd && back) ? "⌂" : isEnd ? "⚑" : fmt(i, lang, 0), time, `${s.name}\n${what}`, how, tideCell]);
  }
  const hopRows = p.hops.map((h, k) => [fmt(k + 1, lang, 0), p.stops[h.from].name, p.stops[h.to].name, clock(h.depart, lang), clock(h.arrive, lang), fmtKm(h.km * 1000, lang),
    fmtDuration(h.min, lang), h.legs.map((l) => (l.mode === "boat" ? W("s_boat") : W("s_walk"))).join(" + "), h.legs.some((l) => l.mode === "boat") ? `${tideName(h.tide, lang)} (${tideSrc(h, lang)})` : "—",
    [...new Set(h.legs.flatMap((l) => l.rivers))].join(", ") || "—"]);
  const legRows = p.hops.flatMap((h, k) => h.legs.map((l, j) => [fmt(k + 1, lang, 0), fmt(j + 1, lang, 0), l.mode === "boat" ? W("s_boat") : W("s_walk"), legEnd(l, "from", lang), legEnd(l, "to", lang),
    clock(l.t0, lang), clock(l.t1, lang), fmt(l.km, lang, 2), fmt(Math.round(l.min), lang, 0), l.rivers.join(", ") || "—", fmt(l.creekKm || 0, lang, 2), fmt(l.permitKm || 0, lang, 2)]));

  const notes: string[] = [];
  if (p.reordered) notes.push(W("reordered"));
  for (const [k, h] of p.hops.entries()) {
    for (const x of h.notes) notes.push(`${W("hop", { n: fmt(k + 1, lang, 0) })}: ${T(x.key as TKey)}${x.m ? ` (${fmtKm(x.m, lang)})` : ""}`);
    if (h.legs.some((l) => l.mode === "boat")) notes.push(`${W("hop", { n: fmt(k + 1, lang, 0) })}: ${tideName(h.tide, lang)} — ${tideSrc(h, lang)}${h.tideH !== undefined ? ` (${fmt(h.tideH, lang, 2)} ${lang === "bn" ? "মি" : "m"})` : ""}`);
    const permit = h.legs.reduce((a, l) => a + (l.permitKm || 0), 0);
    if (permit > 0.05) notes.push(`${W("hop", { n: fmt(k + 1, lang, 0) })}: ${W("permit", { d: fmtKm(permit * 1000, lang) })}`);
  }

  const metaRows: [string, string][] = [
    [T("rep.generated"), new Date().toLocaleString(lang === "bn" ? "bn-IN" : "en-IN", { dateStyle: "long", timeStyle: "short" })],
    ...(hx ? [[lang === "bn" ? "তথ্য সংস্করণ" : "Data release", `${hx.catalog.release.tag} (${hx.catalog.release.exported})`] as [string, string]] : []),
  ];
  const settingsRows: [string, string][] = [
    [W("start"), `${p.stops[0].name} · ${dayLabel(p.start, lang)} ${clock(p.start, lang)}`],
    [W("finish"), `${p.stops[n].name} · ${dayLabel(p.end, lang)} ${clock(p.end, lang)}`],
    [W("r_settings"), `${modeName}${p.settings.mode !== "walk" ? ` · ${vesselName(p.settings.vessel, lang)}` : ""}`],
    ...(p.settings.mode !== "walk" ? [[W("r_prefer"), p.settings.prefer === "safe" ? T("route.safe") : p.settings.prefer === "main" ? T("route.main") : T("route.shortest")] as [string, string],
      [W("r_tideSet"), p.settings.tide === "auto" ? W("r_tideAutoV") : tideName(p.settings.tide, lang)] as [string, string]] : []),
    [W("r_order"), p.settings.bestOrder ? W("r_orderBest") : W("r_orderAsGiven")],
  ];
  const sections: Section[] = [
    { title: W("r_summary"), blocks: [
      { t: "kpis", cols: 3, items: [
        { label: W("k_total"), value: fmtDuration(p.totals.min, lang), sub: `${clock(p.start, lang)} → ${clock(p.end, lang)}` },
        { label: W("k_finish"), value: clock(p.end, lang), sub: dayLabel(p.end, lang) },
        { label: W("k_dist"), value: fmtKm(p.totals.km * 1000, lang), sub: `${fmt(places, lang, 0)} ${lang === "bn" ? "জায়গা" : "places"} · ${fmt(p.hops.length, lang, 0)} ${lang === "bn" ? "যাত্রাংশ" : p.hops.length === 1 ? "hop" : "hops"}` },
        { label: W("k_boat"), value: fmtKm(p.totals.boatKm * 1000, lang), sub: vesselName(p.settings.vessel, lang) },
        { label: W("k_walk"), value: fmtKm(p.totals.walkKm * 1000, lang), sub: W("k_moving", { m: fmtDuration(p.totals.moveMin, lang) }) },
        { label: W("k_changes"), value: fmt(p.totals.changes, lang, 0), sub: `${W("k_stays")} ${fmtDuration(p.totals.stayMin, lang)}` },
      ] },
      ...img(map, `${W("r_map")} — ${W("r_mapCap")}`),
      { t: "kv", rows: settingsRows },
    ] },
    { title: W("r_day"), blocks: [
      ...img(timeline, `${W("r_timeline")} — ${W("r_timelineCap")}`),
      ...img(sp, `${W("split")} — ${W("r_splitCap")}`),
      ...(tide ? img(tide, `${W("r_tide")} — ${W("r_tideCap")}`) : strip ? img(strip, `${W("r_tide")} — ${W("r_tideStrip")}`) : []),
      ...img(hops, `${W("r_hops")} — ${W("r_hopsCap")}`),
    ] },
    { title: W("r_itin"), blocks: [
      { t: "table", head: ["#", W("r_th_time"), W("r_th_place"), W("r_th_how"), W("r_th_tide")], rows: itinRows, widths: [16, 62, 110, "*", 62], numeric: [false, false, false, false, false] },
    ] },
    { title: W("r_hops"), blocks: [
      { t: "table", caption: W("r_hops"), head: [W("r_th_hop"), W("r_th_from"), W("r_th_to"), W("r_th_dep"), W("r_th_arr"), W("r_th_dist"), W("r_th_dur"), W("r_th_mode"), W("r_th_tide"), W("r_th_rivers")],
        rows: hopRows, widths: [22, "*", "*", 34, 34, 40, 50, 48, 56, 70], numeric: [false, false, false, false, false, true, false, false, false, false] },
      { t: "table", caption: W("r_sheet_legs"), head: [W("r_th_hop"), "#", W("r_th_mode"), W("r_th_from"), W("r_th_to"), W("r_th_dep"), W("r_th_arr"), lang === "bn" ? "কিমি" : "km", lang === "bn" ? "মিনিট" : "min", W("r_th_rivers"),
        lang === "bn" ? "খাঁড়ি কিমি" : "Creek km", lang === "bn" ? "অনুমতি কিমি" : "Permit km"], rows: legRows,
        widths: [22, 14, 36, "*", "*", 32, 32, 28, 26, 62, 30, 32] },
    ] },
    ...(notes.length ? [{ title: W("r_notes"), blocks: [{ t: "bullets", items: notes } as Block] }] : []),
    { title: W("r_help"), blocks: [
      { t: "table", head: [lang === "bn" ? "নম্বর" : "Number", lang === "bn" ? "পরিষেবা" : "Service"], rows: SOS_NUMBERS.map((x) => [x, W(`n${x}` as TripWord)]), widths: [70, "*"], numeric: [false, false] },
      ...(near.length ? [{ t: "table", caption: `${W("sosNear")} · ${W("sosFrom", { p: p.stops[0].name })}`, head: [W("r_th_place"), lang === "bn" ? "ধরন" : "Type", W("r_th_dist")],
        rows: near.map(({ s, d }) => [s.name || s.category || "—", (s.amenity || s.category || "").replace(/_/g, " "), fmtKm(d, lang)]), widths: ["*", 120, 60] } as Block] : []),
    ] },
    { title: W("r_method"), blocks: [
      { t: "p", text: W("r_method1") }, { t: "p", text: W("r_method2") }, ...(p.settings.mode !== "walk" ? [{ t: "p", text: W("r_method3") } as Block] : []),
      { t: "table", caption: W("r_coords"), head: ["#", W("r_th_place"), lang === "bn" ? "অক্ষাংশ" : "Latitude", lang === "bn" ? "দ্রাঘিমাংশ" : "Longitude"],
        rows: p.stops.filter((_, i) => !(back && i === n)).map((s, i) => [i === 0 ? "⌂" : fmt(i, lang, 0), s.name, s.lat.toFixed(5), s.lon.toFixed(5)]), widths: [16, "*", 70, 70] },
      { t: "p", muted: true, text: lang === "bn"
        ? "D.I.S.H.A.R.I · মানচিত্রের তথ্য © OpenStreetMap অবদানকারীরা · জলপথ ও নৌচলাচলযোগ্য জল D.I.S.H.A.R.I বিশ্লেষণ · সমুদ্রতলের পূর্বাভাস Open-Meteo (CC BY 4.0)"
        : "D.I.S.H.A.R.I · map data © OpenStreetMap contributors · waterways and navigable water from D.I.S.H.A.R.I analysis · sea-level forecast Open-Meteo (CC BY 4.0)" },
    ] },
  ];
  return {
    title: `${W("r_title")}: ${p.stops[0].name} → ${p.stops[n].name}`,
    subtitle: `${dayLabel(p.start, lang)} · ${clock(p.start, lang)} → ${clock(p.end, lang)} · ${fmtDuration(p.totals.min, lang)} · ${fmtKm(p.totals.km * 1000, lang)}`,
    lang, meta: metaRows, sections, fileBase: `DISHARI_trip_${p.stops[0].name}_${p.stops[n].name}`,
  };
}
