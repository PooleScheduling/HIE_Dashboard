import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Chart, Metric, ReportData, Section } from "../data/types";
import { chartToPng } from "../components/Chart";
import { sectionMetrics } from "./download";

// Builds Word documents (.docx) of the report in the browser.
// Brand colors match NC State: Wolfpack Red #CC0000 and dark gray #333333.

const RED = "CC0000";
const INK = "333333";
const MUTED = "666666";
const FONT = "Arial";

const fmtDate = (iso?: string) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

const text = (t: string, o: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) =>
  new TextRun({ text: t, font: FONT, color: o.color ?? INK, size: o.size ?? 22, bold: o.bold, italics: o.italics });

const para = (runs: TextRun[], o: { after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ children: runs, spacing: { after: o.after ?? 120, before: o.before ?? 0 }, alignment: o.align });

const h1 = (t: string) => para([text(t, { bold: true, color: RED, size: 44 })], { after: 160 });
const h2 = (t: string) =>
  new Paragraph({
    children: [text(t, { bold: true, size: 32 })],
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 4 } },
  });
const h3 = (t: string) => para([text(t, { bold: true, size: 24 })], { before: 200, after: 80 });
const label = (t: string) => para([text(t.toUpperCase(), { bold: true, color: RED, size: 18 })], { after: 60 });

function cell(t: string, head: boolean, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: RED } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [para([text(t, { bold: head, color: head ? "FFFFFF" : INK, size: 20 })], { after: 0 })],
  });
}

// Page is 8.5in wide with 0.75in margins: 10080 twips of usable width.
const PAGE_W = 10080;

function table(head: string[], rows: string[][], weights: number[] = head.map(() => 1)) {
  const total = weights.reduce((a, b) => a + b, 0);
  const columnWidths = weights.map((w) => Math.floor((PAGE_W * w) / total));
  const line = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" };
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths,
    borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, true, columnWidths[i])) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, false, columnWidths[i])) })),
    ],
  });
}

const metricTable = (metrics: Metric[]) =>
  table(
    ["Number", "What it measures", "Change", "Source"],
    metrics.map((m) => [
      m.value,
      m.label + (m.period ? ` (${m.period})` : ""),
      m.change ?? "",
      [m.source.label, fmtDate(m.source.updatedOn)].filter(Boolean).join(", "),
    ]),
    [1.3, 4, 1.6, 2.6],
  );

function base64ToBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(",")[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function chartBlock(c: Chart): Paragraph[] {
  const w = 900;
  const h = c.orientation === "horizontal" ? 340 : 420;
  const png = chartToPng(c, w, h);
  const out = [
    h3(c.title),
    new Paragraph({
      children: [new ImageRun({ type: "png", data: base64ToBytes(png), transformation: { width: 600, height: Math.round((600 * h) / w) } })],
      spacing: { after: 80 },
    }),
  ];
  if (c.note) out.push(para([text(c.note, { color: MUTED, size: 18, italics: true })]));
  return out;
}

function sectionBlock(s: Section): (Paragraph | Table)[] {
  const metrics = sectionMetrics(s);
  const out: (Paragraph | Table)[] = [
    h2(s.title),
    para([text(`Owner: ${s.owner}`, { color: MUTED, size: 20 })], { after: 120 }),
    para([
      ...(s.cardMetric ? [text(`${s.cardMetric.value} `, { bold: true })] : []),
      text(s.summary),
    ]),
  ];
  if (metrics.length) out.push(metricTable(metrics));
  else out.push(para([text("No data reported for this period.", { color: MUTED, italics: true })]));
  for (const c of s.charts) out.push(...chartBlock(c));
  if (s.note) out.push(para([text(s.note, { color: MUTED, size: 18, italics: true })], { before: 120 }));
  return out;
}

function header(data: ReportData, title: string): Paragraph[] {
  return [
    label("Poole College of Management · NC State University"),
    h1(title),
    para([text(`High-Impact Experiences · As of ${fmtDate(data.asOf)}`, { color: MUTED })], { after: 240 }),
  ];
}

function makeDoc(children: (Paragraph | Table)[]) {
  return new Document({
    creator: "Poole College of Management",
    title: "Poole HIE Engagement Report",
    styles: { default: { document: { run: { font: FONT, size: 22, color: INK } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  text("Poole HIE Engagement Report · Page ", { color: MUTED, size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

export async function buildReportDocx(data: ReportData): Promise<Blob> {
  const featured = data.stories.find((s) => s.id === data.featuredStoryId) ?? data.stories[0];
  const children: (Paragraph | Table)[] = [
    ...header(data, data.title),
    label("Our goal"),
    para([text(data.goal, { bold: true, size: 30 })], { after: 120 }),
    para([text(data.intro)], { after: 240 }),
    h2("By the numbers"),
    metricTable(data.headline),
    h2("Program areas at a glance"),
    table(
      ["Program area", "Headline", "Owner"],
      data.sections.map((s) => [s.title, s.cardMetric ? `${s.cardMetric.value} ${s.cardMetric.label}` : "Not reported", s.owner]),
      [3, 4, 2.5],
    ),
    ...data.sections.flatMap(sectionBlock),
    h2("The Hub"),
    metricTable(data.hub.metrics),
    ...chartBlock(data.hub.weekly),
    ...chartBlock(data.hub.hourly),
  ];
  if (featured) {
    children.push(
      h2("In their words"),
      ...data.stories.flatMap((s) => [
        para([text(`“${s.quote}”`, { italics: true })], { after: 60 }),
        para([text(`${s.attribution} · ${s.program}`, { color: MUTED, size: 18 })], { after: 200 }),
      ]),
    );
  }
  return Packer.toBlob(makeDoc(children));
}

export async function buildProgramDocx(data: ReportData, s: Section): Promise<Blob> {
  return Packer.toBlob(makeDoc([...header(data, s.title), ...sectionBlock(s).slice(1)]));
}

export async function buildHubDocx(data: ReportData): Promise<Blob> {
  return Packer.toBlob(
    makeDoc([
      ...header(data, "Poole Undergraduate Student Hub"),
      metricTable(data.hub.metrics),
      ...chartBlock(data.hub.weekly),
      ...chartBlock(data.hub.hourly),
    ]),
  );
}
