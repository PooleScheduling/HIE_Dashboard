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

In the Apps Script editor, open **Project Settings → Script properties** and add:

| Property | Value |
|---|---|
| `KIOSK_SHEET_ID` | The ID from the Feedback Kiosk Data sheet URL (`/d/<ID>/edit`) |
| `DATA_SHEET_ID` | The ID of the HIE Data Hub workbook (see below) |
| `PHOTO_EDITORS` | Emails allowed to upload and place photos, comma-separated (optional) |
| `USE_SAMPLE_ROWS` | `false` to stop using sample rows for datasets that aren't connected (optional) |

The account that deploys the web app needs view access to the kiosk sheet and edit access to the Data Hub.

### How the numbers are made

The dashboard doesn't copy numbers from other reports. Each program keeps a simple list of what happened (one row per application, trip, check-in and so on), and `src/analytics/build.ts` works out every number, chart and data note from those rows. The same code runs on the server (deployed) and in the browser (`npm run dev`).

The datasets, their columns and what each one feeds are listed in `src/analytics/datasets.ts`, and on the **Contribute data** page, where each template can be downloaded. Until a team's data is connected, that dataset uses generated sample rows (`src/analytics/samples.ts`). The sample rows follow what teams have told us about volumes, but they're made up. Set the script property `USE_SAMPLE_ROWS` to `false` to show unconnected areas as not reported instead.

Some groupings use public reference lists in `src/analytics/reference.ts`:
- **County type.** NC counties are sorted into rural, suburban and urban using the NC Rural Center's 2020 Census definitions (people per square mile: rural 250 or fewer, urban 750 or more). Teams only type the county name; Wake, for example, comes out as urban.
- **Industry sector.** The 11 GICS sectors, plus "Government or nonprofit". Common shorthand like "IT" or "healthcare" is matched to the official name.
- **Functional area.** A suggested list of job functions for internships, to confirm with the teams.

### HIE Data Hub workbook

Create a Google Sheet with one tab per dataset, named as in `datasets.ts` (`Packways`, `DeansScholars`, `SBIP Applicants`, `SBIP Employers`, `Practicum`, `Sales Certificate`, `Global`, `Career`, `Stories`, `Settings`). The first row is the column names from the template. Tabs can be added one at a time.

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
