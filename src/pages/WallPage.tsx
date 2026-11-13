import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { ReportData, WallDay } from "../data/types";
import { saveCsv } from "../lib/download";
import { formatDate } from "../components/ui";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

// Laid out like the wall's own stats page (HIE Wall Usage), from the per-day totals in data.wall.
const SCREENS = ["left", "middle", "right"] as const;
const NAMES = { left: "Left", middle: "Middle", right: "Right" };
const RANGES = [[7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"], [365, "Last 12 months"]] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (n: number) => n.toLocaleString("en-US");
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? " am" : " pm"}`;
const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shortDay = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8))}`;
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function summarize(all: WallDay[], end: string, days: number) {
  const dayList: string[] = [];
  const last = new Date(end + "T12:00:00");
  for (let i = days - 1; i >= 0; i--) dayList.push(isoDay(new Date(last.getFullYear(), last.getMonth(), last.getDate() - i)));
  const byDate = new Map(all.map((d) => [d.date, d]));
  const perScreen = SCREENS.map(() => ({ visits: 0, taps: 0 }));
  const depth = SCREENS.map(() => [0, 0, 0]);
  const tops = SCREENS.map(() => new Map<string, number>());
  const byHour = Array(24).fill(0) as number[];
  const qr = new Map<string, number>();
  const daily: number[][] = [];
  for (const k of dayList) {
    const d = byDate.get(k);
    daily.push(d ? d.visits : [0, 0, 0]);
    if (!d) continue;
    SCREENS.forEach((_, s) => {
      perScreen[s].visits += d.visits[s];
      perScreen[s].taps += d.taps[s];
      d.depth[s].forEach((n, i) => (depth[s][i] += n));
      for (const [l, n] of Object.entries(d.tops[s])) tops[s].set(l, (tops[s].get(l) ?? 0) + n);
    });
    d.hours.forEach((n, h) => (byHour[h] += n));
    for (const [l, n] of Object.entries(d.qr)) qr.set(l, (qr.get(l) ?? 0) + n);
  }
  const totalVisits = perScreen.reduce((a, p) => a + p.visits, 0);
  const totalTaps = perScreen.reduce((a, p) => a + p.taps, 0);
  const qrTotal = [...qr.values()].reduce((a, b) => a + b, 0);
  const activeDays = daily.filter((v) => v[0] + v[1] + v[2] > 0).length;
  return { dayList, daily, perScreen, depth, tops, byHour, qr, totalVisits, totalTaps, qrTotal, activeDays };
}

// One ECharts canvas that follows the light/dark toggle.
function useChart(option: () => echarts.EChartsCoreOption, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const opt = useRef(option);
  opt.current = option;
  useEffect(() => {
    if (!ref.current) return;
    inst.current = echarts.init(ref.current, undefined, { renderer: "svg" });
    const draw = () => inst.current?.setOption(opt.current(), true);
    draw();
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { ro.disconnect(); mo.disconnect(); inst.current?.dispose(); };
  }, []);
  useEffect(() => { inst.current?.setOption(opt.current(), true); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

const axisStyle = () => {
  const text2 = token("--w-text-2"), grid = token("--w-grid");
  const font = { color: text2, fontFamily: token("--w-font"), fontSize: 12 };
  return {
    x: { type: "category" as const, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { ...font, hideOverlap: true } },
    y: { type: "value" as const, minInterval: 1, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: grid } }, axisLabel: font },
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: token("--w-surface"), borderColor: token("--w-border"), borderWidth: 1, padding: 10,
      textStyle: { color: token("--w-text"), fontFamily: token("--w-font"), fontSize: 13 },
      extraCssText: "border-radius:8px;box-shadow:none;",
    },
  };
};

export function WallPage({ data }: { data: ReportData }) {
  const [days, setDays] = useState(30);
  const wall = data.wall;
  const sum = useMemo(() => summarize(wall?.days ?? [], data.asOf, days), [wall, data.asOf, days]);
  const busiest = sum.byHour.indexOf(Math.max(...sum.byHour));
  const src = wall?.source;
  const srcText = src ? `${src.label}, updated ${formatDate(src.updatedOn)}` : "";

  const dailyRef = useChart(() => {
    const a = axisStyle();
    return {
      animationDuration: 600,
      grid: { left: 4, right: 12, top: 40, bottom: 4, containLabel: true },
      legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 12, itemGap: 14, textStyle: { color: token("--w-text-2"), fontFamily: token("--w-font"), fontSize: 13 } },
      tooltip: a.tooltip,
      xAxis: { ...a.x, boundaryGap: false, data: sum.dayList.map(shortDay), axisLabel: { ...a.x.axisLabel, interval: Math.max(0, Math.ceil(sum.dayList.length / 8) - 1) } },
      yAxis: a.y,
      series: SCREENS.map((s, i) => ({
        type: "line", name: NAMES[s], data: sum.daily.map((v) => v[i]),
        smooth: true, smoothMonotone: "x",
        symbol: "circle", symbolSize: days <= 30 ? 7 : 0, showSymbol: days <= 30,
        lineStyle: { width: 2, color: token(`--w-${s}`) },
        itemStyle: { color: token(`--w-${s}`), borderColor: token("--w-surface"), borderWidth: 2 },
        emphasis: { scale: 1.4 },
      })),
    };
  }, [sum, days]);

  const hourRef = useChart(() => {
    const a = axisStyle();
    const hours: number[] = [];
    for (let h = 7; h <= 21; h++) hours.push(h);
    return {
      animationDuration: 600,
      grid: { left: 4, right: 8, top: 12, bottom: 4, containLabel: true },
      tooltip: { ...a.tooltip, axisPointer: { type: "shadow", shadowStyle: { color: token("--w-grid"), opacity: 0.6 } } },
      xAxis: { ...a.x, data: hours.map(hourLabel) },
      yAxis: a.y,
      series: [{ type: "bar", name: "Visits", data: hours.map((h) => sum.byHour[h]), barCategoryGap: "28%", itemStyle: { color: token("--w-left"), borderRadius: [4, 4, 0, 0] } }],
    };
  }, [sum]);

  const downloadCsv = () =>
    saveCsv(
      [["date", "left_visits", "middle_visits", "right_visits", "total_visits"], ...sum.dayList.map((k, i) => [k, ...sum.daily[i], sum.daily[i][0] + sum.daily[i][1] + sum.daily[i][2]])],
      "hie-wall-visits.csv",
    );

  const tile = (label: string, num: string, note?: string, screen?: string) => (
    <div className="w-tile" title={srcText}>
      <div className="w-tlabel">{screen && <span className="w-key" style={{ background: `var(--w-${screen})` }} />}{label}</div>
      <div className="w-num">{num}</div>
      {note && <div className="w-tnote">{note}</div>}
    </div>
  );

  return (
    <div className="wall">
      <header className="w-head">
        <div>
          <h1>HIE Wall Usage</h1>
          <p className="w-sub">Nelson Hall lobby screens, {shortDay(sum.dayList[0])} to {shortDay(sum.dayList[sum.dayList.length - 1])}</p>
        </div>
        <div className="w-controls">
          <select aria-label="Date range" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map(([n, label]) => <option key={n} value={n}>{label}</option>)}
          </select>
          <button onClick={downloadCsv}>Download daily CSV</button>
        </div>
      </header>

      {!wall && <div className="w-banner">No taps or scans yet. The numbers fill in once the wall's feed is connected.</div>}

      <section className="w-tiles">
        {tile("Visits", fmt(sum.totalVisits), sum.activeDays ? `${fmt(Math.round(sum.totalVisits / sum.activeDays))} per active day` : "")}
        {tile("Taps", fmt(sum.totalTaps))}
        {tile("Taps per visit", sum.totalVisits ? (sum.totalTaps / sum.totalVisits).toFixed(1) : "0")}
        {tile("Busiest hour", sum.totalVisits ? hourLabel(busiest) : "None yet")}
        {tile("QR scans", fmt(sum.qrTotal))}
      </section>
      <section className="w-tiles">
        {SCREENS.map((s, i) => {
          const p = sum.perScreen[i];
          const share = sum.totalVisits ? Math.round((p.visits / sum.totalVisits) * 100) : 0;
          return <div key={s} style={{ display: "contents" }}>{tile(`${NAMES[s]} screen`, `${fmt(p.visits)} visits`, `${share}% of all visits, ${fmt(p.taps)} taps`, s)}</div>;
        })}
      </section>

      <section className="w-card" style={{ marginTop: 12 }}>
        <h2>Visits per day</h2>
        <p className="w-hint">A visit is one person (or group) using a screen. It ends after 45 seconds with no taps.</p>
        <div className="w-chart" ref={dailyRef} role="img" aria-label="Visits per day by screen" />
      </section>

      <div className="w-grid2">
        <section className="w-card">
          <h2>When the screens get used</h2>
          <p className="w-hint">All visits by hour of the day, all three screens together.</p>
          <div className="w-chart" ref={hourRef} role="img" aria-label="Visits by hour of day" />
        </section>
        <section className="w-card">
          <h2>How deep people go</h2>
          <p className="w-hint">Taps per visit. A quick look is one tap; exploring is five or more.</p>
          <table>
            <thead>
              <tr><th>Screen</th><th className="n">Quick look (1)</th><th className="n">Browsed (2 to 4)</th><th className="n">Explored (5+)</th></tr>
            </thead>
            <tbody>
              {SCREENS.map((s, i) => {
                const dp = sum.depth[i];
                const t = dp[0] + dp[1] + dp[2] || 1;
                return (
                  <tr key={s}>
                    <td><span className="w-key" style={{ background: `var(--w-${s})` }} />{NAMES[s]}</td>
                    {dp.map((x, j) => <td key={j} className="n">{fmt(x)} <span className="w-muted">({Math.round((x / t) * 100)}%)</span></td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      <section className="w-card" style={{ marginTop: 12 }}>
        <h2>Most tapped</h2>
        <p className="w-hint">What people chose on each screen.</p>
        <div className="w-tops">
          {SCREENS.map((s, i) => {
            const list = [...sum.tops[i].entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
            return (
              <div key={s}>
                <h3><span className="w-key" style={{ background: `var(--w-${s})` }} />{NAMES[s]}</h3>
                {list.length ? (
                  <table><tbody>{list.map(([l, n]) => <tr key={l}><td>{l}</td><td className="n">{fmt(n)}</td></tr>)}</tbody></table>
                ) : <p className="w-empty">No taps yet.</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="w-card" style={{ marginTop: 12 }}>
        <h2>QR code scans</h2>
        <p className="w-hint">Phones that scanned a code on the wall and opened the link.</p>
        <table>
          {sum.qr.size ? (
            <>
              <thead><tr><th>Link</th><th className="n">Scans</th></tr></thead>
              <tbody>{[...sum.qr.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => <tr key={l}><td>/go/{l}</td><td className="n">{fmt(n)}</td></tr>)}</tbody>
            </>
          ) : (
            <tbody><tr><td className="w-empty">No scans yet. Point a QR code at a /go/ link to start counting.</td></tr></tbody>
          )}
        </table>
      </section>

      <footer className="w-foot">
        No personal information is collected. Counts are anonymous: time, screen, and what was tapped.
        {srcText && <> Source: {srcText}.</>}
      </footer>
    </div>
  );
}
