import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart as EBar, LineChart as ELine } from "echarts/charts";
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import type { Chart as ChartData } from "../data/types";
import { chartCsv, saveCsv, saveDataUrl, slug } from "../lib/download";
import { DownloadMenu } from "./ui";

echarts.use([EBar, ELine, GridComponent, LegendComponent, TitleComponent, TooltipComponent, SVGRenderer, CanvasRenderer]);

type Colors = { ink: string; muted: string; line: string; surface: string; s1: string; s2: string; s1soft: string; font: string };

// Read colors from the CSS tokens so on-screen charts follow the light/dark theme.
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const screenColors = (): Colors => ({
  ink: token("--ink"), muted: token("--muted"), line: token("--line"), surface: token("--surface"),
  s1: token("--s1"), s2: token("--s2"), s1soft: token("--s1-soft"), font: token("--f-body"),
});
// Downloads always use the light, print-ready colors (same values as the light tokens).
const exportColors: Colors = {
  ink: "#333333", muted: "#666666", line: "#d9d9d9", surface: "#ffffff",
  s1: "#cc0000", s2: "#4156a1", s1soft: "#f1b9b9", font: "Roboto, Arial, sans-serif",
};

function chartOption(chart: ChartData, c: Colors, forExport: boolean, highlight?: number, clickable = false) {
  const horizontal = chart.orientation === "horizontal";
  const single = chart.series.length === 1;
  const radius = horizontal ? [0, 2, 2, 0] : [2, 2, 0, 0];
  const top = (single ? 24 : 44) + (forExport ? 44 : 0);

  const catAxis = {
    type: "category" as const,
    data: chart.categories,
    axisLine: { lineStyle: { color: c.line } },
    axisTick: { show: false },
    axisLabel: { color: horizontal ? c.ink : c.muted, fontFamily: c.font, fontSize: horizontal ? 13 : 12 },
    inverse: horizontal,
  };
  const valAxis = { type: "value" as const, show: false };

  return {
    animation: !forExport,
    animationDuration: 700,
    animationEasing: "cubicOut" as const,
    backgroundColor: forExport ? c.surface : "transparent",
    title: forExport ? { text: chart.title, left: 8, top: 8, textStyle: { color: c.ink, fontFamily: c.font, fontSize: 18, fontWeight: "bold" as const } } : undefined,
    grid: { left: 8, right: horizontal ? 90 : 40, top, bottom: 8, containLabel: true },
    legend: single
      ? undefined
      : { top: forExport ? 48 : 0, left: 8, icon: "rect", itemWidth: 12, itemHeight: 12, itemGap: 18, textStyle: { color: c.muted, fontFamily: c.font, fontSize: 12 } },
    tooltip: {
      trigger: "axis" as const,
      axisPointer: chart.kind === "line"
        ? { type: "line" as const, lineStyle: { color: c.muted, type: "dashed" as const } }
        : { type: "shadow" as const, shadowStyle: { color: c.line, opacity: 0.35 } },
      backgroundColor: c.surface,
      borderColor: c.line,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: c.ink, fontFamily: c.font, fontSize: 13 },
      extraCssText: "border-radius:0;box-shadow:0 6px 18px rgba(0,0,0,.12);",
    },
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series: chart.series.map((s) => {
      if (chart.kind === "line") {
        // Lines: 2px stroke, markers, and a label on the last point only.
        const last = s.values.length - 1;
        return {
          type: "line" as const,
          name: s.name,
          data: s.values.map((v, i) => (i === highlight ? { value: v, symbolSize: 14 } : v)),
          symbol: "circle",
          symbolSize: 8,
          cursor: clickable ? "pointer" : "default",
          lineStyle: { width: 2, color: s.emphasis || single ? c.s1 : c.s2 },
          itemStyle: { color: s.emphasis || single ? c.s1 : c.s2, borderColor: c.surface, borderWidth: 2 },
          areaStyle: single ? { color: c.s1, opacity: 0.08 } : undefined,
          label: {
            show: true,
            position: "top" as const,
            color: c.ink,
            fontFamily: c.font,
            fontWeight: "bold" as const,
            fontSize: 12,
            formatter: (p: { dataIndex: number; value: number }) => (p.dataIndex === (highlight ?? last) ? (s.labels ? s.labels[p.dataIndex] : String(p.value)) : ""),
          },
        };
      }
      // One series: the peak bar is full color and the rest are a lighter tint.
      const hi = highlight ?? s.values.indexOf(Math.max(...s.values));
      const data = single ? s.values.map((v, i) => ({ value: v, itemStyle: { color: i === hi ? c.s1 : c.s1soft } })) : s.values;
      return {
        type: "bar" as const,
        name: s.name,
        data,
        barMaxWidth: horizontal ? 22 : 44,
        cursor: clickable ? "pointer" : "default",
        barGap: "12%",
        itemStyle: { color: single ? c.s1 : s.emphasis ? c.s1 : c.s2, borderRadius: radius },
        emphasis: { itemStyle: { color: c.s1 } },
        label: {
          show: true,
          position: horizontal ? ("right" as const) : ("top" as const),
          color: c.ink,
          fontFamily: c.font,
          fontWeight: "bold" as const,
          fontSize: 12,
          formatter: (p: { dataIndex: number; value: number }) => (s.labels ? s.labels[p.dataIndex] : String(p.value)),
        },
      };
    }),
  };
}

// Renders a chart off screen and returns a PNG data URL (used for downloads and Word files).
export function chartToPng(chart: ChartData, width = 900, height = 420): string {
  const div = document.createElement("div");
  const inst = echarts.init(div, undefined, { renderer: "canvas", width, height });
  inst.setOption(chartOption(chart, exportColors, true));
  const url = inst.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
  inst.dispose();
  return url;
}

type ChartProps = {
  chart: ChartData;
  height?: number;
  highlight?: number; // index of the bar or point to emphasize (defaults to the peak)
  onSelect?: (index: number) => void; // makes bars and points clickable
  bare?: boolean; // no title row (when the parent shows its own)
};

export function Chart({ chart, height = 260, highlight, onSelect, bare }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<ReturnType<typeof echarts.init> | null>(null);
  const latest = useRef({ chart, highlight, onSelect });
  latest.current = { chart, highlight, onSelect };
  const render = () => inst.current?.setOption(chartOption(latest.current.chart, screenColors(), false, latest.current.highlight, !!latest.current.onSelect), true);

  useEffect(() => {
    if (!ref.current) return;
    inst.current = echarts.init(ref.current, undefined, { renderer: "svg" });
    inst.current.on("click", (p) => latest.current.onSelect?.((p as { dataIndex: number }).dataIndex));
    render();
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current);
    // Re-color when the theme toggle changes data-theme on <html>.
    const mo = new MutationObserver(render);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      inst.current?.dispose();
      inst.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(render, [chart, highlight]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = slug(chart.title);
  return (
    <figure className="chart">
      {!bare && <div className="chart-head">
        <figcaption className="chart-title">{chart.title}</figcaption>
        <DownloadMenu
          compact
          label="Download chart"
          items={[
            { label: "Image (PNG)", hint: "For slides and documents", icon: "image", run: () => saveDataUrl(chartToPng(chart, 1000, chart.orientation === "horizontal" ? 380 : 460), `${name}.png`) },
            { label: "Data (CSV)", hint: "Opens in Excel or Sheets", icon: "table", run: () => saveCsv(chartCsv(chart), `${name}.csv`) },
          ]}
        />
      </div>}
      <div ref={ref} style={{ width: "100%", height }} role="img" aria-label={chart.title} />
      {chart.note && <p className="note">{chart.note}</p>}
    </figure>
  );
}
