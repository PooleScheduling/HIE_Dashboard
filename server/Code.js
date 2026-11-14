// @ts-check
/// <reference types="google-apps-script" />
/// <reference path="./globals.d.ts" />

/**
 * Apps Script server for the HIE Engagement Report.
 *
 * Everything starts from one Google Sheet, the HIE Data Hub (DATA_SHEET_ID), kept in the
 * HIE_Dashboard Drive folder (APP_FOLDER_ID). Its tabs:
 *   Sources   one row per data source: dataset, name, owner, type, link, year. Change a link or
 *             add next year's file here; nothing in the code points at a particular sheet.
 *   <dataset> copies of imported rows (one tab per dataset, e.g. "SBIP applicants"), each row
 *             tagged with its Source, Year and when it was imported
 *   Imports   a log of every import;  Archive  rows replaced by a newer import (never deleted)
 *   Settings, Stories, Metrics, Team  as before
 * Run setupDataHub() once from the editor to create these tabs in an empty sheet.
 *
 * Source types (Sources tab, "Type" column):
 *   Live sheet          read every time the report is built (e.g. the Hub kiosk sheet)
 *   Live feed           the touchscreen wall's stats feed (key in TOUCHSCREEN_KEY)
 *   Google Sheet import copied into the Data Hub when someone clicks Import on the Contribute page
 *   File upload         a CSV export uploaded on the Contribute page (Smartsheet, Suitable, ...)
 *
 * Rules: sources are only ever read. The only file this app writes to is the Data Hub, and only
 * after checking it's inside the HIE_Dashboard folder. An import replaces the rows from the same
 * source and year; the old rows go to the Archive tab first. Only totals leave this file.
 *
 * The web app runs as the account that deployed it, so every viewer sees the same numbers
 * without needing access to the sheets. Links to each source are shown on the dashboard; opening
 * one still needs the viewer's own Google access.
 *
 * Script properties (Project Settings → Script properties):
 *   DATA_SHEET_ID     ID of the HIE Data Hub sheet
 *   APP_FOLDER_ID     ID of the HIE_Dashboard Drive folder (the app only writes inside it)
 *   EDITORS           Comma-separated emails who can import data and change photos
 *                     (the deploying account always can; PHOTO_EDITORS is read too)
 *   TOUCHSCREEN_KEY   Key for the touchscreen wall's stats feed
 *   USE_SAMPLE_ROWS   "false" to stop using sample rows for datasets with no source yet
 *   PHOTOS_FOLDER_ID, PHOTO_SLOTS  set by the app
 *   KIOSK_SHEET_ID, TOUCHSCREEN_URL  older setup; used only if the Sources tab has no row for them
 */

const CACHE_KEY = "report-v1";
const CACHE_SECONDS = 600; // 10 minutes
const TZ = "America/New_York";

const SOURCES_TAB = "Sources";
const SOURCE_COLUMNS = ["Dataset", "Source", "Owner", "Type", "Link", "Source tab", "Year", "Notes", "Last imported", "Rows"];
const IMPORTS_TAB = "Imports";
const ARCHIVE_TAB = "Archive";
const META_COLUMNS = ["Year", "Source", "Imported at"];

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
  const useSamples = props.getProperty("USE_SAMPLE_ROWS") !== "false";
  const dataId = props.getProperty("DATA_SHEET_ID");
  const book = dataId ? openSheet_(dataId) : null;
  const sources = book ? readSources_(book) : [];

  // Older setup, before the Sources tab: kiosk and wall links in script properties.
  const legacy = (/** @type {string} */ dataset, /** @type {string} */ type, /** @type {string|null} */ link) =>
    link && !sources.some((s) => s.Dataset === dataset && /^live/i.test(s.Type))
      ? [{ Dataset: dataset, Source: dataset === "touchscreen" ? "HIE wall stats feed" : "Feedback Kiosk Data", Type: type, Link: link, "Source tab": "", Year: "", index: -1 }]
      : [];
  const all = [...sources, ...legacy("hub_checkins", "Live sheet", props.getProperty("KIOSK_SHEET_ID")), ...legacy("touchscreen", "Live feed", props.getProperty("TOUCHSCREEN_URL"))];

  /** @type {Record<string, Record<string, string>[]>} */ const rows = {};
  /** @type {Record<string, string>} */ const kinds = {};
  for (const d of HIE.datasets) {
    /** @type {Record<string, string>[]} */ let r = [];
    for (const s of all.filter((x) => x.Dataset === d.id && /^live/i.test(x.Type))) {
      // Program sheets (form responses, trackers) are mapped to the template's columns here;
      // names, emails and other personal fields are dropped and never leave this function.
      const got = /feed/i.test(s.Type)
        ? readTouchscreen_(s.Link, props.getProperty("TOUCHSCREEN_KEY") || "")
        : readLiveTabs_(s.Link, s["Source tab"] || (d.id === "hub_checkins" ? d.sheetTab : ""))
          .flatMap((tab) => HIE.adaptRows(d.id, tab, { year: s.Year || "", source: s.Source || "" }));
      if (got.length) { r = r.concat(got); kinds[d.id] = "live"; }
    }
    if (book) {
      const copied = d.id === "hub_checkins" || d.id === "touchscreen" ? [] : readTab_(book.getSheetByName(d.sheetTab));
      if (copied.length) { r = r.concat(copied); kinds[d.id] = kinds[d.id] || "upload"; }
    }
    // Programs that have given us their data (realOnly) never fall back to sample rows.
    rows[d.id] = r.length ? r : useSamples && !d.realOnly ? HIE.sampleRows[d.id] || [] : [];
  }

  const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  /** @type {any} */
  // Source links are not sent to the page: the sheets hold personal data, so the one place to
  // find them is the Sources tab of the Data Hub, which editors can open (see getAccess).
  const report = HIE.buildReport(rows, { asOf: today, kinds });
  if (sources.length) report.sources = sourcesForReport_(sources, kinds);
  if (book) {
    overlayMetrics_(report, book.getSheetByName("Metrics"));
    overlayTeam_(report, book.getSheetByName("Team"));
  }

  const json = JSON.stringify(report);
  try { cache.put(CACHE_KEY, json, CACHE_SECONDS); } catch (e) { /* over 100KB: skip cache */ }
  return json;
}

// ---------- Data Hub: sources, imports, archive ----------

/**
 * The Sources tab as objects, with each row's position so the front end can ask to import it.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} book
 */
function readSources_(book) {
  return readTab_(book.getSheetByName(SOURCES_TAB))
    .map((r, i) => Object.assign({}, r, { index: i }))
    .filter((r) => r.Dataset && r.Type);
}

/** The Sources tab as the report's sources list (names, links, status; no rows). */
function sourcesForReport_(/** @type {any[]} */ sources, /** @type {Record<string, string>} */ kinds) {
  const ds = (/** @type {string} */ id) => HIE.datasets.find((/** @type {any} */ d) => d.id === id);
  return sources.map((s) => {
    const d = ds(s.Dataset);
    const live = /^live/i.test(s.Type);
    return {
      id: String(s.index),
      dataset: s.Dataset,
      name: s.Source || (d ? d.name : s.Dataset),
      owner: s.Owner || (d ? d.owner : ""),
      feeds: d ? d.name : s.Dataset,
      kind: live ? (kinds[s.Dataset] === "live" ? "live" : "waiting") : s["Last imported"] ? "upload" : "waiting",
      howItGetsIn: s.Type,
      type: s.Type,
      year: s.Year || undefined,
      lastUpdated: s["Last imported"] ? String(s["Last imported"]).slice(0, 10) : undefined,
      rows: s.Rows ? Number(s.Rows) : undefined,
    };
  });
}

/** Sheet ID from a link or a bare ID. */
function sheetId_(/** @type {string} */ link) {
  const m = /\/d\/([a-zA-Z0-9_-]+)/.exec(String(link));
  return m ? m[1] : String(link).trim();
}

/**
 * Reads a source sheet. Read only: nothing here changes the source. Returns one list of rows per
 * tab read: every tab when Source tab is "*", else the tab named in the Sources tab (spaces and
 * case ignored), else the one the link points at (#gid=...), else the first tab.
 * @param {string} link
 * @param {string} tab
 * @returns {Record<string, string>[][]}
 */
function readLiveTabs_(link, tab) {
  const book = link ? openSheet_(sheetId_(link)) : null;
  if (!book) return [];
  const sheets = book.getSheets();
  if (String(tab).trim() === "*") return sheets.map(readTab_).filter((r) => r.length);
  const want = String(tab || "").trim().toLowerCase();
  const gid = (/[#&?]gid=(\d+)/.exec(String(link)) || [])[1];
  const sheet = (want && sheets.find((sh) => sh.getName().trim().toLowerCase() === want))
    || (gid ? sheets.find((sh) => String(sh.getSheetId()) === gid) : null)
    || sheets[0];
  return [readTab_(sheet)];
}

/**
 * Who can import data and change photos: the deploying account, plus EDITORS / PHOTO_EDITORS.
 */
function canEdit_() {
  const props = PropertiesService.getScriptProperties();
  const me = (Session.getActiveUser().getEmail() || "").toLowerCase();
  const owner = (Session.getEffectiveUser().getEmail() || "").toLowerCase();
  const list = [props.getProperty("EDITORS"), props.getProperty("PHOTO_EDITORS")].join(",")
    .toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return !!me && (me === owner || list.includes(me));
}

/**
 * Called by the front end: can this viewer import data and change photos? Editors also get the
 * link to the Data Hub, the one place that lists every source link (sharing still applies).
 */
function getAccess() {
  const canEdit = canEdit_();
  const id = PropertiesService.getScriptProperties().getProperty("DATA_SHEET_ID");
  return JSON.stringify({ canEdit, hubUrl: canEdit && id ? "https://docs.google.com/spreadsheets/d/" + id + "/edit" : undefined });
}

/**
 * The Data Hub, opened for writing. It's the only file the app writes to, and only if it sits
 * inside the HIE_Dashboard folder.
 */
function writableHub_() {
  const id = PropertiesService.getScriptProperties().getProperty("DATA_SHEET_ID");
  if (!id) throw new Error("The Data Hub isn't connected yet (DATA_SHEET_ID is not set).");
  if (!insideAppFolder_(DriveApp.getFileById(id))) throw new Error("The Data Hub must be inside the HIE_Dashboard folder before the app writes to it.");
  return SpreadsheetApp.openById(id);
}

/**
 * Called from the Contribute page: copies a Google Sheet source (Type "Google Sheet import")
 * into the Data Hub. The source is only read.
 * @param {string} sourceId  the source's row position, from the report's sources list
 */
function importSource(sourceId) {
  if (!canEdit_()) throw new Error("You don't have permission to import data.");
  const book = writableHub_();
  const s = readSources_(book).find((x) => String(x.index) === String(sourceId));
  if (!s || !/google sheet/i.test(s.Type)) throw new Error("That source can't be imported from a link.");
  const d = datasetFor_(s.Dataset);
  const src = openSheet_(sheetId_(s.Link));
  if (!src) throw new Error("Couldn't open the source sheet. Check the link and that the dashboard's account can view it.");
  const sheet = src.getSheetByName(s["Source tab"] || "") || src.getSheets()[0];
  return JSON.stringify(replaceBatch_(book, d, s, s.Year || "All years", sheet.getDataRange().getDisplayValues()));
}

/**
 * Called from the Contribute page: imports an uploaded CSV (already parsed in the browser)
 * for a "File upload" source.
 * @param {string} sourceId
 * @param {string} year  e.g. "2026-27" or "Summer 2027"
 * @param {string[][]} table  header row plus data rows
 */
function importUpload(sourceId, year, table) {
  if (!canEdit_()) throw new Error("You don't have permission to import data.");
  const book = writableHub_();
  const s = readSources_(book).find((x) => String(x.index) === String(sourceId));
  if (!s || /^live/i.test(s.Type)) throw new Error("Pick a source that takes uploads.");
  return JSON.stringify(replaceBatch_(book, datasetFor_(s.Dataset), s, String(year || s.Year || "All years").slice(0, 40), table));
}

function datasetFor_(/** @type {string} */ id) {
  const d = HIE.datasets.find((/** @type {any} */ x) => x.id === id);
  if (!d || d.cadence === "Live") throw new Error("Unknown dataset in the Sources tab: " + id);
  return d;
}

/**
 * Puts one import into the Data Hub: checks the columns, archives the rows from the same source
 * and year, writes the new ones, and logs it. Nothing is deleted without being archived first.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} book
 * @param {any} d  dataset
 * @param {any} s  Sources row
 * @param {string} year
 * @param {string[][]} table
 */
function replaceBatch_(book, d, s, year, table) {
  if (!Array.isArray(table) || table.length < 2) throw new Error("There are no data rows under the header.");
  if (table.length > 20001) throw new Error("That's more than 20,000 rows. Split it by year and import each part.");
  /** @type {string[]} */ const columns = d.columns.map((/** @type {any} */ c) => c.name);
  const required = d.columns.filter((/** @type {any} */ c) => !c.optional).map((/** @type {any} */ c) => c.name);
  const head = table[0].map((h) => String(h).trim().toLowerCase());
  const missing = required.filter((c) => !head.includes(c.toLowerCase()));
  if (missing.length) throw new Error("The source is missing these columns: " + missing.join(", ") + ".");
  const idx = columns.map((c) => head.indexOf(c.toLowerCase()));
  const when = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
  const sourceName = s.Source || d.name;
  const fresh = table.slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ""))
    .map((r) => idx.map((i) => (i < 0 ? "" : String(r[i] ?? "").slice(0, 500))).concat([year, sourceName, when]));

  /** @type {string[][]} */ let replaced = [];
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const header = [...columns, ...META_COLUMNS];
    const tab = book.getSheetByName(d.sheetTab) || book.insertSheet(d.sheetTab);
    const existing = tab.getLastRow() > 0 ? tab.getDataRange().getDisplayValues() : [header];
    const oldHead = existing[0];
    const yi = oldHead.indexOf("Year"), si = oldHead.indexOf("Source");
    const body = existing.slice(1);
    replaced = body.filter((r) => r[yi] === year && r[si] === sourceName);
    const kept = body.filter((r) => !(r[yi] === year && r[si] === sourceName))
      .map((r) => header.map((h) => (oldHead.indexOf(h) < 0 ? "" : r[oldHead.indexOf(h)])));

    if (replaced.length) {
      const archive = book.getSheetByName(ARCHIVE_TAB) || book.insertSheet(ARCHIVE_TAB);
      if (archive.getLastRow() === 0) archive.appendRow(["Dataset", "Source", "Year", "Archived at", "Row (JSON)"]);
      const out = replaced.map((r) => [d.id, sourceName, year, when, JSON.stringify(Object.fromEntries(oldHead.map((h, i) => [h, r[i]])))]);
      archive.getRange(archive.getLastRow() + 1, 1, out.length, 5).setValues(out);
    }
    const all = [header, ...kept, ...fresh];
    tab.getRange(1, 1, all.length, header.length).setValues(all);
    const extra = tab.getLastRow() - all.length;
    if (extra > 0) tab.getRange(all.length + 1, 1, extra, tab.getLastColumn()).clearContent();

    const log = book.getSheetByName(IMPORTS_TAB) || book.insertSheet(IMPORTS_TAB);
    if (log.getLastRow() === 0) log.appendRow(["When", "Who", "Dataset", "Source", "Year", "Rows added", "Rows archived"]);
    log.appendRow([when, Session.getActiveUser().getEmail() || "unknown", d.id, sourceName, year, fresh.length, replaced.length]);

    const srcTab = book.getSheetByName(SOURCES_TAB);
    if (srcTab && s.index >= 0) {
      const h = srcTab.getRange(1, 1, 1, srcTab.getLastColumn()).getValues()[0].map(String);
      const li = h.indexOf("Last imported"), ri = h.indexOf("Rows");
      if (li >= 0) srcTab.getRange(s.index + 2, li + 1).setValue(when);
      if (ri >= 0) srcTab.getRange(s.index + 2, ri + 1).setValue(fresh.length);
    }
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove(CACHE_KEY);
  return { added: fresh.length, archived: replaced.length, year };
}

/**
 * Run once from the editor. Fills an empty Data Hub sheet (DATA_SHEET_ID, inside HIE_Dashboard)
 * with the tabs the app uses and a starter Sources list. Existing tabs are left alone.
 */
function setupDataHub() {
  const book = writableHub_();
  const props = PropertiesService.getScriptProperties();
  /** @param {string} name @param {string[]} header */
  const ensure = (name, header) => {
    let tab = book.getSheetByName(name);
    if (tab) return null;
    tab = book.insertSheet(name);
    tab.appendRow(header);
    tab.setFrozenRows(1);
    tab.getRange(1, 1, 1, header.length).setFontWeight("bold");
    return tab;
  };
  const sources = ensure(SOURCES_TAB, SOURCE_COLUMNS);
  if (sources) {
    /** @type {string[][]} */ const starter = [];
    for (const d of HIE.datasets) {
      if (d.id === "settings" || d.id === "stories") continue;
      const type = d.id === "touchscreen" ? "Live feed" : d.cadence === "Live" ? "Live sheet" : "File upload";
      const link = d.id === "hub_checkins" ? props.getProperty("KIOSK_SHEET_ID") || "" : d.id === "touchscreen" ? props.getProperty("TOUCHSCREEN_URL") || "" : "";
      starter.push([d.id, d.likelySource.split(" (")[0], d.owner, type, link, type === "Live sheet" ? d.sheetTab : "", "", d.description, "", ""]);
    }
    sources.getRange(2, 1, starter.length, SOURCE_COLUMNS.length).setValues(starter);
  }
  for (const d of HIE.datasets) {
    if (d.cadence === "Live") continue;
    ensure(d.sheetTab, [...d.columns.map((/** @type {any} */ c) => c.name), ...(d.id === "settings" || d.id === "stories" ? [] : META_COLUMNS)]);
  }
  ensure(IMPORTS_TAB, ["When", "Who", "Dataset", "Source", "Year", "Rows added", "Rows archived"]);
  ensure(ARCHIVE_TAB, ["Dataset", "Source", "Year", "Archived at", "Row (JSON)"]);
  const first = book.getSheets()[0];
  if (first.getName() !== SOURCES_TAB && first.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(first);
  console.log("Data Hub ready: %s", book.getUrl());
}

// ---------- touchscreen wall ----------

/**
 * Reads the wall's taps and QR scans from its read-only stats feed and turns them into rows
 * (Time, Type, Label, Screen, Visit). The feed has no personal information. If it can't be
 * reached, returns no rows, so the report falls back to the Touchscreen tab or sample rows.
 * @param {string} url
 * @param {string} key
 * @returns {Record<string, string>[]}
 */
function readTouchscreen_(url, key) {
  try {
    const res = UrlFetchApp.fetch(url + (url.indexOf("?") < 0 ? "?" : "&") + "days=400", {
      headers: { "x-stats-key": key },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      console.warn("Touchscreen feed returned %s", res.getResponseCode());
      return [];
    }
    /** @type {{ taps?: { t: number, s?: string, l?: string, k?: string }[], qr?: { t: number, id?: string }[] }} */
    const data = JSON.parse(res.getContentText());
    const when = (/** @type {number} */ t) => Utilities.formatDate(new Date(t), TZ, "yyyy-MM-dd'T'HH:mm:ss");
    return [
      ...(data.taps || []).map((x) => ({ Time: when(x.t), Type: "Tap", Label: String(x.l || ""), Screen: String(x.s || ""), Visit: String(x.k || "") })),
      ...(data.qr || []).map((x) => ({ Time: when(x.t), Type: "QR scan", Label: String(x.id || ""), Screen: "", Visit: "" })),
    ];
  } catch (e) {
    console.warn("Couldn't read the touchscreen feed: %s", e);
    return [];
  }
}

// ---------- overlays ----------

/**
 * Opens a sheet by ID, or returns null if the dashboard's account can't open it. Callers only read.
 * @param {string} id
 */
function openSheet_(id) {
  try { return SpreadsheetApp.openById(id); } catch (e) {
    console.warn("Can't open sheet %s: %s", id, e);
    return null;
  }
}

/**
 * Reads a tab into objects keyed by its header row. The header is the first of the top five rows
 * with at least three filled cells, so sheets with a title or blank row above the header work.
 */
function readTab_(/** @type {GoogleAppsScript.Spreadsheet.Sheet | null} */ sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const all = sheet.getDataRange().getDisplayValues();
  const hi = Math.max(0, all.slice(0, 5).findIndex((r) => r.filter((c) => String(c).trim() !== "").length >= 3));
  const head = all[hi];
  const body = all.slice(hi + 1);
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
// Photos live in "HIE Report Photos" inside the HIE_Dashboard Drive folder (APP_FOLDER_ID).
// Which page uses which photo is kept in the PHOTO_SLOTS script property as JSON:
// { "<page or program id>": "<file id>" }. The app never writes outside HIE_Dashboard.

const PHOTOS_FOLDER_NAME = "HIE Report Photos";

/** Photos follow the same rule as imports: the deploying account plus EDITORS / PHOTO_EDITORS. */
const canEditPhotos_ = () => canEdit_();

/** The HIE_Dashboard folder. Every write the app makes goes inside it. */
function appFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty("APP_FOLDER_ID");
  if (!id) throw new Error("APP_FOLDER_ID isn't set. Add the HIE_Dashboard folder's ID in Script properties.");
  return DriveApp.getFolderById(id);
}

/**
 * True if a file or folder sits somewhere inside the HIE_Dashboard folder.
 * @param {GoogleAppsScript.Drive.File | GoogleAppsScript.Drive.Folder} item
 */
function insideAppFolder_(item) {
  const root = PropertiesService.getScriptProperties().getProperty("APP_FOLDER_ID");
  if (!root) return false;
  /** @type {any[]} */ let level = [item];
  for (let depth = 0; depth < 20 && level.length; depth++) {
    /** @type {any[]} */ const next = [];
    for (const f of level) {
      if (f.getId() === root) return true;
      const parents = f.getParents();
      while (parents.hasNext()) next.push(parents.next());
    }
    level = next;
  }
  return false;
}

/**
 * The photos folder. Reading never creates anything; for an upload (create = true) it finds or
 * makes "HIE Report Photos" inside HIE_Dashboard.
 * @param {boolean} [create]
 */
function photosFolder_(create) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("PHOTOS_FOLDER_ID");
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (insideAppFolder_(f)) return f;
      console.warn("The saved photos folder isn't inside HIE_Dashboard.");
    } catch (e) {
      console.warn("Can't open the photos folder: %s", e);
    }
  }
  if (!create) return null;
  const app = appFolder_();
  const found = app.getFoldersByName(PHOTOS_FOLDER_NAME);
  const folder = found.hasNext() ? found.next() : app.createFolder(PHOTOS_FOLDER_NAME);
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
  const slots = photoSlots_();
  /** @type {any[]} */ const photos = [];
  const folder = photosFolder_(false);
  if (folder) {
    const files = folder.getFiles();
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
  const file = /** @type {GoogleAppsScript.Drive.Folder} */ (photosFolder_(true)).createFile(blob);
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
  const folder = photosFolder_(false);
  if (!folder || !file.getParents().hasNext() || file.getParents().next().getId() !== folder.getId() || !insideAppFolder_(file)) throw new Error("Unknown photo.");
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

/**
 * Run from the Apps Script editor (select testTouchscreen, then Run) to check the wall's feed.
 * The log says what's wrong, if anything, and the report cache is cleared so the next page
 * load reads the feed again.
 */
function testTouchscreen() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty("TOUCHSCREEN_URL");
  const key = props.getProperty("TOUCHSCREEN_KEY");
  if (!url) return console.log("TOUCHSCREEN_URL isn't set in Script properties (check the spelling).");
  if (!key) return console.log("TOUCHSCREEN_KEY isn't set in Script properties.");
  const res = UrlFetchApp.fetch(url + (url.indexOf("?") < 0 ? "?" : "&") + "days=400", { headers: { "x-stats-key": key }, muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code === 401) return console.log("The feed says the key is wrong (401). Check TOUCHSCREEN_KEY.");
  if (code !== 200) return console.log("The feed returned %s. Check TOUCHSCREEN_URL; it should end in /api/hie-stats.", code);
  const data = JSON.parse(res.getContentText());
  clearCache();
  console.log("Feed works: %s taps and %s QR scans.", (data.taps || []).length, (data.qr || []).length);

  // Build the report with the code saved in this editor, the same way the web app does.
  const report = JSON.parse(getReport());
  const wall = report.wall;
  if (!wall) return console.log("The report has no wall data. Analytics.gs is probably out of date: paste build/Analytics.js again.");
  const visits = wall.days.reduce((/** @type {number} */ a, /** @type {any} */ d) => a + d.visits[0] + d.visits[1] + d.visits[2], 0);
  console.log("Report built from %s data: %s visits on record.", wall.source.kind === "live" ? "LIVE" : "SAMPLE", visits);
  if (wall.source.kind === "live") {
    console.log("The saved code is fine. If the web app still shows sample numbers, it's on an old version: Deploy → Manage deployments → pencil → Version: New version → Deploy.");
  } else {
    console.log("The saved code still uses sample rows. Paste build/Code.js into Code.gs and build/Analytics.js into Analytics.gs, save, and run this again.");
  }
}

/**
 * Run from the Apps Script editor to check the Drive setup: reads the HIE_Dashboard folder,
 * then creates and removes a small test file in the photos folder.
 */
function testDriveAccess() {
  const app = appFolder_();
  console.log("Can read HIE_Dashboard: %s", app.getName());
  const folder = /** @type {GoogleAppsScript.Drive.Folder} */ (photosFolder_(true));
  console.log("Photos folder: %s (inside HIE_Dashboard: %s)", folder.getName(), insideAppFolder_(folder));
  const f = folder.createFile("drive-access-test.txt", "Test file from the HIE dashboard. Safe to delete.");
  f.setTrashed(true);
  console.log("Created and removed a test file. Photo uploads will work for %s.", Session.getActiveUser().getEmail());
}
