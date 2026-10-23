import { useMemo, useState } from "react";
import type { ReportData } from "../data/types";
import { PageHead } from "../components/ui";

const audiences = ["All", "Student", "Employer", "Faculty"];

export function StoriesPage({ data }: { data: ReportData }) {
  const programs = useMemo(() => ["All", ...new Set(data.stories.map((s) => s.program))], [data.stories]);
  const [program, setProgram] = useState("All");
  const [audience, setAudience] = useState("All");

  const list = data.stories.filter(
    (s) => (program === "All" || s.program === program) && (audience === "All" || s.audience === audience),
  );

  return (
    <section className="view">
      <PageHead
        title="Stories"
        lead="Quotes from students, employers and faculty, sorted by program and ready for an impact report. Program owners add them through the Stories form."
      />
      <div className="sec-head" style={{ margin: 0 }}>
        <Filter options={programs} value={program} onChange={setProgram} label="Program" />
        <Filter options={audiences} value={audience} onChange={setAudience} label="Who said it" />
      </div>
      {list.length ? (
        <div className="stories">
          {list.map((s) => (
            <div className="panel story" key={s.id}>
              <blockquote>“{s.quote}”</blockquote>
              <footer>
                <strong>— {s.attribution}</strong>
                <span className="tag">{s.program}</span>
                <span className="tag">{s.audience}</span>
                <span>{s.source}</span>
              </footer>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">No stories match these filters yet.</div>
      )}
    </section>
  );
}

function Filter(props: { options: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="filters" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o} aria-pressed={o === props.value} onClick={() => props.onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
