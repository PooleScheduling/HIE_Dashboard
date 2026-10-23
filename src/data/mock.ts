import type { ReportData } from "./types";
import { buildReport } from "../analytics/build";
import { sampleRows } from "../analytics/samples";

// Local report: the same analysis the server runs, applied to the sample rows.
// Sample data runs through Oct 23, 2026, so that's the report date.
export const mockReport: ReportData = buildReport(sampleRows, { asOf: "2026-10-23" });
