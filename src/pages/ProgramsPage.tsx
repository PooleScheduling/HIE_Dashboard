import { useEffect, useState } from "react";
import type { ReportData, Section } from "../data/types";
import { Chart } from "../components/Chart";
import { DownloadMenu, Fact, Reveal, SourcesNote, SplitHeader, accentStyle, formatDate } from "../components/ui";
import { Icon, iconFor } from "../components/Icon";
import { metricsCsv, printPage, saveBlob, saveCsv, sectionMetrics, slug } from "../lib/download";

// Programs: a side menu of program areas, each with its own dashboard.
export function ProgramsPage({ data, anchor }: { data: ReportData; anchor?: string }) {
  const ids = data.sections.map((s) => s.id);
  const fromAnchor = anchor?.replace(/^p-/, "");
  const [sel, setSel] = useState(fromAnchor && ids.includes(fromAnchor) ? fromAnchor : ids[0]);

  useEffect(() => {
    if (fromAnchor && ids.includes(fromAnchor)) setSel(fromAnchor);
  }, [fromAnchor]); // eslint-disable-line react-hooks/exhaustive-deps

  const section = data.sections.find((s) => s.id === sel) ?? data.sections[0];
  const pick = (id: string) => {
    setSel(id);
    try { history.replaceState(null, "", `#programs/${id}`); } catch { /* Apps Script iframe may block this */ }
    document.querySelector(".prog-layout")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!section) return null;

  return (
    <div className="view">
      <div className="prog-layout">
        <aside className="side no-print" aria-label="Program areas">
          <p className="side-title">Program areas</p>
          <ul className="side-list">
            {data.sections.map((s) => (
              <li key={s.id}>
                <button className="side-item" style={accentStyle(s.id)} aria-current={s.id === sel ? "page" : undefined} onClick={() => pick(s.id)}>
                  <Icon name={iconFor(s.id)} size={18} />
                  <span className="side-text"><b>{s.kicker}</b></span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <ProgramDashboard key={section.id} s={section} data={data} />
      </div>
    </div>
  );
}

function ProgramDashboard({ s, data }: { s: Section; data: ReportData }) {
  const metrics = sectionMetrics(s);
  const all = s.cardMetric ? [s.cardMetric, ...metrics] : metrics;
  const updated = all.map((m) => m.source.updatedOn).filter(Boolean).sort().pop();
  const empty = metrics.length === 0 && s.charts.length === 0;
  const file = `Poole-HIE-${slug(s.kicker)}`;

  return (
    <div className="dash" id={`p-${s.id}`}>
      <SplitHeader
        compact
        eyebrow={s.kicker}
        title={s.title}
        icon={iconFor(s.id)}
        accent={s.id}
        lead={<>{s.cardMetric && <b>{s.cardMetric.value} </b>}{s.summary}</>}
      >
        <span className="split-meta"><Icon name="users" size={15} /> {s.owner}</span>
        {updated && <span className="split-meta"><Icon name="calendar" size={15} /> Updated {formatDate(updated)}</span>}
      </SplitHeader>

      <div className="toolbar">
        <span className="toolbar-meta">{[metrics.length && `${metrics.length} metrics`, s.charts.length && `${s.charts.length} ${s.charts.length === 1 ? "chart" : "charts"}`].filter(Boolean).join(" · ")}</span>
        {!empty && (
          <DownloadMenu
            label="Download"
            items={[
              { label: "PDF", hint: "This dashboard, ready to print or share", icon: "printer", run: () => printPage(`Poole HIE · ${s.title}`) },
              {
                label: "Word document",
                hint: "Numbers and charts for this program",
                icon: "file",
                run: async () => {
                  const { buildProgramDocx } = await import("../lib/reportDoc");
                  saveBlob(await buildProgramDocx(data, s), `${file}.docx`);
                },
              },
              { label: "Data (CSV)", hint: "Every number on this dashboard", icon: "table", run: () => saveCsv(metricsCsv(s.title, metrics), `${file}-data.csv`) },
            ]}
          />
        )}
      </div>

      {metrics.length > 0 && (
        <div className="facts boxed dyn" style={{ "--cols": metrics.length <= 4 ? metrics.length : metrics.length <= 6 ? 3 : 4 } as React.CSSProperties}>
          {metrics.map((m, i) => (
            <Fact key={m.id} m={m} accent={s.id} delay={i * 60} icon={iconFor(s.id)} />
          ))}
        </div>
      )}

      {s.charts.length > 0 && (
        <div className="grid two">
          {s.charts.map((c) => (
            <Reveal key={c.title} className="panel">
              <Chart chart={c} height={c.orientation === "horizontal" ? 220 : 280} />
            </Reveal>
          ))}
        </div>
      )}

      {empty && (
        <div className="empty big">
          <Icon name="database" size={30} />
          <b>No data reported for this period</b>
        </div>
      )}

      {s.note && <p className="note">{s.note}</p>}

      <SourcesNote metrics={all} />
    </div>
  );
}
