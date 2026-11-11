"use client";
/** Which drawer is open, and short toast messages. */
import { useSyncExternalStore } from "react";

export type Drawer = "trip" | "pois" | "near" | "dash" | "saved" | null;
interface UI { drawer: Drawer; toast: string | null; layers: boolean }
let state: UI = { drawer: null, toast: null, layers: false };
const subs = new Set<() => void>();
const set = (p: Partial<UI>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const getUI = () => state;
export function useUI<T>(sel: (s: UI) => T): T {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => sel(state), () => sel(state));
}
export function openDrawer(d: Drawer) { set({ drawer: d, layers: false }); }
export function toggleDrawer(d: Exclude<Drawer, null>) { set({ drawer: state.drawer === d ? null : d, layers: false }); }
export function setLayersOpen(v: boolean) { set({ layers: v }); }
let timer: ReturnType<typeof setTimeout> | null = null;
export function toast(msg: string) { set({ toast: msg }); if (timer) clearTimeout(timer); timer = setTimeout(() => set({ toast: null }), 2600); }
