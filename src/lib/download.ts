import type { Chart, Metric, ReportData, Section } from "../data/types";

// Saves a file in the browser. Everything is built on the viewer's machine; nothing is sent anywhere.
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function saveDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const slug = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function csvCell(v: string | number | undefined): string {
  const s = v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: (string | number | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
export function saveCsv(rows: (string | number | undefined)[][], filename: string) {
  // The BOM makes Excel open the file as UTF-8.
  saveBlob(new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" }), filename);
}

const metricHeader = ["Area", "Metric", "Value", "Change", "Period", "Source", "Updated by", "Updated on"];
const metricRow = (area: string, m: Metric) => [
  area, m.label, m.value, m.change, m.period, m.source.label, m.source.updatedBy, m.source.updatedOn,
];

export function sectionMetrics(s: Section): Metric[] {
  return s.metrics.length ? s.metrics : s.cardMetric ? [s.cardMetric] : [];
}

export function reportCsv(data: ReportData): (string | number | undefined)[][] {
  return [
    metricHeader,
    ...data.headline.map((m) => metricRow("Headline", m)),
    ...data.sections.flatMap((s) => sectionMetrics(s).map((m) => metricRow(s.title, m))),
    ...data.hub.metrics.map((m) => metricRow("The Hub", m)),
  ];
}

export function metricsCsv(area: string, metrics: Metric[]) {
  return [metricHeader, ...metrics.map((m) => metricRow(area, m))];
}

export function chartCsv(c: Chart) {
  return [
    ["Category", ...c.series.map((s) => s.name)],
    ...c.categories.map((cat, i) => [cat, ...c.series.map((s) => s.values[i])]),
  ];
}

// Opens the browser's print dialog, where "Save as PDF" makes the PDF.
// Prints in the light theme, and uses the title as the suggested file name.
export function printPage(title: string) {
  const root = document.documentElement;
  const prevTheme = root.dataset.theme;
  const prevTitle = document.title;
  root.dataset.theme = "light";
  document.title = title;
  const restore = () => {
    root.dataset.theme = prevTheme;
    document.title = prevTitle;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  // Give the charts a moment to redraw in light colors first.
  setTimeout(() => window.print(), 150);
}
