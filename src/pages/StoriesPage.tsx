import { useMemo, useState } from "react";
import type { ReportData } from "../data/types";
import { Reveal, SplitHeader, accentForProgram, accentStyle } from "../components/ui";

const audiences = ["All", "Student", "Employer", "Faculty"];

export function StoriesPage({ data }: { data: ReportData }) {
  const programs = useMemo(() => ["All", ...new Set(data.stories.map((s) => s.program))], [data.stories]);
  const [program, setProgram] = useState("All");
  const [audience, setAudience] = useState("All");

  const list = data.stories.filter(
    (s) => (program === "All" || s.program === program) && (audience === "All" || s.audience === audience),
  );

  return (
    <div className="view">
      <SplitHeader
        eyebrow="In their words"
        title="Stories"
        lead="Quotes from students, employers and faculty, sorted by program and ready for an impact report."
        icon="quote"
        accent="stories"
      />
      <div className="filterbar">
        <Filter options={programs} value={program} onChange={setProgram} label="Program" />
        <Filter options={audiences} value={audience} onChange={setAudience} label="Who said it" />
      </div>
      {list.length ? (
        <div className="stories">
          {list.map((s, i) => (
            <Reveal key={s.id} delay={i * 60} className="story" style={accentStyle(accentForProgram(s.program))}>
              <blockquote>“{s.quote}”</blockquote>
              <footer>
                <strong title={`Source: ${s.source}`}>{s.attribution}</strong>
                <span className="tags">
                  <span className="tag accent">{s.program}</span>
                  <span className="tag">{s.audience}</span>
                </span>
              </footer>
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="empty">No stories match these filters.</div>
      )}
    </div>
  );
}

function Filter(props: { options: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="filters" role="group" aria-label={props.label}>
      <span className="label">{props.label}</span>
      {props.options.map((o) => (
        <button key={o} aria-pressed={o === props.value} onClick={() => props.onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
