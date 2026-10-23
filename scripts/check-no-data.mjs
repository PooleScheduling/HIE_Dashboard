// Blocks commits that look like they contain student data.
// Runs as a git pre-commit hook (.githooks/pre-commit) and in GitHub Actions.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const ciMode = process.argv.includes("--all");
const files = (ciMode
  ? execSync("git ls-files", { encoding: "utf8" })
  : execSync("git diff --cached --name-only --diff-filter=ACM", { encoding: "utf8" }))
  .split("\n").filter(Boolean);

const blockedExt = /\.(csv|xlsx?|tsv|sqlite|db)$/i;
const allowedPaths = [/^samples\//];
const checks = [
  { name: "NC State email address", re: /\b[a-z0-9._%+-]+@ncsu\.edu\b/i },
  { name: "Suitable student profile link", re: /app\.suitable\.co\/institution\/\d+\/scorecard\/\d+/i },
  { name: "GPA column or value", re: /\b(c?GPA)\b\s*[,:=]\s*\d\.\d/i },
  { name: "Student ID", re: /\b(student\s*id|unity\s*id)\b\s*[,:=]/i },
  { name: "Google Sheet ID in code", re: /docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{25,}/ },
];
const skip = [/^package-lock\.json$/, /^scripts\/check-no-data\.mjs$/];

const problems = [];
for (const f of files) {
  if (skip.some((r) => r.test(f)) || !existsSync(f)) continue;
  if (blockedExt.test(f) && !allowedPaths.some((r) => r.test(f))) {
    problems.push(`${f}: data files don't belong in this repo`);
    continue;
  }
  const text = readFileSync(f, "utf8");
  for (const c of checks) if (c.re.test(text)) problems.push(`${f}: contains a ${c.name}`);
}

if (problems.length) {
  console.error("\nBlocked: this commit looks like it contains student or internal data.\n");
  for (const p of problems) console.error("  - " + p);
  console.error("\nKeep real data in NC State Google Sheets. Remove it from these files and try again.\n");
  process.exit(1);
}
console.log(`Data check passed (${files.length} files).`);
