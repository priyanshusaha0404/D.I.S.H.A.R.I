"use client";
/** The assistant's conversation and settings. Kept in memory so the chat carries on while the site is open; the voice
 *  setting is remembered in this browser. */
import { useSyncExternalStore } from "react";
import type { Lang } from "../i18n";

export type AgentId = "router" | "map" | "place" | "trip" | "report" | "decision" | "data" | "weather" | "help" | "ai";
/** a button under an answer; when `run` resolves to an agent result, that result is shown in the chat */
export interface Action { label: string; run: () => unknown; primary?: boolean; icon?: string; href?: string }
export interface Chip { label: string; send: string }
export type Part =
  | { k: "text"; text: string }
  | { k: "facts"; title?: string; rows: [string, string][] }
  | { k: "list"; title?: string; items: { title: string; sub?: string; right?: string; colour?: string; act?: Action }[] }
  | { k: "bars"; title: string; items: { label: string; value: number; display: string }[]; colour?: string }
  | { k: "steps"; title?: string; items: string[] }
  | { k: "kpis"; items: { label: string; value: string; sub?: string }[] }
  | { k: "file"; name: string; format: string }
  | { k: "note"; text: string };
export interface Step { agent: AgentId; text: string; status: "run" | "ok" | "fail" | "ask" }
/** a photo sent to the assistant (JPEG, already made small) */
export interface Img { mime: string; data: string; url: string }
export interface Msg {
  id: string; role: "user" | "assistant"; text?: string; images?: string[]; lang: Lang;
  steps: Step[]; parts: Part[]; actions: Action[]; chips: Chip[]; done: boolean;
}
interface State { open: boolean; expanded: boolean; msgs: Msg[]; busy: boolean; voice: boolean; ai: boolean | null; unread: boolean; queue: string | null; lastUse: number }

const VOICE_KEY = "dishari.ai.voice";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } };

let state: State = { open: false, expanded: false, msgs: [], busy: false, voice: false, ai: null, unread: false, queue: null, lastUse: 0 };
let loaded = false;
const subs = new Set<() => void>();
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = { ...state, voice: read(VOICE_KEY) === "1" };
}
function set(p: Partial<State>) { state = { ...state, ...p }; subs.forEach((f) => f()); }
export function getAssistant() { load(); return state; }
export function useAssistant<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => { load(); return sel(state); }, () => sel(state));
}

let seq = 0;
export const msgId = () => `m${Date.now().toString(36)}${(++seq).toString(36)}`;
export function openAssistant(open = true) { set({ open, unread: open ? false : state.unread }); }
export function toggleAssistant() { openAssistant(!state.open); }
export function setExpanded(v: boolean) { set({ expanded: v }); }
export function setBusy(v: boolean) { set({ busy: v, lastUse: Date.now() }); }
export function pushMsg(m: Msg) { set({ msgs: [...state.msgs, m], unread: !state.open }); }
export function patchMsg(id: string, p: Partial<Msg> | ((m: Msg) => Partial<Msg>)) {
  set({ msgs: state.msgs.map((m) => (m.id === id ? { ...m, ...(typeof p === "function" ? p(m) : p) } : m)) });
}
export function clearChat() { set({ msgs: [] }); }
/** open the assistant and send it a message (used by prompts elsewhere on the site) */
export function askAssistant(text: string) { set({ open: true, unread: false, queue: text }); }
export function takeQueue() { const q = state.queue; if (q) set({ queue: null }); return q; }
export function setVoice(v: boolean) { write(VOICE_KEY, v ? "1" : "0"); set({ voice: v }); }
export function setAi(v: boolean) { if (state.ai !== v) set({ ai: v }); }
