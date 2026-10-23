import type { ReportData } from "../data/types";
import { Chart } from "../components/Chart";
import { Chip, PageHead } from "../components/ui";

const statusText = { live: "Live", upload: "Uploaded", report: "From report", waiting: "Awaiting data" } as const;

export function ProgramsPage({ data }: { data: ReportData }) {
  return (
    <section className="view">
      <PageHead
        title="Programs"
        lead="One card per HIE area. Areas without a connected source show what's missing and who owns it."
      />
      <div className="grid two">
        {data.sections.map((s) => (
          <article key={s.id} id={`p-${s.id}`} className="panel program-card">
            <div className="sec-head">
              <h3>{s.title}</h3>
              <Chip kind={s.status} text={statusText[s.status]} />
            </div>
            <p className="src">Owner: {s.owner}</p>
            {s.metrics.length > 0 && (
              <div className="stats">
                {s.metrics.map((m) => (
                  <div className="stat" key={m.id}>
                    <div className="n">{m.value}</div>
                    <div className="l">{m.label}</div>
                  </div>
                ))}
              </div>
            )}
            {s.charts.map((c) => (
              <Chart key={c.title} chart={c} height={c.orientation === "horizontal" ? 200 : 260} />
            ))}
            {s.metrics.length === 0 && s.charts.length === 0 && <div className="empty">{s.note}</div>}
            {s.note && (s.metrics.length > 0 || s.charts.length > 0) && <p className="note">{s.note}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
