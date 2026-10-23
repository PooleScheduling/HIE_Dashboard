// @ts-check
/// <reference types="google-apps-script" />
/// <reference path="./globals.d.ts" />

/**
 * Apps Script server for the HIE Engagement Report.
 *
 * How data flows:
 *   1. Start from MOCK_REPORT (built from src/data/mock.ts at deploy time), so the
 *      report always renders, even before any sheet is connected.
 *   2. Overlay values from the HIE Data Hub workbook (DATA_SHEET_ID):
 *        - "Metrics" tab: one row per metric; a row's MetricId replaces that metric.
 *        - "Stories" tab: approved stories replace the demo stories.
 *   3. Rebuild the Hub section live from the kiosk sheet (KIOSK_SHEET_ID).
 *
 * Only totals ever leave this file. Student-level rows stay in the sheets.
 *
 * Script properties (Project Settings → Script properties):
 *   DATA_SHEET_ID   ID of the HIE Data Hub workbook (optional at first)
 *   KIOSK_SHEET_ID  ID of the Feedback Kiosk Data sheet (optional)
 */

const CACHE_KEY = "report-v1";
const CACHE_SECONDS = 600; // 10 minutes
const TZ = "America/New_York";

function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("Poole HIE Engagement Report")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/** Called by the front end. Returns the report as a JSON string. */
function getReport() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) return hit;

  /** @type {any} */
  const report = JSON.parse(JSON.stringify(MOCK_REPORT));
  const props = PropertiesService.getScriptProperties();
  const dataId = props.getProperty("DATA_SHEET_ID");
  const kioskId = props.getProperty("KIOSK_SHEET_ID");

  if (dataId) {
    const book = SpreadsheetApp.openById(dataId);
    overlayMetrics_(report, book.getSheetByName("Metrics"));
    overlayStories_(report, book.getSheetByName("Stories"));
  }
  if (kioskId) buildHub_(report, SpreadsheetApp.openById(kioskId).getSheetByName("Responses"));

  report.asOf = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  const json = JSON.stringify(report);
  try { cache.put(CACHE_KEY, json, CACHE_SECONDS); } catch (e) { /* over 100KB: skip cache */ }
  return json;
}

/**
 * Called from the Contribute page. Appends validated CSV rows to the template's tab,
 * adding who uploaded and when.
 * @param {string} templateId
 * @param {string[][]} rows
 */
function appendRows(templateId, rows) {
  const dataId = PropertiesService.getScriptProperties().getProperty("DATA_SHEET_ID");
  if (!dataId) throw new Error("The data workbook isn't connected yet (DATA_SHEET_ID is not set).");
  const template = MOCK_REPORT.templates.find((/** @type {any} */ t) => t.id === templateId);
  if (!template) throw new Error("Unknown dataset: " + templateId);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("No rows to add.");
  if (rows.length > 5000) throw new Error("That file has more than 5,000 rows. Split it and upload again.");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const book = SpreadsheetApp.openById(dataId);
    const tab = book.getSheetByName(template.sheetTab) || book.insertSheet(template.sheetTab);
    const header = [...template.columns, "Uploaded by", "Uploaded at"];
    if (tab.getLastRow() === 0) tab.appendRow(header);

    const who = Session.getActiveUser().getEmail() || "unknown";
    const when = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
    const clean = rows.map((r) => template.columns.map((_, i) => String(r[i] ?? "").slice(0, 500)).concat([who, when]));
    tab.getRange(tab.getLastRow() + 1, 1, clean.length, header.length).setValues(clean);
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove(CACHE_KEY);
  return { added: rows.length };
}

// ---------- overlays ----------

/** Reads a tab into objects keyed by header row. */
function readTab_(/** @type {GoogleAppsScript.Spreadsheet.Sheet | null} */ sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const [head, ...body] = sheet.getDataRange().getDisplayValues();
  return body
    .filter((r) => r.some((c) => c !== ""))
    .map((r) => Object.fromEntries(head.map((h, i) => [String(h).trim(), String(r[i]).trim()])));
}

/** Every metric object in the report, so a Metrics row can find its target by id. */
function allMetrics_(/** @type {any} */ report) {
  const out = [...report.headline, ...report.hub.metrics];
  for (const s of report.sections) {
    if (s.cardMetric) out.push(s.cardMetric);
    out.push(...s.metrics);
  }
  return out;
}

/**
 * Metrics tab columns: MetricId | Value | Label | Change | Period | Source | SourceKind | UpdatedBy | UpdatedOn
 * Blank cells keep the existing value.
 */
function overlayMetrics_(/** @type {any} */ report, /** @type {any} */ sheet) {
  const byId = new Map(allMetrics_(report).map((m) => [m.id, m]));
  for (const row of readTab_(sheet)) {
    const m = byId.get(row.MetricId);
    if (!m) continue;
    if (row.Value) m.value = row.Value;
    if (row.Label) m.label = row.Label;
    if (row.Change) m.change = row.Change;
    if (row.Period) m.period = row.Period;
    if (row.Source) m.source.label = row.Source;
    if (row.SourceKind) m.source.kind = row.SourceKind;
    if (row.UpdatedBy) m.source.updatedBy = row.UpdatedBy;
    if (row.UpdatedOn) m.source.updatedOn = row.UpdatedOn;
  }
}

/** Stories tab columns: Quote | Program | Audience | Attribution | Source | Approved */
function overlayStories_(/** @type {any} */ report, /** @type {any} */ sheet) {
  const rows = readTab_(sheet).filter((r) => r.Quote && String(r.Approved).toUpperCase() === "TRUE");
  if (!rows.length) return;
  report.stories = rows.map((r, i) => ({
    id: "sheet-" + i,
    quote: r.Quote,
    program: r.Program || "Other",
    audience: r.Audience || "Student",
    attribution: r.Attribution || r.Audience || "",
    source: r.Source || "",
  }));
  report.featuredStoryId = report.stories[0].id;
}

/** Rebuilds the Hub section from kiosk responses (uses the Date column only). */
function buildHub_(/** @type {any} */ report, /** @type {any} */ sheet) {
  const rows = readTab_(sheet);
  if (!rows.length) return;
  /** @type {Record<string, number>} */ const weeks = {};
  const hours = Array(24).fill(0);
  /** @type {Record<string, number>} */ const days = {};
  let first = "";

  for (const r of rows) {
    const d = new Date(r.Date);
    if (isNaN(d.getTime())) continue;
    const hour = Number(Utilities.formatDate(d, TZ, "H"));
    const dow = Number(Utilities.formatDate(d, TZ, "u")); // 1 = Monday
    const monday = new Date(d.getTime() - (dow - 1) * 86400000);
    const wk = Utilities.formatDate(monday, TZ, "yyyy-MM-dd");
    weeks[wk] = (weeks[wk] || 0) + 1;
    hours[hour]++;
    const day = Utilities.formatDate(d, TZ, "EEE");
    days[day] = (days[day] || 0) + 1;
    const iso = Utilities.formatDate(d, TZ, "yyyy-MM-dd");
    if (!first || iso < first) first = iso;
  }

  // Fill missing weeks with 0 so gaps (kiosk offline) are visible.
  const keys = Object.keys(weeks).sort();
  const filled = [];
  for (let t = new Date(keys[0] + "T12:00:00"); Utilities.formatDate(t, TZ, "yyyy-MM-dd") <= keys[keys.length - 1]; t = new Date(t.getTime() + 7 * 86400000)) {
    const k = Utilities.formatDate(t, TZ, "yyyy-MM-dd");
    filled.push([Utilities.formatDate(t, TZ, "MMM d"), weeks[k] || 0]);
  }
  const used = hours.map((n, h) => [h, n]).filter(([, n]) => n > 0);
  const lo = used[0][0], hi = used[used.length - 1][0];
  const hourCats = [], hourVals = [];
  for (let h = lo; h <= hi; h++) {
    hourCats.push(h === 12 ? "12p" : h > 12 ? h - 12 + "p" : h + "a");
    hourVals.push(hours[h]);
  }
  const total = rows.length;
  const peakWeek = filled.reduce((a, b) => (b[1] > a[1] ? b : a));
  const peakHour = hours.indexOf(Math.max(...hours));
  const peakDay = Object.entries(days).reduce((a, b) => (b[1] > a[1] ? b : a));
  const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  const src = { kind: "live", label: "Feedback Kiosk Data", updatedBy: "Hub iPad", updatedOn: today };
  const firstLabel = Utilities.formatDate(new Date(first + "T12:00:00"), TZ, "MMM d");

  report.hub.weekly.categories = filled.map((w) => w[0]);
  report.hub.weekly.series[0].values = filled.map((w) => w[1]);
  const zeroWeeks = filled.filter((w) => w[1] === 0).map((w) => w[0]);
  report.hub.weekly.note = zeroWeeks.length ? "No check-ins the week of " + zeroWeeks.join(", ") + ". Was the kiosk offline?" : undefined;
  report.hub.hourly.categories = hourCats;
  report.hub.hourly.series[0].values = hourVals;
  report.hub.metrics = [
    { id: "hub-taps", value: total.toLocaleString(), label: "kiosk check-ins since " + firstLabel, source: src },
    { id: "hub-peak-week", value: String(peakWeek[1]), label: "busiest week (" + peakWeek[0] + ")", source: src },
    { id: "hub-peak-hour", value: peakHour === 12 ? "12 pm" : peakHour > 12 ? peakHour - 12 + " pm" : peakHour + " am", label: "busiest hour of the day", source: src },
    { id: "hub-peak-day", value: peakDay[0], label: "busiest weekday (" + peakDay[1] + " check-ins)", source: src },
  ];
}

/** Run this once from the Apps Script editor after changing sheets, to see fresh numbers right away. */
function clearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
}
