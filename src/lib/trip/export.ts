/** Trip files: GPX for GPS apps, GeoJSON for GIS, a Google Maps link and a share link that rebuilds the trip. */
import type { TripPlan, TripSettings, TripStop } from "./plan";
import { encodeTrip } from "./plan";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const iso = (ms: number) => new Date(ms).toISOString();

export function tripGpx(p: TripPlan, title: string): string {
  const stops = p.stops.filter((s, i) => !(i === p.stops.length - 1 && s.id.endsWith("-back")));
  const wpt = stops.map((s, i) => `<wpt lat="${s.lat.toFixed(6)}" lon="${s.lon.toFixed(6)}"><name>${esc(`${i === 0 ? "Start" : i === stops.length - 1 ? "Finish" : i}. ${s.name}`)}</name><type>${esc(s.type)}</type></wpt>`).join("");
  const trk = p.hops.map((h, hi) => `<trk><name>${esc(`${hi + 1}. ${p.stops[h.from].name} → ${p.stops[h.to].name}`)}</name><type>${h.legs.map((l) => l.mode).join("+")}</type>${h.legs.map((l) => {
    const n = l.coords.length;
    return `<trkseg>${l.coords.map(([x, y], k) => `<trkpt lat="${y.toFixed(6)}" lon="${x.toFixed(6)}"><time>${iso(l.t0 + ((l.t1 - l.t0) * k) / Math.max(1, n - 1))}</time></trkpt>`).join("")}</trkseg>`;
  }).join("")}</trk>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="D.I.S.H.A.R.I" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${esc(title)}</name><time>${iso(p.created)}</time></metadata>${wpt}${trk}</gpx>`;
}

export function tripGeoJSON(p: TripPlan): GeoJSON.FeatureCollection {
  const feats: GeoJSON.Feature[] = [];
  p.stops.forEach((s, i) => {
    if (i === p.stops.length - 1 && s.id.endsWith("-back")) return;
    const arr = i === 0 ? null : p.hops.find((h) => h.to === i);
    const dep = p.hops.find((h) => h.from === i);
    feats.push({ type: "Feature", properties: { kind: "stop", order: i, name: s.name, type: s.type, stay_min: i === 0 ? 0 : s.stay,
      arrive: arr ? iso(arr.arrive) : null, leave: dep ? iso(dep.depart) : null }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } });
  });
  p.hops.forEach((h, hi) => h.legs.forEach((l, li) => feats.push({ type: "Feature", properties: { kind: "leg", hop: hi + 1, leg: li + 1, mode: l.mode,
    from: l.fromName || (l.fromNear ? `ghat near ${l.fromNear}` : ""), to: l.toName || (l.toNear ? `ghat near ${l.toNear}` : ""), km: +l.km.toFixed(3), minutes: Math.round(l.min), depart: iso(l.t0), arrive: iso(l.t1), tide: h.tide, tide_source: h.tideSource,
    rivers: l.rivers.join(", "), creek_km: +(l.creekKm || 0).toFixed(3), permit_km: +(l.permitKm || 0).toFixed(3) },
    geometry: { type: "LineString", coordinates: l.coords } })));
  return { type: "FeatureCollection", features: feats };
}

export function googleMapsUrl(stops: TripStop[]): string {
  const s = stops.filter((x, i) => !(i === stops.length - 1 && x.id.endsWith("-back")));
  const o = s[0], d = s[s.length - 1];
  const wp = s.slice(1, -1).slice(0, 8).map((x) => `${x.lat.toFixed(5)},${x.lon.toFixed(5)}`).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${o.lat.toFixed(5)},${o.lon.toFixed(5)}&destination=${d.lat.toFixed(5)},${d.lon.toFixed(5)}${wp ? `&waypoints=${encodeURIComponent(wp)}` : ""}`;
}

export function shareUrl(stops: TripStop[], s: TripSettings): string {
  return `${location.origin}/?trip=${encodeTrip(stops.filter((x) => !x.id.endsWith("-back")), s)}`;
}
