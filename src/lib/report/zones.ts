"use client";
/** Zone reports: for each selected model zone (tiger, fish, honey, crab) — how much of it falls in each block, where it is
 *  densest, how much is open / needs a permit / is National Park core, a map, charts and a full block table.
 *  Several zones → one section each, then a comparison. Hexagon level only (1.6 km²); no animal locations are used. */
import type { Lang } from "../i18n";
import { fmt } from "../format";
import { hexStore } from "../data/hex";
import { zoneIndex, ZONE_META, ZONES, type Zone } from "../zones";
import { chartPng } from "../charts/png";
import { mapPng } from "./mapshot";
import type { Block, ReportDoc, Section } from "./model";

const GRID = "#e5e7eb", AXIS = "#6b7280";
const LV = { high: 0.66, med: 0.4 };
type Row = { block: string; hexes: number; area: number; high: number; med: number; low: number; mean: number; max: number; open: number; permit: number; core: number };

async function stats(z: Zone) {
  const [hx, v] = await Promise.all([hexStore(), zoneIndex(z)]);
  const prot = hx.get("protection");
  const by = new Map<string, Row & { sum: number }>();
  const hist = new Array(10).fill(0);
  let tot = { area: 0, high: 0, med: 0, low: 0, sum: 0, n: 0, open: 0, permit: 0, core: 0 };
  for (let i = 0; i < hx.n; i++) {
    const x = v[i];
    if (Number.isNaN(x)) continue;
    const name = hx.meta.blocks[hx.meta.block[i]] || "Outside the blocks";
    const a = hx.meta.area[i] || 1.6;
    const r = by.get(name) || { block: name, hexes: 0, area: 0, high: 0, med: 0, low: 0, mean: 0, max: 0, open: 0, permit: 0, core: 0, sum: 0 };
    r.hexes++; r.area += a; r.sum += x; r.max = Math.max(r.max, x);
    if (x >= LV.high) {
      r.high += a; tot.high += a;
      const g = Math.round(prot[i]);
      if (g === 3) { r.core += a; tot.core += a; } else if (g === 2) { r.permit += a; tot.permit += a; } else { r.open += a; tot.open += a; }
    } else if (x >= LV.med) { r.med += a; tot.med += a; } else { r.low += a; tot.low += a; }
    by.set(name, r);
    hist[Math.min(9, Math.floor(x * 10))]++;
    tot.area += a; tot.sum += x; tot.n++;
  }
  const rows: Row[] = [...by.values()].map((r) => ({ ...r, mean: r.hexes ? r.sum / r.hexes : 0 })).sort((a, b) => b.high - a.high || b.mean - a.mean);
  return { rows, hist, tot, v, hx };
}

const barOpt = (cats: string[], series: { name: string; data: number[]; color: string; stack?: string }[], unit: string, horizontal = true) => ({
  grid: { left: horizontal ? 150 : 60, right: 40, top: series.length > 1 ? 46 : 20, bottom: horizontal ? 30 : 70 },
  legend: series.length > 1 ? { top: 8, left: "center", icon: "roundRect", itemWidth: 14, itemHeight: 9, textStyle: { fontSize: 13 } } : undefined,
  [horizontal ? "yAxis" : "xAxis"]: { type: "category", data: cats, inverse: horizontal, axisLabel: { fontSize: 12.5, color: "#111827", rotate: horizontal ? 0 : 35 }, axisTick: { show: false }, axisLine: { lineStyle: { color: GRID } } },
  [horizontal ? "xAxis" : "yAxis"]: { type: "value", name: unit, nameTextStyle: { color: AXIS }, axisLabel: { color: AXIS }, splitLine: { lineStyle: { color: GRID } } },
  series: series.map((s) => ({ type: "bar", name: s.name, stack: s.stack, data: s.data, barMaxWidth: 22, itemStyle: { color: s.color, borderRadius: s.stack ? 0 : [0, 5, 5, 0] },
    label: series.length === 1 ? { show: true, position: horizontal ? "right" : "top", fontSize: 11.5, color: "#374151" } : undefined })),
});

async function zoneSection(z: Zone, lang: Lang): Promise<{ section: Section; rows: Row[] }> {
  const l = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const n = (x: number, d = 0) => fmt(x, lang, d);
  const M = ZONE_META[z];
  const name = lang === "bn" ? M.bn : M.en;
  const { rows, hist, tot, v, hx } = await stats(z);
  const inBlocks = rows.filter((r) => r.block !== "Outside the blocks");
  const withHigh = inBlocks.filter((r) => r.high > 0);
  const top = withHigh.slice(0, 3);
  const top3share = tot.high ? (top.reduce((s, r) => s + r.high, 0) / tot.high) * 100 : 0;
  const densest = [...inBlocks].sort((a, b) => b.high / b.area - a.high / a.area)[0];
  const ramp = M.ramp;
  const img = (x: { src: string; w: number; h: number }, caption: string): Block => ({ t: "img", src: x.src, w: 515, h: (515 * x.h) / x.w, caption });

  // map: every hexagon coloured by its level
  const colours = Array.from(v, (x) => (Number.isNaN(x) || x < 0.15 ? null : x >= LV.high ? ramp[4] : x >= LV.med ? ramp[3] : ramp[1]));
  const map = await mapPng({ bounds: [87.95, 21.5, 89.2, 22.7], hexColours: colours, width: 1000, height: 820, labels: true,
    legend: { title: name, items: [{ colour: ramp[4], label: l("High (≥ 0.66)", "বেশি (≥ ০.৬৬)") }, { colour: ramp[3], label: l("Medium (0.40–0.66)", "মাঝারি (০.৪০–০.৬৬)") }, { colour: ramp[1], label: l("Low", "কম") }] } }).catch(() => null);
  void hx;

  const cats = inBlocks.map((r) => r.block);
  const [cLevels, cDensity, cShare, cHist, cPermit] = await Promise.all([
    chartPng(barOpt(cats, [
      { name: l("High", "বেশি"), data: inBlocks.map((r) => +r.high.toFixed(1)), color: ramp[4], stack: "a" },
      { name: l("Medium", "মাঝারি"), data: inBlocks.map((r) => +r.med.toFixed(1)), color: ramp[3], stack: "a" },
      { name: l("Low", "কম"), data: inBlocks.map((r) => +r.low.toFixed(1)), color: ramp[1], stack: "a" }], "km²"), 1000, Math.max(420, cats.length * 30 + 90)),
    (() => { const d = [...inBlocks].sort((a, b) => b.mean - a.mean);
      return chartPng(barOpt(d.map((r) => r.block), [{ name: l("Mean index", "গড় সূচক"), data: d.map((r) => +r.mean.toFixed(2)), color: M.colour }], l("0–1", "০–১")), 1000, Math.max(420, d.length * 30 + 60)); })(),
    chartPng({ legend: { orient: "vertical", right: 20, top: "middle", textStyle: { fontSize: 13 } },
      series: [{ type: "pie", radius: ["42%", "72%"], center: ["36%", "52%"], itemStyle: { borderColor: "#fff", borderWidth: 2 },
        label: { formatter: "{d}%", fontSize: 12.5 }, data: [...withHigh.slice(0, 8).map((r) => ({ name: r.block, value: +r.high.toFixed(1) })),
          ...(withHigh.length > 8 ? [{ name: l("Other blocks", "অন্য ব্লক"), value: +withHigh.slice(8).reduce((s, r) => s + r.high, 0).toFixed(1) }] : [])] }],
      color: ["#0f766e", "#0284c7", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#16a34a", "#475569", "#94a3b8"] }, 1000, 500),
    chartPng({ grid: { left: 60, right: 30, top: 24, bottom: 50 },
      xAxis: { type: "category", data: hist.map((_, k) => `${(k / 10).toFixed(1)}–${((k + 1) / 10).toFixed(1)}`), name: l("Index", "সূচক"), nameLocation: "middle", nameGap: 32, axisLabel: { color: AXIS } },
      yAxis: { type: "value", name: l("Hexagons", "ষড়ভুজ"), axisLabel: { color: AXIS }, splitLine: { lineStyle: { color: GRID } } },
      series: [{ type: "bar", data: hist.map((c, k) => ({ value: c, itemStyle: { color: k >= 7 ? ramp[4] : k >= 4 ? ramp[3] : ramp[1], borderRadius: [4, 4, 0, 0] } })), barCategoryGap: "12%" }] }, 1000, 420),
    (() => { const d = withHigh.slice(0, 15);
      return chartPng(barOpt(d.map((r) => r.block), [
        { name: l("Open", "উন্মুক্ত"), data: d.map((r) => +r.open.toFixed(1)), color: "#16a34a", stack: "p" },
        { name: l("Permit needed", "অনুমতি লাগে"), data: d.map((r) => +r.permit.toFixed(1)), color: "#f59e0b", stack: "p" },
        { name: l("National Park core", "জাতীয় উদ্যানের কোর"), data: d.map((r) => +r.core.toFixed(1)), color: "#dc2626", stack: "p" }], "km²"), 1000, Math.max(380, d.length * 30 + 90)); })(),
  ]);

  const blocks: Block[] = [
    { t: "p", text: l(`${name} from the D.I.S.H.A.R.I model (${M.how[0].toLowerCase()}). Every 1.6 km² hexagon gets an index from 0 to 1; 0.66 and above is a high zone, 0.40–0.66 medium.`,
      `D.I.S.H.A.R.I মডেল থেকে ${name} (${M.how[1]})। প্রতিটি ১.৬ বর্গকিমি ষড়ভুজের সূচক ০ থেকে ১; ০.৬৬ বা তার বেশি হলে বেশি, ০.৪০–০.৬৬ মাঝারি।`) },
    { t: "kpis", cols: 4, items: [
      { label: l("High zone", "বেশি এলাকা"), value: `${n(tot.high)} km²`, sub: l(`${n((tot.high / tot.area) * 100, 1)}% of the area`, `মোট এলাকার ${n((tot.high / tot.area) * 100, 1)}%`) },
      { label: l("Medium zone", "মাঝারি এলাকা"), value: `${n(tot.med)} km²` },
      { label: l("Top block", "শীর্ষ ব্লক"), value: top[0]?.block || "—", sub: top[0] ? `${n(top[0].high)} km²` : undefined },
      { label: l("Mean index", "গড় সূচক"), value: n(tot.n ? tot.sum / tot.n : 0, 2), sub: l(`${n(tot.n)} hexagons`, `${n(tot.n)}টি ষড়ভুজ`) }] },
    { t: "bullets", items: [
      ...(top.length ? [l(`Most of the high zone is in ${top.map((r) => `${r.block} (${n(r.high)} km²)`).join(", ")} — together ${n(top3share)}% of it.`,
        `বেশি এলাকার বড় অংশ ${top.map((r) => `${r.block} (${n(r.high)} বর্গকিমি)`).join(", ")}-এ — মিলিয়ে ${n(top3share)}%।`)] : []),
      ...(densest && densest.high ? [l(`Densest block: ${densest.block} — ${n((densest.high / densest.area) * 100)}% of its area is high zone.`, `সবচেয়ে ঘন ব্লক: ${densest.block} — এর ${n((densest.high / densest.area) * 100)}% এলাকা বেশি।`)] : []),
      l(`${n(withHigh.length)} of ${n(inBlocks.length)} blocks have some high zone.`, `${n(inBlocks.length)}টির মধ্যে ${n(withHigh.length)}টি ব্লকে কিছু বেশি এলাকা আছে।`),
      l(`Of the high zone: ${n(tot.open)} km² open, ${n(tot.permit)} km² needs a forest permit, ${n(tot.core)} km² is National Park core (no entry).`,
        `বেশি এলাকার মধ্যে: ${n(tot.open)} বর্গকিমি উন্মুক্ত, ${n(tot.permit)} বর্গকিমি-তে বনের অনুমতি লাগে, ${n(tot.core)} বর্গকিমি জাতীয় উদ্যানের কোর (প্রবেশ নিষেধ)।`)] },
    ...(map ? [img(map, l(`${name} — every hexagon by level`, `${name} — স্তর অনুযায়ী প্রতিটি ষড়ভুজ`))] : []),
    img(cLevels, l("High, medium and low zone in each block (km²)", "প্রতিটি ব্লকে বেশি, মাঝারি ও কম এলাকা (বর্গকিমি)")),
    img(cDensity, l("Block density — mean index of each block", "ব্লকের ঘনত্ব — প্রতিটি ব্লকের গড় সূচক")),
    img(cShare, l("Share of the high zone by block", "ব্লক অনুযায়ী বেশি এলাকার ভাগ")),
    img(cPermit, l("High zone: open, permit needed or core, by block (km²)", "বেশি এলাকা: উন্মুক্ত, অনুমতি লাগে বা কোর, ব্লক অনুযায়ী (বর্গকিমি)")),
    img(cHist, l("How the index is spread over all hexagons", "সব ষড়ভুজে সূচকের বণ্টন")),
    { t: "table", caption: l("All blocks", "সব ব্লক"),
      head: ["#", l("Block", "ব্লক"), l("Hexagons", "ষড়ভুজ"), "km²", l("High km²", "বেশি"), l("Medium km²", "মাঝারি"), l("Low km²", "কম"), l("High % of block", "ব্লকের বেশি %"), l("Mean", "গড়"), l("Max", "সর্বোচ্চ")],
      numeric: [true, false, true, true, true, true, true, true, true, true],
      rows: inBlocks.map((r, k) => [k + 1, r.block, r.hexes, Math.round(r.area), +r.high.toFixed(1), +r.med.toFixed(1), +r.low.toFixed(1), +((r.high / r.area) * 100).toFixed(1), +r.mean.toFixed(2), +r.max.toFixed(2)]) },
  ];
  return { section: { title: name, blocks }, rows: inBlocks };
}

export async function zoneReport(zones: Zone[], lang: Lang): Promise<ReportDoc> {
  const l = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const zs = ZONES.filter((z) => zones.includes(z));
  const parts: { section: Section; rows: Row[] }[] = [];
  for (const z of zs) parts.push(await zoneSection(z, lang));
  const sections: Section[] = [];
  const zname = (z: Zone) => (lang === "bn" ? ZONE_META[z].bn : ZONE_META[z].en);
  if (zs.length > 1) sections.push({ title: l("In this report", "এই রিপোর্টে"), blocks: [
    { t: "p", text: l(`${zs.length} zones, each in its own part, then all of them side by side.`, `${zs.length}টি এলাকা, প্রতিটি আলাদা অংশে, তারপর সবগুলো পাশাপাশি।`) },
    { t: "table", head: [l("Part", "অংশ"), l("Zone", "এলাকা"), l("High zone", "বেশি এলাকা")], numeric: [true, false, false],
      rows: [...zs.map((z, k) => [k + 1, zname(z), `${fmt(parts[k].rows.reduce((s2, r) => s2 + r.high, 0), lang, 0)} km²`] as (string | number)[]),
        [zs.length + 1, l("All selected zones side by side", "নির্বাচিত সব এলাকা পাশাপাশি"), "—"]] }] });
  parts.forEach((p, k) => {
    if (k || zs.length > 1) sections.push({ title: "", blocks: [{ t: "pb" }] });
    sections.push(zs.length > 1 ? { ...p.section, title: l(`Part ${k + 1} of ${zs.length} — ${zname(zs[k])}`, `অংশ ${fmt(k + 1, lang, 0)}/${fmt(zs.length, lang, 0)} — ${zname(zs[k])}`) } : p.section);
  });
  if (zs.length > 1) {
    const names = [...new Set(parts.flatMap((p) => p.rows.filter((r) => r.high > 0).map((r) => r.block)))];
    const hi = (k: number, b: string) => parts[k].rows.find((r) => r.block === b)?.high || 0;
    names.sort((a, b) => zs.reduce((s, _, k) => s + hi(k, b), 0) - zs.reduce((s, _, k) => s + hi(k, a), 0));
    const c = await chartPng(barOpt(names, zs.map((z, k) => ({ name: lang === "bn" ? ZONE_META[z].bn : ZONE_META[z].en, data: names.map((b) => +hi(k, b).toFixed(1)), color: ZONE_META[z].ramp[3] }))
      .map((s) => ({ ...s, stack: undefined })), "km²"), 1000, Math.max(460, names.length * 42 + 90));
    sections.push({ title: "", blocks: [{ t: "pb" }] });
    sections.push({ title: l("All selected zones side by side", "নির্বাচিত সব এলাকা পাশাপাশি"), blocks: [
      { t: "img", src: c.src, w: 515, h: (515 * c.h) / c.w, caption: l("High zone in each block (km²)", "প্রতিটি ব্লকে বেশি এলাকা (বর্গকিমি)") },
      { t: "table", head: [l("Block", "ব্লক"), ...zs.map((z) => `${lang === "bn" ? ZONE_META[z].bn : ZONE_META[z].en} km²`)], numeric: [false, ...zs.map(() => true)],
        rows: names.map((b) => [b, ...zs.map((_, k) => +hi(k, b).toFixed(1))]) }] });
  }
  const title = zs.length === 1 ? (lang === "bn" ? ZONE_META[zs[0]].bn : ZONE_META[zs[0]].en) : zs.map((z) => (lang === "bn" ? ZONE_META[z].bn : ZONE_META[z].en)).join(" · ");
  return { title: `${title} — ${l("block report", "ব্লক রিপোর্ট")}`, subtitle: "D.I.S.H.A.R.I · Sundarbans", lang,
    meta: [[l("Date", "তারিখ"), new Date().toLocaleDateString(lang === "bn" ? "bn-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" })],
      [l("Zones", "এলাকা"), zs.map((z) => (lang === "bn" ? ZONE_META[z].bn : ZONE_META[z].en)).join(", ")], [l("Unit", "একক"), l("1.6 km² hexagons", "১.৬ বর্গকিমি ষড়ভুজ")]],
    sections, fileBase: `DISHARI_${zs.join("_")}_zones_report` };
}
