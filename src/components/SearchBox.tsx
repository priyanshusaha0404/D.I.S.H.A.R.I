"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Anchor, Building2, Crosshair, Hexagon, Home, Landmark, MapPin, Mic, Search, Shell, ShieldCheck, Trees, Waves, X } from "@/components/icons";
import { useApp } from "@/lib/app-context";
import { coordOf, gridIdOf, searchPlaces, type Place } from "@/lib/data/search";
import { hexStore } from "@/lib/data/hex";
import { useDismiss } from "@/hooks/useDismiss";
import { cx } from "@/components/ui";
import type { TKey } from "@/lib/i18n";

type SR = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void; onend: () => void; onerror: () => void };
export interface PickedPlace { type: string; id: string; name: string; lon: number; lat: number; bbox: [number, number, number, number] | null; context?: string }

const ICON: Record<string, typeof Home> = { village: Home, town: Building2, block: Landmark, district: Landmark, island: Shell, forest_unit: Trees,
  protected_area: ShieldCheck, river: Waves, canal: Waves, creek: Waves, jetty: Anchor, poi: MapPin, place: MapPin, hex: Hexagon, point: Crosshair };

export const entLabel = (type: string): TKey => (`ent.${type}` as TKey);

export default function SearchBox({ onPick, placeholder, types, autoFocus = false, size = "md", value, onClear }: {
  onPick: (p: PickedPlace) => void; placeholder?: string; types?: string[]; autoFocus?: boolean; size?: "md" | "sm" | "hero"; value?: string; onClear?: () => void;
}) {
  const { t, lang } = useApp();
  const [q, setQ] = useState(value || "");
  const [res, setRes] = useState<(Place | PickedPlace)[]>([]);
  const [latin, setLatin] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const lid = useId();
  useDismiss(open, box, () => setOpen(false));
  useEffect(() => { if (value !== undefined) setQ(value); }, [value]);

  useEffect(() => {
    const query = q.trim();
    if (!query || query === value) { setRes([]); return; }
    let live = true;
    const h = setTimeout(async () => {
      const extra: PickedPlace[] = [];
      const c = coordOf(query);
      if (c) extra.push({ type: "point", id: `${c[1].toFixed(5)},${c[0].toFixed(5)}`, name: `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`, lon: c[0], lat: c[1], bbox: null, context: t("search.coordinate") });
      const g = gridIdOf(query);
      if (g) {
        const hx = await hexStore();
        const i = hx.index.get(g);
        if (i !== undefined) extra.push({ type: "hex", id: g, name: g, lon: hx.meta.lon[i], lat: hx.meta.lat[i], bbox: null,
          context: `${t("search.hexagon")} · ${hx.meta.blocks[hx.meta.block[i]] || ""}` });
      }
      const r = await searchPlaces(query, { types, limit: 10 });
      if (!live) return;
      setRes([...extra, ...r.results]);
      setLatin(r.latin);
      setAct(0);
      setOpen(true);
    }, 110);
    return () => { live = false; clearTimeout(h); };
  }, [q, types, t, value]);

  const [listening, setListening] = useState(false);
  const hero = size === "hero";
  const listen = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const R = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!R) return;
    const r = new R(); r.lang = lang === "bn" ? "bn-IN" : "en-IN"; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) setQ(t.trim()); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    setListening(true); r.start();
  };
  const go = () => { if (res[act]) pick(res[act]); else setOpen(true); };
  const pick = (p: Place | PickedPlace) => {
    setOpen(false);
    setQ(lang === "bn" && "name_bn" in p && p.name_bn ? p.name_bn : p.name);
    onPick({ type: p.type, id: p.id, name: p.name, lon: p.lon, lat: p.lat, bbox: p.bbox, context: p.context });
  };

  return (
    <div ref={box} className="relative">
      <div className={cx("flex items-center gap-2", hero ? "search-hero h-[52px] rounded-full pl-4 pr-1.5" : "rounded-xl border border-line bg-raised px-3 shadow-sm focus-within:border-water", size === "sm" ? "h-9" : !hero && "h-11")}>
        <Search size={hero ? 18 : 16} className="shrink-0 text-faint" aria-hidden="true" />
        <input
          role="combobox" aria-expanded={open} aria-controls={lid} aria-autocomplete="list" autoFocus={autoFocus}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
          placeholder={placeholder || t("search.placeholder")} value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => res.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAct((a) => Math.min(res.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter" && res[act]) { e.preventDefault(); pick(res[act]); }
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        {q && <button className="text-faint hover:text-ink" aria-label={t("tools.clear")} onClick={() => { setQ(""); setRes([]); onClear?.(); }}><X size={15} /></button>}
        {hero && <>
          <button type="button" onClick={listen} className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", listening ? "animate-pulse bg-rose-500/20 text-rose-400" : "text-rose-400 hover:bg-white/10")}
            aria-label={lang === "bn" ? "বলে খুঁজুন" : "Search by voice"} title={lang === "bn" ? "বলে খুঁজুন" : "Search by voice"}><Mic size={18} /></button>
          <button type="button" onClick={go} className="h-10 shrink-0 rounded-full bg-[#2dd4a7] px-5 text-sm font-bold text-[#06231b] shadow-[0_6px_18px_rgba(45,212,167,.35)] hover:brightness-110">{lang === "bn" ? "খুঁজুন" : "Search"}</button>
        </>}
      </div>
      {open && q.trim() && q !== value && (
        <div id={lid} role="listbox" className="panel absolute left-0 right-0 z-50 mt-1.5 max-h-[60vh] overflow-y-auto p-1 scroll-thin">
          {latin && <p className="px-2 py-1 text-2xs text-faint">{t("search.translit")}: <b className="text-muted">{latin}</b></p>}
          {!res.length && <p className="px-2 py-3 text-center text-sm text-muted">{t("search.empty")}<br /><span className="text-2xs text-faint">{t("search.hint")}</span></p>}
          {res.map((r, k) => {
            const I = ICON[r.type] || MapPin;
            const nm = lang === "bn" && "name_bn" in r && r.name_bn ? r.name_bn : r.name;
            return (
              <button key={`${r.type}:${r.id}`} role="option" aria-selected={k === act} onMouseEnter={() => setAct(k)} onClick={() => pick(r)}
                className={cx("flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left", k === act ? "bg-sunken" : "")}>
                <I size={16} className="mt-0.5 shrink-0 text-water" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{nm}</span>
                  <span className="block truncate text-2xs text-muted">{t(entLabel(r.type === "point" ? "point" : r.type))}{r.context ? ` · ${r.context}` : ""}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
