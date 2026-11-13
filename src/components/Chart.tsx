import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart as EBar, CustomChart, FunnelChart, GaugeChart, LineChart as ELine, PieChart, ScatterChart, TreemapChart } from "echarts/charts";
import { GraphicComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import type { Chart as ChartData } from "../data/types";
import { chartCsv, saveCsv, saveDataUrl, slug } from "../lib/download";
import { DownloadMenu } from "./ui";

echarts.use([EBar, ELine, PieChart, FunnelChart, TreemapChart, GaugeChart, ScatterChart, CustomChart, GraphicComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent, SVGRenderer, CanvasRenderer]);

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

// Categorical colors for donuts and treemaps: NC State's brand palette, in a fixed order.
const PALETTE = ["#cc0000", "#4156a1", "#008473", "#d14905", "#6f7d1c", "#427e93", "#990000", "#7a7a7a"];

// A treemap only works when every box can show its name and number. With long names or many
// items, the same data is drawn as ranked horizontal bars so every label is readable.
export function effectiveChart(chart: ChartData): ChartData {
  if (chart.kind !== "treemap") return chart;
  const fits = chart.categories.length <= 10 && chart.categories.every((k) => k.length <= 18);
  return fits ? chart : { ...chart, kind: "bar", orientation: "horizontal" };
}

function chartOption(input: ChartData, c: Colors, forExport: boolean, highlight?: number, clickable = false) {
  const chart = effectiveChart(input);
  const special = specialOption(chart, c, forExport);
  if (special) return special;
  return barLineOption(chart, c, forExport, highlight, clickable);
}

// The infographic kinds. Each keeps the same data shape (categories + series) as a bar chart.
function specialOption(chart: ChartData, c: Colors, forExport: boolean) {
  const kind = chart.kind ?? "bar";
  if (kind === "bar" || kind === "line") return null;
  const s = chart.series[0];
  const text = { color: c.ink, fontFamily: c.font };
  const base = {
    animation: !forExport,
    animationDuration: 800,
    backgroundColor: forExport ? c.surface : "transparent",
    title: forExport ? { text: chart.title, left: 8, top: 8, textStyle: { ...text, fontSize: 18, fontWeight: "bold" as const } } : undefined,
    tooltip: { trigger: "item" as const, backgroundColor: c.surface, borderColor: c.line, textStyle: { ...text, fontSize: 13 }, extraCssText: "border-radius:0;box-shadow:0 6px 18px rgba(0,0,0,.12);" },
  };
  const top = forExport ? 50 : 6;
  const data = chart.categories.map((name, i) => ({ name, value: s?.values[i] ?? 0, label: s?.labels?.[i] }));
  const total = data.reduce((a, d) => a + d.value, 0) || 1;

  if (kind === "donut") {
    return {
      ...base,
      color: PALETTE,
      legend: { bottom: 0, left: "center", icon: "circle", itemWidth: 10, itemHeight: 10, textStyle: { ...text, fontSize: 12, color: c.muted } },
      series: [{
        type: "pie" as const, radius: ["48%", "72%"], center: ["50%", forExport ? "52%" : "44%"], avoidLabelOverlap: true,
        itemStyle: { borderColor: c.surface, borderWidth: 2 },
        label: { ...text, fontSize: 12, formatter: (p: { name: string; value: number }) => `${Math.round((p.value / total) * 100)}%` },
        labelLine: { length: 8, length2: 6 },
        data,
      }],
      graphic: forExport ? undefined : [{ type: "text" as const, left: "center", top: "39%", style: { text: total.toLocaleString("en-US"), fill: c.ink, font: `bold 22px ${c.font}` } }],
    };
  }
  if (kind === "funnel") {
    const first = data[0]?.value || 1;
    return {
      ...base,
      series: [{
        type: "funnel" as const, top, bottom: 6, left: "2%", width: "56%", minSize: "18%", sort: "none" as const, gap: 3,
        itemStyle: { color: c.s1, borderWidth: 0 },
        data: data.map((d, i) => ({ ...d, itemStyle: { color: c.s1, opacity: 1 - i * (0.6 / Math.max(1, data.length - 1)) } })),
        label: { position: "right" as const, ...text, fontSize: 13, formatter: (p: { name: string; value: number }) => `{b|${p.value.toLocaleString("en-US")}} ${p.name} · ${Math.round((p.value / first) * 100)}%`, rich: { b: { fontWeight: "bold" as const, fontSize: 15, color: c.ink } } },
      }],
    };
  }
  if (kind === "treemap") {
    return {
      ...base,
      series: [{
        type: "treemap" as const, top, left: 0, right: 0, bottom: 0, roam: false, nodeClick: false as const, breadcrumb: { show: false },
        itemStyle: { borderColor: c.surface, borderWidth: 2, gapWidth: 2 },
        label: { color: "#ffffff", fontFamily: c.font, fontSize: 12, overflow: "truncate" as const, ellipsis: "…", formatter: (p: { name: string; value: number }) => `{n|${p.value}}\n${p.name}`, rich: { n: { fontSize: 18, fontWeight: "bold" as const, color: "#ffffff", lineHeight: 22 } } },
        data: data.filter((d) => d.value > 0).map((d, i) => ({ ...d, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
      }],
    };
  }
  if (kind === "rings") {
    const max = chart.max ?? 100;
    const n = data.length;
    const perRow = Math.min(n, 4);
    const rows = Math.ceil(n / perRow);
    return {
      ...base,
      series: data.map((d, i) => {
        const col = i % perRow, row = Math.floor(i / perRow);
        return {
          type: "gauge" as const, startAngle: 90, endAngle: -270, min: 0, max,
          center: [`${((col + 0.5) / perRow) * 100}%`, `${((row + 0.42) / rows) * 100 * (forExport ? 0.85 : 1) + (forExport ? 12 : 0)}%`],
          radius: `${Math.min(34, 90 / Math.max(perRow, rows * 1.6))}%`,
          pointer: { show: false }, axisLine: { lineStyle: { width: 10, color: [[1, c.line]] } },
          progress: { show: true, width: 10, roundCap: true, itemStyle: { color: PALETTE[i % PALETTE.length] } },
          splitLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false },
          title: { show: true, offsetCenter: [0, "150%"], ...text, fontSize: 12, width: 150, overflow: "break" as const, lineHeight: 15 },
          detail: { valueAnimation: true, offsetCenter: [0, 0], ...text, fontSize: 18, fontWeight: "bold" as const, formatter: () => d.label ?? (max === 100 ? `${d.value}%` : `${d.value}`) },
          data: [{ value: d.value, name: d.name }],
        };
      }),
    };
  }
  if (kind === "meter") {
    const max = chart.max ?? 100;
    return {
      ...base,
      grid: { left: 8, right: 56, top, bottom: 4, containLabel: true },
      xAxis: { type: "value" as const, max, show: false },
      yAxis: { type: "category" as const, data: chart.categories, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...text, fontSize: 12, width: 230, overflow: "truncate" as const } },
      series: [{
        type: "bar" as const, data: data.map((d) => d.value), barWidth: 12, showBackground: true, backgroundStyle: { color: c.line, borderRadius: 6 },
        itemStyle: { color: c.s1, borderRadius: 6 },
        label: { show: true, position: "right" as const, ...text, fontWeight: "bold" as const, fontSize: 13, formatter: (p: { dataIndex: number; value: number }) => data[p.dataIndex].label ?? `${p.value}%` },
      }],
    };
  }
  if (kind === "dumbbell") {
    const [a, b] = chart.series;
    const cats = chart.categories;
    return {
      ...base,
      legend: { top: forExport ? 48 : 0, left: 8, icon: "circle", itemWidth: 10, itemHeight: 10, textStyle: { ...text, fontSize: 12, color: c.muted } },
      grid: { left: 8, right: 30, top: top + 26, bottom: 4, containLabel: true },
      xAxis: { type: "value" as const, min: chart.max ? 0 : undefined, max: chart.max, splitLine: { lineStyle: { color: c.line, type: "dashed" as const } }, axisLabel: { ...text, fontSize: 11, color: c.muted } },
      yAxis: { type: "category" as const, data: cats, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...text, fontSize: 12, width: 180, overflow: "truncate" as const } },
      tooltip: { ...base.tooltip, trigger: "axis" as const },
      series: [
        {
          type: "custom" as const, silent: true, tooltip: { show: false },
          renderItem: (_: unknown, api: { value: (i: number) => number; coord: (v: [number, number]) => number[] }) => {
            const y = api.value(0);
            const p1 = api.coord([api.value(1), y]), p2 = api.coord([api.value(2), y]);
            return { type: "line", shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, style: { stroke: c.muted, lineWidth: 3, opacity: 0.45 } };
          },
          encode: { x: [1, 2], y: 0 },
          data: cats.map((_, i) => [i, a.values[i], b.values[i]]),
        },
        { type: "scatter" as const, name: a.name, symbolSize: 13, itemStyle: { color: c.s2 }, data: a.values.map((v, i) => [v, i]), encode: { x: 0, y: 1 } },
        { type: "scatter" as const, name: b.name, symbolSize: 15, itemStyle: { color: c.s1 }, data: b.values.map((v, i) => [v, i]), encode: { x: 0, y: 1 },
          label: { show: true, position: "right" as const, ...text, fontWeight: "bold" as const, fontSize: 12, formatter: (p: { dataIndex: number }) => (b.labels ? b.labels[p.dataIndex] : String(b.values[p.dataIndex])) } },
      ],
    };
  }
  return null;
}

function barLineOption(chart: ChartData, c: Colors, forExport: boolean, highlight?: number, clickable = false) {
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
export function chartToPng(input: ChartData, width = 900, height = 420): string {
  const chart = input.kind === "rings" || input.kind === "meter" ? { ...input, kind: "bar" as const, orientation: "horizontal" as const } : input;
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
  const shown = effectiveChart(chart);
  // Percentages and ratings: a readable list (number, full question, a thin bar) instead of a canvas,
  // so long questions wrap instead of overlapping. Downloads still draw it as bars.
  const list = shown.kind === "meter" || shown.kind === "rings";
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
      {list ? (
        <ul className="statlist">
          {shown.categories.map((cat, i) => {
            const v = shown.series[0]?.values[i] ?? 0;
            const max = shown.max ?? 100;
            return (
              <li key={cat}>
                <b className="sl-v">{shown.series[0]?.labels?.[i] ?? `${v}%`}</b>
                <span className="sl-q">{cat}</span>
                <span className="sl-track" aria-hidden="true"><span style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div ref={ref} style={{ width: "100%", height }} role="img" aria-label={chart.title} />
      )}
      {chart.note && <p className="note">{chart.note}</p>}
    </figure>
  );
}
