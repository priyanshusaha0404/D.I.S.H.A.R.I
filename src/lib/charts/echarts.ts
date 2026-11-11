"use client";
/** ECharts, loaded on demand with only the chart types the site uses. */
type EC = typeof import("echarts/core");
let mod: Promise<EC> | null = null;

export function loadECharts(): Promise<EC> {
  if (!mod) {
    mod = Promise.all([
      import("echarts/core"), import("echarts/charts"), import("echarts/components"), import("echarts/renderers"),
    ]).then(([core, charts, comps, rend]) => {
      core.use([charts.TreemapChart, charts.LineChart, charts.BarChart, charts.ScatterChart, charts.BoxplotChart, charts.HeatmapChart, charts.PieChart,
        comps.GridComponent, comps.TooltipComponent, comps.LegendComponent, comps.DataZoomComponent, comps.MarkLineComponent,
        comps.MarkAreaComponent, comps.VisualMapComponent, comps.TitleComponent, comps.DatasetComponent, comps.AriaComponent,
        rend.CanvasRenderer]);
      return core;
    });
  }
  return mod;
}

/** Render an option to a PNG data URL (for reports). */
export async function chartPng(option: Record<string, unknown>, width = 900, height = 420): Promise<string> {
  const ec = await loadECharts();
  const div = document.createElement("div");
  div.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(div);
  try {
    const ch = ec.init(div, undefined, { renderer: "canvas", width, height, devicePixelRatio: 2 });
    ch.setOption({ ...option, animation: false, backgroundColor: "#ffffff" });
    const url = ch.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
    ch.dispose();
    return url;
  } finally {
    div.remove();
  }
}
