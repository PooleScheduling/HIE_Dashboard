// Globals provided by other files in the Apps Script project.
// HIE is build/Analytics.js: src/analytics/index.ts bundled by scripts/prepare-deploy.mjs.
declare const HIE: {
  datasets: { id: string; name: string; sheetTab: string; columns: { name: string; optional?: boolean }[] }[];
  sampleRows: Record<string, Record<string, string>[]>;
  buildReport: (rows: Record<string, Record<string, string>[]>, opts: { asOf: string; kinds?: Record<string, string> }) => any;
};
