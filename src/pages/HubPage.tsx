import type { Chart as ChartData, Metric, ReportData } from "../data/types";
import { ChartExplorer, type ExplorerView } from "../components/ChartExplorer";
import { CountUp, DownloadMenu, Fact, LabeledSection, Reveal, SourcesNote, SplitHeader, formatDate } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { chartCsv, metricsCsv, printPage, saveBlob, saveCsv } from "../lib/download";

// Turns "7a", "12p", "3p" into 7, 12, 15.
const hourOf = (label: string) => {
  const n = parseInt(label, 10);
  return label.endsWith("p") ? (n === 12 ? 12 : n + 12) : n === 12 ? 0 : n;
};
const hourLabel = (h: number) => (h === 0 ? "12 am" : h === 12 ? "12 pm" : h > 12 ? `${h - 12} pm` : `${h} am`);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ordinal = (n: number) => (n === 1 ? "" : n === 2 ? "2nd " : n === 3 ? "3rd " : `${n}th `);
const rankOf = (xs: number[], i: number) => 1 + xs.filter((v) => v > xs[i]).length;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

type Highlight = { icon: IconName; value: string; title: string; text: string };

// Everything here is worked out from the weekly and hourly kiosk counts,
// so it updates on its own whenever the kiosk sheet does.
function analyze(data: ReportData) {
  const weekly = data.hub.weekly.series[0]?.values ?? [];
  const weeks = data.hub.weekly.categories;
  const hourly = data.hub.hourly.series[0]?.values ?? [];
  const hours = data.hub.hourly.categories.map(hourOf);
  const total = sum(weekly);
  const hourTotal = sum(hourly);
  const active = weekly.filter((v) => v > 0).length;
  const avg = active ? total / active : 0;

  const last4 = sum(weekly.slice(-4));
  const prev4 = sum(weekly.slice(-8, -4));
  const change = prev4 ? Math.round(((last4 - prev4) / prev4) * 100) : null;
  const peakI = weekly.indexOf(Math.max(...weekly));
  const zeroWeeks = weeks.filter((_, i) => weekly[i] === 0);

  const inRange = (lo: number, hi: number) => hourly.reduce((a, v, i) => (hours[i] >= lo && hours[i] < hi ? a + v : a), 0);
  const parts = [
    { name: "Morning", sub: "before noon", n: inRange(0, 12) },
    { name: "Afternoon", sub: "noon to 5 pm", n: inRange(12, 17) },
    { name: "Evening", sub: "5 pm and later", n: inRange(17, 24) },
  ];
  let best = { start: hours[0] ?? 0, n: 0 };
  for (let i = 0; i + 2 < hourly.length; i++) {
    const n = hourly[i] + hourly[i + 1] + hourly[i + 2];
    if (n > best.n) best = { start: hours[i], n };
  }
  const quietI = hourly.indexOf(Math.min(...hourly));

  let running = 0;
  const cumulative = weekly.map((v) => (running += v));
  const totalChart: ChartData = { title: "Total check-ins over the semester", kind: "line", categories: weeks, series: [{ name: "Running total", values: cumulative, emphasis: true }] };
  const todChart: ChartData = {
    title: "Check-ins by time of day",
    orientation: "horizontal",
    categories: parts.map((p) => `${p.name} (${p.sub})`),
    series: [{ name: "Check-ins", values: parts.map((p) => p.n), labels: parts.map((p) => `${pct(p.n, hourTotal)}%`), emphasis: true }],
  };

  const views: ExplorerView[] = [
    {
      id: "week",
      label: "By week",
      chart: data.hub.weekly,
      detail: (i) => {
        const v = weekly[i];
        const prev = i > 0 ? weekly[i - 1] : null;
        const vs = prev === null ? "the first week of the semester" : prev === 0 ? `up from ${prev} the week before` : `${v >= prev ? "up" : "down"} ${Math.abs(Math.round(((v - prev) / prev) * 100))}% from the week before`;
        return v === 0
          ? { value: "0", text: "No check-ins were recorded this week." }
          : { value: plural(v, "check-in"), text: `The ${ordinal(rankOf(weekly, i))}busiest of ${weeks.length} weeks, ${vs}.` };
      },
    },
    {
      id: "total",
      label: "Running total",
      chart: totalChart,
      start: cumulative.length - 1,
      detail: (i) => ({ value: plural(cumulative[i], "check-in"), text: `by the week of ${weeks[i]}, ${pct(cumulative[i], total)}% of this semester's total so far.` }),
    },
    {
      id: "hour",
      label: "By hour",
      chart: data.hub.hourly,
      height: 280,
      detail: (i) => ({ value: plural(hourly[i], "check-in"), text: `${pct(hourly[i], hourTotal)}% of all visits start in the ${hourLabel(hours[i])} hour, the ${ordinal(rankOf(hourly, i))}busiest hour of the day.` }),
    },
    {
      id: "tod",
      label: "Time of day",
      chart: todChart,
      height: 220,
      detail: (i) => ({ value: `${pct(parts[i].n, hourTotal)}%`, text: `of visits happen in the ${parts[i].name.toLowerCase()} (${parts[i].sub}): ${plural(parts[i].n, "check-in")}.` }),
    },
  ];
  if (data.hub.weekday) {
    const wd = data.hub.weekday;
    const vals = wd.series[0]?.values ?? [];
    views.push({ id: "weekday", label: "By weekday", chart: wd, detail: (i) => ({ value: plural(vals[i], "check-in"), text: `${pct(vals[i], sum(vals))}% of visits happen on ${wd.categories[i]}.` }) });
  }

  // Always six cards, so the grid stays even.
  const highlights: Highlight[] = [
    change !== null
      ? { icon: "trend", value: `${change > 0 ? "+" : ""}${change}%`, title: "Recent trend", text: `${last4} check-ins in the last four weeks, against ${prev4} in the four weeks before.` }
      : { icon: "trend", value: String(weeks.length), title: "Weeks of data", text: "Trends appear once there are eight weeks of check-ins." },
    { icon: "calendar", value: String(weekly[peakI] ?? 0), title: `Busiest week: ${weeks[peakI] ?? "—"}`, text: avg ? `About ${(weekly[peakI] / avg).toFixed(1)} times a typical week.` : "" },
    { icon: "users", value: String(Math.round(avg)), title: "A typical week", text: `Average check-ins across the ${plural(active, "week")} the kiosk was used.` },
    { icon: "clock", value: `${pct(best.n, hourTotal)}%`, title: `Rush hour: ${hourLabel(best.start)}–${hourLabel(best.start + 3)}`, text: "Share of all visits in the busiest three-hour stretch." },
    { icon: "spark", value: `${pct(parts[1].n, hourTotal)}%`, title: "Afternoons rule", text: `Mornings bring ${pct(parts[0].n, hourTotal)}% of visits and evenings ${pct(parts[2].n, hourTotal)}%.` },
    zeroWeeks.length
      ? { icon: "database", value: String(zeroWeeks.length), title: zeroWeeks.length === 1 ? "Week with no check-ins" : "Weeks with no check-ins", text: `No check-ins recorded the week of ${zeroWeeks.join(", ")}.` }
      : { icon: "database", value: hourLabel(hours[quietI]), title: "Quietest hour", text: `Only ${plural(hourly[quietI], "check-in")} so far.` },
  ];

  const src = data.hub.metrics[0]?.source ?? { kind: "live" as const, label: "Feedback Kiosk Data" };
  const extraMetrics: Metric[] = highlights.map((h, i) => ({ id: `hub-h${i}`, value: h.value, label: `${h.title}. ${h.text}`, source: src }));
  return { views, highlights, extraMetrics, charts: [data.hub.weekly, totalChart, data.hub.hourly, todChart] };
}

export function HubPage({ data }: { data: ReportData }) {
  const a = analyze(data);

  return (
    <div className="view">
      <SplitHeader
        eyebrow="The Hub"
        title="Poole Undergraduate Student Hub"
        lead="Check-ins on the Hub kiosk iPad. Each tap counts as one visit, so read this as traffic, not unique students."
        accent="hub"
      >
        <span className="split-meta"><span className="live-dot" aria-hidden="true" /> Live from the kiosk</span>
        {data.hub.owner && <span className="split-meta"><Icon name="users" size={15} /> Run by {data.hub.owner}</span>}
      </SplitHeader>
      <div className="toolbar">
        <span className="toolbar-meta"><Icon name="calendar" size={16} /> Updated {formatDate(data.hub.metrics[0]?.source.updatedOn)}</span>
        <DownloadMenu
          label="Download"
          items={[
            { label: "PDF", hint: "This page, ready to print or share", icon: "printer", run: () => printPage("Poole HIE · The Hub") },
            {
              label: "Word document",
              hint: "Numbers and charts for the Hub",
              icon: "file",
              run: async () => {
                const { buildHubDocx } = await import("../lib/reportDoc");
                saveBlob(await buildHubDocx(data), "Poole-HIE-Hub.docx");
              },
            },
            { label: "Data (CSV)", hint: "Every number on this page", icon: "table", run: () => saveCsv(metricsCsv("The Hub", [...data.hub.metrics, ...a.extraMetrics]), "Poole-HIE-Hub-data.csv") },
            { label: "Chart data (CSV)", hint: "Weekly and hourly counts", icon: "table", run: () => saveCsv(a.charts.flatMap((c) => [[c.title], ...chartCsv(c), []]), "Poole-HIE-Hub-charts.csv") },
          ]}
        />
      </div>

      <div className="facts boxed">
        {data.hub.metrics.map((m, i) => (
          <Fact key={m.id} m={m} accent="hub" delay={i * 70} />
        ))}
      </div>

      <LabeledSection label="Explore the traffic" title="Pick a view, then click any bar">
        <ChartExplorer views={a.views} />
      </LabeledSection>

      <LabeledSection label="What stands out" title="Highlights">
        <div className="highlights">
          {a.highlights.map((h, i) => (
            <Reveal key={h.title} delay={(i % 3) * 70} className="highlight">
              <span className="hl-ic"><Icon name={h.icon} size={20} /></span>
              <span className="hl-v"><CountUp value={h.value} /></span>
              <span className="hl-t">{h.title}</span>
              <span className="hl-x">{h.text}</span>
            </Reveal>
          ))}
        </div>
      </LabeledSection>

      <SourcesNote metrics={data.hub.metrics} />
    </div>
  );
}
