/* shoot_ui.mjs — render a tab of the app and write PNGs of it.
 *
 * WHY THIS EXISTS
 * The two other browser tools in here (test_drawings, test_print_mobile) assert
 * on measurements: is this text crossed by a line, does this sheet fit in this
 * viewport. That catches everything you can write down as a number, and nothing
 * you can't. "Cluttered" is not a number. Neither is "the interface kinda
 * sucks", which is how the Parts revamp got asked for.
 *
 * So this is the other half of the loop: it renders the real app — the real
 * parts.js, the real stylesheet, real SN5 data — and writes images a reviewer
 * can look at. It asserts nothing. It is a camera, not a test.
 *
 * It resolves the app relative to ITSELF, not the cwd, which is the point:
 * run it from inside a git worktree and it shoots that worktree's app. That is
 * how four competing variants get photographed under identical conditions.
 *
 *   node tools/shoot_ui.mjs --out .ui-shots
 *   node tools/shoot_ui.mjs --out /tmp/shots --label B --tab parts
 *
 * Options
 *   --out <dir>    where the PNGs go            (default .ui-shots)
 *   --label <s>    filename prefix, e.g. the variant id   (default "ui")
 *   --tab <id>     which tab to shoot           (default parts)
 *   --id <recId>   which record for the detail states     (default first row)
 *   --width <n>    shoot one width instead of all three
 *   --theme <t>    light | dark, instead of both
 *
 * Needs Playwright, same as the other two, and skips loudly without it.
 */

import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveApp, loadChromium, skipMessage, APP_ROOT } from "./lib/browser.mjs";

/* ---------- args ---------- */
function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const OUT = arg("out", ".ui-shots");
const LABEL = arg("label", "ui");
const TAB = arg("tab", "parts");
const REC = arg("id", "");

/* Three widths, each one a real decision boundary in the stylesheet rather than
   a round number: 1440 is the design target, 900 is where the sidebar becomes a
   drawer and list tables card-stack, 393 is an iPhone 15. A layout that works at
   all three has no untested middle. */
const WIDTHS = [
  { w: 1440, h: 1000, id: "1440", mobile: false },
  { w: 900, h: 1100, id: "900", mobile: false },
  { w: 393, h: 852, id: "393", mobile: true },
];
const THEMES = ["light", "dark"];

const oneW = arg("width", ""), oneT = arg("theme", "");
const widths = oneW ? WIDTHS.filter(v => v.id === oneW) : WIDTHS;
const themes = oneT ? THEMES.filter(t => t === oneT) : THEMES;

/* ---------- the states worth a photograph ----------
   A tab is not one picture. The list with the default filter is what you see
   99% of the time; the list with everything shown is where density actually
   bites (33 records, not 12); read and edit are two different designs wearing
   the same name. Each entry is a string of app JS run in the page — the same
   technique test_print_mobile uses to mount a document, and for the same
   reason: it drives the app through its own entry points instead of
   reaching in and rearranging its state. */
const STATES = [
  { id: "list", js: tab => `setTab(${JSON.stringify(tab)});` },
  { id: "list-all", js: tab => `setTab(${JSON.stringify(tab)}); view.fDone = true; render();` },
  { id: "detail", js: (tab, id) => `setTab(${JSON.stringify(tab)}); openRecord(${JSON.stringify(tab)}, ${JSON.stringify(id)});` },
  { id: "detail-edit", js: (tab, id) => `setTab(${JSON.stringify(tab)}); openRecord(${JSON.stringify(tab)}, ${JSON.stringify(id)}); view.edit = true; render();` },
];

/* ---------- the stand-in for fb.js ----------
   Same boundary the shared FB_STUB stubs (onFbData / onFbChange), but seeded
   with parts AS WELL AS work orders. Parts need their own archive, and the
   linked-work-order chip on a part only resolves if both collections are
   present — shooting parts with an empty workOrders would photograph a missing
   feature and call it a design. */
const STUB = `
window.fb = {
  state: "ready",
  user: { uid: "u1", email: "simon@berkeley.edu", name: "Simon Starbuck" },
  roster: { role: "lead", name: "Simon Starbuck", email: "simon@berkeley.edu" },
  rosterCheckFailed: false,
  save: async () => {}, del: async () => {}, mutateField: async () => {}, appendTo: async () => {},
  upload: async () => ({ url: "", path: "", name: "", size: 0, type: "" }), deleteFile: async () => {},
  allocId: async () => "X-1", importMany: async () => {},
  rosterAll: async () => [], rosterSet: async () => {}, rosterDelete: async () => {},
  notify: async () => {}, markNotifRead: async () => {},
  signOut: async () => {}, refreshRoster: async () => {},
  getConfig: async () => null, setConfig: async () => {},
};
/* Reported, never swallowed — an empty DB photographs as a working empty state
   and nobody notices the seed failed. Same lesson as tools/lib/browser.mjs. */
window.__seedError = null;
async function seed(coll, file, pick) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const arr = pick ? pick(json) : json;
      if (!Array.isArray(arr) || !arr.length) throw new Error(file + " parsed but held no records");
      window.onFbData(coll, arr);
      return;
    } catch (e) {
      window.__seedError = String((e && e.message) || e);
      window.onFbData(coll, []);
      await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
    }
  }
}
await seed("parts", "sn5-parts.json");
await seed("workOrders", "sn5-work-orders.json", j => Array.isArray(j) ? j : (j.workOrders || []));
window.onFbChange("ready");
`;

/* ---------- go ---------- */
const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the UI")); process.exit(0); }

await mkdir(OUT, { recursive: true });
const { server, port } = await serveApp({});
const browser = await chromium.launch();

/* Default record for the detail shots: the first id in the archive, unless one
   was named. Reading the file rather than hardcoding "P-SN5-001" keeps this
   working if the seed ever changes. */
let recId = REC;
if (!recId) {
  try {
    const seedFile = { parts: "sn5-parts.json", workorders: "sn5-work-orders.json" }[TAB];
    const json = JSON.parse(await readFile(join(APP_ROOT, seedFile), "utf8"));
    const arr = Array.isArray(json) ? json : (json.workOrders || []);
    recId = (arr[0] || {}).id || "";
  } catch { recId = ""; }
}

const written = [];
const problems = [];

for (const vp of widths) {
  for (const theme of themes) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    await ctx.route("**/fb.js", r => r.fulfill({ body: STUB, contentType: "text/javascript" }));
    /* The theme is read from localStorage by the no-FOUC script in index.html
       BEFORE first paint, so it has to be set before the document exists —
       hence addInitScript rather than an evaluate after load. Toggling it
       afterwards would work too, but it wouldn't photograph the first paint,
       which is the one a user sees. */
    await ctx.addInitScript(`try { localStorage.setItem("feb-theme", ${JSON.stringify(theme)}); } catch (e) {}`);

    const page = await ctx.newPage();
    page.on("pageerror", e => problems.push(`${vp.id}/${theme}: page error — ${String(e).slice(0, 200)}`));
    page.on("console", m => { if (m.type() === "error") problems.push(`${vp.id}/${theme}: console — ${m.text().slice(0, 200)}`); });

    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction("window.fb && fb.state === 'ready'", null, { timeout: 20000 });
    const seedError = await page.evaluate("window.__seedError || null");
    if (seedError) throw new Error(`app booted with an empty database: ${seedError}`);

    for (const st of STATES) {
      const needsRec = st.id.startsWith("detail");
      if (needsRec && !recId) continue;
      await page.evaluate(st.js(TAB, recId));
      /* Let webfonts settle and any post-render pass (labelListTables) run.
         Screenshots taken mid-swap are the classic way to photograph a bug
         that isn't there. */
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await page.waitForTimeout(350);
      const name = `${LABEL}-${st.id}-${vp.id}-${theme}.png`;
      await page.screenshot({ path: join(OUT, name), fullPage: true });
      written.push(name);
    }
    await ctx.close();
  }
}

await browser.close();
server.close();

console.log(`${written.length} images in ${OUT}`);
console.log(`  ${TAB}${recId ? " · detail record " + recId : ""} · widths ${widths.map(v => v.id).join(", ")} · ${themes.join(", ")}`);
if (problems.length) {
  console.log(`\n${problems.length} console/page error${problems.length === 1 ? "" : "s"} while shooting:`);
  [...new Set(problems)].slice(0, 10).forEach(p => console.log("  " + p));
}
