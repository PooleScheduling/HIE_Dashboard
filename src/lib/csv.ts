// Small CSV parser: handles quoted fields with commas and escaped quotes ("").
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

export type Validation = { ok: true; rows: string[][] } | { ok: false; error: string };

// Checks the header has every required column (any order, any case) and
// returns the data rows reordered to match the template's column order.
export function validateAgainstTemplate(table: string[][], columns: string[]): Validation {
  if (table.length < 2) return { ok: false, error: "That file has no data rows. Add at least one row under the header." };
  const header = table[0].map((h) => h.toLowerCase());
  const missing = columns.filter((c) => !header.includes(c.toLowerCase()));
  if (missing.length) return { ok: false, error: `This file is missing: ${missing.join(", ")}.` };
  const idx = columns.map((c) => header.indexOf(c.toLowerCase()));
  return { ok: true, rows: table.slice(1).map((r) => idx.map((i) => r[i] ?? "")) };
}
