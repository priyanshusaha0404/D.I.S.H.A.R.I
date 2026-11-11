/** Glossy map pins (drawn once from SVG, used as GPU icons in the 3D map and as HTML markers on the main map)
 *  and the traveller icons. */
import type maplibregl from "maplibre-gl";

/** 24 × 24 line icons used inside pins */
export const ICON: Record<string, string> = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  anchor: '<circle cx="12" cy="5.5" r="2"/><path d="M12 7.5V21"/><path d="M5 13a7 7 0 0 0 14 0"/><path d="M8 10h8"/>',
  boat: '<path d="M3 15h18l-3 5H6z"/><path d="M12 15V4"/><path d="M12 5l6 8h-6"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2-6 3 3v3"/><path d="M8 11l3-4 3 1 2 4"/><path d="M12 15l-1-6"/>',
  health: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>',
  market: '<path d="M4 9h16l-1.5 11h-13z"/><path d="M8.5 9 12 4l3.5 5"/>',
  school: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
  temple: '<path d="M12 3l3 5H9z"/><path d="M6 21V11h12v10"/><path d="M4 11h16"/><path d="M10 21v-5h4v5"/>',
  village: '<path d="M2 20h20"/><path d="M4 20v-7l4-4 4 4v7"/><path d="M14 20v-9l4-3 3 3v9"/>',
  place: '<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  bus: '<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M4 11h16"/><circle cx="8" cy="19" r="1.5"/><circle cx="16" cy="19" r="1.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5h.01"/>',
  tree: '<path d="M12 3l6 8h-4l5 6H5l5-6H6z"/><path d="M12 17v4"/>',
};

export function pinSVG(color: string, inner?: { text?: string; icon?: string }): string {
  const body = "M32 93 C27.5 77 6 59 6 32 A26 26 0 1 1 58 32 C58 59 36.5 77 32 93 Z";
  let hole = "";
  if (inner?.icon) hole = `<circle cx="32" cy="31" r="13" fill="#fff"/><svg x="21.5" y="20.5" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${ICON[inner.icon] || ""}</svg>`;
  else if (inner?.text != null) {
    const t = String(inner.text);
    hole = `<circle cx="32" cy="31" r="13" fill="#fff"/><text x="32" y="${t.length > 1 ? 36 : 37}" font-size="${t.length > 1 ? 14 : 17}" font-weight="800" text-anchor="middle" fill="${color}" font-family="Inter Variable,Arial,sans-serif">${t.replace(/[<&]/g, "")}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 100" width="64" height="100"><defs>
  <radialGradient id="sh" cx="34%" cy="22%" r="85%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".25" stop-color="#fff" stop-opacity=".1"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient>
  <radialGradient id="gr" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <radialGradient id="sp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="32" cy="95" rx="16" ry="4.4" fill="url(#gr)"/>
  <path d="${body}" fill="${color}" stroke="rgba(0,0,0,.3)" stroke-width="1.6"/><path d="${body}" fill="url(#sh)"/>
  <path d="M41 18.5 A15.5 15.5 0 0 1 47.5 33" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>
  <ellipse cx="19" cy="17" rx="7.5" ry="4.2" transform="rotate(-38 19 17)" fill="url(#sp)"/>${hole}</svg>`;
}

const cache = new Map<string, Promise<ImageData>>();
/** Register a pin as a map image (pixelRatio 2), rendered once per colour/content. */
export async function addPinImage(map: maplibregl.Map, id: string, color: string, inner: { text?: string; icon?: string } | undefined, w: number) {
  const key = `${id}|${w}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(pinSVG(color, inner));
    await img.decode();
    const c = document.createElement("canvas");
    c.width = Math.round(w * 2); c.height = Math.round((w * 2 * 100) / 64);
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, c.width, c.height);
    return g.getImageData(0, 0, c.width, c.height);
  })());
  const data = await cache.get(key)!;
  if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: 2 });
  return id;
}

/** HTML pin for the 2D main map */
export function pinEl(color: string, inner: { text?: string; icon?: string } | undefined, w = 30) {
  const el = document.createElement("div");
  el.style.cssText = `width:${w}px;height:${(w * 100) / 64}px;cursor:pointer;filter:drop-shadow(0 2px 2px rgba(0,0,0,.18))`;
  el.innerHTML = pinSVG(color, inner).replace("<svg ", `<svg style="width:100%;height:100%;display:block" `);
  return el;
}

/** traveller: a white disc with the mode inside, a heading cone that turns with the course and a pulsing halo */
export function travellerHTML(mode: "boat" | "walk") {
  const icon = mode === "boat"
    ? '<path d="M3.5 14.5h17l-2.8 5H6.3z" fill="#fff"/><path d="M12 14.5V4" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/><path d="M12.7 4.8l5.4 8.2h-5.4z" fill="#fff"/><path d="M11.3 6.8 7.2 13h4.1z" fill="#fff" opacity=".85"/>'
    : '<circle cx="13" cy="4.6" r="2.1" fill="#fff"/><path d="M10 21l2-6 3 3v3M8 11l3-4 3 1 2 4M12 15l-1-6" stroke="#fff" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  const bg = mode === "boat" ? "#2a78d6" : "#3c3b37";
  return `<div class="trav-halo" style="--c:${bg}"></div><div class="trav-dir"><svg viewBox="0 0 60 60" width="60" height="60"><path d="M30 2 40 17 A15 15 0 0 0 20 17 Z" fill="${bg}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg></div>`
    + `<div class="trav-core" style="background:${bg}"><svg viewBox="0 0 24 24" width="21" height="21">${icon}</svg></div>`;
}
