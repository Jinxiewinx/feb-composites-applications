#!/usr/bin/env node
/* The real library.js against the Firebase emulators, end to end.

   test_viewer_smoke.mjs stubs library.js out; this one does not. It boots the
   app on localhost (so library.js talks to the emulators on this app's ports),
   picks the fixture through the file input, and checks the record and file
   both landed; then reloads with ?open=<id> and checks the report comes back
   out of the emulator bucket through getDownloadURL + fetch, which is the
   path the bucket's CORS policy exists for in production.

   Run:  npm run test:library   (from "08 CFD Sims Dashboard/"; starts the
   emulators itself through emulators:exec). Skips when Playwright is absent. */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveDir, loadChromium, skipMessage } from "../../tools/lib/browser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "DP_22.pdf");
let pass = 0, fail = 0;
const t = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok || detail == null ? "" : "  — " + detail}`); };

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the CFD library round-trip")); process.exit(0); }

const { server, port } = await serveDir(join(HERE, "..", "app"));
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.CFD && Array.isArray(window.CFD.S.library), null, { timeout: 20000 });
  t("library listener connected to the Firestore emulator", true);

  await page.setInputFiles("#filepick", FIXTURE);
  await page.waitForFunction(() => window.CFD.S.docs.length === 1 && window.CFD.S.docs[0].reportId, null, { timeout: 90000 });
  const rec = await page.evaluate(() => window.CFD.S.library.find(r => r.id === window.CFD.S.docs[0].reportId));
  t("record written with the indexer's counts", rec && rec.pages === 39 && rec.panels === 59 && rec.size > 8_000_000, JSON.stringify(rec));
  t("record has a 64-char sha256", rec && /^[0-9a-f]{64}$/.test(rec.sha256));

  // Same file again: no second upload, the existing record is reused.
  await page.setInputFiles("#filepick", FIXTURE);
  await page.waitForFunction(() => window.CFD.S.docs.length === 2 && window.CFD.S.docs[1].reportId, null, { timeout: 90000 });
  const n = await page.evaluate(() => window.CFD.S.library.length);
  const same = await page.evaluate(() => window.CFD.S.docs[0].reportId === window.CFD.S.docs[1].reportId);
  t("re-uploading the same bytes dedups to one record", n === 1 && same, `records=${n} same=${same}`);

  // Fresh page, opened from the URL: bytes come back out of the bucket.
  await page.goto(`http://localhost:${port}/?open=${rec.id}&tab=panels`);
  await page.waitForFunction(() => window.CFD && window.CFD.S.docs.length === 1 && !window.CFD.S.docs[0].loading && window.CFD.S.docs[0].index, null, { timeout: 90000 });
  const back = await page.evaluate(() => [window.CFD.S.docs[0].reportId, window.CFD.S.docs[0].index.numPages, window.CFD.S.tab]);
  t("report fetched from the emulator bucket and indexed", back[0] === rec.id && back[1] === 39 && back[2] === "panels", JSON.stringify(back));

  // Delete through the library API; the listener empties the list.
  await page.evaluate(async (id) => {
    const lib = await import("/library.js");
    await lib.remove(window.CFD.S.library.find(r => r.id === id));
  }, rec.id);
  await page.waitForFunction(() => window.CFD.S.library.length === 0, null, { timeout: 20000 });
  t("delete removed the record", true);

  t("no page errors", errors.length === 0, errors.join(" | ").slice(0, 400));
} finally {
  await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
