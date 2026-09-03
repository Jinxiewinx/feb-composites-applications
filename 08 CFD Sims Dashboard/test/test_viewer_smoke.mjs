#!/usr/bin/env node
/* Browser smoke test for the ported viewer, with no Firebase.

   The risky part of hosting pdf.js is that it starts a MODULE worker, which
   depends entirely on page origin and MIME types; the rest of the app is
   node-tested through the indexer. So this boots the real app in Chromium
   over a static server, with library.js swapped for an in-memory stand-in
   (route interception, so nothing is left in app/), and checks:

     - the worker starts and DP_22.pdf indexes to 39 pages / 59 panels;
     - ?open=A,B&tab=overlay restores two library reports from the URL;
     - the Panels rows come from matchPanels (59 of them);
     - the difference view on the same file twice reads exactly 0.00%, the
       invariant every alignment change is judged by;
     - a local file picked through the input is opened AND handed to the
       library upload with the indexer's counts.

   Run:  npm run test:smoke   (from "08 CFD Sims Dashboard/")
   Skips, exit 0, when Playwright is not installed. */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveDir, loadChromium, skipMessage } from "../../tools/lib/browser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");                 // served, so /app/ and /test/fixtures/ are both reachable
const FIXTURE = join(HERE, "fixtures", "DP_22.pdf");

const LIB_STUB = `
export const usingEmulators = false;
export const MAX_BYTES = 60 * 1024 * 1024;
const recs = [
  { id: "RPT-AAAAAAAA", name: "DP_22 (A)", path: "reports/RPT-AAAAAAAA/report.pdf", size: 8470000, sha256: "a".repeat(64), pages: 39, panels: 59, note: "", createdAt: "2026-09-01T00:00:00Z" },
  { id: "RPT-BBBBBBBB", name: "DP_22 (B)", path: "reports/RPT-BBBBBBBB/report.pdf", size: 8470000, sha256: "b".repeat(64), pages: 39, panels: 59, note: "", createdAt: "2026-09-02T00:00:00Z" },
];
window.__stub = { uploads: [] };
let listener = null;
export function watchReports(cb) { listener = cb; setTimeout(() => cb(recs.slice()), 0); return () => {}; }
export async function findByHash() { return null; }
export async function sha256Hex() { return "c".repeat(64); }
export function newId() { return "RPT-CCCCCCCC"; }
export function cleanName(n) { return String(n || "report").replace(/\\.pdf$/i, "").trim().slice(0, 120); }
export async function upload(bytes, name, meta, onProgress) {
  onProgress?.(0.5); onProgress?.(1);
  const rec = { id: newId(), name: cleanName(name), path: "reports/RPT-CCCCCCCC/report.pdf", size: bytes.byteLength, sha256: "c".repeat(64), pages: meta.pages, panels: meta.panels, note: "", createdAt: new Date().toISOString() };
  window.__stub.uploads.push({ name, bytes: bytes.byteLength, meta });
  recs.unshift(rec);
  listener?.(recs.slice());   // what the real onSnapshot does after a write
  return rec;
}
export async function fetchBytes(rec) {
  const res = await fetch("/test/fixtures/DP_22.pdf");
  return new Uint8Array(await res.arrayBuffer());
}
export async function rename() {}
export async function setNote() {}
export async function remove() {}
`;

let pass = 0, fail = 0;
function t(name, ok, detail) {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok || detail == null ? "" : "  — " + detail}`);
}

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the CFD viewer")); process.exit(0); }

const { server, port } = await serveDir(ROOT);
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.route("**/library.js", r => r.fulfill({ contentType: "text/javascript", body: LIB_STUB }));

  await page.goto(`http://127.0.0.1:${port}/app/?open=RPT-AAAAAAAA,RPT-BBBBBBBB&tab=overlay`);
  await page.waitForFunction(() => window.CFD && window.CFD.S.library && window.CFD.S.library.length === 2, null, { timeout: 15000 });
  t("library snapshot reached the app (2 records)", true);

  await page.waitForFunction(() => {
    const S = window.CFD.S; return S.docs.length === 2 && S.docs.every(d => !d.loading && d.index);
  }, null, { timeout: 60000 });
  const shape = await page.evaluate(() => window.CFD.S.docs.map(d => [d.reportId, d.index.numPages, d.index.panels.length]));
  t("both URL reports opened from the library", shape[0][0] === "RPT-AAAAAAAA" && shape[1][0] === "RPT-BBBBBBBB", JSON.stringify(shape));
  t("module worker started: 39 pages / 59 panels per report", shape.every(s => s[1] === 39 && s[2] === 59), JSON.stringify(shape));
  t("tab restored from the URL", await page.evaluate(() => window.CFD.S.tab) === "overlay");
  t("panel rows come from matchPanels (59)", await page.evaluate(() => window.CFD.panelRows().length) === 59);
  t("URL still names both reports", (await page.url()).includes("open=RPT-AAAAAAAA%2CRPT-BBBBBBBB") || (await page.url()).includes("open=RPT-AAAAAAAA,RPT-BBBBBBBB"), await page.url());

  await page.evaluate(() => { window.CFD.S.overlay.mode = "difference"; window.CFD.render(); });
  await page.waitForFunction(() => window.__lastDiff && typeof window.__lastDiff.pct === "number", null, { timeout: 30000 });
  const diff = await page.evaluate(() => window.__lastDiff);
  t("difference of the same report against itself is exactly 0.00%", diff.pct === 0 && diff.changed === 0, JSON.stringify(diff));

  // Panels view renders one column per report for the selected row.
  await page.evaluate(() => { window.CFD.S.tab = "panels"; window.CFD.render(); window.CFD.renderChrome(); });
  await page.waitForFunction(() => document.querySelectorAll("#main canvas").length >= 2, null, { timeout: 30000 });
  t("panels view drew a canvas per report", true);

  // A local file through the picker: opened, then handed to the library.
  await page.setInputFiles("#filepick", FIXTURE);
  await page.waitForFunction(() => window.__stub.uploads.length === 1 && window.CFD.S.docs.length === 3 && window.CFD.S.docs[2].reportId, null, { timeout: 60000 });
  const up = await page.evaluate(() => window.__stub.uploads[0]);
  t("picked file was uploaded with the indexer's counts", up.meta.pages === 39 && up.meta.panels === 59 && up.bytes > 8_000_000, JSON.stringify(up));
  t("the new doc carries the library id", await page.evaluate(() => window.CFD.S.docs[2].reportId) === "RPT-CCCCCCCC");

  const libRows = await page.evaluate(() => document.querySelectorAll("#liblist .doc.lib").length);
  t("library list shows all three records", libRows === 3, String(libRows));

  t("no page errors", errors.length === 0, errors.join(" | ").slice(0, 400));
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
