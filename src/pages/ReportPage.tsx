import { useState } from "react";
import type { Coverage, ReportData, Story } from "../data/types";
import { CountUp, DownloadMenu, Fact, LabeledSection, MiniBars, Reveal, SourcesNote, SplitHeader, accentForProgram, accentStyle, formatDate, initials } from "../components/ui";
import { Icon, iconFor } from "../components/Icon";
import type { View } from "../components/Header";
import { printPage, reportCsv, saveBlob, saveCsv } from "../lib/download";

type Go = (v: View, anchor?: string) => void;
const headlineAccent = ["global", "packways", "internships"];

// The front page doubles as the final report: goal, headline numbers, program areas, a story.
export function ReportPage({ data, go }: { data: ReportData; go: Go }) {
  const keepers = Array.from(new Map(data.sections.map((s) => [s.owner, s])).values());
  const hubMetric = data.hub.metrics[0];
  const withData = data.sections.filter((s) => s.cardMetric);
  // HIE wall: total visits and visits per week, from the per-day totals.
  const wallDays = data.wall?.days ?? [];
  const wallVisits = wallDays.reduce((a, d) => a + d.visits[0] + d.visits[1] + d.visits[2], 0);
  const wallWeeks = new Map<string, number>();
  for (const d of wallDays) {
    const t = new Date(d.date + "T12:00:00");
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const k = t.toISOString().slice(0, 10);
    wallWeeks.set(k, (wallWeeks.get(k) ?? 0) + d.visits[0] + d.visits[1] + d.visits[2]);
  }

  return (
    <div className="view report">
      <SplitHeader
        compact
        eyebrow="Our goal"
        title={data.goal}
        lead={data.intro}
        icon="spark"
        accent="red"
        slot="report"
      >
        <button className="btn-outline" onClick={() => go("programs")}>Explore programs <Icon name="arrow" size={16} /></button>
        <button className="btn-outline" onClick={() => go("stories")}>Read student stories <Icon name="arrow" size={16} /></button>
      </SplitHeader>

      <div className="toolbar">
        <span className="toolbar-meta"><Icon name="calendar" size={16} /> Poole HIE Engagement Report · as of {formatDate(data.asOf)}</span>
        <DownloadMenu
          label="Download report"
          items={[
            { label: "PDF", hint: "This page, ready to print or share", icon: "printer", run: () => printPage("Poole HIE Engagement Report") },
            {
              label: "Word document",
              hint: "Full report with every program and chart",
              icon: "file",
              run: async () => {
                const { buildReportDocx } = await import("../lib/reportDoc");
                saveBlob(await buildReportDocx(data), "Poole-HIE-Engagement-Report.docx");
              },
            },
            { label: "Data (CSV)", hint: "Every number, for Excel or Sheets", icon: "table", run: () => saveCsv(reportCsv(data), "Poole-HIE-Engagement-Report-data.csv") },
          ]}
        />
      </div>

      {/* First screen: headline numbers next to the student picture, then every program area. */}
      <section className="overview" aria-label="By the numbers">
        <div className="ov-numbers">
          <p className="label">By the numbers</p>
          <div className="facts tight">
            {data.headline.map((m, i) => (
              <Fact key={m.id} m={m} accent={headlineAccent[i] ?? "packways"} delay={i * 90} />
            ))}
          </div>
        </div>
        <StudentDots c={data.coverage} />
      </section>

      <LabeledSection label="Program areas" title="Every way Poole students get there" className="compact-head">
        <div className="cards">
          {withData.map((s, i) => (
            <Reveal key={s.id} delay={(i % 3) * 70}>
              <button className="card" style={accentStyle(s.id)} onClick={() => go("programs", `p-${s.id}`)}>
                <span className="card-art" aria-hidden="true"><Icon name={iconFor(s.id)} size={150} /></span>
                <span className="card-ic"><Icon name={iconFor(s.id)} size={30} /></span>
                <span className="card-h">{s.title}</span>
                <span className="card-n">{s.cardMetric && <CountUp value={s.cardMetric.value} />}</span>
                <span className="card-t">{s.summary}</span>
                {s.charts[0] && <MiniBars chart={s.charts[0]} />}
                <span className="cta">Explore {s.kicker} <Icon name="arrow" size={14} /></span>
              </button>
            </Reveal>
          ))}
          {hubMetric && (
            <Reveal delay={(withData.length % 3) * 70}>
              <button className="card" style={accentStyle("hub")} onClick={() => go("hub")}>
                <span className="card-art" aria-hidden="true"><Icon name="pin" size={150} /></span>
                <span className="card-ic"><Icon name="pin" size={30} /></span>
                <span className="card-h">Poole Undergraduate Student Hub</span>
                <span className="card-n"><CountUp value={hubMetric.value} /></span>
                <span className="card-t">{hubMetric.label}</span>
                <MiniBars chart={data.hub.weekly} />
                <span className="cta">Explore the Hub <Icon name="arrow" size={14} /></span>
              </button>
            </Reveal>
          )}
          {wallVisits > 0 && (
            <Reveal delay={((withData.length + 1) % 3) * 70}>
              <button className="card" style={accentStyle("wall")} onClick={() => go("wall")}>
                <span className="card-art" aria-hidden="true"><Icon name="users" size={150} /></span>
                <span className="card-h">HIE Wall in Nelson Hall</span>
                <span className="card-n"><CountUp value={wallVisits.toLocaleString("en-US")} /></span>
                <span className="card-t">visits to the touchscreen wall since {new Date(wallDays[0].date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <MiniBars chart={{ title: "Visits per week", categories: [...wallWeeks.keys()], series: [{ name: "Visits", values: [...wallWeeks.values()] }] }} />
                <span className="cta">Explore the HIE Wall <Icon name="arrow" size={14} /></span>
              </button>
            </Reveal>
          )}
        </div>
      </LabeledSection>

      {data.stories.length > 0 && <Spotlight stories={data.stories} featuredId={data.featuredStoryId} go={go} />}

      <div className="split-row">
        <Reveal className="teams">
          <p className="label">Program teams</p>
          <h2>The people behind each program</h2>
          <ul className="team-list">
            {keepers.map((s) => (
              <li key={s.owner} style={accentStyle(s.id)}>
                <span className="avatar" aria-hidden="true">{initials(s.owner)}</span>
                <span>
                  <b>{s.owner}</b>
                  <small>{s.kicker}</small>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal className="block-cta" style={accentStyle("red")}>
          <h2>Share your program's numbers</h2>
          <p>Upload a spreadsheet for your program area and it shows up in this report.</p>
          <button className="btn-outline" onClick={() => go("contribute")}>Contribute data <Icon name="arrow" size={16} /></button>
        </Reveal>
      </div>

      <SourcesNote metrics={[...data.headline, ...withData.flatMap((s) => (s.cardMetric ? [s.cardMetric] : [])), ...(hubMetric ? [hubMetric] : [])]} />
    </div>
  );
}

// Story callout: one quote at a time with arrows and dots.
function Spotlight({ stories, featuredId, go }: { stories: Story[]; featuredId?: string; go: Go }) {
  const start = Math.max(0, stories.findIndex((s) => s.id === featuredId));
  const [i, setI] = useState(start);
  const s = stories[i];
  const step = (d: number) => setI((n) => (n + d + stories.length) % stories.length);

  return (
    <Reveal className="callout-block" style={accentStyle(accentForProgram(s.program))}>
      <p className="split-eyebrow">In their words</p>
      <div aria-live="polite">
        <blockquote key={s.id} className="fade-swap">“{s.quote}”</blockquote>
        <p className="callout-who">{s.attribution} · {s.program}</p>
      </div>
      <div className="callout-nav no-print">
        <button className="sq" onClick={() => step(-1)} aria-label="Previous story"><Icon name="left" /></button>
        <div className="dots">
          {stories.map((x, n) => (
            <button key={x.id} className="dot" aria-pressed={n === i} aria-label={`Story ${n + 1}`} onClick={() => setI(n)} />
          ))}
        </div>
        <button className="sq" onClick={() => step(1)} aria-label="Next story"><Icon name="right" /></button>
      </div>
      <button className="btn-outline no-print" onClick={() => go("stories")}>Read all stories <Icon name="arrow" size={16} /></button>
    </Reveal>
  );
}

// Every Poole undergraduate as one dot, colored by how many high-impact experiences they have
// on record. Hover a key (or tap it) to pick out one group. Plain SVG, so it prints as is.
function StudentDots({ c }: { c: Coverage }) {
  const [focus, setFocus] = useState<number | null>(null);
  if (!c.enrollment) return null;
  const per = c.enrollment > 4000 ? Math.ceil(c.enrollment / 3000) : 1;
  const none = Math.max(0, c.enrollment - c.students);
  const groups = [
    { label: "3 or more HIEs", n: c.byCount[2]?.n ?? 0 },
    { label: "2 HIEs", n: c.byCount[1]?.n ?? 0 },
    { label: "1 HIE", n: c.byCount[0]?.n ?? 0 },
    { label: "Not yet on record", n: none },
  ];
  const cols = 100;
  const total = groups.reduce((a, g) => a + Math.round(g.n / per), 0);
  const rows = Math.ceil(total / cols);
  let i = 0;
  const share = (n: number) => Math.round((n / c.enrollment) * 1000) / 10;
  const maxArea = Math.max(...c.byArea.map((a) => a.n), 1);
  return (
    <Reveal className="panel dots-panel">
      <div className="dots-main">
        <p className="label">Progress toward the goal</p>
        <h2><span className="dots-big">{c.students > 0 ? `About 1 in ${Math.max(1, Math.round(c.enrollment / c.students))}` : "None yet"}</span> Poole undergraduates {c.students >= c.enrollment ? "have" : "has"} a high-impact experience on record</h2>
        <svg className={`dots-art${focus !== null ? " focusing" : ""}`} viewBox={`0 0 ${cols * 10} ${rows * 10}`} role="img"
          aria-label={groups.map((g) => `${g.label}: ${fmtN(g.n)}`).join(", ")}>
          {groups.map((g, gi) => (
            <g key={g.label} className={`dot-g s${gi}${focus === gi ? " on" : ""}`}>
              {Array.from({ length: Math.round(g.n / per) }, () => {
                const k = i++;
                return <circle key={k} cx={(k % cols) * 10 + 5} cy={Math.floor(k / cols) * 10 + 5} r={3.6} style={{ animationDelay: `${Math.floor(k / cols) * 30}ms` }} />;
              })}
            </g>
          ))}
        </svg>
        <ul className="dots-legend">
          {groups.map((g, gi) => (
            <li key={g.label}>
              <button className={focus === gi ? "on" : ""} aria-pressed={focus === gi}
                onMouseEnter={() => setFocus(gi)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(gi)} onBlur={() => setFocus(null)}
                onClick={() => setFocus(focus === gi ? null : gi)}>
                <span className={`dot-key s${gi}`} aria-hidden="true" />
                <b>{fmtN(g.n)}</b> {g.label === "Not yet on record" ? "not yet on record" : `with ${g.label}`} <span className="src">({share(g.n)}%)</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="src">Each dot is {per === 1 ? "one student" : `${per} students`}, out of {fmtN(c.enrollment)} Poole undergraduates.</p>
      </div>
      <div className="goal-side">
        <p className="label">Where students found their HIE</p>
        <ul className="area-bars">
          {c.byArea.map((a) => (
            <li key={a.id} style={accentStyle(a.id)}>
              <span className="ab-label">{a.label}</span>
              <span className="ab-track"><span className="ab-fill" style={{ width: `${(a.n / maxArea) * 100}%` }} /></span>
              <b>{fmtN(a.n)}</b>
            </li>
          ))}
        </ul>
        <p className="src">A student counts once per area, and can appear in more than one.</p>
      </div>
    </Reveal>
  );
}

const fmtN = (n: number) => n.toLocaleString("en-US");
