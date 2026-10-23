// Assembles build/ for `clasp push`:
//   build/index.html     the whole React app as one file (from vite build)
//   build/Code.js        server code
//   build/MockData.js    src/data/mock.ts bundled into a global MOCK_REPORT (server fallback data)
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
  stdin: {
    contents: 'import { mockReport } from "./src/data/mock.ts"; globalThis.MOCK_REPORT = mockReport;',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  target: "es2019",
  outfile: `${out}/MockData.js`,
  logLevel: "warning",
});

// Apps Script loads files alphabetically; MockData.js only sets a global, and Code.js
// reads MOCK_REPORT inside functions, so load order doesn't matter.
console.log("build/ is ready for clasp push");
