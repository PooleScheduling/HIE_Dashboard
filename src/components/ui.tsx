import type { Metric, Provenance, SourceKind } from "../data/types";

const kindLabel: Record<SourceKind, string> = {
  live: "Live",
  upload: "Uploaded",
  report: "Report",
  waiting: "Awaiting data",
};

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function Chip({ kind, text }: { kind: SourceKind; text?: string }) {
  return <span className={`chip c-${kind}`}>{text ?? kindLabel[kind]}</span>;
}

export function SourceLine({ source }: { source: Provenance }) {
  const parts = [source.label, source.updatedBy, source.updatedOn && formatDate(source.updatedOn)].filter(Boolean);
  return <span className="src">{parts.join(" · ")}</span>;
}

export function MetricTile({ m }: { m: Metric }) {
  return (
    <div className="panel kpi">
      <div className="n">{m.value}</div>
      <div className="l">{m.label}</div>
      {m.change && <div className="d">{m.change}</div>}
      <div className="foot">
        <Chip kind={m.source.kind} text={m.source.label} />
      </div>
    </div>
  );
}

export function PageHead({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) {
  return (
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
    </div>
  );
}
