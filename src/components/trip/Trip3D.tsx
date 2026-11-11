"use client";
/** Full-screen 3D trip: HUD with the current step, live stats, controls, arrival cards, a scrubbable trip strip,
 *  "what is around" when paused, live GPS tracking and help numbers. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRightLeft, Box, Clock3, FileText, Flag, Footprints, Gauge, Layers, LocateFixed, Pause, Phone, Play, Radio, Search, Ship, Siren,
  Volume2, VolumeX, X, Navigation2, House } from "@/components/icons";
import { useApp } from "@/lib/app-context";
import { fmtDuration, fmtKm, fmt } from "@/lib/format";
import { at, metres, type LL } from "@/lib/trip/geo";
import type { TripPlan } from "@/lib/trip/plan";
import { GROUP_STYLE, iconFor, nearestOf, type NearGroup } from "@/lib/trip/nearby";
import { ICON } from "@/lib/trip/pins";
import { clock, legEnd, MODE_COLOUR, SOS_NUMBERS, tideName, useTW, vesselName, type TripWord } from "@/lib/trip/text";
import { cx } from "@/components/ui";
import { TripEngine, type UIState } from "./engine";

const GROUPS: NearGroup[] = ["help", "ghats", "villages", "services", "places"];
const Ico = ({ name, size = 18 }: { name: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: ICON[name] || ICON.info }} />
);

export default function Trip3D({ plan, onClose, onReport, onReplan, autoLive = false }: {
  plan: TripPlan; onClose: () => void; onReport: () => void; onReplan: (here: LL, nextStop: number) => void; autoLive?: boolean;
}) {
  const { lang, theme } = useApp();
  const tw = useTW();
  const el = useRef<HTMLDivElement>(null);
  const eng = useRef<TripEngine | null>(null);
  const [ui, setUi] = useState<UIState | null>(null);
  const [sos, setSos] = useState(false);
  const replanRef = useRef(onReplan);
  replanRef.current = onReplan;

  useEffect(() => {
    if (!el.current) return;
    const e = new TripEngine(el.current, plan, lang, setUi, theme === "dark");
    e.onReplan = (h, n) => replanRef.current(h, n);
    eng.current = e;
    setUi(e.ui);
    e.start().then(() => { if (autoLive && !e.ui.live) e.toggleLive(); });
    document.body.style.overflow = "hidden";
    return () => { e.destroy(); eng.current = null; document.body.style.overflow = ""; };
    // the engine is rebuilt only for a new plan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);
  useEffect(() => { eng.current?.setLang(lang); }, [lang]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (sos) { setSos(false); eng.current?.hold(false); }
      else if (eng.current?.ui.around) eng.current.resume();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sos, onClose]);

  const E = eng.current;
  const tl = E?.tl;
  const arriveM = useMemo(() => (tl ? tl.arrive.map((a) => at(tl.pts, a.t).m) : []), [tl]);
  if (typeof document === "undefined") return null;

  const seg = ui && tl ? tl.segs[ui.seg] : undefined;
  const stops = plan.stops;
  const lastStop = stops.length - 1;
  const nextArr = ui && tl ? tl.arrive.findIndex((a) => a.t > ui.pos + 1e-6) : -1;
  const nextStop = nextArr >= 0 && tl ? tl.arrive[nextArr] : null;

  /* ---------------------------------------------------------------- HUD text */
  let hud: { icon: JSX.Element; colour: string; title: string; sub: string } | null = null;
  if (ui && tl && E) {
    if (ui.done) hud = { icon: <Flag size={24} />, colour: MODE_COLOUR.done, title: tw("t_done"), sub: stops[lastStop].name };
    else if (seg) {
      const h = plan.hops[seg.hop];
      const l = seg.leg >= 0 ? h.legs[seg.leg] : undefined;
      const arr = nextStop ? clock(tl.start + nextStop.t * 60000, lang) : "";
      const nextName = nextStop ? stops[nextStop.stop].name : stops[lastStop].name;
      const tide = `${tideName(h.tide, lang)} (${tw(h.tideSource === "forecast" ? "forecast" : h.tideSource === "chosen" ? "chosen" : "usual")})`;
      if (seg.kind === "boat" && l) hud = { icon: <Ship size={24} />, colour: MODE_COLOUR.boat, title: tw("t_boat", { vessel: vesselName(plan.settings.vessel, lang), to: legEnd(l, "to", lang) }),
        sub: [l.rivers.length ? tw("via", { r: l.rivers.join(", ") }) : "", fmtKm(l.km * 1000, lang), tide, tw("arrive", { t: arr })].filter(Boolean).join(" · ") };
      else if (seg.kind === "walk" && l) hud = { icon: <Footprints size={24} />, colour: MODE_COLOUR.walk, title: tw("t_walk", { d: fmtKm(l.km * 1000, lang), to: legEnd(l, "to", lang) }),
        sub: [tw("t_next", { name: nextName, t: arr })].join(" · ") };
      else if (seg.kind === "change") {
        const a = h.legs[seg.leg - 1], b = h.legs[seg.leg];
        const nm = (m: string) => tw(m === "boat" ? "s_boat" : "s_walk");
        hud = { icon: <ArrowRightLeft size={24} />, colour: MODE_COLOUR.change, title: tw("t_change", { at: b ? legEnd(b, "from", lang) : a ? legEnd(a, "to", lang) : "—", a: nm(a?.mode || "walk"), b: nm(b?.mode || "boat") }),
          sub: `${fmtDuration(seg.t1 - seg.t0, lang)} · ${tw("t_next", { name: nextName, t: arr })}` };
      } else {
        const st = stops[seg.stop ?? h.from];
        hud = { icon: <Clock3 size={24} />, colour: MODE_COLOUR.stay, title: tw("t_stay", { name: st.name, t: clock(tl.start + seg.t1 * 60000, lang) }), sub: tw("t_next", { name: nextName, t: arr }) };
      }
    }
  }

  const pct = ui && tl ? Math.round((100 * ui.pos) / tl.total) : 0;
  const curM = ui && tl ? at(tl.pts, ui.pos).m : 0;
  const card = ui?.card;
  const A = ui?.around;
  const list = A && E ? E.filtered(A) : [];
  const selItem = A && A.sel !== null ? A.items.find((x) => x.i === A.sel) : null;

  const ctrl = (key: string, icon: JSX.Element, label: string, on: () => void, opts: { active?: boolean; tone?: "dark" | "red"; hide?: boolean } = {}) => opts.hide ? null : (
    <button key={key} onClick={on} aria-pressed={opts.active} title={label}
      className={cx("t3-btn", opts.active && "on", opts.tone === "dark" && "dark", opts.tone === "red" && "red")}>{icon}<span>{label}</span></button>
  );

  const view = (
    <div className={cx("t3 fixed inset-0 z-[90] bg-[#0f1513]", A && "paused")} role="dialog" aria-modal="true" aria-label={tw("live3d")}>
      <div ref={el} className="absolute inset-0" />
      {(!ui || !ui.ready) && !ui?.error && (
        <div className="absolute inset-0 z-[3] grid place-items-center bg-[#0f1513]/70 text-white">
          <div className="flex flex-col items-center gap-3"><span className="t3-spin" /><span className="text-sm font-semibold">{tw("live3d")}…</span></div>
        </div>
      )}
      {ui?.error && (
        <div className="absolute inset-0 z-[3] grid place-items-center bg-[#0f1513] p-6 text-center text-white">
          <div><p className="max-w-sm text-sm">{tw("f_nogl")}</p><button className="btn-primary mt-4" onClick={onClose}>{tw("t_exit")}</button></div>
        </div>
      )}

      {/* HUD */}
      {hud && (
        <div className="t3-top" style={{ ["--lc" as string]: hud.colour }} aria-live="polite">
          <span className="mode">{hud.icon}</span>
          <div className="min-w-0"><b>{hud.title}</b><small>{hud.sub}</small></div>
        </div>
      )}

      {/* live GPS */}
      {ui?.live && (
        <div className={cx("t3-live", ui.live.off ? "off" : ui.live.status === "denied" ? "bad" : "")}>
          <span className="dot" />
          <div className="min-w-0 flex-1">
            {ui.live.status === "denied" ? <b>{tw("l_denied")}</b>
              : ui.live.status === "wait" ? <b>{tw("l_wait")}</b>
                : ui.live.off ? <b>{tw("l_off", { d: fmtKm(ui.live.off, lang) })}</b>
                  : <b>{tw("l_on")} · {tw("l_onRoute")}</b>}
            {ui.live.status === "ok" && <small>{[ui.live.acc ? tw("l_acc", { m: fmtKm(ui.live.acc, lang) }) : "", ui.live.kmh !== undefined ? tw("l_speed", { v: fmt(ui.live.kmh, lang, 1) }) : ""].filter(Boolean).join(" · ")}</small>}
          </div>
          {ui.live.off ? <button className="t3-chip-btn" onClick={() => E?.replanFromHere()}><Navigation2 size={14} /> {tw("l_replan")}</button> : null}
          <button className="t3-x" aria-label={tw("t_sim")} onClick={() => E?.stopLive()}><X size={15} /></button>
        </div>
      )}

      {/* stats */}
      {ui?.ready && tl && E && (
        <div className={cx("t3-stats", A && "hide-around")}>
          <div><small>{tw("t_remaining")}</small><b>{fmtDuration(tl.total - ui.pos, lang)}</b></div>
          <div><small>{tw("t_eta")}</small><b>{clock(E.etaAt(), lang)}</b></div>
          <div className="hide-xs"><small>{tw("t_clock")}</small><b>{clock(E.clockAt(), lang)}</b></div>
          {nextStop && nextArr < tl.arrive.length - 1 && (
            <div className="hide-xs max-w-[200px]"><small>{tw("t_nextIn")}</small><b className="truncate">{fmtKm(Math.max(0, arriveM[nextArr] - curM), lang)}</b><span className="truncate">{stops[nextStop.stop].name}</span></div>
          )}
          <div className="prog"><small>{tw("t_progress")} · {fmt(pct, lang, 0)}%</small><div className="bar"><i style={{ width: `${pct}%` }} /></div></div>
        </div>
      )}

      {/* controls */}
      {ui?.ready && E && (
        <div className="t3-ctrl">
          {ctrl("play", ui.playing ? <Pause size={20} /> : <Play size={20} />, ui.playing ? tw("t_pause") : A ? tw("t_resume") : tw("t_play"), () => E.toggle(), { active: ui.playing, hide: !!ui.live })}
          {ctrl("speed", <Gauge size={20} />, `${fmt(ui.speed, lang, 0)}×`, () => E.cycleSpeed(), { hide: !!ui.live })}
          {ctrl("live", <Radio size={20} />, ui.live ? tw("t_sim") : tw("t_live"), () => E.toggleLive(), { active: !!ui.live })}
          {ctrl("voice", ui.voice ? <Volume2 size={20} /> : <VolumeX size={20} />, ui.voice ? tw("t_voiceOn") : tw("t_voiceOff"), () => E.toggleVoice(), { active: ui.voice })}
          {ctrl("view", <Box size={20} />, ui.view3d ? tw("t_2d") : tw("t_3d"), () => E.toggleView())}
          {ctrl("base", <Layers size={20} />, tw(ui.base === "sat" ? "b_streets" : ui.base === "streets" ? "b_delta" : "b_sat"), () => E.cycleBase())}
          {ctrl("follow", <LocateFixed size={20} />, tw("t_follow"), () => E.followNow(), { hide: ui.follow || !!A })}
          {ctrl("sos", <Siren size={20} />, "SOS", () => { E.hold(true); setSos(true); }, { tone: "red" })}
          {ctrl("exit", <X size={20} />, tw("t_exit"), onClose, { tone: "dark" })}
        </div>
      )}

      {/* arrival card */}
      {card && tl && (
        <div className="t3-stop" role="status">
          <span className="ph" style={{ background: card.final ? MODE_COLOUR.done : card.stop === 0 ? "#123D32" : "#eb6834" }}>
            {card.final ? <Flag size={26} /> : card.stop === 0 ? <House size={26} /> : <b className="text-xl">{fmt(card.stop, lang, 0)}</b>}</span>
          <div className="bd">
            {card.final ? (
              <>
                <small>{clock(tl.start + tl.total * 60000, lang)}</small>
                <h4>{tw("t_done")} — {stops[card.stop].name}</h4>
                <p>{tw("t_doneSub", { dur: fmtDuration(plan.totals.min, lang), km: fmtKm(plan.totals.km * 1000, lang), n: fmt(stops.length - (stops[lastStop].id.endsWith("-back") ? 1 : 0), lang, 0) })}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn-primary px-3 py-1.5 text-xs" onClick={onReport}><FileText size={14} /> {tw("t_report")}</button>
                  <button className="btn-outline px-3 py-1.5 text-xs" onClick={() => E?.play()}><Play size={14} /> {tw("t_play")}</button>
                  <button className="btn-outline px-3 py-1.5 text-xs" onClick={onClose}>{tw("t_exit")}</button>
                </div>
              </>
            ) : (() => {
              const a = tl.arrive.find((x) => x.stop === card.stop)!;
              const stay = Math.round(a.leave - a.t);
              const h = plan.hops.find((x) => x.from === card.stop);
              const l0 = h?.legs[0];
              return (
                <>
                  <small>{clock(tl.start + a.t * 60000, lang)}</small>
                  <h4>{tw("t_arrived", { name: stops[card.stop].name })}</h4>
                  {stay > 0 && <p>{tw("t_stayFor", { m: fmtDuration(stay, lang), t: clock(tl.start + a.leave * 60000, lang) })}</p>}
                  {h && l0 && <p className="text-muted">{tw("t_nextHop", { how: l0.mode === "boat" ? vesselName(plan.settings.vessel, lang) : tw("s_walk"), to: stops[h.to].name })} · {tideName(h.tide, lang)}</p>}
                  {!ui?.live && <button className="btn-primary mt-2 px-3 py-1.5 text-xs" onClick={() => E?.continueTrip()}><Play size={14} /> {tw("t_continue")}</button>}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* the trip strip: scrub to any moment */}
      {ui?.ready && tl && E && !A && (
        <TripStrip tl={tl} pos={ui.pos} onSeek={(t) => E.seek(t)} disabled={!!ui.live} plan={plan} />
      )}

      {/* paused: what is around */}
      {A && E && (
        <div className="t3-near" role="region" aria-label={tw("a_title", { r: fmtKm(A.r, lang) })}>
          <div className="nr-head">
            <span className="pulse-dot" />
            <div className="min-w-0 flex-1">
              <b>{tw("a_title", { r: fmtKm(A.r, lang) })}</b>
              <small>{tw("a_paused", { t: clock(E.clockAt(A.t), lang) })}</small>
              <small className="hint">{tw("a_hint")}</small>
            </div>
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => E.resume()}><Play size={14} /> {tw("t_resume")}</button>
          </div>
          <label className="nr-search"><Search size={16} /><input type="search" value={A.q} placeholder={tw("a_search")} onChange={(e) => E.setNearQuery(e.target.value)} aria-label={tw("a_search")} /></label>
          <div className="nr-chips">
            {GROUPS.map((g) => {
              const n = A.items.filter((x) => x.group === g).length;
              return <button key={g} className={cx(!A.q.trim() && A.group === g && "on", g === "help" && "help")} onClick={() => E.setNearGroup(g)}>
                {g === "help" && <Siren size={13} />}{lang === "bn" ? GROUP_STYLE[g].bn : GROUP_STYLE[g].en}{A.loaded && <small>{fmt(n, lang, 0)}</small>}</button>;
            })}
          </div>
          {selItem && (
            <div className="nr-sel" style={{ ["--c" as string]: GROUP_STYLE[selItem.group].color }}>
              <span className="ic"><Ico name={iconFor(selItem)} /></span>
              <div className="min-w-0"><b>{selItem.name}</b><small>{selItem.sub} · {fmtKm(selItem.d, lang)}</small>
                {A.going && A.going.i === selItem.i && !A.going.busy && <small className="eta"><Footprints size={13} /> {tw("a_goWalk", { m: fmtDuration(A.going.min || 0, lang), d: fmtKm(A.going.m || 0, lang) })}</small>}</div>
              <button className="btn-primary px-3 py-1.5 text-xs" disabled={!!A.going?.busy} onClick={() => E.goNear(selItem.i)}><Navigation2 size={14} /> {tw("a_go")}</button>
            </div>
          )}
          <div className="nr-list scroll-thin">
            {!A.loaded ? <div className="nr-empty">{tw("a_looking")}</div>
              : list.length ? list.slice(0, 100).map((x) => (
                <button key={x.i} className={cx("nr-row", A.sel === x.i && "on")} onClick={() => E.selectNear(x.i)}>
                  <span className="ic" style={{ ["--c" as string]: GROUP_STYLE[x.group].color }}><Ico name={iconFor(x)} size={16} /></span>
                  <span className="tx"><b>{x.name}</b><small>{x.sub}</small></span>
                  <span className="d">{fmtKm(x.d, lang)}</span>
                </button>))
                : <div className="nr-empty">{tw("a_none", { r: fmtKm(A.r, lang) })}</div>}
          </div>
        </div>
      )}

      {sos && <SosSheet here={ui?.live?.here || (tl && ui ? (() => { const p = at(tl.pts, ui.pos); return [p.lon, p.lat] as LL; })() : null)} onClose={() => { setSos(false); E?.hold(false); }}
        onShow={() => { setSos(false); E?.hold(false); if (E && !E.ui.around) { if (E.ui.live) E.stopLive(); E.pause(); } }} tw={tw} />}
    </div>
  );
  return createPortal(view, document.body);
}

/* ------------------------------------------------------------------ trip strip */
function TripStrip({ tl, pos, onSeek, disabled, plan }: { tl: NonNullable<TripEngine["tl"]>; pos: number; onSeek: (t: number) => void; disabled: boolean; plan: TripPlan }) {
  const { lang } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const toT = (x: number) => { const r = ref.current!.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)) * tl.total; };
  const col = { boat: MODE_COLOUR.boat, walk: MODE_COLOUR.walk, change: MODE_COLOUR.change, stay: MODE_COLOUR.stay };
  const ticks: number[] = [];
  const [w, setW] = useState(800);
  useEffect(() => { const on = () => setW(ref.current?.clientWidth || 800); on(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  const maxLabels = Math.max(2, Math.floor(w / (lang === "bn" ? 92 : 72)));
  const stepH = [1, 2, 3, 4, 6, 12].find((h) => tl.total / 60 / h <= maxLabels) || 12;
  const h0 = Math.ceil(tl.start / (stepH * 3600e3)) * stepH * 3600e3;
  for (let t = h0; t < tl.start + tl.total * 60000; t += stepH * 3600e3) ticks.push((t - tl.start) / 60000);
  return (
    <div className="t3-strip">
      <div ref={ref} className={cx("track", disabled && "off")}
        onPointerDown={(e) => { if (disabled) return; drag.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onSeek(toT(e.clientX)); }}
        onPointerMove={(e) => { if (drag.current && !disabled) onSeek(toT(e.clientX)); }}
        onPointerUp={() => { drag.current = false; }} role="slider" aria-valuemin={0} aria-valuemax={Math.round(tl.total)} aria-valuenow={Math.round(pos)}
        aria-label="Trip" tabIndex={0}
        onKeyDown={(e) => { if (disabled) return; if (e.key === "ArrowRight") onSeek(Math.min(tl.total, pos + 5)); if (e.key === "ArrowLeft") onSeek(Math.max(0, pos - 5)); }}>
        {tl.segs.map((s, k) => (
          <i key={k} className={cx("seg", s.kind)} style={{ left: `${(100 * s.t0) / tl.total}%`, width: `${(100 * (s.t1 - s.t0)) / tl.total}%`, background: col[s.kind] }} />
        ))}
        {ticks.map((t) => <span key={t} className="tick" style={{ left: `${(100 * t) / tl.total}%` }}>{clock(tl.start + t * 60000, lang)}</span>)}
        {[{ t: 0, stop: 0 }, ...tl.arrive].map((a, k) => {
          const last = k === tl.arrive.length;
          const back = last && plan.stops[a.stop].id.endsWith("-back");
          return <span key={k} className={cx("stop", k === 0 && "first", last && "last")} style={{ left: `${(100 * a.t) / tl.total}%` }} title={plan.stops[a.stop].name}>
            {k === 0 || back ? "⌂" : last ? "⚑" : fmt(a.stop, lang, 0)}</span>;
        })}
        <span className="knob" style={{ left: `${(100 * pos) / tl.total}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ help numbers */
function SosSheet({ here, onClose, onShow, tw }: { here: LL | null; onClose: () => void; onShow: () => void; tw: (k: TripWord, p?: Record<string, string | number>) => string }) {
  const { lang } = useApp();
  const [near, setNear] = useState<{ name: string; sub: string; d: number; lon: number; lat: number }[] | null>(null);
  useEffect(() => {
    if (!here) { setNear([]); return; }
    nearestOf(here, ["health", "emergency", "shelter"], 4).then((xs) => setNear(xs.map(({ s, d }) => ({ name: s.name || (s.category || ""), sub: (s.amenity || s.category || "").replace(/_/g, " "), d, lon: s.lon, lat: s.lat }))));
  }, [here]);
  return (
    <div className="t3-sheet" onClick={onClose}>
      <div className="box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tw("sosTitle")}>
        <div className="flex items-center gap-2"><Siren size={20} className="text-[#e34948]" /><b className="flex-1 text-base">{tw("sosTitle")}</b>
          <button className="icon-btn h-8 w-8" onClick={onClose} aria-label={tw("t_exit")}><X size={16} /></button></div>
        <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SOS_NUMBERS.map((n) => (
            <a key={n} href={`tel:${n}`} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 hover:bg-sunken">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#e34948] text-white"><Phone size={15} /></span>
              <span className="min-w-0 flex-1"><b className="block text-[15px] tabular-nums">{n}</b><small className="block truncate text-2xs text-muted">{tw(`n${n}` as TripWord)}</small></span>
            </a>
          ))}
        </div>
        <p className="section-title mt-4">{tw("sosNear")}</p>
        <ul className="mt-1.5 space-y-1">
          {near === null ? <li className="text-xs text-muted">…</li> : near.map((x, k) => (
            <li key={k} className="flex items-center gap-2 rounded-lg bg-sunken px-2.5 py-1.5 text-sm">
              <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: GROUP_STYLE.help.color }}><Ico name="health" size={15} /></span>
              <span className="min-w-0 flex-1"><b className="block truncate text-[13px]">{x.name}</b><small className="block truncate text-2xs text-muted">{x.sub}</small></span>
              <span className="text-xs font-semibold tabular-nums">{fmtKm(here ? metres(here, [x.lon, x.lat]) : x.d, lang)}</span>
            </li>
          ))}
        </ul>
        <button className="btn-outline mt-3 w-full py-2 text-sm" onClick={onShow}><Siren size={15} /> {tw("a_show")}</button>
      </div>
    </div>
  );
}
