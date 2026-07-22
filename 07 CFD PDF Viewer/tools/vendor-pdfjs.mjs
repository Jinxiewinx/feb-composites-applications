/* Copy pdf.js out of node_modules into app/vendor/.

   The app has to run two ways: as a packaged Electron build, and as a plain
   folder someone opens in a browser straight from a git clone. The second only
   works if pdf.js is committed, so it lives in app/vendor/ rather than being
   resolved from node_modules at runtime.

   Uses the legacy build, which targets older JS engines and avoids pdf.js
   tripping over the file:// origin some browsers hand an unpacked folder.

   Run: npm run vendor */

import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist");
const to = join(root, "app", "vendor");

mkdirSync(to, { recursive: true });

const files = [
  ["legacy/build/pdf.min.mjs", "pdf.mjs"],
  ["legacy/build/pdf.worker.min.mjs", "pdf.worker.mjs"],
];
for (const [src, dst] of files) {
  copyFileSync(join(from, src), join(to, dst));
  console.log("vendored", dst);
}

// Record what was vendored, so the next person can tell whether it is stale.
const version = JSON.parse(readFileSync(join(from, "package.json"), "utf8")).version;
writeFileSync(join(to, "VERSION"), `pdfjs-dist ${version}\nvendored by tools/vendor-pdfjs.mjs\n`);
console.log("pdfjs-dist", version);
