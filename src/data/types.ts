// The one shape the whole front end reads. src/analytics/build.ts computes it from the
// raw datasets: on the server from the Google Sheets, locally from sample rows.

export type SourceKind = "live" | "upload" | "report" | "waiting" | "sample";

export interface Provenance {
  kind: SourceKind;
  label: string; // e.g. "Annual impact report"
  updatedBy?: string;
  updatedOn?: string; // ISO date
}

export interface Metric {
  id: string;
  value: string; // pre-formatted for display, e.g. "6,776"
  label: string;
  change?: string; // e.g. "+6.3% vs AY25"
  period?: string; // e.g. "AY26"
  source: Provenance;
}

export interface ChartSeries {
  name: string;
  values: number[];
  labels?: string[]; // optional display text per value, e.g. "~20"
  emphasis?: boolean;
}

export interface Chart {
  title: string;
  kind?: "bar" | "line"; // default "bar"
  categories: string[];
  series: ChartSeries[];
  orientation?: "vertical" | "horizontal";
  note?: string;
}

export interface Section {
  id: string;
  title: string;
  kicker: string; // short label on the front-page card
  summary: string; // one sentence for the front-page card
  owner: string;
  status: SourceKind;
  cardMetric?: Metric; // the one number on the front-page card
  metrics: Metric[];
  charts: Chart[];
  note?: string;
}

export interface Story {
  id: string;
  quote: string;
  program: string;
  audience: "Student" | "Employer" | "Faculty";
  attribution: string;
  source: string;
}

// One person on a program team. Areas are section ids, or "hub".
// Real names come from the Team tab in the Data Hub workbook; the sample data has roles only.
export interface Person {
  id: string;
  name?: string;
  role: string;
  team: string; // Team.id
  areas: string[];
  lead?: boolean;
}

export interface Team {
  id: string;
  name: string;
  summary: string;
  parent?: string; // Team.id this team reports into (for the org tree)
}

export interface DataSource {
  name: string;
  owner: string;
  feeds: string;
  kind: SourceKind;
  howItGetsIn: string;
  lastUpdated?: string;
}

export interface TemplateColumn {
  name: string;
  example: string;
  note?: string;
  optional?: boolean;
}

// A dataset the dashboard reads, described as a template for the team that keeps it.
export interface UploadTemplate {
  id: string;
  name: string;
  area: string;
  owner: string;
  status: "confirmed" | "placeholder";
  description: string;
  likelySource: string;
  cadence: string;
  sheetTab: string;
  columns: TemplateColumn[];
  powers: string[];
  kind: SourceKind; // where its rows come from right now
  rows: number;
}

// Progress toward the goal: students with at least one HIE on record.
export interface Coverage {
  students: number;
  enrollment: number;
  byCount: { label: string; n: number }[]; // students with 1, 2, 3+ HIEs
  byArea: { id: string; label: string; n: number }[];
  source: Provenance;
}

export interface ReportData {
  title: string;
  goal: string;
  intro: string;
  asOf: string; // ISO date
  headline: Metric[];
  sections: Section[];
  hub: { weekly: Chart; hourly: Chart; weekday?: Chart; metrics: Metric[]; owner?: string };
  teams: Team[];
  people: Person[];
  stories: Story[];
  featuredStoryId?: string;
  sources: DataSource[];
  templates: UploadTemplate[];
  openIssues: string[];
  coverage: Coverage;
}
