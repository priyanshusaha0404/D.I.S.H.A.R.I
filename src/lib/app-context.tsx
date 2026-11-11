"use client";
/** App-wide settings: language, theme, connectivity and offline-cache state. There are no accounts — every visitor sees
 *  and can use everything. Settings are remembered in this browser. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type Lang, type TKey } from "./i18n";

type Theme = "light" | "dark";
export type OfflineState = { status: "unsupported" | "installing" | "ready" | "error"; done: number; total: number; update: boolean };

interface Ctx {
  lang: Lang; setLang: (l: Lang) => void;
  theme: Theme; setTheme: (t: Theme) => void;
  t: (k: TKey) => string;
  online: boolean;
  offline: OfflineState;
  applyUpdate: () => void;
  /** pick the Bengali or English variant of a pair */
  L: (en: string | null | undefined, bn?: string | null) => string;
}
const AppCtx = createContext<Ctx | null>(null);

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangS] = useState<Lang>("en");
  const [theme, setThemeS] = useState<Theme>("light");
  const [online, setOnline] = useState(true);
  const [offline, setOffline] = useState<OfflineState>({ status: "unsupported", done: 0, total: 0, update: false });
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const l = read("dishari.lang");
    if (l === "bn" || l === "en") setLangS(l);
    const th = read("dishari.theme");
    if (th === "dark" || th === "light") setThemeS(th);
    else setThemeS("dark");
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); }, [theme]);

  // service worker: precaches the whole site and its data so it keeps working without a connection
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let cancelled = false;
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data || {};
      if (d.type === "progress") setOffline((o) => ({ ...o, status: d.done >= d.total ? "ready" : "installing", done: d.done, total: d.total }));
      if (d.type === "ready") setOffline((o) => ({ ...o, status: "ready", done: d.total ?? o.total, total: d.total ?? o.total }));
      if (d.type === "status") setOffline((o) => ({ ...o, status: d.complete ? "ready" : "installing", done: d.done, total: d.total }));
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      if (cancelled) return;
      setOffline((o) => ({ ...o, status: "installing" }));
      const ask = () => navigator.serviceWorker.controller?.postMessage({ type: "status" });
      if (navigator.serviceWorker.controller) ask();
      navigator.serviceWorker.addEventListener("controllerchange", ask);
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) { setWaiting(w); setOffline((o) => ({ ...o, update: true })); }
          if (w.state === "activated") ask();
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) { setWaiting(reg.waiting); setOffline((o) => ({ ...o, update: true })); }
      track(reg.installing);
      reg.addEventListener("updatefound", () => track(reg.installing));
      setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
    }).catch(() => setOffline((o) => ({ ...o, status: "error" })));
    return () => { cancelled = true; navigator.serviceWorker.removeEventListener("message", onMsg); };
  }, []);

  const applyUpdate = useCallback(() => {
    if (waiting) {
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
      waiting.postMessage({ type: "skipWaiting" });
    } else window.location.reload();
  }, [waiting]);

  const value = useMemo<Ctx>(() => ({
    lang, theme, online, offline, applyUpdate,
    setLang: (l) => { setLangS(l); write("dishari.lang", l); },
    setTheme: (th) => { setThemeS(th); write("dishari.theme", th); },
    t: (k) => translate(lang, k),
    L: (en, bn) => (lang === "bn" && bn ? bn : en || bn || ""),
  }), [lang, theme, online, offline, applyUpdate]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

/** Small async-data hook with loading / error state. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: Error | null; loading: boolean; reload: () => void } {
  const [state, set] = useState<{ data: T | null; error: Error | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    set((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => live && set({ data, error: null, loading: false }))
      .catch((error: Error) => live && set({ data: null, error, loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}
