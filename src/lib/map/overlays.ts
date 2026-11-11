/** Reference layers drawn from the site's own vector data, plus label and highlight layers. */
import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";

export type RefGroup = "admin" | "water" | "nature" | "places";
export interface RefDef {
  key: string; group: RefGroup; en: string; bn: string; file: string;
  /** layer specs (ids are prefixed by the caller) */
  layers: (dark: boolean) => LayerSpecification[];
  legend: { colour: string; en: string; bn: string; outline?: boolean; line?: boolean; dot?: boolean }[];
  /** clicking a feature opens this entity */
  entity?: { type: string | ((p: Record<string, unknown>) => string); prop: string };
}

const F = { r: ["Noto Sans Regular"], m: ["Noto Sans Medium"], i: ["Noto Sans Italic"] };
const halo = (dark: boolean) => ({ "text-halo-color": dark ? "rgba(10,20,17,0.9)" : "rgba(255,255,255,0.92)", "text-halo-width": 1.4 });
const ink = (dark: boolean) => (dark ? "#e5ece8" : "#1f2a25");

export const SERVICE_COLOURS: Record<string, string> = {
  health: "#e34948", finance: "#6250d6", religious: "#eda100", market: "#eb6834", education: "#2a78d6", transport: "#1baf7a",
  emergency: "#e34948", shelter: "#008300", government: "#52514e", community: "#e87ba4", other: "#898781",
};

export const REF_LAYERS: RefDef[] = [
  { key: "districts", group: "admin", en: "District boundaries", bn: "জেলার সীমানা", file: "vector/districts.geojson",
    layers: (d) => [{ id: "l", type: "line", source: "", paint: { "line-color": d ? "#c9d3ce" : "#3d3a33", "line-width": 2 } }],
    legend: [{ colour: "#3d3a33", en: "District", bn: "জেলা", line: true }], entity: { type: "district", prop: "id" } },
  { key: "blocks", group: "admin", en: "Block boundaries", bn: "ব্লকের সীমানা", file: "vector/blocks.geojson",
    layers: (d) => [
      { id: "f", type: "fill", source: "", paint: { "fill-color": "#000", "fill-opacity": 0 } },
      { id: "c", type: "line", source: "", paint: { "line-color": "rgba(2,6,23,.75)", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.6, 13, 5], "line-opacity": 0.55 } },
      { id: "l", type: "line", source: "", paint: { "line-color": d ? "#7dd3fc" : "#1e3a8a", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.1, 13, 2.2] } },
      { id: "t", type: "symbol", source: "", minzoom: 8.6, maxzoom: 12.5, layout: { "text-field": ["get", "name"], "text-font": F.m, "text-size": 12,
        "text-transform": "uppercase", "text-letter-spacing": 0.08 }, paint: { "text-color": d ? "#c9d3ce" : "#5b5548", ...halo(d) } }],
    legend: [{ colour: "#6b6556", en: "Block", bn: "ব্লক", line: true }], entity: { type: "block", prop: "id" } },
  { key: "villages", group: "admin", en: "Villages and towns (Census 2011)", bn: "গ্রাম ও শহর (জনগণনা ২০১১)", file: "vector/villages.geojson",
    layers: (d) => [
      { id: "f", type: "fill", source: "", paint: { "fill-color": ["match", ["get", "t"], "town", "#eb6834", "#a08f6e"],
        "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.28, 0.06] } },
      { id: "l", type: "line", source: "", minzoom: 9.5, paint: { "line-color": d ? "#7d8c85" : "#a39a85", "line-width": 0.6 } }],
    legend: [{ colour: "#a08f6e", en: "Village", bn: "গ্রাম", outline: true }, { colour: "#eb6834", en: "Town", bn: "শহর", outline: true }],
    entity: { type: (p) => (p.t === "town" ? "town" : "village"), prop: "id" } },
  { key: "islands", group: "admin", en: "Islands", bn: "দ্বীপ", file: "vector/islands.geojson",
    layers: (d) => [
      { id: "f", type: "fill", source: "", paint: { "fill-color": "#000", "fill-opacity": 0 } },
      { id: "l", type: "line", source: "", paint: { "line-color": d ? "#6fb3c8" : "#287f9b", "line-width": 1, "line-opacity": 0.8 } }],
    legend: [{ colour: "#287f9b", en: "Island outline", bn: "দ্বীপের রেখা", line: true }], entity: { type: "island", prop: "id" } },
  { key: "protected_areas", group: "nature", en: "National Park, sanctuaries and reserve forest", bn: "জাতীয় উদ্যান, অভয়ারণ্য ও সংরক্ষিত বন", file: "vector/protected_areas.geojson",
    layers: () => [
      { id: "f", type: "fill", source: "", paint: { "fill-color": ["match", ["get", "kind"], "core", "#176a33", ["match", ["get", "designation"], "Wildlife Sanctuary", "#55a95c", "#86c67f"]],
        "fill-opacity": ["match", ["get", "kind"], "core", 0.1, 0.07] } },
      { id: "l", type: "line", source: "", paint: { "line-color": ["match", ["get", "kind"], "core", "#0b4a24", "#2f8a45"],
        "line-width": ["match", ["get", "kind"], "core", 2, 0.8] } }],
    legend: [{ colour: "#176a33", en: "Sundarbans National Park (core)", bn: "সুন্দরবন জাতীয় উদ্যান (কোর)" },
      { colour: "#55a95c", en: "Wildlife sanctuary", bn: "বন্যপ্রাণী অভয়ারণ্য" }, { colour: "#86c67f", en: "Reserve forest compartment", bn: "সংরক্ষিত বনের কম্পার্টমেন্ট" }],
    entity: { type: (p) => (p.kind === "core" ? "protected_area" : "forest_unit"), prop: "id" } },
  { key: "designations", group: "nature", en: "World Heritage and Ramsar sites", bn: "বিশ্ব ঐতিহ্য ও রামসার এলাকা", file: "vector/designations.geojson",
    layers: () => [{ id: "f", type: "fill", source: "", paint: { "fill-color": "#000", "fill-opacity": 0 } },
      { id: "l", type: "line", source: "", paint: { "line-color": "#6250d6", "line-width": 1.6, "line-dasharray": [2, 2] } }],
    legend: [{ colour: "#6250d6", en: "Ramsar wetland / World Heritage", bn: "রামসার জলাভূমি / বিশ্ব ঐতিহ্য", line: true }],
    entity: { type: "protected_area", prop: "id" } },
  { key: "mangrove_2025", group: "nature", en: "Mangrove 2025", bn: "ম্যানগ্রোভ ২০২৫", file: "vector/mangrove_2025.geojson",
    layers: () => [{ id: "f", type: "fill", source: "", paint: { "fill-color": "#176a33", "fill-opacity": 0.55 } }],
    legend: [{ colour: "#176a33", en: "Mangrove 2025", bn: "ম্যানগ্রোভ ২০২৫" }] },
  { key: "mangrove_2016", group: "nature", en: "Mangrove 2016", bn: "ম্যানগ্রোভ ২০১৬", file: "vector/mangrove_2016.geojson",
    layers: () => [{ id: "f", type: "fill", source: "", paint: { "fill-color": "#86c67f", "fill-opacity": 0.55 } }],
    legend: [{ colour: "#86c67f", en: "Mangrove 2016", bn: "ম্যানগ্রোভ ২০১৬" }] },
  { key: "habitat_patches", group: "nature", en: "Tiger habitat patches", bn: "বাঘের আবাস খণ্ড", file: "vector/habitat_patches.geojson",
    layers: () => [{ id: "f", type: "fill", source: "", paint: { "fill-color": "#ec7f37", "fill-opacity": 0.22 } },
      { id: "l", type: "line", source: "", paint: { "line-color": "#a6480f", "line-width": 1.4 } }],
    legend: [{ colour: "#ec7f37", en: "Habitat patch", bn: "আবাস খণ্ড" }] },
  { key: "corridors", group: "nature", en: "Habitat corridors", bn: "আবাস করিডোর", file: "vector/corridors.geojson",
    layers: () => [{ id: "c", type: "line", source: "", paint: { "line-color": "#fff", "line-width": 5, "line-opacity": 0.7 } },
      { id: "l", type: "line", source: "", paint: { "line-color": "#a6480f", "line-width": 2.6, "line-dasharray": [2, 1.2] } }],
    legend: [{ colour: "#a6480f", en: "Least-cost corridor", bn: "ন্যূনতম-ব্যয় করিডোর", line: true }] },
  { key: "waterways", group: "water", en: "Rivers, canals and creeks", bn: "নদী, খাল ও খাঁড়ি", file: "vector/waterways.geojson",
    layers: (d) => [
      { id: "l", type: "line", source: "", paint: { "line-color": d ? "#5fb3d0" : "#1f6f8b",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, ["match", ["get", "c"], "river", 1.6, 0.6], 14, ["match", ["get", "c"], "river", 5, 2]] } },
      { id: "t", type: "symbol", source: "", minzoom: 10.5, layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-font": F.i,
        "text-size": 11, "symbol-spacing": 320 }, paint: { "text-color": d ? "#8fd0e6" : "#1f5f7a", ...halo(d) } }],
    legend: [{ colour: "#1f6f8b", en: "River / canal", bn: "নদী / খাল", line: true }] },
  { key: "water_bodies", group: "water", en: "Ponds and water bodies", bn: "পুকুর ও জলাশয়", file: "vector/water_bodies.geojson",
    layers: () => [{ id: "f", type: "fill", source: "", paint: { "fill-color": "#3987e5", "fill-opacity": 0.45 } }],
    legend: [{ colour: "#3987e5", en: "Water body", bn: "জলাশয়" }] },
  { key: "jetties", group: "places", en: "Ghats and jetties", bn: "ঘাট ও জেটি", file: "vector/jetties.geojson",
    layers: (d) => [
      { id: "c", type: "circle", source: "", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 6],
        "circle-color": ["match", ["get", "kind"], "ferry_terminal", "#0d366b", "#3987e5"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.4 } },
      { id: "t", type: "symbol", source: "", minzoom: 12, layout: { "text-field": ["get", "name"], "text-font": F.r, "text-size": 11,
        "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true }, paint: { "text-color": d ? "#9ec5f4" : "#0d366b", ...halo(d) } }],
    legend: [{ colour: "#0d366b", en: "Ferry ghat", bn: "ফেরিঘাট", dot: true }, { colour: "#3987e5", en: "Jetty / pier", bn: "জেটি", dot: true }],
    entity: { type: "jetty", prop: "id" } },
  { key: "services", group: "places", en: "Health, banks, markets and other services", bn: "স্বাস্থ্য, ব্যাংক, বাজার ও অন্যান্য পরিষেবা", file: "vector/services.geojson",
    layers: (d) => [
      { id: "c", type: "circle", source: "", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 6.5],
        "circle-color": ["match", ["get", "category"], ...Object.entries(SERVICE_COLOURS).flat(), "#898781"] as unknown as ExpressionSpecification, "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 } },
      { id: "t", type: "symbol", source: "", minzoom: 13, layout: { "text-field": ["get", "name"], "text-font": F.r, "text-size": 11,
        "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true }, paint: { "text-color": ink(d), ...halo(d) } }],
    legend: [{ colour: SERVICE_COLOURS.health, en: "Health", bn: "স্বাস্থ্য", dot: true }, { colour: SERVICE_COLOURS.finance, en: "Bank / finance", bn: "ব্যাংক", dot: true },
      { colour: SERVICE_COLOURS.market, en: "Market", bn: "বাজার", dot: true }, { colour: SERVICE_COLOURS.education, en: "Education", bn: "শিক্ষা", dot: true },
      { colour: SERVICE_COLOURS.religious, en: "Religious", bn: "ধর্মীয়", dot: true }, { colour: SERVICE_COLOURS.other, en: "Other", bn: "অন্যান্য", dot: true }],
    entity: { type: "poi", prop: "id" } },
  { key: "places", group: "places", en: "Place names (OpenStreetMap)", bn: "স্থানের নাম (ওপেনস্ট্রিটম্যাপ)", file: "vector/places.geojson",
    layers: (d) => [
      { id: "c", type: "circle", source: "", minzoom: 10, paint: { "circle-radius": 2.6, "circle-color": d ? "#c3c2b7" : "#52514e" } },
      { id: "t", type: "symbol", source: "", minzoom: 11.5, layout: { "text-field": ["get", "name"], "text-font": F.r, "text-size": 11,
        "text-offset": [0, 0.9], "text-anchor": "top", "text-optional": true }, paint: { "text-color": ink(d), ...halo(d) } }],
    legend: [{ colour: "#52514e", en: "Named place", bn: "নামযুক্ত স্থান", dot: true }], entity: { type: "place", prop: "id" } },
];
export const refByKey = (k: string) => REF_LAYERS.find((r) => r.key === k);

/** Place labels (villages, towns, islands, blocks, districts). Latin script on the map; the panels are bilingual. */
export function labelLayers(dark: boolean): LayerSpecification[] {
  const h = halo(dark);
  return [
    { id: "ov-lab-district", type: "symbol", source: "ov-labels", maxzoom: 9.2, filter: ["==", ["get", "t"], "district"],
      layout: { "text-field": ["get", "n"], "text-font": F.m, "text-size": 14, "text-transform": "uppercase", "text-letter-spacing": 0.12 },
      paint: { "text-color": dark ? "#dfe7e3" : "#3d3a33", ...h } },
    { id: "ov-lab-island", type: "symbol", source: "ov-labels", minzoom: 9, filter: ["==", ["get", "t"], "island"],
      layout: { "text-field": ["get", "n"], "text-font": F.i, "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10.5, 13, 13], "text-max-width": 8 },
      paint: { "text-color": dark ? "#8fd0e6" : "#1f5f7a", ...h } },
    { id: "ov-lab-town", type: "symbol", source: "ov-labels", minzoom: 9, filter: ["==", ["get", "t"], "town"],
      layout: { "text-field": ["get", "n"], "text-font": F.m, "text-size": ["interpolate", ["linear"], ["zoom"], 9, 11, 13, 13.5], "symbol-sort-key": ["-", 0, ["get", "r"]] },
      paint: { "text-color": ink(dark), ...h } },
    { id: "ov-lab-village", type: "symbol", source: "ov-labels", minzoom: 10.5, filter: ["==", ["get", "t"], "village"],
      layout: { "text-field": ["get", "n"], "text-font": F.r, "text-size": ["interpolate", ["linear"], ["zoom"], 10.5, 10, 14, 12.5],
        "symbol-sort-key": ["-", 0, ["get", "r"]], "text-padding": 4 },
      paint: { "text-color": dark ? "#c3cfc9" : "#3b4640", ...h } },
  ];
}

/** Colours used by highlights, routes and measurements. */
export const UI = { highlight: "#eda100", casing: "#3d2a00", boat: "#2a78d6", walk: "#52514e", alt: "#898781", measure: "#e34948" };
