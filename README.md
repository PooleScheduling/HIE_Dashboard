# Poole HIE Engagement Report

A board-style report of high-impact experience (HIE) engagement at the Poole College of Management, NC State. Program owners keep their numbers current in Google Sheets; the report reads them live.

- **Front end:** React 18, TypeScript, Vite, Apache ECharts
- **Server:** Google Apps Script (serves the page, reads the sheets, computes totals)
- **Data:** Google Sheets in NC State Google Workspace. No data leaves NC State systems.
- **Access:** NC State Google login only (`access: DOMAIN`)

```
Google Sheets (HIE Data Hub, Kiosk sheet)  →  Apps Script (server/Code.js)  →  React app (src/)
        owners edit here                        totals only, cached 10 min        what viewers see
```

## Run it locally

Needs Node 20 or newer.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). Locally the app runs the analysis on sample rows (`src/analytics/samples.ts`), so it always works without Google.

## Photos

Page headers start as plain brand-color blocks. People who manage the site can add photos:

- **Contribute data → Photo gallery:** upload photos (they're resized in the browser first), then choose where each one appears.
- **Any page header:** use the **Add photo / Change photo** button.

Deployed, photos are saved to a Google Drive folder called "HIE Report Photos" in the deploying account (created on first upload). Who can manage photos is set in the script property `PHOTO_EDITORS` (comma-separated emails). If it's blank, only the deploying account can. Locally, photos are kept in your browser so you can try it out.

## Downloads

Every page has a **Download** menu, and every chart has a small download button.

- **PDF:** opens the browser's print dialog with a print layout; choose "Save as PDF". The front page is the report.
- **Word document:** built in the browser with the open-source `docx` library. The front page's Word file is the full report: every program, table and chart.
- **Data (CSV):** every number on the page, for Excel or Google Sheets.
- **Chart image (PNG) / chart data (CSV):** from the button on each chart.

Nothing is uploaded anywhere; files are made on the viewer's computer.

## Project layout

```
src/
  data/types.ts      The ReportData shape. Server and front end both follow it.
  analytics/         Datasets (templates), sample rows, and buildReport: all the number-crunching
  data/mock.ts       The local report: buildReport run on the sample rows
  data/api.ts        getReport() / appendRows(): calls Apps Script when deployed, mock locally
  lib/csv.ts         CSV parsing and template validation for uploads
  lib/download.ts    File saving, CSV export, print-to-PDF
  lib/reportDoc.ts   Word (.docx) report builder
  components/        Header, Chart (ECharts wrapper), small UI pieces
  pages/             Report (front page), Programs, Hub, Stories, Contribute
server/
  Code.js            Apps Script: doGet, getReport, appendRows, sheet overlays, kiosk aggregation
  appsscript.json    Apps Script manifest (time zone, web app access, scopes)
scripts/
  prepare-deploy.mjs Builds build/ for clasp (index.html + Code.js + Analytics.js)
samples/             Example CSVs for testing uploads
```

## Deploy to Apps Script (first time)

Use the office's shared Google account if there is one, so the app doesn't depend on one person.

1. Turn on the Apps Script API for your account: https://script.google.com/home/usersettings
2. Log in to clasp: `npx clasp login` (pick your NC State account)
3. Create the Apps Script project: `npx clasp create --type webapp --title "HIE Engagement Report" --rootDir build`
   This writes `.clasp.json` (git-ignored). Check that `rootDir` is `build`; see `.clasp.json.example`.
4. Push the code: `npm run push`
5. In the Apps Script editor (`npx clasp open`), choose **Deploy → New deployment → Web app**. Execute as: *Me*. Who has access: *Anyone within NC State University*. Copy the web app URL.
6. Later updates: `npm run push`, then **Deploy → Manage deployments → Edit → New version** (or `npm run deploy`).

## Connect the data

Everything runs from one Google Sheet, the **HIE Data Hub**, kept in the HIE_Dashboard Drive folder. It lists every source and holds a copy of every imported row, so handing the project off means sharing that folder.

**Setup (once):**
1. Create an empty Google Sheet called "HIE Data Hub" inside the HIE_Dashboard folder.
2. In the Apps Script editor, **Project Settings → Script properties**:

| Property | Value |
|---|---|
| `DATA_SHEET_ID` | The Data Hub's ID (from its URL, `/d/<ID>/edit`) |
| `APP_FOLDER_ID` | The HIE_Dashboard folder's ID (from its URL, `/folders/<ID>`). The app only writes inside it. |
| `EDITORS` | Emails, comma-separated, who can import data and change photos (the deploying account always can) |
| `TOUCHSCREEN_KEY` | The touchscreen wall feed's key. Ask whoever runs the wall; never put it in the code. |
| `USE_SAMPLE_ROWS` | `false` to stop showing sample rows for datasets with no source yet (optional) |

3. Run `setupDataHub` in the editor. It adds the tabs below and a starter Sources list. Existing tabs are left alone.
4. Fill in the **Link** for each source in the Sources tab, then deploy a new version.

**Data Hub tabs:**
- **Sources:** one row per source: `Dataset | Source | Owner | Type | Link | Source tab | Year | Notes | Last imported | Rows`. Every link the app uses comes from here; nothing in the code points at a particular sheet. Types:
  - `Live sheet`: read each time the report is built (the Hub kiosk).
  - `Live feed`: the touchscreen wall's stats feed (Link = the `/api/hie-stats` address; key in `TOUCHSCREEN_KEY`).
  - `Google Sheet import`: copied into the Data Hub when an editor clicks **Import** on the Contribute page. Use one row per file, with its Year (e.g. one row per summer's SBIP sheet).
  - `File upload`: an export (Smartsheet, Suitable, …) uploaded on the Contribute page; the uploader asks which year it covers.
- **One tab per dataset** (`SBIP Applicants`, `Practicum`, …): the imported rows, each tagged with `Year`, `Source` and `Imported at`. Every year stays, so charts show all years and compare the latest with the one before.
- **Imports:** a log of every import (when, who, source, year, rows added, rows archived).
- **Archive:** rows replaced by a newer import of the same source and year. Nothing is deleted without being archived first; Google's version history is a second safety net.
- **Settings, Stories, Metrics, Team:** as below.

**Rules:** sources are only ever read. The only file the app writes to is the Data Hub, and the code checks it's inside HIE_Dashboard first. The web app runs as the deploying account (`executeAs: USER_DEPLOYING`), so every viewer sees the same totals without needing access to the sheets; the source links on the dashboard open only for people Google already lets see them. Imports and photo changes are limited to the deploying account and `EDITORS`.

**Permissions (appsscript.json):** `spreadsheets` (read sources, write the Data Hub), `drive.readonly` (check folders, read photos), `drive.file` (create photos), `userinfo.email`, `script.external_request` (the wall feed). Google can't limit writing to one folder, so that rule is in server/Code.js. Run `testDriveAccess` to check photo uploads work with `drive.file`.

**Program sheets read as they are:** a `Live sheet` can be a program's own form-response or tracker sheet. `src/analytics/adapters.ts` finds the columns it needs by meaning (e.g. any column mentioning "NC State email" or "major"), so a reworded form still works. It keeps only those fields, turns each email into an anonymous student key (the same student matches across programs), and drops everything else (names, emails, phones, GPAs, links) before the analysis runs. Only totals reach the page. The tab is the one in **Source tab**, else the one the link points at (`#gid=`), else the first tab. Put the cohort or cycle in **Year** (e.g. `Summer 2027`); if blank, it's worked out from the timestamp. Charts for outcomes (interviewed, placed, accepted, hosting) appear only once the sheet records them. Adapters exist for SBIP applicants, the SBIP employer tracker and the Sales Excellence Certificate.

**Real data only, no links on the page:** datasets marked `realOnly` in `datasets.ts` (the Hub kiosk, the HIE wall, SBIP applicants, employers and surveys, practicum, the Sales Certificate and stories) never show sample rows once deployed; with no source they show "No data reported". Source links are never sent to the page, because the source sheets hold personal information. Editors get one button on the Contribute page that opens the Data Hub, where the Sources tab lists every link (the sheets' own sharing still applies).

Older setups used `KIOSK_SHEET_ID` and `TOUCHSCREEN_URL` script properties; they still work if the Sources tab has no row for those datasets.

### HIE Wall Usage (touchscreen wall)

The HIE Wall tab copies the wall's own stats page (same tiles, charts, tables, date ranges and daily CSV). The wall's site keeps every tap (time, screen, button label, a random visit ID) and every QR scan (time, link name), with no personal information. The server reads all of it (`days=400`) each time the report is rebuilt and sends the page per-day totals only (`ReportData.wall`). This needs the `script.external_request` scope; after adding it, the deploying account approves the new permission once. If the feed can't be reached, the page uses sample rows.

A few button labels carry a person's name (staff directory cards, Monthly Movers and Student Spotlight previews). Their taps still count, but `wallLabelHasName` in `src/analytics/reference.ts` keeps those labels out of "Most tapped". If the wall adds another button with names in it, add it there.

### How the numbers are made

The dashboard doesn't copy numbers from other reports. Each program keeps a simple list of what happened (one row per application, trip, check-in and so on), and `src/analytics/build.ts` works out every number, chart and data note from those rows. The same code runs on the server (deployed) and in the browser (`npm run dev`).

The datasets, their columns and what each one feeds are listed in `src/analytics/datasets.ts`, and on the **Contribute data** page, where each template can be downloaded. Until a team's data is connected, that dataset uses generated sample rows (`src/analytics/samples.ts`). The sample rows follow what teams have told us about volumes, but they're made up. Set the script property `USE_SAMPLE_ROWS` to `false` to show unconnected areas as not reported instead.

Some groupings use public reference lists in `src/analytics/reference.ts`:
- **County type.** NC counties are sorted into rural, suburban and urban using the NC Rural Center's 2020 Census definitions (people per square mile: rural 250 or fewer, urban 750 or more). Teams only type the county name; Wake, for example, comes out as urban.
- **Industry sector.** The 11 GICS sectors, plus "Government or nonprofit". Common shorthand like "IT" or "healthcare" is matched to the official name.
- **Functional area.** A suggested list of job functions for internships, to confirm with the teams.

### Settings, Stories, Metrics and Team tabs

- **Settings:** `Setting | Value`. Set `Poole undergraduate enrollment` so the report can show the share of students with an HIE.
- **Stories:** only rows with `Approved` = `TRUE` appear. Point a Google Form at this tab.
- **Metrics (optional):** `MetricId | Value | Label | Change | Period | Source | SourceKind | UpdatedBy | UpdatedOn`. Replaces a computed number by its id, for the rare case a number has to be entered by hand.
- **Team (optional, page on hold):** `Name | Role | Team | Areas | Lead`.

After editing sheets, numbers refresh within 10 minutes (or run `clearCache` in the editor).

## Keeping data out of this repo

This repo is on github.com, so it holds code and sample data only.

- `.gitignore` excludes CSV, Excel and export folders (except `samples/`).
- A pre-commit hook (`.githooks/pre-commit`, turned on by `npm install`) runs `scripts/check-no-data.mjs` and blocks commits containing data files, ncsu.edu emails, GPA values, Suitable profile links or Google Sheet links.
- GitHub Actions runs the same check and the build on every push.

## Privacy rules

- The server sends totals only. Never return student names, emails, IDs or GPAs to the front end.
- Keep student-level data in its source sheet with restricted sharing.
- Don't add external services, APIs or analytics that would send data outside NC State.
