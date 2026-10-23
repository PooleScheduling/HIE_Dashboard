// Assembles build/ for `clasp push`:
//   build/index.html     the whole React app as one file (from vite build)
//   build/Code.js        server code
//   build/Analytics.js   src/analytics bundled into a global HIE (datasets, sample rows, buildReport)
//   build/appsscript.json
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const out = "build";
if (!existsSync("dist/index.html")) {
  console.error("dist/index.html is missing. Run `npm run build` first.");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out);

cpSync("dist/index.html", `${out}/index.html`);
cpSync("server/Code.js", `${out}/Code.js`);
cpSync("server/appsscript.json", `${out}/appsscript.json`);

await build({
  entryPoints: ["src/analytics/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "HIE",
  target: "es2019",
  outfile: `${out}/Analytics.js`,
  logLevel: "warning",
});

// Apps Script loads files alphabetically; Analytics.js only sets a global, and Code.js
// reads HIE inside functions, so load order doesn't matter.
console.log("build/ is ready for clasp push");
