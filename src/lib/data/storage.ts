"use client";
/** Personal items kept in this browser only (no account needed): saved places, journeys and field notes. */
import { useCallback, useEffect, useState } from "react";

export interface SavedPlace { id: string; type: string; ref: string; name: string; lon: number; lat: number; saved: string }
export interface Journey { id: string; name: string; mode: string; tide: string; km: number; min: number; from: string; to: string; saved: string; geometry: [number, number][][];
  /** smart-trip share code (rebuilds the whole trip) and number of places */
  trip?: string; stops?: number }
export interface FieldNote { id: string; title: string; text: string; lon: number | null; lat: number | null; time: string; category: string }

type Store = { places: SavedPlace[]; journeys: Journey[]; notes: FieldNote[] };
const KEY = "dishari.my";
const empty: Store = { places: [], journeys: [], notes: [] };

function read(): Store {
  try { return { ...empty, ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Store>) }; } catch { return { ...empty }; }
}
function write(s: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); window.dispatchEvent(new Event("dishari-my")); } catch { /* storage unavailable */ }
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
/** add a journey / a place without the React hook (the assistant saves for you) */
export function saveJourney(j: Omit<Journey, "id" | "saved">) { const s = read(); write({ ...s, journeys: [{ ...j, id: uid(), saved: new Date().toISOString() }, ...s.journeys].slice(0, 50) }); }
export function savePlace(p: Omit<SavedPlace, "id" | "saved">) { const s = read(); write({ ...s, places: [{ ...p, id: uid(), saved: new Date().toISOString() }, ...s.places.filter((q) => !(q.type === p.type && q.ref === p.ref))] }); }

export function useMyData() {
  const [s, setS] = useState<Store>(empty);
  useEffect(() => {
    setS(read());
    const on = () => setS(read());
    window.addEventListener("dishari-my", on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener("dishari-my", on); window.removeEventListener("storage", on); };
  }, []);
  const update = useCallback((f: (s: Store) => Store) => write(f(read())), []);
  return {
    ...s,
    addPlace: (p: Omit<SavedPlace, "id" | "saved">) => update((x) => ({ ...x, places: [{ ...p, id: uid(), saved: new Date().toISOString() }, ...x.places.filter((q) => !(q.type === p.type && q.ref === p.ref))] })),
    removePlace: (id: string) => update((x) => ({ ...x, places: x.places.filter((p) => p.id !== id) })),
    addJourney: (j: Omit<Journey, "id" | "saved">) => update((x) => ({ ...x, journeys: [{ ...j, id: uid(), saved: new Date().toISOString() }, ...x.journeys].slice(0, 50) })),
    removeJourney: (id: string) => update((x) => ({ ...x, journeys: x.journeys.filter((p) => p.id !== id) })),
    saveNote: (n: FieldNote) => update((x) => ({ ...x, notes: [n, ...x.notes.filter((q) => q.id !== n.id)] })),
    removeNote: (id: string) => update((x) => ({ ...x, notes: x.notes.filter((p) => p.id !== id) })),
    isSaved: (type: string, ref: string) => s.places.some((p) => p.type === type && p.ref === ref),
  };
}
