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

// ---------- photos ----------
// Deployed: photos live in a Google Drive folder (see server/Code.js).
// Local dev: they're kept in this browser's storage so the gallery can be tried out.

export interface PhotoItem { id: string; name: string; src: string; addedOn: string }
export interface PhotoLibrary { photos: PhotoItem[]; slots: Record<string, string>; canEdit: boolean }

const LOCAL_KEY = "hie-photos-v1";
function readLocal(): PhotoLibrary {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
    if (v && Array.isArray(v.photos)) return { photos: v.photos, slots: v.slots ?? {}, canEdit: true };
  } catch { /* storage blocked or corrupt */ }
  return { photos: [], slots: {}, canEdit: true };
}
function writeLocal(lib: PhotoLibrary) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ photos: lib.photos, slots: lib.slots }));
  } catch {
    throw new Error("This browser is out of room for more photos. Delete a few and try again.");
  }
}

export async function getPhotos(): Promise<PhotoLibrary> {
  if (isAppsScript()) return JSON.parse(await callServer<string>("getPhotos")) as PhotoLibrary;
  return readLocal();
}

export async function uploadPhoto(name: string, dataUrl: string): Promise<PhotoItem> {
  if (isAppsScript()) return JSON.parse(await callServer<string>("uploadPhoto", name, dataUrl)) as PhotoItem;
  const lib = readLocal();
  const item = { id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, src: dataUrl, addedOn: new Date().toISOString().slice(0, 10) };
  writeLocal({ ...lib, photos: [item, ...lib.photos] });
  return item;
}

export async function deletePhoto(id: string): Promise<void> {
  if (isAppsScript()) { await callServer("deletePhoto", id); return; }
  const lib = readLocal();
  const slots = Object.fromEntries(Object.entries(lib.slots).filter(([, v]) => v !== id));
  writeLocal({ ...lib, photos: lib.photos.filter((p) => p.id !== id), slots });
}

export async function setPhotoSlot(slot: string, id: string | null): Promise<void> {
  if (isAppsScript()) { await callServer("setPhotoSlot", slot, id ?? ""); return; }
  const lib = readLocal();
  const slots = { ...lib.slots };
  if (id) slots[slot] = id;
  else delete slots[slot];
  writeLocal({ ...lib, slots });
}
