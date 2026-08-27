#!/usr/bin/env node
/* shoot_release.mjs — the picture that goes out with a release.
 *
 *   node tools/shoot_release.mjs                  # version read from core.js
 *   node tools/shoot_release.mjs --version 2.2.0  # iterate without cutting one
 *
 * WHY THIS EXISTS. release.mjs already builds the #composites note, and what it
 * prints is words. The one thing that actually makes fifteen people open the app
 * is a picture of the new thing, and until now there was no way to get one that
 * was of the version being announced. make_mockups.mjs is the same camera
 * pointed at the README tour; this is it pointed at what changed.
 *
 * It shoots the REAL app seeded with the SAME fixtures the suites use, so a
 * picture cannot show a state the tests never covered — and it runs AFTER
 * release.mjs has verified the deploy is live, so it is provably of the version
 * that shipped.
 *
 * IT HARD-FAILS WHEN CHROMIUM IS MISSING, and that is deliberate. Every other
 * Playwright suite in this repo prints a skip line and exits 0, which is right
 * for a test — you learn nothing, you break nothing. Here a silent skip means a
 * release announced with no picture and nobody finding out. So: die, with the
 * install line. release.mjs --no-shots is the way past it, and it says so in the
 * note.
 *
 * The captions are hand-written in tools/lib/release-shots.mjs. See its header
 * for why they are not generated.
 */
import { mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serveApp, loadChromium, FB_STUB, splashGone } from "./lib/browser.mjs";
import { APPLY_FIXTURES } from "./lib/fixtures.mjs";
import { RELEASE_SHOTS } from "./lib/release-shots.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(REPO, "03 App", "app");

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
function die(msg) { console.error("\n✕ " + msg + "\n"); process.exit(1); }

/* The version, from core.js unless told otherwise — so a hand run and a release
   run cannot disagree about what they are photographing. */
const core = await readFile(join(APP, "core.js"), "utf8");
const version = arg("version", (core.match(/^var APP_VERSION = "([^"]*)";$/m) || [])[1]);
if (!version) die("No --version given and core.js has no APP_VERSION to read.");
if (!RELEASE_SHOTS.length) die("tools/lib/release-shots.mjs is empty. Write the picture before cutting the release.");
if (RELEASE_SHOTS.length > 2) die("Two pictures at most; release-shots.mjs has " + RELEASE_SHOTS.length + ".");

/* FB_STUB seeds work orders only. Parts, the schedule, the rack and the whole
   fixture set come from APPLY_FIXTURES, which is the same data test_appui and
   make_mockups drive — including the R&D records, so a release picture can only
   ever show a state the suites also cover.
   Extending the exported stub rather than writing another one on purpose: there
   are already seven copies of `window.fb = {
  guest: false,
  async signInGuest() { fb.guest = true; },` in this repo and every one of them
   has to learn about a new fb method. This adds an eighth CONSUMER, not an
   eighth shim. */
const STUB = FB_STUB.replace(/window\.onFbChange\("ready"\);\s*$/, `
async function seedJson(coll, file, pick) {
  try {
    const res = await fetch(file);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    window.onFbData(coll, pick ? pick(j) : j);
  } catch (e) { window.__seedError = String((e && e.message) || e); }
}
await seedJson("parts", "sn5-parts.json");
await seedJson("schedule", "sn5-schedule.json");
await seedJson("stock", "sn5-stock.json");
${APPLY_FIXTURES}
window.__fixturesReady = true;
window.onFbChange("ready");
`);

const chromium = await loadChromium();
if (!chromium) {
  die("Chromium is not installed, so there is no picture.\n" +
      "  A release announced with no picture and nobody noticing is the exact\n" +
      "  failure this refuses to have, so this is fatal rather than a skip.\n\n" +
      "    npx playwright install chromium\n\n" +
      "  Or, if you genuinely mean to announce without one: release.mjs --no-shots");
}

const browser = await chromium.launch();
const server = await serveApp({});
const outDir = join(REPO, "03 App", "design");
await mkdir(outDir, { recursive: true });
const written = [];
const problems = [];

/* The frame: a caption bar over the screenshot, in the app's own colours.
   Deliberately plainer than make_mockups' numbered picture-frame chrome — this
   one gets pasted into Slack next to three lines of text, not into a README
   tour, so the picture should be most of the pixels. */
function frameHtml(shot, b64) {
  return `<!doctype html><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { background: #eef1f6; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 26px; }
  .cap { max-width: 1240px; margin: 0 auto 14px; }
  .v { display: inline-block; background: #003262; color: #FDB515; font-weight: 800;
       font-size: 12px; letter-spacing: .08em; padding: 4px 10px; border-radius: 5px; }
  h1 { font-size: 25px; line-height: 1.25; color: #141d2b; margin: 10px 0 6px; font-weight: 800; }
  p { font-size: 15px; line-height: 1.5; color: #515f74; max-width: 92ch; }
  .shot { max-width: 1240px; margin: 0 auto; border-radius: 10px; overflow: hidden;
          border: 1px solid #dde3ec; box-shadow: 0 10px 30px rgba(20,29,43,.14); }
  img { display: block; width: 100%; }
  </style>
  <div class="cap">
    <span class="v">FEB COMPOSITES v${version}</span>
    <h1>${shot.title}</h1>
    <p>${shot.note}</p>
  </div>
  <div class="shot"><img src="data:image/png;base64,${b64}"></div>`;
}

for (const shot of RELEASE_SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: shot.vh || 1000 }, deviceScaleFactor: 2 });
  try {
    await ctx.route("**/fb.js", r => r.fulfill({ body: STUB, contentType: "text/javascript" }));
    await ctx.addInitScript(`try { localStorage.setItem("feb-theme", "light"); } catch (e) {}`);
    const page = await ctx.newPage();
    page.on("pageerror", e => problems.push(`${shot.id}: page error — ${String(e).slice(0, 160)}`));
    await page.goto(`http://127.0.0.1:${server.port}/index.html`, { waitUntil: "load" });
    /* fb.state is "ready" on the stub's first line, long before the seeds land —
       the trap test_detailui.mjs documents. Wait on the flag the fixtures set
       LAST, or the picture is of a half-seeded database. */
    await page.waitForFunction("window.__fixturesReady === true", null, { timeout: 20000 });
    await splashGone(page);
    const seedError = await page.evaluate("window.__seedError || null");
    if (seedError) die(`the app booted with an empty database: ${seedError}`);
    await page.evaluate(shot.js);
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await page.waitForTimeout(400);
    const png = await page.screenshot({ fullPage: false });

    const fctx = await browser.newContext({ viewport: { width: 1300, height: 800 }, deviceScaleFactor: 2 });
    const fpage = await fctx.newPage();
    await fpage.setContent(frameHtml(shot, png.toString("base64")), { waitUntil: "load" });
    const file = join(outDir, `release-v${version}-${shot.id}.png`);
    await fpage.screenshot({ path: file, fullPage: true });
    await fctx.close();
    written.push(file.slice(REPO.length + 1));
    console.log("  " + file.slice(REPO.length + 1));
  } finally {
    await ctx.close();
  }
}

await browser.close();
server.server.close();

if (problems.length) {
  console.log("\n  page errors while shooting:");
  problems.forEach(p => console.log("    " + p));
}
/* Written to stdout in a form release.mjs greps, so the two do not have to
   agree about a path format in two places. */
written.forEach(f => console.log("SHOT " + f));
