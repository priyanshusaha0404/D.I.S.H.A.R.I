/** Loads the static data files under /data. Everything is cached in memory; the service worker caches the files for
 *  offline use. File URLs carry the data version so a new deployment never mixes old and new files. */
import { gunzipSync } from "fflate";

export const DATA_VERSION = process.env.NEXT_PUBLIC_DATA_VERSION || "dev";
const memo = new Map<string, Promise<unknown>>();

export function dataUrl(path: string): string {
  return `/data/${path}?v=${DATA_VERSION}`;
}

async function get(path: string): Promise<Response> {
  const res = await fetch(dataUrl(path));
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res;
}

export function loadJSON<T>(path: string): Promise<T> {
  if (!memo.has(path)) {
    const p = get(path).then((r) => r.json() as Promise<T>);
    p.catch(() => memo.delete(path));
    memo.set(path, p);
  }
  return memo.get(path) as Promise<T>;
}

/** Binary file; `.gz` files are gunzipped in the browser (works the same online and offline). */
export function loadBinary(path: string): Promise<Uint8Array> {
  if (!memo.has(path)) {
    const p = get(path).then(async (r) => {
      const buf = new Uint8Array(await r.arrayBuffer());
      return path.endsWith(".gz") && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
    });
    p.catch(() => memo.delete(path));
    memo.set(path, p);
  }
  return memo.get(path) as Promise<Uint8Array>;
}

export interface Manifest { version: string; generated: string; total_bytes: number; files: { path: string; bytes: number; hash: string }[] }
export const loadManifest = () => loadJSON<Manifest>("manifest.json");
