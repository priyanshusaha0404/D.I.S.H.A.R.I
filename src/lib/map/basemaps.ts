/** Basemap gallery (in the spirit of the ArcGIS Pro basemap gallery). Offline basemaps are drawn from data shipped
 *  with the site; online basemaps stream tiles from their providers and tiles you have viewed stay available offline. */
import type { LayerSpecification, SourceSpecification } from "maplibre-gl";
import { loadJSON } from "../data/fetch";
import { dataUrl } from "../data/fetch";
import type { RasterDef } from "../data/catalog";

export type BasemapGroup = "offline" | "imagery" | "streets" | "canvas" | "science";
export interface Basemap {
  id: string; group: BasemapGroup; en: string; bn: string; offline: boolean; dark?: boolean;
  /** XYZ template used for the gallery thumbnail ({z}/{x}/{y}); or a static image */
  thumb: { tiles: string } | { src: string };
  attribution: string;
}
export interface Bundle { background: string; sources: Record<string, SourceSpecification>; base: LayerSpecification[]; top: LayerSpecification[] }

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const esri = (svc: string) => `${ESRI}/${svc}/MapServer/tile/{z}/{y}/{x}`;
const A_ESRI_IMG = "Esri, Maxar, Earthstar Geographics, and the GIS User Community";
const A_ESRI = "Esri, HERE, Garmin, USGS, NGA, FAO, NOAA, © OpenStreetMap contributors, and the GIS User Community";
const A_OSM = "© OpenStreetMap contributors";
const A_CARTO = "© OpenStreetMap contributors © CARTO";
const yesterday = () => new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);

interface TileSpec { tiles: string[]; maxzoom: number; ref?: { tiles: string[]; maxzoom: number }[] }
const TILES: Record<string, TileSpec> = {
  esri_imagery: { tiles: [esri("World_Imagery")], maxzoom: 19 },
  esri_hybrid: { tiles: [esri("World_Imagery")], maxzoom: 19, ref: [{ tiles: [esri("Reference/World_Transportation")], maxzoom: 19 }, { tiles: [esri("Reference/World_Boundaries_and_Places")], maxzoom: 19 }] },
  esri_clarity: { tiles: ["https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], maxzoom: 19 },
  esri_firefly: { tiles: ["https://fly.maptiles.arcgis.com/arcgis/rest/services/World_Imagery_Firefly/MapServer/tile/{z}/{y}/{x}"], maxzoom: 19,
    ref: [{ tiles: [esri("Reference/World_Boundaries_and_Places")], maxzoom: 19 }] },
  s2cloudless: { tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg"], maxzoom: 15 },
  modis_daily: { tiles: [`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`], maxzoom: 9 },
  esri_streets: { tiles: [esri("World_Street_Map")], maxzoom: 19 },
  esri_topo: { tiles: [esri("World_Topo_Map")], maxzoom: 19 },
  esri_natgeo: { tiles: [esri("NatGeo_World_Map")], maxzoom: 16 },
  osm: { tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], maxzoom: 19 },
  osm_hot: { tiles: ["a", "b", "c"].map((s) => `https://${s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png`), maxzoom: 19 },
  carto_voyager: { tiles: ["a", "b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`), maxzoom: 20 },
  opentopo: { tiles: ["a", "b", "c"].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`), maxzoom: 17 },
  esri_terrain: { tiles: [esri("World_Terrain_Base")], maxzoom: 13, ref: [{ tiles: [esri("Reference/World_Reference_Overlay")], maxzoom: 13 }] },
  esri_relief: { tiles: [esri("World_Shaded_Relief")], maxzoom: 13 },
  esri_physical: { tiles: [esri("World_Physical_Map")], maxzoom: 8 },
  esri_hillshade: { tiles: [esri("Elevation/World_Hillshade")], maxzoom: 16 },
  esri_hillshade_dark: { tiles: [esri("Elevation/World_Hillshade_Dark")], maxzoom: 16 },
  eox_terrain: { tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/terrain-light_3857/default/g/{z}/{y}/{x}.jpg"], maxzoom: 16 },
  esri_lightgray: { tiles: [esri("Canvas/World_Light_Gray_Base")], maxzoom: 16, ref: [{ tiles: [esri("Canvas/World_Light_Gray_Reference")], maxzoom: 16 }] },
  esri_darkgray: { tiles: [esri("Canvas/World_Dark_Gray_Base")], maxzoom: 16, ref: [{ tiles: [esri("Canvas/World_Dark_Gray_Reference")], maxzoom: 16 }] },
  esri_ocean: { tiles: [esri("Ocean/World_Ocean_Base")], maxzoom: 16, ref: [{ tiles: [esri("Ocean/World_Ocean_Reference")], maxzoom: 16 }] },
  carto_positron: { tiles: ["a", "b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png`), maxzoom: 20 },
  carto_dark: { tiles: ["a", "b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`), maxzoom: 20 },
  viirs_night: { tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png"], maxzoom: 8 },
};

const t = (id: string) => ({ tiles: TILES[id].tiles[0].replace("{date}", "2025-01-15") });
export const BASEMAPS: Basemap[] = [
  { id: "delta", group: "offline", en: "Delta (offline)", bn: "ব-দ্বীপ (অফলাইন)", offline: true, thumb: { src: "/thumbs/delta.png" }, attribution: "D.I.S.H.A.R.I, © OpenStreetMap contributors" },
  { id: "delta_dark", group: "offline", en: "Delta night (offline)", bn: "ব-দ্বীপ রাত (অফলাইন)", offline: true, dark: true, thumb: { src: "/thumbs/delta-dark.png" }, attribution: "D.I.S.H.A.R.I, © OpenStreetMap contributors" },
  { id: "landsat_2025", group: "offline", en: "Landsat 2025 (offline)", bn: "ল্যান্ডস্যাট ২০২৫ (অফলাইন)", offline: true, thumb: { src: "/data/raster/thumb_landsat_truecolor_2025.jpg" }, attribution: "USGS Landsat Collection 2" },
  { id: "landsat_2010", group: "offline", en: "Landsat 2010 (offline)", bn: "ল্যান্ডস্যাট ২০১০ (অফলাইন)", offline: true, thumb: { src: "/data/raster/thumb_landsat_truecolor_2010.jpg" }, attribution: "USGS Landsat Collection 2" },
  { id: "landsat_false", group: "offline", en: "Landsat false colour (offline)", bn: "ল্যান্ডস্যাট ফলস কালার (অফলাইন)", offline: true, thumb: { src: "/data/raster/thumb_landsat_falsecolor_2025.jpg" }, attribution: "USGS Landsat Collection 2" },
  { id: "terrain_offline", group: "offline", en: "Shaded terrain (offline)", bn: "ছায়াযুক্ত ভূসংস্থান (অফলাইন)", offline: true, thumb: { src: "/data/raster/thumb_terrain_shaded.jpg" }, attribution: "NASA SRTM" },
  { id: "landcover_offline", group: "offline", en: "Land cover (offline)", bn: "ভূমি আচ্ছাদন (অফলাইন)", offline: true, thumb: { src: "/data/raster/thumb_worldcover.jpg" }, attribution: "ESA WorldCover 2021" },
  { id: "blank", group: "offline", en: "No basemap", bn: "ভিত্তি মানচিত্র ছাড়া", offline: true, thumb: { src: "/thumbs/blank.png" }, attribution: "" },

  { id: "esri_imagery", group: "imagery", en: "Imagery", bn: "উপগ্রহ চিত্র", offline: false, dark: true, thumb: t("esri_imagery"), attribution: A_ESRI_IMG },
  { id: "esri_hybrid", group: "imagery", en: "Imagery Hybrid", bn: "উপগ্রহ চিত্র ও নাম", offline: false, thumb: t("esri_imagery"), attribution: A_ESRI_IMG },
  { id: "esri_clarity", group: "imagery", en: "Imagery (Clarity)", bn: "উপগ্রহ চিত্র (ক্ল্যারিটি)", offline: false, thumb: t("esri_clarity"), attribution: A_ESRI_IMG },
  { id: "esri_firefly", group: "imagery", en: "Imagery (Firefly)", bn: "উপগ্রহ চিত্র (ফায়ারফ্লাই)", offline: false, thumb: t("esri_firefly"), attribution: A_ESRI_IMG },
  { id: "s2cloudless", group: "imagery", en: "Sentinel-2 cloudless 2023", bn: "সেন্টিনেল-২ মেঘমুক্ত ২০২৩", offline: false, thumb: t("s2cloudless"),
    attribution: "Sentinel-2 cloudless — s2maps.eu by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2023)" },
  { id: "modis_daily", group: "imagery", en: "Daily satellite (MODIS)", bn: "দৈনিক উপগ্রহ চিত্র (MODIS)", offline: false, thumb: t("modis_daily"), attribution: "NASA EOSDIS GIBS — MODIS Terra" },

  { id: "esri_streets", group: "streets", en: "Streets", bn: "রাস্তা", offline: false, thumb: t("esri_streets"), attribution: A_ESRI },
  { id: "esri_topo", group: "streets", en: "Topographic", bn: "ভূসংস্থানিক", offline: false, thumb: t("esri_topo"), attribution: A_ESRI },
  { id: "esri_natgeo", group: "streets", en: "National Geographic Style", bn: "ন্যাশনাল জিওগ্রাফিক ধাঁচ", offline: false, thumb: t("esri_natgeo"), attribution: "National Geographic, " + A_ESRI },
  { id: "osm", group: "streets", en: "OpenStreetMap", bn: "ওপেনস্ট্রিটম্যাপ", offline: false, thumb: t("osm"), attribution: A_OSM },
  { id: "osm_hot", group: "streets", en: "OpenStreetMap Humanitarian", bn: "ওপেনস্ট্রিটম্যাপ মানবিক", offline: false, thumb: t("osm_hot"), attribution: A_OSM + ", Humanitarian OpenStreetMap Team, OSM France" },
  { id: "carto_voyager", group: "streets", en: "Voyager", bn: "ভয়েজার", offline: false, thumb: t("carto_voyager"), attribution: A_CARTO },
  { id: "opentopo", group: "streets", en: "OpenTopoMap", bn: "ওপেনটোপোম্যাপ", offline: false, thumb: t("opentopo"), attribution: A_OSM + ", SRTM | style © OpenTopoMap (CC-BY-SA)" },

  { id: "esri_lightgray", group: "canvas", en: "Light Gray Canvas", bn: "হালকা ধূসর ক্যানভাস", offline: false, thumb: t("esri_lightgray"), attribution: A_ESRI },
  { id: "esri_darkgray", group: "canvas", en: "Dark Gray Canvas", bn: "গাঢ় ধূসর ক্যানভাস", offline: false, dark: true, thumb: t("esri_darkgray"), attribution: A_ESRI },
  { id: "carto_positron", group: "canvas", en: "Positron", bn: "পজিট্রন", offline: false, thumb: t("carto_positron"), attribution: A_CARTO },
  { id: "carto_dark", group: "canvas", en: "Dark Matter", bn: "ডার্ক ম্যাটার", offline: false, dark: true, thumb: t("carto_dark"), attribution: A_CARTO },
  { id: "esri_ocean", group: "canvas", en: "Oceans", bn: "মহাসাগর", offline: false, thumb: t("esri_ocean"), attribution: "Esri, GEBCO, NOAA, National Geographic, DeLorme, HERE, Geonames.org, and other contributors" },

  { id: "esri_terrain", group: "science", en: "Terrain with Labels", bn: "ভূসংস্থান ও নাম", offline: false, thumb: t("esri_terrain"), attribution: "Esri, USGS, NOAA" },
  { id: "esri_relief", group: "science", en: "Shaded Relief", bn: "ছায়াযুক্ত উচ্চতা", offline: false, thumb: t("esri_relief"), attribution: "Esri, USGS, NOAA" },
  { id: "esri_hillshade", group: "science", en: "Hillshade", bn: "পাহাড়-ছায়া", offline: false, thumb: t("esri_hillshade"), attribution: "Esri, USGS, NGA, NASA, CGIAR, NLS, OS, NMA, Geodatastyrelsen, GSA, GSI and the GIS User Community" },
  { id: "esri_hillshade_dark", group: "science", en: "Hillshade (dark)", bn: "পাহাড়-ছায়া (গাঢ়)", offline: false, dark: true, thumb: t("esri_hillshade_dark"), attribution: "Esri, USGS, NGA, NASA, CGIAR and the GIS User Community" },
  { id: "esri_physical", group: "science", en: "Physical", bn: "প্রাকৃতিক", offline: false, thumb: t("esri_physical"), attribution: "U.S. National Park Service, Esri" },
  { id: "eox_terrain", group: "science", en: "Terrain light (EOX)", bn: "হালকা ভূসংস্থান (EOX)", offline: false, thumb: t("eox_terrain"), attribution: "Terrain light © EOX IT Services GmbH, © OpenStreetMap contributors" },
  { id: "viirs_night", group: "science", en: "Earth at night 2016", bn: "রাতের পৃথিবী ২০১৬", offline: false, dark: true, thumb: t("viirs_night"), attribution: "NASA Earth Observatory — Black Marble (VIIRS)" },
];
export const basemapById = (id: string) => BASEMAPS.find((b) => b.id === id) || BASEMAPS[0];

/** 2 × 2 tiles at zoom 8 around the delta, for gallery thumbnails. */
export function thumbTiles(tpl: string): string[] {
  const one = tpl.replace("{s}", "a");
  return [[190, 111], [191, 111], [190, 112], [191, 112]].map(([x, y]) => one.replace("{z}", "8").replace("{x}", String(x)).replace("{y}", String(y)));
}

/* ------------------------------------------------------------------ offline vector basemap */
type FC = GeoJSON.FeatureCollection;
export async function deltaData() {
  const [study, land, water, rivers, mangrove, blocks, districts] = await Promise.all([
    loadJSON<FC>("vector/study_area.geojson"), loadJSON<FC>("vector/land.geojson"), loadJSON<FC>("vector/water_bodies.geojson"),
    loadJSON<FC>("vector/waterways.geojson"), loadJSON<FC>("vector/mangrove_2025.geojson"), loadJSON<FC>("vector/blocks.geojson"),
    loadJSON<FC>("vector/districts.geojson"),
  ]);
  return { study, land, water, rivers, mangrove, blocks, districts };
}

export const PALETTE = {
  light: { outside: "#e7e5de", sea: "#c9dfe5", land: "#f5f2e9", mangrove: "#d3e5cc", water: "#aed2de", river: "#94c4d3", block: "#bdb6a5", district: "#8a8473" },
  dark: { outside: "#070b16", sea: "#0b1a35", land: "#18223d", mangrove: "#143833", water: "#143a6e", river: "#1c4f8c", block: "#3b4b74", district: "#6f80ac" },
};

async function deltaBundle(dark: boolean): Promise<Bundle> {
  const d = await deltaData();
  const c = dark ? PALETTE.dark : PALETTE.light;
  return {
    background: c.outside,
    sources: {
      "bm-study": { type: "geojson", data: d.study }, "bm-land": { type: "geojson", data: d.land }, "bm-water": { type: "geojson", data: d.water },
      "bm-rivers": { type: "geojson", data: d.rivers }, "bm-mangrove": { type: "geojson", data: d.mangrove, tolerance: 0.5 },
      "bm-blocks": { type: "geojson", data: d.blocks }, "bm-districts": { type: "geojson", data: d.districts },
    },
    base: [
      { id: "bm-study", type: "fill", source: "bm-study", paint: { "fill-color": c.sea } },
      { id: "bm-land", type: "fill", source: "bm-land", paint: { "fill-color": c.land } },
      { id: "bm-mangrove", type: "fill", source: "bm-mangrove", paint: { "fill-color": c.mangrove, "fill-opacity": 0.9 } },
      { id: "bm-water", type: "fill", source: "bm-water", paint: { "fill-color": c.water } },
      { id: "bm-rivers", type: "line", source: "bm-rivers", paint: { "line-color": c.river,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, ["match", ["get", "c"], "river", 1.2, 0.4], 14, ["match", ["get", "c"], "river", 4, 1.6]] } },
      { id: "bm-blocks", type: "line", source: "bm-blocks", minzoom: 8.5, paint: { "line-color": c.block, "line-width": 0.8, "line-dasharray": [3, 2] } },
      { id: "bm-districts", type: "line", source: "bm-districts", paint: { "line-color": c.district, "line-width": 1.4 } },
      { id: "bm-study-line", type: "line", source: "bm-study", paint: { "line-color": c.district, "line-width": 0.6, "line-opacity": 0.6 } },
    ],
    top: [],
  };
}

async function rasterBundle(key: string, dark: boolean): Promise<Bundle> {
  const idx = await loadJSON<Record<string, RasterDef>>("raster/index.json");
  const r = idx[key];
  const base = await deltaBundle(dark);
  return {
    background: base.background,
    sources: { ...base.sources, "bm-img": { type: "image", url: new URL(dataUrl(r.url), location.href).href, coordinates: r.coordinates } },
    base: [base.base[0], base.base[1], { id: "bm-img", type: "raster", source: "bm-img", paint: { "raster-fade-duration": 0, "raster-resampling": "linear" } },
      { id: "bm-districts", type: "line", source: "bm-districts", paint: { "line-color": dark ? "#9fb3aa" : "#f6f5ef", "line-width": 1, "line-opacity": 0.7 } }],
    top: [],
  };
}

/** Build the layers for a basemap. Online basemaps carry the offline delta underneath, so the map never goes blank. */
export async function buildBasemap(id: string, theme: "light" | "dark"): Promise<Bundle> {
  const bm = basemapById(id);
  const dark = bm.dark ?? theme === "dark";
  if (id === "delta") return deltaBundle(theme === "dark");
  if (id === "delta_dark") return deltaBundle(true);
  if (id === "landsat_2025") return rasterBundle("landsat_truecolor_2025", dark);
  if (id === "landsat_2010") return rasterBundle("landsat_truecolor_2010", dark);
  if (id === "landsat_false") return rasterBundle("landsat_falsecolor_2025", dark);
  if (id === "terrain_offline") return rasterBundle("terrain_shaded", dark);
  if (id === "landcover_offline") return rasterBundle("worldcover", dark);
  if (id === "blank") return { background: theme === "dark" ? "#0f1513" : "#f7f6f2", sources: {}, base: [], top: [] };
  const spec = TILES[id];
  const fallback = await deltaBundle(dark);
  const date = yesterday();
  const sources: Record<string, SourceSpecification> = { ...fallback.sources,
    "bm-tiles": { type: "raster", tiles: spec.tiles.map((u) => u.replace("{date}", date)), tileSize: 256, maxzoom: spec.maxzoom, attribution: bm.attribution } };
  const top: LayerSpecification[] = [];
  (spec.ref || []).forEach((r, k) => {
    sources[`bm-ref${k}`] = { type: "raster", tiles: r.tiles, tileSize: 256, maxzoom: r.maxzoom };
    top.push({ id: `bm-top-ref${k}`, type: "raster", source: `bm-ref${k}`, paint: { "raster-fade-duration": 150 } });
  });
  return {
    background: fallback.background, sources,
    base: [...fallback.base.slice(0, 4), { id: "bm-tiles", type: "raster", source: "bm-tiles", paint: { "raster-fade-duration": 150 } }],
    top,
  };
}
