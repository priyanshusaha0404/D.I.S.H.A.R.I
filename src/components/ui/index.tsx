"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Info, Loader2, X } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useDismiss } from "@/hooks/useDismiss";

export function cx(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ brand */
export function LogoMark({ size = 34 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/logo.png" width={size} height={size} alt="" aria-hidden="true" className="shrink-0 rounded-full bg-white" style={{ width: size, height: size }} />;
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={cx("font-extrabold tracking-[0.06em] text-ink", className)} aria-label="D.I.S.H.A.R.I">
      D.I.S.H.A.<span className="text-warn">R</span>.I
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useApp();
  return (
    <div className="flex items-center gap-2 p-3 text-sm text-muted" role="status">
      <Loader2 size={16} className="animate-spin" aria-hidden="true" /> {label || t("common.loading")}
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line p-5 text-center">
      {icon || <Info size={18} className="text-faint" aria-hidden="true" />}
      <p className="text-sm font-semibold">{title}</p>
      {children && <div className="text-xs text-muted">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: { message: string } | null; onRetry?: () => void }) {
  const { t } = useApp();
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-risk/30 bg-risk/5 p-3 text-sm" role="alert">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-risk" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-semibold">{t("common.error")}</p>
        <p className="text-xs text-muted">{error.message}</p>
      </div>
      {onRetry && <button className="btn-outline px-2 py-1 text-xs" onClick={onRetry}>{t("common.retry")}</button>}
    </div>
  );
}

/* ------------------------------------------------------------------ popover (click to open, outside click / Esc closes) */
export function Popover({ trigger, children, align = "left", className = "" }: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode;
  align?: "left" | "right" | "up"; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={cx("panel absolute z-50 min-w-[14rem] p-1.5",
          align === "right" ? "right-0 mt-2" : align === "up" ? "bottom-full right-0 mb-2" : "left-0 mt-2", className)}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ tabs, segmented, toggle */
export function Tabs<T extends string>({ tabs, value, onChange, className = "" }: {
  tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void; className?: string;
}) {
  return (
    <div role="tablist" className={cx("flex gap-1 overflow-x-auto scroll-thin", className)}>
      {tabs.map((tb) => (
        <button key={tb.key} role="tab" aria-selected={value === tb.key} onClick={() => onChange(tb.key)}
          className={cx("whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
            value === tb.key ? "bg-accent text-on-accent" : "text-muted hover:bg-sunken hover:text-ink")}>
          {tb.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { key: T; label: string }[]; value: T; onChange: (k: T) => void; label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-xl border border-line bg-sunken p-0.5">
      {options.map((o) => (
        <button key={o.key} role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)}
          className={cx("flex-1 rounded-[10px] px-2 py-1.5 text-xs font-semibold transition-colors",
            value === o.key ? "bg-raised text-ink shadow-float" : "text-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (b: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40",
        checked ? "bg-mangrove" : "bg-line")}>
      <span className={cx("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="section-title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Kv({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl>
      {items.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => (
        <div key={k} className="kv"><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

/** Horizontal stacked bar of zone counts with a legend. */
export function ZoneBar({ counts, colours, labels }: { counts: Record<string, number>; colours: Record<string, string>; labels?: Record<string, string> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return <p className="text-xs text-faint">—</p>;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-sunken">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} style={{ width: `${(v / total) * 100}%`, background: colours[k] || "#999" }} title={`${labels?.[k] || k}: ${v}`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted">
        {Object.entries(counts).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-sm" style={{ background: colours[k] || "#999" }} />
            {labels?.[k] || k} <b className="text-ink">{v}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Collapsible section — closed by default (UI rule: panels open only on click). */
export function Disclosure({ title, children, defaultOpen = false, badge, icon }: {
  title: string; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode; icon?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line bg-raised">
      <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {icon}
        <span className="flex-1 text-[13px] font-semibold">{title}</span>
        {badge}
        <ChevronDown size={15} className={cx("text-faint transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && <div className="space-y-2 border-t border-line px-3 pb-3 pt-2.5">{children}</div>}
    </div>
  );
}

export const PROTECTION_COLOURS: Record<number, string> = { 1: "#8FB59C", 2: "#D98A37", 3: "#C84B43" };

/** Native select with the field style. */
export function Select<T extends string>({ value, onChange, options, label, className = "" }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; group?: string }[]; label?: string; className?: string;
}) {
  const groups = Array.from(new Set(options.map((o) => o.group || "")));
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className={cx("field py-1.5 pr-8", className)}>
      {groups.map((g) => g ? (
        <optgroup key={g} label={g}>{options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
      ) : options.filter((o) => !o.group).map((o) => <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

/** Key figure tile. */
export function Stat({ label, value, sub, icon, accent }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-raised p-3.5">
      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">
        {icon && <span style={accent ? { color: accent } : undefined}>{icon}</span>}{label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Centered dialog with backdrop; Esc and backdrop click close it. */
export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={cx("panel max-h-[92vh] w-full overflow-hidden rounded-b-none sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-md")}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="flex-1 text-sm font-bold">{title}</h2>
          <button className="icon-btn h-8 w-8" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="scroll-thin max-h-[calc(92vh-52px)] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** Colour legend: classes or a continuous ramp. */
export function Legend({ items, ramp, min, max, unit }: {
  items?: { colour: string; label: string; outline?: boolean; line?: boolean; dot?: boolean }[]; ramp?: string[]; min?: string; max?: string; unit?: string;
}) {
  if (ramp) return (
    <div>
      <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(90deg, ${ramp.join(",")})` }} />
      <div className="mt-1 flex justify-between text-2xs tabular-nums text-muted"><span>{min}</span>{unit && <span>{unit}</span>}<span>{max}</span></div>
    </div>
  );
  return (
    <ul className="space-y-1">
      {(items || []).map((it, k) => (
        <li key={k} className="flex items-center gap-2 text-xs">
          {it.line ? <i className="inline-block h-[3px] w-3.5 shrink-0 rounded-full" style={{ background: it.colour }} />
            : it.dot ? <i className="mx-[3px] inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: it.colour }} />
            : <i className="inline-block h-3 w-3.5 shrink-0 rounded-[3px]" style={it.outline ? { border: `2px solid ${it.colour}` } : { background: it.colour }} />}
          <span className="text-ink">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}
