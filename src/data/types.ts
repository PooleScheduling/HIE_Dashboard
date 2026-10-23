// The one shape the whole front end reads. The server (server/Code.js) builds this
// from the Google Sheets workbook; in local dev it comes from mock.ts.

export type SourceKind = "live" | "upload" | "report" | "waiting";

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

export interface DataSource {
  name: string;
  owner: string;
  feeds: string;
  kind: SourceKind;
  howItGetsIn: string;
  lastUpdated?: string;
}

export interface UploadTemplate {
  id: string;
  name: string;
  columns: string[];
  sheetTab: string;
}

export interface ReportData {
  title: string;
  goal: string;
  intro: string;
  asOf: string; // ISO date
  headline: Metric[];
  sections: Section[];
  hub: { weekly: Chart; hourly: Chart; metrics: Metric[] };
  stories: Story[];
  featuredStoryId?: string;
  sources: DataSource[];
  templates: UploadTemplate[];
  openIssues: string[];
}
