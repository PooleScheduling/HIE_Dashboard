import { useState } from "react";
import type { Person, ReportData, Team } from "../data/types";
import { LabeledSection, Reveal, SplitHeader, accentStyle, initials } from "../components/ui";
import { Icon, iconFor } from "../components/Icon";
import type { View } from "../components/Header";

type Go = (v: View, anchor?: string) => void;
type Area = { id: string; label: string };

// Meet the team: how the teams fit together, and which program areas each person covers.
export function TeamPage({ data, go }: { data: ReportData; go: Go }) {
  const areas: Area[] = [...data.sections.map((s) => ({ id: s.id, label: s.kicker })), { id: "hub", label: "The Hub" }];
  const [focus, setFocus] = useState<string | null>(null);

  const roots = data.teams.filter((t) => !t.parent || !data.teams.some((x) => x.id === t.parent));
  const childrenOf = (id: string) => data.teams.filter((t) => t.parent === id);
  const peopleIn = (id: string) =>
    data.people.filter((p) => p.team === id).sort((a, b) => Number(!!b.lead) - Number(!!a.lead));
  const teamName = (id: string) => data.teams.find((t) => t.id === id)?.name ?? id;
  const openArea = (id: string) => (id === "hub" ? go("hub") : go("programs", `p-${id}`));

  // Areas covered by more than one program team (the top-level office oversees everything, so it doesn't count).
  const rootIds = new Set(roots.map((r) => r.id));
  const shared = areas
    .map((a) => ({ area: a, teams: [...new Set(data.people.filter((p) => p.areas.includes(a.id) && !rootIds.has(p.team)).map((p) => p.team))] }))
    .filter((x) => x.teams.length > 1);
  const multi = data.people.filter((p) => p.areas.length > 1).length;

  return (
    <div className="view">
      <SplitHeader
        eyebrow="Who runs what"
        title="Meet the team"
        lead="The teams behind Poole's high-impact experiences, and the program areas each one covers. Many people work across more than one area."
        accent="red"
        slot="team"
      />

      <div className="facts boxed">
        <TeamFact n={data.teams.length} label="teams" icon="tree" />
        <TeamFact n={data.people.length} label="people keeping programs running" icon="users" />
        <TeamFact n={multi} label="people working across more than one area" icon="spark" />
        <TeamFact n={shared.length} label={shared.length === 1 ? "program area shared between teams" : "program areas shared between teams"} icon="globe" />
      </div>

      <div className="area-filter no-print" role="group" aria-label="Highlight a program area">
        <span className="label">Highlight an area</span>
        <button aria-pressed={focus === null} onClick={() => setFocus(null)}>All</button>
        {areas.map((a) => (
          <button key={a.id} style={accentStyle(a.id)} aria-pressed={focus === a.id} onClick={() => setFocus(focus === a.id ? null : a.id)}>
            <Icon name={iconFor(a.id)} size={15} /> {a.label}
          </button>
        ))}
      </div>

      <LabeledSection label="How the teams fit together" title="Team structure">
        <div className="tree">
          {roots.map((root) => (
            <div key={root.id} className="tree-root">
              <TeamNode team={root} people={peopleIn(root.id)} areas={areas} focus={focus} openArea={openArea} root />
              {childrenOf(root.id).length > 0 && (
                <div className="tree-branches">
                  {childrenOf(root.id).map((t, i) => (
                    <Reveal key={t.id} className="tree-branch" delay={i * 60}>
                      <TeamNode team={t} people={peopleIn(t.id)} areas={areas} focus={focus} openArea={openArea} />
                    </Reveal>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </LabeledSection>

      <LabeledSection label="Overlapping areas" title="Who covers what">
        <div className="panel tscroll">
          <table className="matrix">
            <thead>
              <tr>
                <th>Person</th>
                <th>Team</th>
                {areas.map((a) => (
                  <th key={a.id} className={`m-col${focus === a.id ? " on" : ""}`} style={accentStyle(a.id)}>
                    <button className="m-head" onClick={() => setFocus(focus === a.id ? null : a.id)} title={`Highlight ${a.label}`}>
                      <Icon name={iconFor(a.id)} size={16} />
                      <span>{a.label}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.teams.flatMap((t) => peopleIn(t.id)).map((p) => (
                <tr key={p.id} className={focus && !p.areas.includes(focus) ? "dim" : ""}>
                  <td><b>{p.name ?? p.role}</b>{p.name && <small className="src"> · {p.role}</small>}</td>
                  <td className="src">{teamName(p.team)}</td>
                  {areas.map((a) => (
                    <td key={a.id} className={`m-cell${focus === a.id ? " on" : ""}`} style={accentStyle(a.id)}>
                      {p.areas.includes(a.id) && <span className="m-dot" aria-label={`Covers ${a.label}`} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}><b>People per area</b></td>
                {areas.map((a) => (
                  <td key={a.id} className={`m-cell num${focus === a.id ? " on" : ""}`}>{data.people.filter((p) => p.areas.includes(a.id)).length}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        {shared.length > 0 && (
          <ul className="shared-list">
            {shared.map(({ area, teams }) => (
              <li key={area.id} style={accentStyle(area.id)}>
                <Icon name={iconFor(area.id)} size={18} />
                <span><b>{area.label}</b> is shared by {listJoin(teams.map(teamName))}.</span>
              </li>
            ))}
          </ul>
        )}
      </LabeledSection>
    </div>
  );
}

function TeamNode({ team, people, areas, focus, openArea, root }: { team: Team; people: Person[]; areas: Area[]; focus: string | null; openArea: (id: string) => void; root?: boolean }) {
  const covered = areas.filter((a) => people.some((p) => p.areas.includes(a.id)));
  const lit = !focus || people.some((p) => p.areas.includes(focus));
  return (
    <div className={`team-node${root ? " root" : ""}${lit ? "" : " dim"}`}>
      <div className="tn-head">
        <h3>{team.name}</h3>
        {team.summary && <p>{team.summary}</p>}
      </div>
      <ul className="tn-people">
        {people.map((p) => (
          <li key={p.id} className={focus && !p.areas.includes(focus) ? "dim" : ""}>
            <span className="avatar" style={accentStyle(p.areas.length === 1 ? p.areas[0] : "red")} aria-hidden="true">{initials(p.name ?? p.role)}</span>
            <span>
              <b>{p.name ?? p.role}</b>
              <small>{p.name ? p.role : p.lead ? "Team lead" : ""}{p.name && p.lead ? " · Team lead" : ""}</small>
            </span>
          </li>
        ))}
        {people.length === 0 && <li className="src">No one listed yet</li>}
      </ul>
      {covered.length > 0 && !root && (
        <div className="tn-areas">
          {covered.map((a) => (
            <button key={a.id} className="area-tag" style={accentStyle(a.id)} onClick={() => openArea(a.id)}>
              <Icon name={iconFor(a.id)} size={13} /> {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamFact({ n, label, icon }: { n: number; label: string; icon: "tree" | "users" | "spark" | "globe" }) {
  return (
    <div className="fact" style={accentStyle("red")}>
      <span className="fact-ic"><Icon name={icon} size={22} /></span>
      <div className="fact-n">{n}</div>
      <div className="fact-l">{label}</div>
    </div>
  );
}

function listJoin(xs: string[]): string {
  return xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
