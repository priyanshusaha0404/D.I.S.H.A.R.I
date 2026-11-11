"use client";
import { useEffect, type ReactNode } from "react";
import { Info } from "@/components/icons";
import { applyPreset, type LayerType } from "@/lib/map/store";

export function PanelHeader({ icon, title, sub, accent, children }: { icon: ReactNode; title: string; sub?: string; accent?: string; children?: ReactNode }) {
  return (
    <header className="px-4 pb-2 pt-1">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: accent || "rgb(var(--water))" }}>{icon}</span>
        <div className="min-w-0 flex-1"><h1 className="truncate text-base font-extrabold leading-tight">{title}</h1>{sub && <p className="text-2xs leading-snug text-muted">{sub}</p>}</div>
      </div>
      {children}
    </header>
  );
}
export function usePreset(items: { type: LayerType; key: string; visible?: boolean; opacity?: number }[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { applyPreset(items); }, []);
}
export function Note({ children }: { children: ReactNode }) {
  return <p className="flex items-start gap-1.5 text-2xs leading-relaxed text-muted"><Info size={12} className="mt-0.5 shrink-0" />{children}</p>;
}
