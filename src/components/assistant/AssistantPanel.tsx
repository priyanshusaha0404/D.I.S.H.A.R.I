"use client";
/** The assistant's chat window: a clean chat with the tiger, rich answers (facts, lists, charts, files), buttons that act
 *  on the site, suggestions, photos (gallery or camera), voice input and read-aloud. */
import { Fragment, useEffect, useRef, useState } from "react";
import { BarChart3, Camera, Check, ChevronDown, CircleAlert, CircleHelp, CloudSun, Expand, FileDown, FileText, ImagePlus, LoaderCircle, Map as MapIcon, MapPin,
  Mic, MicOff, SendHorizontal, Ship, Shrink, Sparkles, Target, Trash2, Volume2, VolumeX, X } from "@/components/icons";
import { cx } from "@/components/ui";
import { AGENTS, isOut, type Env } from "@/lib/assistant/agents";
import { ask, postOut, speakMsg } from "@/lib/assistant/run";
import { clearChat, openAssistant, setExpanded, setVoice, takeQueue, useAssistant, type Action, type AgentId, type Img, type Msg, type Part, type Step } from "@/lib/assistant/store";
import { Tiger } from "./Tiger";
import { stopVoice, voiceOk } from "@/lib/trip/voice";
import { setMapInset } from "@/lib/map/store";
import type { Lang } from "@/lib/i18n";

const ICON: Record<string, typeof MapIcon> = { spark: Sparkles, map: MapIcon, pin: MapPin, boat: Ship, file: FileText, target: Target, chart: BarChart3, cloud: CloudSun, help: CircleHelp };
const tx = (lang: Lang) => (en: string, bn: string) => (lang === "bn" ? bn : en);

function Avatar({ id, size = 22, ring = false }: { id: AgentId; size?: number; ring?: boolean }) {
  const a = AGENTS[id];
  const I = ICON[a.icon] || Sparkles;
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-full text-white", ring && "ring-2 ring-raised")} style={{ background: a.colour, width: size, height: size }} title={a.en}>
      <I size={Math.round(size * 0.55)} aria-hidden="true" />
    </span>
  );
}

/** **bold** and line breaks */
function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  return <>{lines.map((ln, i) => (
    <Fragment key={i}>{ln.split(/(\*\*[^*]+\*\*)/g).map((s, k) => (s.startsWith("**") && s.endsWith("**") ? <strong key={k} className="font-semibold">{s.slice(2, -2)}</strong> : <Fragment key={k}>{s}</Fragment>))}
      {i < lines.length - 1 && <br />}</Fragment>))}</>;
}

function ActBtn({ a, small = false, lang }: { a: Action; small?: boolean; lang: Lang }) {
  const [state, setStateL] = useState<"idle" | "run" | "ok">("idle");
  const cls = cx(small ? "rounded-lg px-2 py-1 text-2xs font-semibold" : "rounded-xl px-3 py-1.5 text-xs font-semibold", "inline-flex items-center gap-1 transition-colors disabled:opacity-60",
    a.primary ? "bg-accent text-on-accent hover:opacity-90" : "border border-line bg-raised hover:bg-sunken");
  if (a.href && a.href.startsWith("tel:")) return <a href={a.href} className={cls}>{a.label}</a>;
  return (
    <button className={cls} disabled={state === "run"} onClick={async () => {
      setStateL("run");
      try { const r = await a.run(); if (isOut(r)) postOut(a.label, r, lang); setStateL("ok"); setTimeout(() => setStateL("idle"), 1600); } catch (e) { console.error(e); setStateL("idle"); }
    }}>
      {state === "run" ? <LoaderCircle size={12} className="animate-spin" /> : state === "ok" ? <Check size={12} /> : null}{a.label}
    </button>
  );
}

function PartView({ p, lang }: { p: Part; lang: Lang }) {
  switch (p.k) {
    case "text": return <p className="text-[13.5px] leading-relaxed"><Rich text={p.text} /></p>;
    case "note": return <p className="break-words text-2xs leading-relaxed text-muted"><Rich text={p.text} /></p>;
    case "facts": return (
      <div className="rounded-xl border border-line bg-sunken/50 px-3 py-1">
        {p.title && <p className="section-title pb-0.5 pt-1.5">{p.title}</p>}
        <dl>{p.rows.map(([k, v], i) => <div key={i} className="kv !py-1 text-[12.5px]"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </div>);
    case "list": return (
      <div className="space-y-1">
        {p.title && <p className="section-title pt-0.5">{p.title}</p>}
        <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line bg-raised">
          {p.items.map((it, i) => (
            <li key={i} className="flex items-center gap-2.5 px-2.5 py-2">
              {it.colour && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.colour }} aria-hidden="true" />}
              <div className="min-w-0 flex-1"><p className="truncate text-[12.5px] font-semibold">{it.title}</p>{it.sub && <p className="line-clamp-2 text-2xs text-muted">{it.sub}</p>}</div>
              {it.right && <span className="shrink-0 text-2xs font-semibold tabular-nums text-muted">{it.right}</span>}
              {it.act && <ActBtn a={it.act} small lang={lang} />}
            </li>))}
        </ul>
      </div>);
    case "bars": {
      const max = Math.max(...p.items.map((x) => Math.abs(x.value)), 1e-9);
      return (
        <figure className="rounded-xl border border-line bg-raised p-3">
          <figcaption className="mb-2 text-xs font-semibold">{p.title}</figcaption>
          <ol className="space-y-1.5">
            {p.items.map((x, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-2xs">
                <span className="truncate text-muted" title={x.label}>{x.label}</span>
                <span className="h-2.5 rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${Math.max(2, (Math.abs(x.value) / max) * 100)}%`, background: p.colour || "#2a78d6" }} /></span>
                <span className="font-semibold tabular-nums">{x.display}</span>
              </li>))}
          </ol>
        </figure>);
    }
    case "steps": return (
      <ol className="space-y-1.5">{p.items.map((s, i) => (
        <li key={i} className="flex gap-2 text-[12.5px] leading-snug"><span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-2xs font-bold text-on-accent">{lang === "bn" ? "০১২৩৪৫৬৭৮৯"[i + 1] || i + 1 : i + 1}</span><span>{s}</span></li>))}
      </ol>);
    case "kpis": return (
      <div className={cx("grid gap-1.5", p.items.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {p.items.map((k, i) => <div key={i} className="min-w-0 rounded-xl border border-line bg-raised px-2.5 py-1.5"><div className="truncate text-2xs text-muted">{k.label}</div><div className="text-sm font-bold leading-snug tabular-nums">{k.value}</div>{k.sub && <div className="text-2xs text-faint">{k.sub}</div>}</div>)}
      </div>);
    case "file": return (
      <div className="flex items-center gap-2.5 rounded-xl border border-ok/30 bg-ok/[0.06] px-3 py-2">
        <FileDown size={18} className="shrink-0 text-ok" />
        <div className="min-w-0 flex-1"><p className="truncate text-[12.5px] font-semibold">{p.name}</p><p className="text-2xs text-muted">{p.format} · {lang === "bn" ? "ডাউনলোড হয়েছে" : "downloaded"}</p></div>
        <Check size={16} className="shrink-0 text-ok" />
      </div>);
  }
}

function Trace({ steps, done, lang }: { steps: Step[]; done: boolean; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const l = tx(lang);
  const show = !done || open;
  if (done && !steps.some((s) => s.status === "fail")) return null;   // a clean chat: the steps show only while working
  const agents = [...new Set(steps.map((s) => s.agent))];
  return (
    <div className="mb-2">
      {done && (
        <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left" aria-expanded={open}>
          <span className="flex -space-x-1.5">{agents.slice(0, 5).map((a) => <Avatar key={a} id={a} size={18} ring />)}</span>
          <span className="min-w-0 flex-1 truncate text-2xs text-muted">{(() => {
            const workers = agents.filter((a) => a !== "router" && a !== "ai");
            if (steps.some((s) => s.status === "fail")) return l("Could not finish everything", "সব শেষ করা যায়নি");
            if (steps.some((s) => s.status === "ask")) return l("Needs one more detail", "আর একটি তথ্য দরকার");
            if (!workers.length) return agents.includes("ai") ? l("Answered by your AI model", "আপনার এআই মডেলের উত্তর") : l("Answered", "উত্তর");
            return workers.map((a) => (lang === "bn" ? AGENTS[a].bn : AGENTS[a].en)).join(" → ");
          })()}</span>
          <ChevronDown size={13} className={cx("shrink-0 text-faint transition-transform", open && "rotate-180")} />
        </button>
      )}
      {show && (
        <ol className={cx("space-y-1", done && "mt-1.5 border-l border-line pl-2.5")}>
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-2xs">
              <Avatar id={s.agent} size={18} />
              <span className="font-semibold" style={{ color: AGENTS[s.agent].colour }}>{lang === "bn" ? AGENTS[s.agent].bn : AGENTS[s.agent].en}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{s.text}</span>
              {s.status === "run" ? <LoaderCircle size={13} className="shrink-0 animate-spin text-water" /> : s.status === "ok" ? <Check size={13} className="shrink-0 text-ok" />
                : s.status === "ask" ? <CircleHelp size={13} className="shrink-0 text-warn" /> : <CircleAlert size={13} className="shrink-0 text-risk" />}
            </li>))}
        </ol>
      )}
    </div>
  );
}

function MessageView({ m, last, busy, env }: { m: Msg; last: boolean; busy: boolean; env: Env }) {
  const l = tx(m.lang);
  if (m.role === "user") return (
    <div className="flex flex-col items-end gap-1">
      {!!m.images?.length && <div className="flex max-w-[85%] flex-wrap justify-end gap-1">{m.images.map((u, i) => <img key={i} src={u} alt="" className="h-24 w-24 rounded-xl border border-line object-cover" />)}</div>}
      {m.text && <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent px-3 py-2 text-[13.5px] text-on-accent">{m.text}</p>}
    </div>
  );
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 shrink-0"><Tiger size={30} /></span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line bg-raised px-3 py-2.5 shadow-float" lang={m.lang}>
        <Trace steps={m.steps} done={m.done} lang={m.lang} />
        <div className="space-y-2">{m.parts.map((p, i) => <PartView key={i} p={p} lang={m.lang} />)}</div>
        {!m.done && !m.parts.length && <p className="flex items-center gap-1.5 text-2xs text-muted"><LoaderCircle size={12} className="animate-spin" /> {l("Working…", "কাজ চলছে…")}</p>}
        {m.actions.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{m.actions.map((a, i) => <ActBtn key={i} a={a} lang={m.lang} />)}</div>}
        {m.done && (m.parts.length > 0) && voiceOk() && (
          <div className="mt-1.5 flex justify-end"><button className="rounded-md p-1 text-faint hover:bg-sunken hover:text-ink" onClick={() => speakMsg(m)} aria-label={l("Read aloud", "পড়ে শোনাও")} title={l("Read aloud", "পড়ে শোনাও")}><Volume2 size={13} /></button></div>
        )}
        {last && m.done && !busy && m.chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">{m.chips.map((c, i) => (
            <button key={i} onClick={() => ask(c.send, env)} className="rounded-full border border-water/40 bg-water/[0.06] px-2.5 py-1 text-2xs font-semibold text-water hover:bg-water/15">{c.label}</button>))}
          </div>
        )}
      </div>
    </div>
  );
}

function Welcome({ env }: { env: Env }) {
  const l = tx(env.lang);
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 shrink-0"><Tiger size={30} /></span>
      <div className="rounded-2xl rounded-tl-md border border-line bg-raised px-3 py-2.5 text-[13.5px] leading-relaxed shadow-float">
        <p className="font-semibold">{l("Namaskar! 🐯", "নমস্কার! 🐯")}</p>
        <p className="mt-0.5">{l("I'm your D.I.S.H.A.R.I guide for the Sundarbans. Ask me anything — in English, বাংলা or Banglish — or send me a photo.",
          "আমি সুন্দরবনের D.I.S.H.A.R.I সহায়ক। যা খুশি জিজ্ঞেস করুন — বাংলা, ইংরেজি বা বাংলিশে — বা একটা ছবি পাঠান।")}</p>
      </div>
    </div>
  );
}

/** make a photo small enough to send (longest side 1280 px, JPEG) */
async function shrink(file: File): Promise<Img | null> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = url; });
    const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const du = c.toDataURL("image/jpeg", 0.82);
    return { mime: "image/jpeg", data: du.split(",")[1], url: du };
  } catch { return null; }
}

/* ------------------------------------------------------------------ voice input */
type Rec = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const SR = () => (typeof window === "undefined" ? null : ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition
  || (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition || null));

export default function AssistantPanel({ env }: { env: Env }) {
  const open = useAssistant((s) => s.open);
  const msgs = useAssistant((s) => s.msgs);
  const busy = useAssistant((s) => s.busy);
  const voice = useAssistant((s) => s.voice);
  const expanded = useAssistant((s) => s.expanded);
  const queue = useAssistant((s) => s.queue);
  const [draft, setDraft] = useState("");
  const [imgs, setImgs] = useState<Img[]>([]);
  const [roar, setRoar] = useState(0);
  const galRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Rec | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const l = tx(env.lang);
  const canListen = !!SR();

  const send = (t?: string) => { const s = (t ?? draft).trim(); if ((!s && !imgs.length) || busy) return; const im = imgs; setDraft(""); setImgs([]); ask(s, env, im); };
  const addFiles = async (fl: FileList | null) => {
    if (!fl) return;
    const out: Img[] = [];
    for (const f of Array.from(fl).slice(0, 4)) if (f.type.startsWith("image/")) { const x = await shrink(f); if (x) out.push(x); }
    setImgs((p) => [...p, ...out].slice(0, 4));
    inputRef.current?.focus();
  };
  useEffect(() => { if (open) setRoar((r) => r + 1); }, [open]);
  useEffect(() => { if (queue) { const q = takeQueue(); if (q) ask(q, env); } }, [queue, env]);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60); }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".t3")) openAssistant(false); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open]);
  useEffect(() => { const el = inputRef.current; if (el) { el.style.height = "auto"; el.style.height = `${Math.min(140, el.scrollHeight)}px`; } }, [draft]);
  // tell the map how much of the screen the chat covers, so places are framed beside it, not under it
  useEffect(() => {
    const upd = () => {
      const small = window.matchMedia("(max-width: 767px)").matches;
      if (!open) setMapInset({ right: 0, bottom: 0 });
      else if (small) setMapInset({ right: 0, bottom: expanded ? 0 : Math.round(window.innerHeight * 0.66) });
      else setMapInset({ right: (expanded ? Math.min(760, window.innerWidth - 24) : 420) + 12, bottom: 0 });
    };
    upd();
    window.addEventListener("resize", upd);
    return () => { window.removeEventListener("resize", upd); setMapInset({ right: 0, bottom: 0 }); };
  }, [open, expanded]);

  const listen = () => {
    const C = SR();
    if (!C) return;
    if (listening) { recRef.current?.stop(); return; }
    const r = new C();
    r.lang = env.lang === "bn" ? "bn-IN" : "en-IN";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) { s += e.results[i][0].transcript; if (e.results[i].isFinal) finalText = s; }
      setDraft(s);
    };
    r.onend = () => { setListening(false); recRef.current = null; if (finalText.trim()) send(finalText); };
    r.onerror = () => { setListening(false); recRef.current = null; };
    recRef.current = r;
    stopVoice();
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  return (
    <>
      <aside role="dialog" aria-label={l("D.I.S.H.A.R.I assistant", "D.I.S.H.A.R.I সহায়ক")} aria-hidden={!open}
        className={cx("assistant panel fixed z-[60] flex flex-col overflow-hidden transition-[opacity,transform] duration-200 ease-soft print:hidden",
          "inset-x-0 bottom-0 rounded-b-none md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:rounded-2xl",
          expanded ? "top-0 rounded-t-none md:w-[min(760px,calc(100vw-24px))] md:rounded-t-2xl" : "top-[34dvh] md:w-[420px]",
          open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0")}>
        <header className="flex items-center gap-2 border-b border-line bg-raised/95 px-3 py-2.5">
          <button className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-orange-400 bg-orange-50" onClick={() => { setRoar((r) => r + 1); }}
            aria-label={l("Roar", "গর্জন")} title={l("Roar!", "গর্জন!")}><Tiger size={40} roar={roar} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight">D.I.S.H.A.R.I</p>
            <p className="flex items-center gap-1 truncate text-2xs text-muted"><span className="h-1.5 w-1.5 rounded-full bg-ok" />{busy ? l("Working…", "কাজ করছি…") : l("Online · ask me anything", "অনলাইন · যা খুশি জিজ্ঞেস করুন")}</p>
          </div>
          {voiceOk() && <button className="icon-btn h-8 w-8" onClick={() => { setVoice(!voice); if (voice) stopVoice(); }} aria-pressed={voice} aria-label={l("Read answers aloud", "উত্তর পড়ে শোনাও")} title={l("Read answers aloud", "উত্তর পড়ে শোনাও")}>{voice ? <Volume2 size={16} className="text-water" /> : <VolumeX size={16} />}</button>}
          {msgs.length > 0 && <button className="icon-btn h-8 w-8" onClick={() => { stopVoice(); clearChat(); }} disabled={busy} aria-label={l("New chat", "নতুন কথোপকথন")} title={l("New chat", "নতুন কথোপকথন")}><Trash2 size={16} /></button>}
          <button className="icon-btn h-8 w-8" onClick={() => setExpanded(!expanded)} aria-label={expanded ? l("Smaller", "ছোট") : l("Larger", "বড়")} title={expanded ? l("Smaller", "ছোট") : l("Larger", "বড়")}>{expanded ? <Shrink size={16} /> : <Expand size={16} />}</button>
          <button className="icon-btn h-8 w-8" onClick={() => openAssistant(false)} aria-label={l("Close", "বন্ধ")}><X size={18} /></button>
        </header>
        <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3" aria-live="polite">
          {msgs.length === 0 ? <Welcome env={env} /> : msgs.map((m, i) => <MessageView key={m.id} m={m} last={i === msgs.length - 1} busy={busy} env={env} />)}
        </div>
        <form className="border-t border-line bg-raised/95 p-2.5" onSubmit={(e) => { e.preventDefault(); send(); }}
          onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void addFiles(e.clipboardData.files); } }}>
          <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          {imgs.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">{imgs.map((im, i) => (
              <span key={i} className="relative"><img src={im.url} alt="" className="h-14 w-14 rounded-lg border border-line object-cover" />
                <button type="button" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-raised" onClick={() => setImgs((p) => p.filter((_, k) => k !== i))} aria-label={l("Remove photo", "ছবি সরান")}><X size={11} /></button></span>))}
            </div>)}
          <div className={cx("flex items-end gap-1.5 rounded-2xl border bg-raised p-1.5 transition-colors", listening ? "border-risk/60" : "border-line focus-within:border-water")}>
            <button type="button" onClick={() => galRef.current?.click()} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunken hover:text-ink" aria-label={l("Add photos", "ছবি যোগ করুন")} title={l("Add photos", "ছবি যোগ করুন")}><ImagePlus size={17} /></button>
            <button type="button" onClick={() => camRef.current?.click()} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunken hover:text-ink" aria-label={l("Take a photo", "ছবি তুলুন")} title={l("Take a photo", "ছবি তুলুন")}><Camera size={17} /></button>
            <textarea ref={inputRef} rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={600}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              placeholder={listening ? l("Listening…", "শুনছি…") : l("Ask anything…", "যা খুশি জিজ্ঞেস করুন…")}
              aria-label={l("Message", "বার্তা")} className="scroll-thin max-h-[140px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] text-ink placeholder:text-faint focus:outline-none" />
            {canListen && (
              <button type="button" onClick={listen} className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors", listening ? "animate-pulse bg-risk text-white" : "text-muted hover:bg-sunken hover:text-ink")}
                aria-pressed={listening} aria-label={listening ? l("Stop listening", "শোনা বন্ধ") : l("Speak", "বলুন")} title={listening ? l("Stop listening", "শোনা বন্ধ") : l(`Speak (${env.lang === "bn" ? "Bengali" : "English"})`, `বলুন (${env.lang === "bn" ? "বাংলা" : "ইংরেজি"})`)}>
                {listening ? <MicOff size={17} /> : <Mic size={17} />}
              </button>)}
            <button type="submit" disabled={busy || (!draft.trim() && !imgs.length)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent transition-opacity disabled:opacity-40" aria-label={l("Send", "পাঠান")}>
              {busy ? <LoaderCircle size={17} className="animate-spin" /> : <SendHorizontal size={17} />}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

