import { useState } from "react";
import type { Chart as ChartData } from "../data/types";
import { Chart } from "./Chart";
import { Icon } from "./Icon";

export type ExplorerView = {
  id: string;
  label: string;
  chart: ChartData;
  height?: number;
  start?: number; // index selected when the tab opens (defaults to the peak)
  detail: (i: number) => { value: string; text: string };
};

// One chart panel with tabs. Click a bar, drag the slider or use the arrows to step through it.
export function ChartExplorer({ views }: { views: ExplorerView[] }) {
  const [active, setActive] = useState(views[0]?.id);
  const view = views.find((v) => v.id === active) ?? views[0];
  const values = view?.chart.series[0]?.values ?? [];
  const peak = values.indexOf(Math.max(...values));
  const [picked, setPicked] = useState<Record<string, number>>({});
  if (!view) return null;

  const n = view.chart.categories.length;
  const i = Math.min(n - 1, picked[view.id] ?? view.start ?? peak);
  const pick = (x: number) => setPicked((p) => ({ ...p, [view.id]: Math.max(0, Math.min(n - 1, x)) }));
  const d = view.detail(i);

  return (
    <div className="panel explorer">
      <div className="ex-tabs" role="tablist" aria-label="Choose a view">
        {views.map((v) => (
          <button key={v.id} role="tab" aria-selected={v.id === view.id} onClick={() => setActive(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      <Chart key={view.id} chart={view.chart} height={view.height ?? 300} highlight={i} onSelect={pick} />
      <div className="ex-control no-print">
        <button className="sq-dark" onClick={() => pick(i - 1)} disabled={i === 0} aria-label="Previous">
          <Icon name="left" size={18} />
        </button>
        <input
          type="range"
          min={0}
          max={n - 1}
          value={i}
          onChange={(e) => pick(Number(e.target.value))}
          aria-label={`Pick a ${view.label.toLowerCase()} value`}
          aria-valuetext={view.chart.categories[i]}
        />
        <button className="sq-dark" onClick={() => pick(i + 1)} disabled={i === n - 1} aria-label="Next">
          <Icon name="right" size={18} />
        </button>
      </div>
      <div className="ex-detail" aria-live="polite">
        <span className="ex-cat">{view.chart.categories[i]}</span>
        <span className="ex-val">{d.value}</span>
        <span className="ex-text">{d.text}</span>
      </div>
    </div>
  );
}
