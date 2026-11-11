/** WGS 84 ⇄ UTM zone 45N (EPSG:32645), the analysis projection of the data set. Krüger series, millimetre accuracy. */
const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, lon0 = (87 * Math.PI) / 180, FE = 500000;
const n = f / (2 - f), A = (a / (1 + n)) * (1 + n * n / 4 + n ** 4 / 64);
const al = [0, n / 2 - (2 / 3) * n * n + (5 / 16) * n ** 3, (13 / 48) * n * n - (3 / 5) * n ** 3, (61 / 240) * n ** 3];
const be = [0, n / 2 - (2 / 3) * n * n + (37 / 96) * n ** 3, (1 / 48) * n * n + (1 / 15) * n ** 3, (17 / 480) * n ** 3];
const de = [0, 2 * n - (2 / 3) * n * n - 2 * n ** 3, (7 / 3) * n * n - (8 / 5) * n ** 3, (56 / 15) * n ** 3];
const e2n = (2 * Math.sqrt(n)) / (1 + n);

export function toUtm(lon: number, lat: number): [number, number] {
  const phi = (lat * Math.PI) / 180, lam = (lon * Math.PI) / 180 - lon0;
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e2n * Math.atanh(e2n * Math.sin(phi)));
  const xi = Math.atan2(t, Math.cos(lam)), eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let x = eta, y = xi;
  for (let j = 1; j <= 3; j++) { x += al[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); y += al[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
  return [FE + k0 * A * x, k0 * A * y];
}

export function fromUtm(E: number, N: number): [number, number] {
  const xi = N / (k0 * A), eta = (E - FE) / (k0 * A);
  let xp = xi, ep = eta;
  for (let j = 1; j <= 3; j++) { xp -= be[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= be[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
  let phi = chi;
  for (let j = 1; j <= 3; j++) phi += de[j] * Math.sin(2 * j * chi);
  const lam = lon0 + Math.atan2(Math.sinh(ep), Math.cos(xp));
  return [(lam * 180) / Math.PI, (phi * 180) / Math.PI];
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371.0088, r = Math.PI / 180;
  const h = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Geodesic polygon area (km²) on the sphere, for the measure tool. */
export function polygonAreaKm2(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const R = 6371.0088, r = Math.PI / 180;
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    s += (x2 - x1) * r * (2 + Math.sin(y1 * r) + Math.sin(y2 * r));
  }
  return Math.abs((s * R * R) / 2);
}

/** Degrees → "22°09′12″ N" */
export function dms(v: number, isLat: boolean): string {
  const h = isLat ? (v >= 0 ? "N" : "S") : v >= 0 ? "E" : "W";
  const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60);
  return `${d}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″ ${h}`;
}
