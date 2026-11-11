"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Table } from "@/components/icons";
import { loadECharts } from "@/lib/charts/echarts";
import { useApp } from "@/lib/app-context";
import { cx } from "@/components/ui";
import { downloadBlob, safeName } from "@/lib/map/export";

type Opt = Record<string, unknown>;
export interface ChartTable { head: string[]; rows: (string | number)[][] }

export default function Chart({ option, height = 260, title, table, className = "", label, onPick }: {
  option: Opt | null; height?: number; title?: string; table?: ChartTable; className?: string; label?: string;
  /** called with the name of the bar / bubble / box (or axis label) that was clicked */
  onPick?: (name: string) => void;
}) {
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const el = useRef<HTMLDivElement>(null);
  const inst = useRef<{ setOption: (o: Opt, n?: boolean) => void; resize: () => void; dispose: () => void; getDataURL: (o: Opt) => string } | null>(null);
  const [showTable, setShowTable] = useState(false);
  const { t, lang } = useApp();

  useEffect(() => {
    let ro: ResizeObserver | null = null;
    let disposed = false;
    loadECharts().then((ec) => {
      if (disposed || !el.current) return;
      const ch = ec.init(el.current, undefined, { renderer: "canvas" });
      inst.current = ch as unknown as typeof inst.current;
      if (option) ch.setOption(option, true);
      ch.on("click", (p: { componentType?: string; name?: string; value?: unknown }) => {
        const name = p.componentType === "yAxis" || p.componentType === "xAxis" ? String(p.value ?? "") : String(p.name ?? "");
        if (name) pickRef.current?.(name);
      });
      ro = new ResizeObserver(() => ch.resize());
      ro.observe(el.current);
    });
    return () => { disposed = true; ro?.disconnect(); inst.current?.dispose(); inst.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (option && inst.current) inst.current.setOption(option, true); }, [option]);

  const png = () => {
    const url = inst.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
    if (!url) return;
    fetch(url).then((r) => r.blob()).then((b) => downloadBlob(b, `${safeName(title || "chart")}.png`));
  };
  return (
    <figure className={cx("rounded-2xl border border-line bg-raised p-3", className)}>
      {(title || table) && (
        <figcaption className="mb-1 flex items-center gap-2">
          <span className="flex-1 text-[13px] font-semibold">{title}</span>
          {table && <button className={cx("icon-btn h-7 w-7", showTable && "bg-sunken")} onClick={() => setShowTable((s) => !s)} aria-pressed={showTable}
            title={lang === "bn" ? "সারণি দেখুন" : "Table view"} aria-label={lang === "bn" ? "সারণি দেখুন" : "Table view"}><Table size={14} /></button>}
          <button className="icon-btn h-7 w-7" onClick={png} title={t("common.download")} aria-label={t("common.download")}><Download size={14} /></button>
        </figcaption>
      )}
      <div ref={el} style={{ height, display: showTable ? "none" : undefined }} role="img" aria-label={label || title} />
      {showTable && table && (
        <div className="max-h-[320px] overflow-auto scroll-thin" style={{ minHeight: height }}>
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-raised"><tr>{table.head.map((h) => <th key={h} className="border-b border-line px-2 py-1.5 text-left font-semibold text-muted">{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i} className="border-b border-line/60">{r.map((c, j) => <td key={j} className={cx("px-2 py-1", j > 0 && "text-right")}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
