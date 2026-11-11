"use client";
/** Dashboard: the Sundarbans blocks at a glance — headline numbers, where people live, services, ghats, forest permit
 *  zones and the model zones (tiger, fish, honey, crab) for every block, a sortable table, downloads and your trips. */
import { useMemo, useState } from "react";
import { Anchor, Download, Hospital, House, Map as MapIcon, Trees, Users } from "@/components/icons";
import Chart from "@/components/charts/Chart";
import { useApp, useAsync } from "@/lib/app-context";
import { chrome } from "@/lib/charts/options";
import { useMyData } from "@/lib/data/storage";
import { hexStore } from "@/lib/data/hex";
import { getEntity } from "@/lib/data/entities";
import { fmt, fmtDuration, fmtKm } from "@/lib/format";
import { fitBounds, setState } from "@/lib/map/store";
import { allBlocks, CATS, CAT_COLOUR, CAT_NAME, type BlockInfo } from "@/lib/blockinfo";
import { ZONES, ZONE_META, zoneIndex, type Zone } from "@/lib/zones";
import { toast } from "@/lib/ui";
import { cx, Spinner } from "@/components/ui";

type Opt = Record<string, unknown>;
type Key = "population" | "households" | "villages" | "area" | "density" | "ghats" | "health" | "services" | "permit";
const val = (b: BlockInfo, k: Key) => k === "ghats" ? b.ghats.length : k === "health" ? b.services.health?.length || 0 : k === "services" ? Object.values(b.services).reduce((s, x) => s + x.length, 0)
  : k === "permit" ? b.zones.permit + b.zones.core : k === "density" ? b.density || 0 : b[k];
const DCOL = ["#38bdf8", "#2dd4a7"];   // North / South 24 Parganas
const FONT = "'Inter Variable', 'Noto Sans Bengali', system-ui, sans-serif";
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** area (km²) of high model zones in every block */
async function zonesByBlock(): Promise<Record<string, Record<Zone, number>>> {
  const hx = await hexStore();
  const out: Record<string, Record<Zone, number>> = {};
  for (const z of ZONES) {
    const v = await zoneIndex(z);
    for (let i = 0; i < hx.n; i++) {
      if (!(v[i] >= 0.66)) continue;
      const b = normName(hx.meta.blocks[hx.meta.block[i]] || "");
      if (!b) continue;
      (out[b] ||= { tiger: 0, fish: 0, honey: 0, crab: 0 })[z] += hx.meta.area[i] || 1.6;
    }
  }
  return out;
}

function Tile({ icon, label, value, sub, colour }: { icon: React.ReactNode; label: string; value: string; sub?: string; colour: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-raised px-3.5 py-3">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: colour }} />
      <div className="flex items-center gap-2 text-2xs font-semibold text-muted"><span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: `${colour}22`, color: colour }}>{icon}</span>{label}</div>
      <div className="mt-1.5 text-[22px] font-extrabold leading-none tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-2xs text-faint">{sub}</div>}
    </div>
  );
}

export default function Dash() {
  const { lang, theme, L } = useApp();
  const { data, loading } = useAsync(allBlocks, []);
  const zb = useAsync(zonesByBlock, []);
  const my = useMyData();
  const [metric, setMetric] = useState<Key>("population");
  const [sort, setSort] = useState<{ k: Key | "name"; dir: 1 | -1 }>({ k: "population", dir: -1 });
  const [district, setDistrict] = useState("all");
  const dark = theme === "dark";
  const c = chrome({ dark });
  const bn = lang === "bn";
  const n = (v: number, d = 0) => fmt(v, lang, d);
  const METRICS: [Key, string][] = [["population", L("Population", "জনসংখ্যা")], ["households", L("Households", "পরিবার")], ["villages", L("Villages", "গ্রাম")], ["area", L("Area km²", "ক্ষেত্রফল")],
    ["density", L("People/km²", "জন/বর্গকিমি")], ["ghats", L("Ghats", "ঘাট")], ["health", L("Health", "স্বাস্থ্য")], ["services", L("Services", "পরিষেবা")], ["permit", L("Permit zone %", "অনুমতি এলাকা %")]];
  const districts = useMemo(() => [...new Set((data || []).map((b) => b.district))].sort(), [data]);
  const dColour = (d: string) => DCOL[Math.max(0, districts.indexOf(d)) % DCOL.length];
  const bs = useMemo(() => (data || []).filter((b) => district === "all" || b.district === district), [data, district]);
  const ranked = useMemo(() => [...bs].sort((a, b) => val(b, metric) - val(a, metric)), [bs, metric]);
  const rows = useMemo(() => [...bs].sort((a, b) => sort.k === "name" ? a.name.localeCompare(b.name) * sort.dir : (val(a, sort.k) - val(b, sort.k)) * sort.dir), [bs, sort]);

  const base = useMemo<Opt>(() => ({ backgroundColor: "transparent", textStyle: { fontFamily: FONT, color: c.ink2 }, aria: { enabled: true },
    tooltip: { backgroundColor: dark ? "#262624" : "#fff", borderColor: c.axis, textStyle: { color: c.ink, fontSize: 12 }, confine: true } }), [c, dark]);

  const opts = useMemo(() => {
    if (!bs.length) return null;
    const sum = (f: (b: BlockInfo) => number) => bs.reduce((s, b) => s + f(b), 0);
    const tip = base.tooltip as Opt;
    // where people live: treemap of blocks, grouped by district
    const treemap: Opt = { ...base, tooltip: { ...tip, formatter: (p: { name: string; value: number; treePathInfo: unknown[] }) => `<b>${p.name}</b><br/>${n(p.value)} ${bn ? "জন" : "people"}` },
      series: [{ type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false }, top: 4, left: 2, right: 2, bottom: 2,
        label: { show: true, formatter: (p: { name: string; value: number }) => `{n|${p.name}}\n{v|${fmt(p.value / 1000, lang, 0)}k}`, rich: { n: { fontSize: 11, fontWeight: 700, color: "#0b1220" }, v: { fontSize: 10, color: "#0b1220cc" } } },
        upperLabel: { show: false }, itemStyle: { borderColor: c.surface, borderWidth: 2, gapWidth: 2, borderRadius: 6 },
        levels: [{ itemStyle: { borderWidth: 0, gapWidth: 3 } }, { colorSaturation: [0.35, 0.6], itemStyle: { gapWidth: 2, borderRadius: 6 } }],
        data: districts.filter((d) => district === "all" || d === district).map((d) => ({ name: d, itemStyle: { color: dColour(d) },
          children: bs.filter((b) => b.district === d).map((b) => ({ name: b.name, value: b.population })) })) }] };
    // services donut with the total in the middle
    const all = CATS.map((k) => ({ k: k as string, v: sum((b) => b.services[k]?.length || 0) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const cats = all.length > 7 ? [...all.slice(0, 6), { k: "other", v: all.slice(6).reduce((s, x) => s + x.v, 0) }] : all;
    const total = cats.reduce((s, x) => s + x.v, 0);
    const donut: Opt = { ...base, tooltip: { ...tip, trigger: "item" },
      title: { text: n(total), subtext: bn ? "পরিষেবা" : "services", left: "27%", top: "41%", textAlign: "center", textStyle: { fontSize: 22, fontWeight: 800, color: c.ink }, subtextStyle: { fontSize: 11, color: c.muted }, itemGap: 2 },
      legend: { orient: "vertical", left: "56%", top: "middle", icon: "circle", itemWidth: 9, itemHeight: 9, itemGap: 9, textStyle: { color: c.ink2, fontSize: 11.5, width: 120, overflow: "truncate" } },
      series: [{ type: "pie", radius: ["44%", "68%"], center: ["28%", "50%"], padAngle: 1.5, itemStyle: { borderRadius: 5, borderColor: c.surface, borderWidth: 2 }, label: { show: false },
        emphasis: { scale: true, scaleSize: 5 }, data: cats.map((x) => ({ name: (CAT_NAME[x.k] || CAT_NAME.other)[bn ? 1 : 0], value: x.v, itemStyle: { color: CAT_COLOUR[x.k] || "#94a3b8" } })) }] };
    // ranked bars with a gradient and labels
    const mname = METRICS.find((m) => m[0] === metric)![1];
    const vals = ranked.map((b) => +val(b, metric).toFixed(metric === "density" || metric === "area" || metric === "permit" ? 0 : 0));
    const ranking: Opt = { ...base, tooltip: { ...tip, trigger: "axis", axisPointer: { type: "shadow" } }, grid: { left: 118, right: 54, top: 6, bottom: 6 },
      xAxis: { type: "value", show: false }, yAxis: { type: "category", inverse: true, triggerEvent: true, data: ranked.map((b) => b.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: c.ink2, fontSize: 11.5, width: 110, overflow: "truncate" } },
      series: [{ name: mname, type: "bar", barWidth: 13, data: vals.map((v, i) => ({ value: v, itemStyle: { color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: `${dColour(ranked[i].district)}55` }, { offset: 1, color: dColour(ranked[i].district) }] } } })),
        itemStyle: { borderRadius: [0, 6, 6, 0] }, showBackground: true, backgroundStyle: { color: dark ? "#ffffff08" : "#0000000a", borderRadius: [0, 6, 6, 0] },
        label: { show: true, position: "right", color: c.ink2, fontSize: 11, fontWeight: 600, formatter: (p: { value: number }) => n(p.value) + (metric === "permit" ? "%" : "") } }] };
    // model zones per block (stacked, km²)
    const zmap = zb.data || {};
    const zBlocks = [...bs].map((b) => ({ b, z: zmap[normName(b.name)] || { tiger: 0, fish: 0, honey: 0, crab: 0 } }))
      .filter((x) => ZONES.some((z) => x.z[z] > 0)).sort((a, b) => ZONES.reduce((s, z) => s + b.z[z], 0) - ZONES.reduce((s, z) => s + a.z[z], 0));
    const zoneBars: Opt = { ...base, tooltip: { ...tip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => `${fmt(v, lang, 0)} km²` },
      legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 8, textStyle: { color: c.ink2, fontSize: 11.5 } },
      grid: { left: 118, right: 16, top: 30, bottom: 22 },
      xAxis: { type: "value", axisLabel: { color: c.muted, fontSize: 10.5, formatter: (v: number) => `${fmt(v, lang, 0)}` }, splitLine: { lineStyle: { color: c.grid } }, name: "km²", nameLocation: "end", nameTextStyle: { color: c.muted, fontSize: 10.5 } },
      yAxis: { type: "category", inverse: true, triggerEvent: true, data: zBlocks.map((x) => x.b.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: c.ink2, fontSize: 11.5, width: 110, overflow: "truncate" } },
      series: ZONES.map((z) => ({ name: bn ? ZONE_META[z].bn : ZONE_META[z].en, type: "bar", stack: "z", barWidth: 13, data: zBlocks.map((x) => +x.z[z].toFixed(1)),
        itemStyle: { color: ZONE_META[z].colour, borderColor: c.surface, borderWidth: 1 } })) };
    // people vs health points: who is short of care (bubble = area)
    const maxA = Math.max(...bs.map((b) => b.area), 1);
    const bigs = new Set([...bs].sort((a, b) => (b.services.health?.length || 0) - (a.services.health?.length || 0) || b.population - a.population).slice(0, 4).map((b) => b.name));
    const bubble: Opt = { ...base, tooltip: { ...tip, trigger: "item", formatter: (p: { data: { name: string; value: number[] } }) => `<b>${p.data.name}</b><br/>${bn ? "জনসংখ্যা" : "People"}: ${n(p.data.value[0])}<br/>${bn ? "স্বাস্থ্যকেন্দ্র" : "Health points"}: ${n(p.data.value[1])}<br/>${bn ? "প্রতি ১০,০০০ জনে" : "Per 10,000 people"}: ${fmt(p.data.value[3], lang, 1)}` },
      legend: districts.length > 1 ? { top: 0, right: 0, icon: "circle", itemWidth: 9, itemHeight: 9, textStyle: { color: c.ink2, fontSize: 11.5 } } : undefined,
      grid: { left: 46, right: 18, top: 40, bottom: 38 },
      xAxis: { type: "value", name: bn ? "জনসংখ্যা" : "People", nameLocation: "middle", nameGap: 24, nameTextStyle: { color: c.muted, fontSize: 11 }, axisLabel: { color: c.muted, fontSize: 10.5, formatter: (v: number) => `${fmt(v / 1000, lang, 0)}k` }, splitLine: { lineStyle: { color: c.grid } } },
      yAxis: { type: "value", max: (v: { max: number }) => Math.ceil(v.max * 1.3), name: bn ? "স্বাস্থ্যকেন্দ্র" : "Health points", nameTextStyle: { color: c.muted, fontSize: 11, align: "left" }, axisLabel: { color: c.muted, fontSize: 10.5 }, splitLine: { lineStyle: { color: c.grid } } },
      series: districts.map((d) => ({ name: d, type: "scatter", data: bs.filter((b) => b.district === d).map((b) => { const h = b.services.health?.length || 0; return { name: b.name, value: [b.population, h, b.area, b.population ? (h / b.population) * 1e4 : 0] }; }),
        symbolSize: (v: number[]) => 8 + 26 * Math.sqrt(v[2] / maxA), itemStyle: { color: dColour(d), opacity: 0.75, borderColor: c.surface, borderWidth: 1.5 },
        label: { show: true, position: "top", fontSize: 9.5, color: c.muted, formatter: (p: { data: { name: string; value: number[] } }) => (bigs.has(p.data.name) ? p.data.name : "") }, emphasis: { focus: "series" } })) };
    // permit zones per block, 100 %
    const pBlocks = [...bs].sort((a, b) => (b.zones.permit + b.zones.core) - (a.zones.permit + a.zones.core));
    const permit: Opt = { ...base, tooltip: { ...tip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => `${fmt(v, lang, 0)}%` },
      legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 8, textStyle: { color: c.ink2, fontSize: 11.5 } }, grid: { left: 118, right: 16, top: 30, bottom: 8 },
      xAxis: { type: "value", max: 100, show: false }, yAxis: { type: "category", inverse: true, triggerEvent: true, data: pBlocks.map((b) => b.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: c.ink2, fontSize: 11.5, width: 110, overflow: "truncate" } },
      series: ([["open", L("Open", "উন্মুক্ত"), "#2dd4a7"], ["permit", L("Permit needed", "অনুমতি লাগে"), "#f5a623"], ["core", L("No entry (core)", "প্রবেশ নিষেধ (কোর)"), "#f0556a"]] as const).map(([k, name, col]) => ({
        name, type: "bar", stack: "p", barWidth: 12, data: pBlocks.map((b) => +b.zones[k].toFixed(1)), itemStyle: { color: col, borderColor: c.surface, borderWidth: 1 } })) };
    return { treemap, donut, ranking, zoneBars, zBlocks, bubble, permit, pBlocks, cats, mname };
  }, [bs, base, c, dark, lang, bn, metric, ranked, districts, district, zb.data]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !data || !opts) return <div className="p-6"><Spinner /></div>;
  const sum = (f: (b: BlockInfo) => number) => bs.reduce((s, b) => s + f(b), 0);
  const pop = sum((b) => b.population), area = sum((b) => b.area), health = sum((b) => b.services.health?.length || 0);
  const permitPct = area ? (sum((b) => (b.zones.permit + b.zones.core) * b.area) / area) : 0;
  const pickBlock = (name: string) => {
    const b = bs.find((x) => x.name === name);
    if (!b) return;
    if (b.bbox) fitBounds(b.bbox, 11.5);
    setState({ spots: [{ lon: b.lon, lat: b.lat, colour: "#f43f5e", size: 40, inner: { text: "★" }, title: b.name, onClick: () => show(b) }] });
    // the whole block is highlighted, not only a point
    void getEntity("block", b.id).then((e) => { if (e?.geom) setState({ highlight: { layer: e.geom.layer, ids: e.geom.ids } }); }).catch(() => undefined);
    toast(L(`${b.name} marked on the map`, `${b.name} মানচিত্রে চিহ্নিত`));
  };
  const show = (b: BlockInfo) => { if (b.bbox) fitBounds(b.bbox, 12); setState({ selection: { lon: b.lon, lat: b.lat, entity: { type: "block", id: b.id } } }); };
  const dl = async (f: "pdf" | "docx" | "xlsx") => { const [{ overviewReport }, { exportReport }] = await Promise.all([import("@/lib/report/lean"), import("@/lib/report")]); await exportReport(await overviewReport(lang), f); toast(L("Downloaded", "ডাউনলোড হয়েছে")); };
  const km = my.journeys.reduce((s, j) => s + j.km, 0), min = my.journeys.reduce((s, j) => s + j.min, 0);
  const Th = ({ k, children }: { k: Key | "name"; children: string }) => (
    <th className={cx("cursor-pointer whitespace-nowrap border-b border-line px-2 py-2 font-bold text-muted hover:text-ink", k === "name" ? "text-left" : "text-right")}
      onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : k === "name" ? 1 : -1 }))}>{children}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</th>);
  const maxPop = Math.max(...rows.map((b) => b.population), 1);
  return (
    <div className="space-y-3.5 px-4 pb-5">
      {/* hero */}
      <div className="relative overflow-hidden rounded-2xl p-4 text-white" style={{ background: "linear-gradient(120deg,#0b3b5a 0%,#0f766e 55%,#166534 100%)" }}>
        <svg className="pointer-events-none absolute -right-6 -top-8 h-44 w-44 opacity-20" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="none" stroke="#fff" strokeWidth="1" /><circle cx="50" cy="50" r="34" fill="none" stroke="#fff" strokeWidth="1" /><circle cx="50" cy="50" r="20" fill="none" stroke="#fff" strokeWidth="1" /></svg>
        <p className="text-2xs font-bold uppercase tracking-[.14em] text-white/70">{L("Indian Sundarbans", "ভারতীয় সুন্দরবন")}</p>
        <h3 className="mt-0.5 text-xl font-extrabold leading-tight">{L(`${n(bs.length)} blocks at a glance`, `এক নজরে ${n(bs.length)}টি ব্লক`)}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-white/15 p-0.5 text-2xs font-bold" role="radiogroup">
            {["all", ...districts].map((d) => (
              <button key={d} role="radio" aria-checked={district === d} onClick={() => setDistrict(d)} className={cx("rounded-[10px] px-2.5 py-1.5", district === d ? "bg-white text-slate-900" : "text-white/85 hover:text-white")}>
                {d === "all" ? L("Both districts", "দুই জেলা") : d}</button>))}
          </div>
          <span className="flex-1" />
          {(["pdf", "docx", "xlsx"] as const).map((f) => <button key={f} className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1.5 text-2xs font-bold hover:bg-white/25" onClick={() => dl(f)}><Download size={12} />{f === "pdf" ? "PDF" : f === "docx" ? "Word" : "Excel"}</button>)}
        </div>
      </div>

      {/* headline numbers */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile icon={<Users size={14} />} label={L("People", "জনসংখ্যা")} value={n(pop)} sub={L(`${n(sum((b) => b.households))} households`, `${n(sum((b) => b.households))}টি পরিবার`)} colour="#38bdf8" />
        <Tile icon={<House size={14} />} label={L("Villages", "গ্রাম")} value={n(sum((b) => b.villages))} sub={L(`${n(sum((b) => b.towns))} towns`, `${n(sum((b) => b.towns))}টি শহর`)} colour="#a78bfa" />
        <Tile icon={<MapIcon size={14} />} label={L("Area", "ক্ষেত্রফল")} value={`${n(area)} km²`} sub={L(`${n(area ? pop / area : 0)} people per km²`, `প্রতি বর্গকিমিতে ${n(area ? pop / area : 0)} জন`)} colour="#2dd4a7" />
        <Tile icon={<Anchor size={14} />} label={L("Ghats", "ঘাট")} value={n(sum((b) => b.ghats.length))} sub={L("boat landings", "নৌকাঘাট")} colour="#60a5fa" />
        <Tile icon={<Hospital size={14} />} label={L("Health points", "স্বাস্থ্যকেন্দ্র")} value={n(health)} sub={L(`${fmt(pop ? (health / pop) * 1e4 : 0, lang, 1)} per 10,000 people`, `প্রতি ১০,০০০ জনে ${fmt(pop ? (health / pop) * 1e4 : 0, lang, 1)}`)} colour="#f0556a" />
        <Tile icon={<Trees size={14} />} label={L("Forest permit zone", "বনের অনুমতি এলাকা")} value={`${n(permitPct)}%`} sub={L("of the land area", "মোট এলাকার")} colour="#f5a623" />
      </div>

      <div className="grid gap-3 md:grid-cols-[1.25fr_1fr]">
        <Chart title={L("Where people live", "মানুষ কোথায় থাকে")} height={280} option={opts.treemap} onPick={pickBlock}
          table={{ head: [L("Block", "ব্লক"), L("People", "জনসংখ্যা")], rows: [...bs].sort((a, b) => b.population - a.population).map((b) => [b.name, b.population]) }} />
        <Chart title={L("Services by type", "ধরন অনুযায়ী পরিষেবা")} height={280} option={opts.donut}
          table={{ head: [L("Type", "ধরন"), L("Number", "সংখ্যা")], rows: opts.cats.map((x) => [(CAT_NAME[x.k] || CAT_NAME.other)[bn ? 1 : 0], x.v]) }} />
      </div>

      <div className="rounded-2xl border border-line bg-raised p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[13px] font-semibold">{L("Compare blocks", "ব্লকের তুলনা")}</span>
          {METRICS.map(([k, label]) => <button key={k} onClick={() => setMetric(k)} className={cx("rounded-full border px-2.5 py-1 text-2xs font-bold transition-colors", metric === k ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-ink")}>{label}</button>)}
        </div>
        <Chart className="!border-0 !p-0" height={Math.max(240, ranked.length * 24)} option={opts.ranking} onPick={pickBlock}
          table={{ head: [L("Block", "ব্লক"), opts.mname], rows: ranked.map((b) => [b.name, +val(b, metric).toFixed(1)]) }} label={opts.mname} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <figure className="rounded-2xl border border-line bg-raised p-3">
          <figcaption className="mb-2 text-[13px] font-semibold">{L("Model zones in each block (high, km²)", "প্রতিটি ব্লকে মডেলের এলাকা (বেশি, বর্গকিমি)")}</figcaption>
          {!zb.data ? <Spinner /> : (
            <table className="w-full table-fixed text-2xs tabular-nums">
              <thead><tr><th className="w-[34%] pb-1.5 text-left font-semibold text-muted">{L("Block", "ব্লক")}</th>
                {ZONES.map((z) => <th key={z} className="pb-1.5 text-center font-semibold" style={{ color: ZONE_META[z].colour }}>{(bn ? ZONE_META[z].bn : ZONE_META[z].en).split(" ")[0]}</th>)}</tr></thead>
              <tbody>{opts.zBlocks.map((x) => (
                <tr key={x.b.id} className="cursor-pointer hover:opacity-80" onClick={() => show(x.b)}>
                  <td className="truncate py-[3px] pr-1 text-[11.5px] font-semibold">{x.b.name}</td>
                  {ZONES.map((z) => { const mx = Math.max(...opts.zBlocks.map((y) => y.z[z]), 1), v = x.z[z], a = v / mx;
                    return <td key={z} className="p-[2px]"><div className="rounded-md py-1 text-center font-bold" style={{ background: v ? `${ZONE_META[z].colour}${Math.round(30 + a * 200).toString(16).padStart(2, "0")}` : "transparent",
                      color: a > 0.55 ? "#0b1220" : undefined }}>{v ? n(v) : "·"}</div></td>; })}
                </tr>))}</tbody>
            </table>)}
        </figure>
        <Chart title={L("Forest permit zones by block", "ব্লক অনুযায়ী বনের অনুমতি এলাকা")} height={Math.max(260, opts.pBlocks.length * 20 + 40)} option={opts.permit} onPick={pickBlock}
          table={{ head: [L("Block", "ব্লক"), L("Open %", "উন্মুক্ত %"), L("Permit %", "অনুমতি %"), L("Core %", "কোর %")], rows: opts.pBlocks.map((b) => [b.name, +b.zones.open.toFixed(1), +b.zones.permit.toFixed(1), +b.zones.core.toFixed(1)]) }} />
      </div>

      <Chart title={L("People and health points (bubble = block area)", "জনসংখ্যা ও স্বাস্থ্যকেন্দ্র (বৃত্ত = ব্লকের আয়তন)")} height={300} option={opts.bubble} onPick={pickBlock}
        table={{ head: [L("Block", "ব্লক"), L("People", "জনসংখ্যা"), L("Health points", "স্বাস্থ্যকেন্দ্র"), L("Per 10,000", "প্রতি ১০,০০০")], rows: bs.map((b) => [b.name, b.population, b.services.health?.length || 0, +(b.population ? ((b.services.health?.length || 0) / b.population) * 1e4 : 0).toFixed(2)]) }} />

      <div><p className="grp mb-1.5">{L("All blocks — touch a row to open it", "সব ব্লক — খুলতে সারিতে ছুঁয়ে দিন")}</p>
        <div className="max-h-[380px] overflow-auto rounded-2xl border border-line bg-raised scroll-thin">
          <table className="w-full text-xs tabular-nums"><thead className="sticky top-0 z-[1] bg-raised"><tr>
            <Th k="name">{L("Block", "ব্লক")}</Th><Th k="population">{L("People", "জনসংখ্যা")}</Th><Th k="villages">{L("Villages", "গ্রাম")}</Th><Th k="area">km²</Th><Th k="ghats">{L("Ghats", "ঘাট")}</Th><Th k="health">{L("Health", "স্বাস্থ্য")}</Th><Th k="permit">{L("Permit %", "অনুমতি %")}</Th></tr></thead>
            <tbody>{rows.map((b) => (
              <tr key={b.id} className="cursor-pointer border-b border-line/50 hover:bg-sunken/60" onClick={() => show(b)}>
                <td className="px-2 py-1.5 font-bold"><span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: dColour(b.district) }} />{b.name}</td>
                <td className="px-2 text-right"><div className="flex items-center justify-end gap-1.5"><span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-sunken sm:block"><span className="block h-full rounded-full" style={{ width: `${(b.population / maxPop) * 100}%`, background: dColour(b.district) }} /></span>{n(b.population)}</div></td>
                <td className="px-2 text-right">{n(b.villages)}</td><td className="px-2 text-right">{n(b.area)}</td>
                <td className="px-2 text-right">{n(b.ghats.length)}</td><td className="px-2 text-right">{n(b.services.health?.length || 0)}</td><td className="px-2 text-right">{n(b.zones.permit + b.zones.core)}</td></tr>))}</tbody></table></div></div>

      <div><p className="grp mb-1.5">{L("Your trips", "আপনার যাত্রা")}</p>
        <div className="grid grid-cols-3 gap-2">
          {[[L("Saved trips", "রাখা যাত্রা"), n(my.journeys.length)], [L("Total distance", "মোট দূরত্ব"), fmtKm(km * 1000, lang)], [L("Total time", "মোট সময়"), fmtDuration(min, lang)]].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-line bg-raised px-3 py-2.5"><div className="text-2xs text-muted">{k}</div><div className="text-base font-extrabold tabular-nums">{v}</div></div>))}</div></div>
      <p className="text-2xs text-faint">{L("People: Census of India 2011. Ghats and services: OpenStreetMap. Permit zones: Sundarban Tiger Reserve and reserve forest boundaries. Model zones: D.I.S.H.A.R.I tiger habitat model and fish, honey and crab indexes (1.6 km² hexagons).",
        "জনসংখ্যা: ভারতের জনগণনা ২০১১। ঘাট ও পরিষেবা: ওপেনস্ট্রিটম্যাপ। অনুমতি এলাকা: সুন্দরবন ব্যাঘ্র প্রকল্প ও সংরক্ষিত বনের সীমানা। মডেলের এলাকা: D.I.S.H.A.R.I বাঘের আবাস মডেল এবং মাছ, মধু ও কাঁকড়ার সূচক (১.৬ বর্গকিমি ষড়ভুজ)।")}</p>
    </div>
  );
}
