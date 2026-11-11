"use client";
/** Draw an ECharts chart off screen and return it as a PNG (for reports). */
import { loadECharts } from "./echarts";

export async function chartPng(option: Record<string, unknown>, width = 1000, height = 520): Promise<{ src: string; w: number; h: number }> {
  const ec = await loadECharts();
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(el);
  const ch = ec.init(el, undefined, { renderer: "canvas", width, height });
  try {
    ch.setOption({ animation: false, backgroundColor: "#ffffff", textStyle: { fontFamily: "'Inter Variable', 'Noto Sans Bengali', system-ui, sans-serif", color: "#1f2937" }, ...option }, true);
    const src = ch.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
    return { src, w: width, h: height };
  } finally { ch.dispose(); el.remove(); }
}
