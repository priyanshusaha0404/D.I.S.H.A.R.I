/** Legend descriptors shared by the map legend, the layer list, map exports and reports. */
import type { HexStore } from "../data/hex";
import type { RasterDef } from "../data/catalog";
import { varLabel, varUnit } from "../data/catalog";
import { classify, defaultSymFor } from "../symbology";
import { refByKey } from "./overlays";
import type { LayerItem } from "./store";
import type { Lang } from "../i18n";
import { fmt } from "../format";

export interface LegendItem { colour: string; label: string; outline?: boolean; line?: boolean; dot?: boolean }
export interface LegendDesc { title: string; sub?: string; items?: LegendItem[]; ramp?: string[]; min?: string; max?: string; unit?: string; source?: string }

export const RASTER_TEXT: Record<string, { en: string; bn: string; group: string }> = {
  landsat_truecolor_2025: { en: "Landsat true colour 2025", bn: "ল্যান্ডস্যাট প্রকৃত রং ২০২৫", group: "imagery" },
  landsat_truecolor_2010: { en: "Landsat true colour 2010", bn: "ল্যান্ডস্যাট প্রকৃত রং ২০১০", group: "imagery" },
  landsat_falsecolor_2025: { en: "Landsat false colour (NIR–red–green) 2025", bn: "ল্যান্ডস্যাট ফলস কালার (NIR–লাল–সবুজ) ২০২৫", group: "imagery" },
  elevation_srtm: { en: "Elevation (SRTM)", bn: "উচ্চতা (SRTM)", group: "terrain" },
  terrain_shaded: { en: "Shaded terrain (SRTM)", bn: "ছায়াযুক্ত ভূসংস্থান (SRTM)", group: "terrain" },
  worldcover: { en: "Land cover (ESA WorldCover 2021)", bn: "ভূমি আচ্ছাদন (ESA WorldCover ২০২১)", group: "landcover" },
  mangrove_2016: { en: "Mangrove extent 2016", bn: "ম্যানগ্রোভের বিস্তার ২০১৬", group: "vegetation" },
  mangrove_2020: { en: "Mangrove extent 2020", bn: "ম্যানগ্রোভের বিস্তার ২০২০", group: "vegetation" },
  mangrove_2025: { en: "Mangrove extent 2025", bn: "ম্যানগ্রোভের বিস্তার ২০২৫", group: "vegetation" },
  mangrove_change_2016_2025: { en: "Mangrove change 2016 → 2025", bn: "ম্যানগ্রোভ পরিবর্তন ২০১৬ → ২০২৫", group: "vegetation" },
  ndvi_2017: { en: "Greenness (Sentinel-2 NDVI) 2017", bn: "সবুজতা (সেন্টিনেল-২ NDVI) ২০১৭", group: "vegetation" },
  ndvi_2025: { en: "Greenness (Sentinel-2 NDVI) 2025", bn: "সবুজতা (সেন্টিনেল-২ NDVI) ২০২৫", group: "vegetation" },
  ndvi_change_2017_2025: { en: "Greenness change 2017 → 2025 (ΔNDVI)", bn: "সবুজতার পরিবর্তন ২০১৭ → ২০২৫ (ΔNDVI)", group: "vegetation" },
  water_frequency: { en: "Water frequency 2019–2025", bn: "জলের উপস্থিতির হার ২০১৯–২০২৫", group: "water" },
  water_permanent_seasonal: { en: "Permanent and tidal water 2019–2025", bn: "স্থায়ী ও জোয়ারের জল ২০১৯–২০২৫", group: "water" },
  channel_network: { en: "Main river channels and small creeks", bn: "প্রধান নদীখাত ও ছোট খাঁড়ি", group: "water" },
  navigable_water: { en: "Navigable water at low and high tide", bn: "ভাটা ও জোয়ারে নৌচলাচলযোগ্য জল", group: "water" },
  shoreline_change_2005_2015: { en: "Erosion and accretion 2005–2015", bn: "ভাঙন ও চর গঠন ২০০৫–২০১৫", group: "coast" },
  shoreline_change_2015_2025: { en: "Erosion and accretion 2015–2025", bn: "ভাঙন ও চর গঠন ২০১৫–২০২৫", group: "coast" },
};
const ITEM_BN: Record<string, string> = {
  "Main river channel": "প্রধান নদীখাত", "Small creek": "ছোট খাঁড়ি", Mangrove: "ম্যানগ্রোভ", "Mangrove in both years": "উভয় বছরে ম্যানগ্রোভ",
  "Gain (new in 2025)": "বৃদ্ধি (২০২৫-এ নতুন)", "Loss (absent in 2025)": "হ্রাস (২০২৫-এ নেই)", "Navigable at low and high tide": "ভাটা ও জোয়ার দুই সময়েই চলাচলযোগ্য",
  "Navigable at high tide only": "শুধু জোয়ারে চলাচলযোগ্য", "Erosion (land → water)": "ভাঙন (স্থল → জল)", "Accretion (water → land)": "চর গঠন (জল → স্থল)",
  "Permanent water": "স্থায়ী জল", "Seasonal tidal water": "জোয়ারের (ঋতুভিত্তিক) জল", "Tree cover": "বৃক্ষ আচ্ছাদন", Shrubland: "গুল্মভূমি", Grassland: "তৃণভূমি",
  Cropland: "কৃষিজমি", "Built-up": "নির্মিত এলাকা", "Bare / sparse vegetation": "অনাবৃত / বিরল উদ্ভিদ", "Permanent water bodies": "স্থায়ী জলাশয়",
  "Herbaceous wetland": "তৃণ জলাভূমি", Mangroves: "ম্যানগ্রোভ", "Snow and ice": "বরফ", "Moss and lichen": "শৈবাল ও লাইকেন",
};
export const rasterTitle = (key: string, r: RasterDef | undefined, lang: Lang) => {
  const x = RASTER_TEXT[key];
  return x ? (lang === "bn" ? x.bn : x.en) : r?.title || key;
};
export const rasterItem = (en: string, lang: Lang) => (lang === "bn" ? ITEM_BN[en] || en : en);

export function legendFor(L: LayerItem, hx: HexStore | null, rasters: Record<string, RasterDef> | null, lang: Lang): LegendDesc | null {
  if (L.type === "result" && L.result) return { title: L.result.title, items: L.result.classes.map((c) => ({ colour: c.colour, label: c.label })) };
  if (L.type === "hex") {
    const def = hx?.def(L.key);
    if (!hx || !def) return null;
    const c = classify(def, hx.get(L.key), L.sym || defaultSymFor(def), lang);
    return { title: varLabel(def, lang), sub: [varUnit(def, lang), def.period].filter(Boolean).join(" · "), unit: varUnit(def, lang),
      items: c.colours.map((col, k) => ({ colour: col, label: c.labels[k] })), source: def.source };
  }
  if (L.type === "raster") {
    const r = rasters?.[L.key];
    if (!r) return null;
    const title = rasterTitle(L.key, r, lang);
    const lg = r.legend;
    if (!lg) return { title };
    if (lg.type === "categorical") return { title, items: lg.items.map((i) => ({ colour: i.colour, label: rasterItem(i.en, lang) })) };
    const unit = L.key.startsWith("elevation") ? (lang === "bn" ? "মিটার" : "m") : L.key.startsWith("ndvi") ? "NDVI" : L.key === "water_frequency" ? "0–1" : "";
    return { title, ramp: lg.colours, min: fmt(lg.min, lang, 1), max: fmt(lg.max, lang, 1), unit };
  }
  const d = refByKey(L.key);
  if (!d) return null;
  return { title: lang === "bn" ? d.bn : d.en, items: d.legend.map((i) => ({ colour: i.colour, label: lang === "bn" ? i.bn : i.en, outline: i.outline, line: i.line, dot: i.dot })) };
}
