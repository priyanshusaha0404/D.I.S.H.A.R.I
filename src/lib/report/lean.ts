/** Short, practical reports: one block (people, villages, ghats, services, permit zones) and all blocks side by side. */
import type { Lang } from "../i18n";
import { fmt } from "../format";
import { allBlocks, CATS, CAT_NAME, type BlockInfo } from "../blockinfo";
import type { ReportDoc, Section } from "./model";

const today = (lang: Lang) => new Date().toLocaleDateString(lang === "bn" ? "bn-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" });
const pct = (v: number, lang: Lang) => `${fmt(v, lang, 0)}%`;

export function blockReport(b: BlockInfo, lang: Lang): ReportDoc {
  const l = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const n = (v: number | null, d = 0) => (v === null || Number.isNaN(v) ? "—" : fmt(v, lang, d));
  const cat = (c: string) => CAT_NAME[c][lang === "bn" ? 1 : 0];
  const sections: Section[] = [
    { title: l("At a glance", "এক নজরে"), blocks: [
      { t: "kpis", cols: 4, items: [{ label: l("Population (2011)", "জনসংখ্যা (২০১১)"), value: n(b.population) }, { label: l("Households", "পরিবার"), value: n(b.households) },
        { label: l("Villages", "গ্রাম"), value: n(b.villages) }, { label: l("Area", "ক্ষেত্রফল"), value: `${n(b.area, 0)} km²` }] },
      { t: "kv", rows: [[l("District", "জেলা"), b.district], [l("Towns", "শহর"), n(b.towns)], [l("People per km²", "প্রতি বর্গকিমিতে মানুষ"), n(b.density)],
        [l("Men", "পুরুষ"), n(b.male)], [l("Women", "নারী"), n(b.female)], [l("Women per 1,000 men", "প্রতি হাজার পুরুষে নারী"), n(b.sexRatio)],
        [l("People per household", "পরিবার প্রতি সদস্য"), n(b.hhSize, 1)], [l("Land", "স্থলভাগ"), b.land === null ? "—" : pct(b.land, lang)], [l("Rivers and water", "নদী ও জল"), b.water === null ? "—" : pct(b.water, lang)]] }] },
    { title: l("Where a forest permit is needed", "কোথায় বনের অনুমতি লাগে"), blocks: [
      { t: "kv", rows: [[l("Open — no permit", "উন্মুক্ত — অনুমতি লাগে না"), pct(b.zones.open, lang)], [l("Protected forest — permit needed", "সংরক্ষিত বন — অনুমতি লাগে"), pct(b.zones.permit, lang)],
        [l("National Park core — no entry", "জাতীয় উদ্যানের কোর — প্রবেশ নিষেধ"), pct(b.zones.core, lang)]] }] },
    { title: l("Ghats and services", "ঘাট ও পরিষেবা"), blocks: [
      { t: "table", head: [l("Type", "ধরন"), l("Number", "সংখ্যা")], numeric: [false, true], rows: [[cat("jetty"), b.ghats.length], ...CATS.filter((c) => b.services[c]?.length).map((c) => [cat(c), b.services[c].length] as [string, number])] },
      ...(b.ghats.length ? [{ t: "table" as const, caption: l("Ghats and jetties", "ঘাট ও জেটি"), head: [l("Name", "নাম"), l("Kind", "ধরন"), "Lat", "Lon"], numeric: [false, false, true, true],
        rows: b.ghats.map((g) => [g.name, g.sub, g.lat.toFixed(5), g.lon.toFixed(5)]) }] : []),
      ...CATS.filter((c) => b.services[c]?.length).map((c) => ({ t: "table" as const, caption: cat(c), head: [l("Name", "নাম"), l("Kind", "ধরন"), "Lat", "Lon"], numeric: [false, false, true, true],
        rows: b.services[c].map((g) => [g.name, g.sub, g.lat.toFixed(5), g.lon.toFixed(5)]) }))] },
    { title: l("Largest villages and towns", "সবচেয়ে বড় গ্রাম ও শহর"), blocks: [
      { t: "table", head: [l("Name", "নাম"), l("Population", "জনসংখ্যা"), l("Households", "পরিবার")], numeric: [false, true, true], rows: b.top.map((v) => [v.name, v.population, v.households]) }] },
  ];
  return { title: l(`${b.name} block`, `${b.name} ব্লক`), subtitle: `${b.district} · D.I.S.H.A.R.I`, lang, meta: [[l("Date", "তারিখ"), today(lang)], [l("People data", "জনসংখ্যার তথ্য"), l("Census of India 2011", "ভারতের জনগণনা ২০১১")]],
    sections, fileBase: `DISHARI_${b.name}_block` };
}

export async function overviewReport(lang: Lang): Promise<ReportDoc> {
  const l = (en: string, bn: string) => (lang === "bn" ? bn : en);
  const bs = [...(await allBlocks())].sort((a, b) => b.population - a.population);
  const sum = (f: (b: BlockInfo) => number) => bs.reduce((s, b) => s + f(b), 0);
  return { title: l("Sundarbans blocks — overview", "সুন্দরবনের ব্লক — সারাংশ"), subtitle: "D.I.S.H.A.R.I", lang, landscape: true,
    meta: [[l("Date", "তারিখ"), today(lang)], [l("People data", "জনসংখ্যার তথ্য"), l("Census of India 2011", "ভারতের জনগণনা ২০১১")]],
    sections: [{ title: l("All blocks", "সব ব্লক"), blocks: [
      { t: "kpis", cols: 4, items: [{ label: l("Blocks", "ব্লক"), value: fmt(bs.length, lang, 0) }, { label: l("Population", "জনসংখ্যা"), value: fmt(sum((b) => b.population), lang, 0) },
        { label: l("Villages", "গ্রাম"), value: fmt(sum((b) => b.villages), lang, 0) }, { label: l("Ghats", "ঘাট"), value: fmt(sum((b) => b.ghats.length), lang, 0) }] },
      { t: "table", head: [l("Block", "ব্লক"), l("District", "জেলা"), l("Population", "জনসংখ্যা"), l("Households", "পরিবার"), l("Villages", "গ্রাম"), "km²", l("Ghats", "ঘাট"), l("Health", "স্বাস্থ্য"), l("Permit zone %", "অনুমতি এলাকা %")],
        numeric: [false, false, true, true, true, true, true, true, true],
        rows: bs.map((b) => [b.name, b.district, b.population, b.households, b.villages, Math.round(b.area), b.ghats.length, b.services.health?.length || 0, Math.round(b.zones.permit + b.zones.core)]) }] }],
    fileBase: "DISHARI_blocks_overview" };
}
