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

Open the URL Vite prints (usually http://localhost:5173). Locally the app uses `src/data/mock.ts`, so it always works without Google. The header shows a "Demo data" tag when it does.

## Project layout

```
src/
  data/types.ts      The ReportData shape. Server and front end both follow it.
  data/mock.ts       Demo data (published totals and program summaries)
  data/api.ts        getReport() / appendRows(): calls Apps Script when deployed, mock locally
  lib/csv.ts         CSV parsing and template validation for uploads
  components/        Header, Chart (ECharts wrapper), small UI pieces
  pages/             Report (front page), Programs, Hub, Stories, Contribute
server/
  Code.js            Apps Script: doGet, getReport, appendRows, sheet overlays, kiosk aggregation
  appsscript.json    Apps Script manifest (time zone, web app access, scopes)
scripts/
  prepare-deploy.mjs Builds build/ for clasp (index.html + Code.js + MockData.js)
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

The account that deploys the web app needs view access to the kiosk sheet and edit access to the Data Hub.

### HIE Data Hub workbook

Create a Google Sheet with these tabs. Anything left blank falls back to the demo data, so you can connect one piece at a time.

**Metrics:** one row per number shown in the report. `MetricId` must match an `id` in `src/data/mock.ts`.

| MetricId | Value | Label | Change | Period | Source | SourceKind | UpdatedBy | UpdatedOn |
|---|---|---|---|---|---|---|---|---|
| sbip-apps | 110 | students applied for about 20 small-business internships next summer | | Summer 2027 | Program sheet | upload | Program team | 2026-10-14 |

`SourceKind` is one of `live`, `upload`, `report`, `waiting`.

**Stories:** `Quote | Program | Audience | Attribution | Source | Approved`. Only rows with `Approved` = `TRUE` appear. Point a Google Form at this tab so anyone can submit.

**Practicum, Global, Career:** created automatically on the first upload from the Contribute page.

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
