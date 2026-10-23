import type { ReportData } from "./types";
import { mockReport } from "./mock";

// When the app runs inside Apps Script, `google.script.run` exists and we call the server.
// Anywhere else (npm run dev), we use the local mock so the app is always demoable.

interface ScriptRun {
  withSuccessHandler(fn: (value: unknown) => void): ScriptRun;
  withFailureHandler(fn: (err: Error) => void): ScriptRun;
  [serverFn: string]: unknown;
}
declare const google: { script: { run: ScriptRun } } | undefined;

export const isAppsScript = (): boolean =>
  typeof google !== "undefined" && !!google?.script?.run;

function callServer<T>(fn: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const runner = google!.script.run
      .withSuccessHandler((v) => resolve(v as T))
      .withFailureHandler(reject) as unknown as Record<string, (...a: unknown[]) => void>;
    runner[fn](...args);
  });
}

export async function getReport(): Promise<ReportData> {
  if (isAppsScript()) {
    const json = await callServer<string>("getReport");
    return JSON.parse(json) as ReportData;
  }
  return structuredClone(mockReport);
}

export async function appendRows(templateId: string, rows: string[][]): Promise<{ added: number }> {
  if (isAppsScript()) return callServer("appendRows", templateId, rows);
  await new Promise((r) => setTimeout(r, 300)); // simulate a round trip in local dev
  return { added: rows.length };
}
