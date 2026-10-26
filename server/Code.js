// @ts-check
/// <reference types="google-apps-script" />
/// <reference path="./globals.d.ts" />

/**
 * Apps Script server for the HIE Engagement Report.
 *
 * How data flows:
 *   1. Read each dataset's rows from its tab in the HIE Data Hub workbook (DATA_SHEET_ID),
 *      and the Hub check-ins from the kiosk sheet (KIOSK_SHEET_ID). The datasets and their
 *      tab names are listed in src/analytics/datasets.ts.
 *   2. Datasets that aren't connected yet use the sample rows, so the report always renders.
 *      Set USE_SAMPLE_ROWS to "false" to show those areas as not reported instead.
 *   3. HIE.buildReport (src/analytics/build.ts, bundled as build/Analytics.js) works out every
 *      number, chart and data note from the rows. The browser runs the same code locally.
 *   4. Optional overrides: "Metrics" tab (replace a computed number by MetricId) and
 *      "Team" tab (people and their program areas).
 *
 * Only totals ever leave this file. Student-level rows stay in the sheets.
 *
 * Script properties (Project Settings → Script properties):
 *   DATA_SHEET_ID     ID of the HIE Data Hub workbook (optional at first)
 *   KIOSK_SHEET_ID    ID of the Feedback Kiosk Data sheet (optional)
 *   USE_SAMPLE_ROWS   "false" to stop using sample rows for unconnected datasets
 *   PHOTO_EDITORS     Comma-separated emails allowed to upload and place photos.
 *                     If blank, only the account that deployed the app can.
 *   PHOTOS_FOLDER_ID  Drive folder for uploaded photos (created automatically on first upload)
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

  const props = PropertiesService.getScriptProperties();
  const dataId = props.getProperty("DATA_SHEET_ID");
  const kioskId = props.getProperty("KIOSK_SHEET_ID");
  const useSamples = props.getProperty("USE_SAMPLE_ROWS") !== "false";
  const book = dataId ? SpreadsheetApp.openById(dataId) : null;

  /** @type {Record<string, Record<string, string>[]>} */ const rows = {};
  /** @type {Record<string, string>} */ const kinds = {};
  for (const d of HIE.datasets) {
    /** @type {Record<string, string>[]} */ let r = [];
    if (d.id === "hub_checkins") {
      if (kioskId) {
        const kiosk = SpreadsheetApp.openById(kioskId);
        r = readTab_(kiosk.getSheetByName(d.sheetTab) || kiosk.getSheets()[0]);
        if (r.length) kinds[d.id] = "live";
      }
    } else if (book) {
      r = readTab_(book.getSheetByName(d.sheetTab));
      if (r.length) kinds[d.id] = "upload";
    }
    rows[d.id] = r.length ? r : useSamples ? HIE.sampleRows[d.id] || [] : [];
  }

  const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  /** @type {any} */
  const report = HIE.buildReport(rows, { asOf: today, kinds });
  if (book) {
    overlayMetrics_(report, book.getSheetByName("Metrics"));
    overlayTeam_(report, book.getSheetByName("Team"));
  }

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
  const template = HIE.datasets.find((/** @type {any} */ d) => d.id === templateId);
  if (!template || templateId === "hub_checkins") throw new Error("Unknown dataset: " + templateId);
  /** @type {string[]} */
  const columns = template.columns.filter((/** @type {any} */ c) => !c.optional).map((/** @type {any} */ c) => c.name);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("No rows to add.");
  if (rows.length > 5000) throw new Error("That file has more than 5,000 rows. Split it and upload again.");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const book = SpreadsheetApp.openById(dataId);
    const tab = book.getSheetByName(template.sheetTab) || book.insertSheet(template.sheetTab);
    const header = [...columns, "Uploaded by", "Uploaded at"];
    if (tab.getLastRow() === 0) tab.appendRow(header);

    const who = Session.getActiveUser().getEmail() || "unknown";
    const when = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
    const clean = rows.map((r) => columns.map((_, i) => String(r[i] ?? "").slice(0, 500)).concat([who, when]));
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

/**
 * Team tab columns: Name | Role | Team | Areas | Lead
 * Areas is a comma-separated list of program areas (Global, Internships, Practicum, Packways, Career, Hub).
 * A Team name that isn't in the sample list becomes a new team under the HIE Office.
 */
function overlayTeam_(/** @type {any} */ report, /** @type {any} */ sheet) {
  const rows = readTab_(sheet).filter((r) => r.Name || r.Role);
  if (!rows.length) return;
  /** @param {string} s */
  const key = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  /** @type {Record<string, string>} */
  const areaIds = { hub: "hub", "the-hub": "hub" };
  for (const s of report.sections) {
    areaIds[s.id] = s.id;
    areaIds[key(s.kicker)] = s.id;
    areaIds[key(s.title)] = s.id;
  }
  const teamByName = new Map(report.teams.map((/** @type {any} */ t) => [key(t.name), t]));
  report.people = rows.map((r, i) => {
    let team = teamByName.get(key(r.Team || "HIE Office"));
    if (!team) {
      team = { id: key(r.Team), name: r.Team, summary: "", parent: "hie-office" };
      report.teams.push(team);
      teamByName.set(key(r.Team), team);
    }
    const areas = String(r.Areas || "").split(",").map((a) => areaIds[key(a)]).filter(Boolean);
    return { id: "t" + i, name: r.Name || undefined, role: r.Role || "", team: team.id, areas, lead: String(r.Lead).toUpperCase() === "TRUE" };
  });
}

// ---------- photos ----------
// Photos live in a Drive folder in the deploying account. Which page uses which photo
// is kept in the PHOTO_SLOTS script property as JSON: { "<page or program id>": "<file id>" }.

function canEditPhotos_() {
  const props = PropertiesService.getScriptProperties();
  const me = (Session.getActiveUser().getEmail() || "").toLowerCase();
  const owner = (Session.getEffectiveUser().getEmail() || "").toLowerCase();
  const editors = String(props.getProperty("PHOTO_EDITORS") || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return !!me && (me === owner || editors.includes(me));
}

function photosFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("PHOTOS_FOLDER_ID");
  if (id) return DriveApp.getFolderById(id);
  const folder = DriveApp.createFolder("HIE Report Photos");
  props.setProperty("PHOTOS_FOLDER_ID", folder.getId());
  return folder;
}

function photoSlots_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty("PHOTO_SLOTS") || "{}"); } catch (e) { return {}; }
}

/** @param {GoogleAppsScript.Drive.File} f */
function photoItem_(f) {
  const blob = f.getBlob();
  return {
    id: f.getId(),
    name: f.getName(),
    src: "data:" + (f.getMimeType() || "image/jpeg") + ";base64," + Utilities.base64Encode(blob.getBytes()),
    addedOn: Utilities.formatDate(f.getDateCreated(), TZ, "yyyy-MM-dd"),
  };
}

/** Called by the front end. Returns the photo gallery, page assignments and whether this viewer can edit. */
function getPhotos() {
  const props = PropertiesService.getScriptProperties();
  const slots = photoSlots_();
  /** @type {any[]} */ const photos = [];
  if (props.getProperty("PHOTOS_FOLDER_ID")) {
    const files = photosFolder_().getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (!f.isTrashed() && f.getSize() > 0 && String(f.getMimeType()).startsWith("image/")) photos.push(photoItem_(f));
    }
    photos.sort((a, b) => (a.addedOn < b.addedOn ? 1 : -1));
  }
  return JSON.stringify({ photos, slots, canEdit: canEditPhotos_() });
}

/**
 * @param {string} name
 * @param {string} dataUrl  a JPEG or PNG as a data URL (resized in the browser first)
 */
function uploadPhoto(name, dataUrl) {
  if (!canEditPhotos_()) throw new Error("You don't have permission to upload photos.");
  const text = String(dataUrl || "");
  const comma = text.indexOf(",");
  const type = (/^data:(image\/(?:jpeg|png|webp));base64$/.exec(text.slice(0, comma)) || [])[1];
  if (comma < 0 || !type) throw new Error("That file isn't a supported image.");
  const b64 = text.slice(comma + 1).replace(/\s/g, "");
  const bytes = Utilities.base64Decode(b64);
  console.log("uploadPhoto: data url %s chars, base64 %s chars, %s bytes", text.length, b64.length, bytes.length);
  if (!bytes.length) throw new Error("The photo arrived empty. Try again, or try a smaller photo.");
  if (bytes.length > 5 * 1024 * 1024) throw new Error("That photo is larger than 5 MB.");
  const ext = type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg";
  const blob = Utilities.newBlob(bytes, type, (String(name).slice(0, 120) || "photo") + ext);
  const file = photosFolder_().createFile(blob);
  if (!file.getSize()) {
    file.setTrashed(true);
    throw new Error("Drive saved an empty file. Please try again.");
  }
  return JSON.stringify(photoItem_(file));
}

/** @param {string} id */
function deletePhoto(id) {
  if (!canEditPhotos_()) throw new Error("You don't have permission to delete photos.");
  const file = DriveApp.getFileById(id);
  if (!file.getParents().hasNext() || file.getParents().next().getId() !== photosFolder_().getId()) throw new Error("Unknown photo.");
  file.setTrashed(true);
  const slots = photoSlots_();
  for (const k of Object.keys(slots)) if (slots[k] === id) delete slots[k];
  PropertiesService.getScriptProperties().setProperty("PHOTO_SLOTS", JSON.stringify(slots));
  return true;
}

/**
 * Puts a photo on a page (or removes it when id is empty).
 * @param {string} slot  page or program id, e.g. "report", "hub", "global"
 * @param {string} id
 */
function setPhotoSlot(slot, id) {
  if (!canEditPhotos_()) throw new Error("You don't have permission to change photos.");
  const slots = photoSlots_();
  if (id) slots[String(slot)] = String(id);
  else delete slots[String(slot)];
  PropertiesService.getScriptProperties().setProperty("PHOTO_SLOTS", JSON.stringify(slots));
  return true;
}

/** Run this once from the Apps Script editor after changing sheets, to see fresh numbers right away. */
function clearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
}
