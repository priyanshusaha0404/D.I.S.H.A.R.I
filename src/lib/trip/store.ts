"use client";
/** Smart-trip state: the stops, the settings and the planned trip. Kept in this browser so a trip survives reloads and
 *  works offline. */
import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, planTrip, type TripPlan, type TripSettings, type TripStop } from "./plan";

export interface TripState {
  stops: TripStop[];
  settings: TripSettings;
  plan: TripPlan | null;
  stale: boolean;
  busy: null | { phase: "order" | "route"; done: number; total: number };
  error: string | null;
  view3d: boolean;
  /** a request (from the assistant) to open the 3D trip; the trip page opens it */
  launch: { live: boolean; at: number } | null;
}
const KEY = "dishari.trip.v2";
const init: TripState = { stops: [], settings: DEFAULT_SETTINGS(), plan: null, stale: false, busy: null, error: null, view3d: false, launch: null };
let state: TripState = init;
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && Array.isArray(s.stops)) {
      const settings = { ...DEFAULT_SETTINGS(), ...(s.settings || {}) };
      if (settings.leaveAt < Date.now() - 12 * 3600e3) settings.leaveAt = DEFAULT_SETTINGS().leaveAt;
      state = { ...state, stops: s.stops, settings, plan: s.plan || null };
    }
  } catch { /* storage blocked */ }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ stops: state.stops, settings: state.settings, plan: state.plan })); } catch { /* storage full */ }
}
function set(p: Partial<TripState>, persist = true) {
  state = { ...state, ...p };
  if (persist) save();
  subs.forEach((f) => f());
}
export function getTrip() { load(); return state; }
export function useTrip<T>(sel: (s: TripState) => T): T {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => { load(); return sel(state); }, () => sel(init));
}

let seq = 0;
export const stopId = () => `st${Date.now().toString(36)}${(++seq).toString(36)}`;

export function setStops(stops: TripStop[]) { set({ stops, stale: true }); }
export function addStop(s: Omit<TripStop, "id" | "stay"> & { stay?: number }, at?: number) {
  const stop: TripStop = { stay: 30, ...s, id: stopId() };
  const stops = [...state.stops];
  if (at === undefined) stops.push(stop); else stops.splice(at, 0, stop);
  set({ stops, stale: true });
}
export function updateStop(i: number, p: Partial<TripStop>) { set({ stops: state.stops.map((s, k) => (k === i ? { ...s, ...p } : s)), stale: true }); }
export function removeStop(i: number) { set({ stops: state.stops.filter((_, k) => k !== i), stale: true }); }
export function moveStop(i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= state.stops.length) return;
  const a = [...state.stops];
  [a[i], a[j]] = [a[j], a[i]];
  set({ stops: a, stale: true });
}
export function setSettings(p: Partial<TripSettings>) { set({ settings: { ...state.settings, ...p }, stale: true }); }
export function clearTrip() { set({ stops: [], plan: null, stale: false, error: null }); }
export function setView3d(v: boolean) { set({ view3d: v }, false); }
export function launch3d(live = false) { set({ launch: { live, at: Date.now() } }, false); }
export function launched() { set({ launch: null }, false); }

let running = 0;
export async function replan(): Promise<TripPlan | null> {
  const stops = state.stops.filter((s) => Number.isFinite(s.lon) && Number.isFinite(s.lat));
  if (stops.length < 2) { set({ error: "need2" }); return null; }
  const id = ++running;
  set({ busy: { phase: "route", done: 0, total: stops.length - 1 }, error: null }, false);
  try {
    const plan = await planTrip(stops, state.settings, (p) => { if (id === running) set({ busy: p }, false); });
    if (id !== running) return null;
    set({ plan, stale: false, busy: null, error: plan.failed ? "failed" : null, stops: plan.reordered ? plan.stops.filter((s) => !s.id.endsWith("-back")) : state.stops });
    return plan;
  } catch (e) {
    if (id === running) set({ busy: null, error: (e as Error).message || "error" }, false);
    return null;
  }
}
