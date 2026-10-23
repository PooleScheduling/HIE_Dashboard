import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart as EBar } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { Chart as ChartData } from "../data/types";

echarts.use([EBar, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

// Read colors from the CSS tokens so charts follow light/dark theme.
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function Chart({ chart, height = 260 }: { chart: ChartData; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const inst = echarts.init(ref.current, undefined, { renderer: "svg" });
    const horizontal = chart.orientation === "horizontal";

    const render = () => {
      const muted = token("--muted");
      const ink = token("--ink");
      const line = token("--line");
      const accent = token("--bar");
      const quiet = token("--bar2");
      const mono = token("--f-mono");

      const catAxis = {
        type: "category" as const,
        data: chart.categories,
        axisLine: { lineStyle: { color: line } },
        axisTick: { show: false },
        axisLabel: { color: horizontal ? ink : muted, fontFamily: horizontal ? undefined : mono, fontSize: horizontal ? 13 : 11 },
        inverse: horizontal,
      };
      const valAxis = { type: "value" as const, show: false };

      inst.setOption(
        {
          animationDuration: 500,
          grid: { left: horizontal ? 8 : 8, right: 40, top: chart.series.length > 1 ? 40 : 24, bottom: 8, containLabel: true },
          legend: chart.series.length > 1
            ? { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: muted, fontFamily: mono, fontSize: 11 } }
            : undefined,
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
          xAxis: horizontal ? valAxis : catAxis,
          yAxis: horizontal ? catAxis : valAxis,
          series: chart.series.map((s) => ({
            type: "bar",
            name: s.name,
            data: s.values,
            barMaxWidth: horizontal ? 20 : 48,
            itemStyle: { color: s.emphasis ? accent : quiet, borderRadius: 2 },
            label: {
              show: true,
              position: horizontal ? "right" : "top",
              color: ink,
              fontFamily: mono,
              fontSize: 11,
              formatter: (p: { dataIndex: number; value: number }) => (s.labels ? s.labels[p.dataIndex] : String(p.value)),
            },
          })),
        },
        true,
      );
    };

    render();
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(ref.current);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", render);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", render);
      inst.dispose();
    };
  }, [chart]);

  return (
    <figure className="chart">
      <figcaption className="chart-title">{chart.title}</figcaption>
      <div ref={ref} style={{ width: "100%", height }} role="img" aria-label={chart.title} />
      {chart.note && <p className="note">{chart.note}</p>}
    </figure>
  );
}
