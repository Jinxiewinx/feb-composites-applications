/* make_mockups.mjs — annotated real screenshots for the READMEs.
 *
 * The 2026-07-28 mockup set was hand-composed concept art: a caption strip, a
 * white card, an annotation footer, and invented data. It looked great and
 * could never be updated, because there was no source — only the PNG. This
 * replaces that convention with the same framing around a screenshot of the
 * REAL app, seeded with the same fixtures the tests use. The captions live in
 * the SHOTS table below, so regenerating after a UI change is one command:
 *
 *   node tools/make_mockups.mjs              # everything
 *   node tools/make_mockups.mjs --only labels,scan   # a subset, by id
 *   node tools/make_mockups.mjs --date 20260803      # override the date stamp
 *
 * Output goes straight into the folders the READMEs reference:
 *   03 App/design/<id>-mockup-<date>.png     the app tour
 *   07 CFD PDF Viewer/design/…               the viewer
 *   08 Website/design/…                      the public site
 *   06 Design System/…                       the style guide
 *
 * It is a camera plus a picture frame, not a test — it asserts nothing beyond
 * "the seed loaded". Needs Playwright, same as shoot_ui.mjs, and skips loudly
 * without it.
 */

import { mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serveApp, serveDir, loadChromium, skipMessage, APP_ROOT } from "./lib/browser.mjs";
import { APPLY_FIXTURES } from "./lib/fixtures.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const DATE = arg("date", new Date().toISOString().slice(0, 10).replace(/-/g, ""));
const ONLY = arg("only", "").split(",").map(s => s.trim()).filter(Boolean);

/* ---------- the shot list ----------
 * kind:
 *   app   — boot the seeded app, run `js` in the page, shoot the viewport
 *   q     — the public scan landing page, phone-sized, render() driven directly
 *   cfd   — the CFD viewer with both sample reports loaded, one view per shot
 *   site  — the built team website
 *   guide — the design-system style guide
 * badge/title/note are the annotation chrome. vh is the viewport height of the
 * raw capture (1440 wide for desktop, 393 for phone).
 */
const SHOTS = [
  { id: "dashboard", kind: "app", badge: 1, vh: 1000,
    js: `setTab("dashboard");`,
    title: "Dashboard · mission control",
    note: "The board, on the app's own white surfaces: gold-slash Saira headers and big numerals carry the identity. The alert strip leads with the lead's one-second read (late, blocked, unassigned, curing, T-minus to competition), then the bucketed work list, shop status, the season gauges, this week's stations, a cross-app activity feed, countdown and streaks, money with the $50 approval rule, a launchpad of filtered jumps and pinned docs, and the fact of the day from SN5 shop lore. Every element still a link." },
  { id: "workorders", kind: "app", badge: 2, vh: 1000,
    js: `setTab("workorders");`,
    title: "Work orders · every run, under the part it builds",
    note: "The rail groups runs by the part they build, so the tab reads as the hierarchy: each row shows how far through its buy-offs a run is and whether it is blocked or curing. Parts nobody has started show up too, with the button that starts one." },
  { id: "workorder-detail", kind: "app", badge: 3, vh: 1500,
    js: `setTab("workorders"); openRecord("workorders", __WO__);`,
    title: "A work order · steps, buy-offs, cure holds",
    note: "The traveler lives here as one scroll, Steps first because that is the bench action, with a bar that jumps to any section and counts what is in it. Which run it is, its status, the lineage and anything blocking it stay above that bar. Buying off an infusion asks which resin and which lots went in, and the demould step then stays locked until the cure hold has run." },
  { id: "parts", kind: "app", badge: 4, vh: 1200,
    js: `setTab("parts"); openRecord("parts", __PART__);`,
    title: "Parts · the season tracker, split view",
    note: "Every part down the left, the selected one beside it, so opening a part never destroys the list. Each stage is a row of steps you click directly; arrow keys walk the index and 1/2/3 advance the stages." },
  { id: "molds", kind: "app", badge: 5, vh: 1200,
    js: `setTab("molds"); openRecord("molds", "MOLD-SN6-001");`,
    title: "Molds · a mold and its file, on one screen",
    note: "The rail groups every mold by the stage it is at, so it reads as the pipeline it is; the pane is whatever is selected. A mold's stack plan is part of the mold — the rotatable 3D view, the exploded stack and the blanks table are all here, not one click away. Arrow keys walk the rail and 1 advances a mold's stage. Planning a mold creates its record at “Designed”, and the plan, drawings and cut list hang off it." },
  { id: "molds-overview", kind: "app", badge: 6, vh: 1100,
    js: `setTab("molds");`,
    title: "Molds · the season view",
    note: "With nothing selected, the pane answers the standing questions: where the live molds sit across the stages, whether the planned blanks actually fit what you own, and what needs a hand — molds with no home, molds machined with no stack plan on file, plans carrying a slicer warning nobody has read, and plans with no mold to be reached through." },
  { id: "inventory", kind: "app", badge: 7, vh: 1100,
    /* An empty shelf is half a real shop, and it is a card like any other, so
       the shot has to contain one or it shows a range the map does not have. */
    js: `
      DB.items.push(
        { id: "BIN-SN6-101", cls: "BIN", name: "Cure oven shelf", stage: "Active",
          site: "RFS container", locKind: "shelf", walkedAt: today() },
        { id: "BIN-SN6-102", cls: "BIN", name: "Consumables drawer", stage: "Active",
          site: "RFS container", locKind: "drawer", walkedAt: today() });
      setTab("inventory");
    `,
    title: "Inventory · the storage map",
    note: "One card per shelf, rack and bin, grouped by site, each showing what is on it and what is wrong with it: expired lots, resin and hardener together, flammables outside the rated cabinet, and how long since anyone confirmed the shelf. Click a card anywhere to see what is on that shelf. An empty shelf is a quieter card, never a hidden one — the map is the picture of the shop, and a shelf missing from it is a shelf you forget you own. Search matches what is ON a shelf, so a material name leaves the shelves that have some; a shelf with something wrong leads with the warning and wears a red spine; the monthly stock walk is the Confirm button on the card. New shelves are added here, with + Location." },
  { id: "receiving", kind: "app", badge: 8, vh: 1000,
    js: `
      DB.items = [
        { id: "BIN-SN6-001", cls: "BIN", name: "RFS Container Shelf A", stage: "Active", site: "RFS container", locKind: "shelf" },
        { id: "BIN-SN6-002", cls: "BIN", name: "Flammables Cabinet", stage: "Active", site: "Flammables cabinet", locKind: "cabinet", flam: "Yes" },
        { id: "BIN-SN6-003", cls: "BIN", name: "Jacobs Basement Shelf B3", stage: "Active", site: "Jacobs basement", locKind: "shelf" },
      ];
      DB.lots = [];
      RX = { rows: [], supplier: "Easy Composites", receivedOn: "2026-08-23", buyId: "",
             defBin: "BIN-SN6-001", lockBin: "", index: "" };
      const add = (o) => RX.rows.push({ ...rxBlankRow({}), ...o });
      add({ cls: "FAB", name: "195 Twill Sigmatex 2x2 3k", qty: "3", bin: "BIN-SN6-001", vendorLot: "SG24-1180", unitCost: "61.40" });
      add({ cls: "FAB", name: "450gsm Biax E-Glass", qty: "2", bin: "BIN-SN6-001", vendorLot: "EG-9902", unitCost: "22.00" });
      add({ cls: "RSN", name: "IN2 Infusion Resin", qty: "4", bin: "BIN-SN6-002", vendorLot: "IN2-44120", unitCost: "78.00", expiresOn: "2027-04-30" });
      add({ cls: "RSN:hardener", name: "AT30 Slow Hardener", qty: "2", bin: "BIN-SN6-003", vendorLot: "AT30-8871", unitCost: "41.50", expiresOn: "2027-04-30" });
      add({ cls: "CON", name: "Blue tack tape", qty: "12", bin: "BIN-SN6-001", unitCost: "9.40" });
      add({ cls: "CON", name: "", qty: "1", bin: "BIN-SN6-001" });
      RX.rows[2].cls = "RSN:resin";
      view = { ...view, tab: "inventory", invView: "desk", mode: "list", id: null };
      render();
    `,
    title: "Receiving · many things, many shelves, one pass",
    note: "One line per thing in the box, each landing wherever it actually goes. The count says what it will become as you type it — three rolls are three labelled records, twelve rolls of tape are one record with a count — so the confirm is a receipt rather than a reveal. Enter starts the next line already carrying the class and the shelf, which is what makes typing a shop in survivable." },
  { id: "inventory-boards", kind: "app", badge: 8, vh: 1000,
    js: `view = { ...view, tab: "inventory", invView: "boards", mode: "list", id: null, q: "", invDens: "" }; render();`,
    title: "Boards · the tooling rack",
    note: "A board is a thing on a shelf, so the rack lives beside the items and the materials rather than on the Molds rail. One row per size, because a board is its length, width, thickness and density; the individual records and their printed labels are one click deeper. Grouped by grade, since that is the one axis the packer refuses to substitute across — and grade is typed, not picked from a list, because the rack has always held sheets outside the 30/60 catalogue." },
  { id: "inventory-contents", kind: "app", badge: 8, vh: 1150,
    js: `setTab("inventory"); selectInvRec("BIN-SN6-001");`,
    title: "A shelf · what lives here",
    note: "Scanning a shelf's own label lands on this page. Add here creates records already located; Move here scans things onto the shelf; Confirm contents is CS-011's monthly stock walk as one tap; Receive a delivery stocks a whole order in one pass." },
  { id: "tickets", kind: "app", badge: 9, vh: 1100,
    js: `setTab("projects");`,
    title: "Tickets · everything that is not a part",
    note: "R&D, process fixes, bugs, outreach. The rail lists every ticket with sub-tickets nested under their parent; the kanban board fills the pane until one is opened. Drag a card between statuses, or walk the rail with the arrow keys." },
  { id: "ticket-detail", kind: "app", badge: 10, vh: 1400,
    js: `setTab("projects"); openRecord("projects", "TKT-0031");`,
    title: "A ticket · genealogy, sub-tickets, the thread",
    note: "The lineage bar names a sub-ticket's parent (and an issue's work order and part), hyperlinked both ways. Sub-tickets are a real children table with due dates and lateness; the jump bar counts what is in each section; comments read newest-first with the composer on top, and the metadata sits beside the discussion instead of burying it." },
  { id: "schedule", kind: "app", badge: 11, vh: 1000,
    js: `view.schedView='stations'; setTab("timeline");`,
    title: "Schedule · the season by station",
    note: "Weeks are columns, the seven stations are rows, so “when is the ShopSabre free” is one horizontal scan. A slot here is the plan, not a booking; the machine is reserved on the RFS site." },
  { id: "schedule-week", kind: "app", badge: 12, vh: 1100,
    js: `view.schedView='week'; setTab("timeline");`,
    title: "Schedule · the week by person",
    note: "The same schedule behind the toggle: what happens each day, by which car group, plus a per-person rollup pulled from ticket due dates and assignments. Timeline and Weekly Plan used to be two tabs; they were always one question." },
  { id: "budget", kind: "app", badge: 13, vh: 1000,
    js: `setTab("budget");`,
    title: "Budget · purchases through reimbursement",
    note: "Submitted, Ordered, Reimbursed, with a season total and a flag on anything over $50. On a phone, “scan receipt” opens the camera and attaches the photo to the purchase." },
  { id: "documents", kind: "app", badge: 14, vh: 1100,
    js: `setTab("documents");`,
    title: "Documents · one shelf for everything",
    note: "Datasheets, CS standards and printables, filterable by type, plus the team shelf: the Google Docs people keep asking for, pinned once. Paste a Drive URL anywhere and the app reads the real title and offers an inline preview." },
  { id: "reports", kind: "app", badge: 15, vh: 1000,
    js: `setTab("reports");`,
    title: "Reports · exports, status board, labels",
    note: "Per-dataset CSV export, a printable Monday status board, and the bulk label builder with a start-cell picker so a part-used Avery sheet gets finished instead of binned." },
  { id: "people", kind: "app", badge: 16, vh: 1000,
    js: `setTab("people");`,
    title: "People · who is carrying what",
    note: "The roster with roles and each person's live assignments across parts, tickets and work orders. Sub-tickets fold into their parent, so breaking work down does not make you look busier." },
  { id: "labels", kind: "app", badge: 17, vh: 1150,
    js: `openLabelPreview(
           DB.molds.slice(0, 3).map(o => ({ coll: "molds", o }))
             .concat(DB.parts.slice(0, 8).map(o => ({ coll: "parts", o })))
             .concat(DB.lots.slice(0, 4).map(o => ({ coll: "lots", o }))),
           { grid: "5161" });`,
    title: "Labels · every physical thing gets one",
    note: "4 × 1 inch, Avery 20-up: the ID, the fact that identifies the thing, and a QR that resolves to the record. The first cell is a 100 mm calibration bar, because browsers silently “fit to page” and polyester sheets cost real money." },
  { id: "scan", kind: "q", badge: 18, vh: 700,
    title: "Scanning · a plain camera, no account",
    note: "Pointing any phone at a label opens the public nameplate: what the object is, what stage, where it lives. No sign-in and no app install, because the person asking is often not on the roster. Names, costs and files stay behind the login." },

  { id: "cfd-panels", kind: "cfd", badge: 1, vh: 1000, view: "Panels",
    dir: "07 CFD PDF Viewer/design",
    title: "Panels · the same plot from every report",
    note: "The indexer finds and names every plot in each Fluent report, so one named panel can be pulled out of all of them, cropped and scaled identically. The eye does the comparing." },
  { id: "cfd-overlay", kind: "cfd", badge: 2, vh: 1000, view: "Overlay",
    dir: "07 CFD PDF Viewer/design",
    title: "Overlay · two reports on top of each other",
    note: "Blend, a draggable swipe divider, or a per-pixel difference map with a percent-changed readout. Two identical reports read exactly 0.00%, which is what makes the number trustworthy." },
  { id: "cfd-summary", kind: "cfd", badge: 3, vh: 1000, view: "Summary",
    dir: "07 CFD PDF Viewer/design",
    title: "Summary · the numbers before the plots",
    note: "Mesh counts, solver settings, iterations and residuals from every open report in one table, changed values highlighted. Often answers the question before you look at a single contour." },

  { id: "website-home", kind: "site", badge: 1, vh: 1100,
    dir: "08 Website/design",
    title: "The public site · sponsors and recruits",
    note: "Built on the same design system as the app, plain HTML and CSS. Photos are placeholders and the application form is not wired yet; the README has the list." },

  { id: "styleguide-light", kind: "guide", badge: 1, vh: 1300, theme: "light",
    dir: "06 Design System",
    title: "The design system · light",
    note: "Color, type and spacing tokens plus the component library, extracted from the app so the next FEB tool starts on-brand. tools/test_designsystem.mjs keeps this and the app from drifting apart." },
  { id: "styleguide-dark", kind: "guide", badge: 2, vh: 1300, theme: "dark",
    dir: "06 Design System",
    title: "The design system · dark",
    note: "The same tokens re-pointed for dark. Every surface, chip and status color changes with the theme; printing always comes out black on white regardless." },
];

/* ---------- the fb.js stand-in (same shape as shoot_ui.mjs) ---------- */
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
await seed("schedule", "sn5-schedule.json");
await seed("stock", "sn5-stock.json");
${APPLY_FIXTURES}
window.__fixturesReady = true;
window.onFbChange("ready");
`;

/* ---------- the picture frame ----------
 * Approximates the 2026-07-28 concept-art chrome: numbered navy badge, all-caps
 * caption, white card with a soft shadow on a pale blue-grey field, and a blue
 * annotation footer. The screenshot goes in as a data URI so the wrapper needs
 * no server and leaves no file behind.
 */
function frameHtml(shot, pngB64, phone) {
  return `<!doctype html><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { background: #e9eef5; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .wrap { max-width: ${phone ? 560 : 1240}px; margin: 0 auto; padding: 26px 30px 34px; }
  .cap { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; }
  .badge { flex: none; width: 26px; height: 26px; border-radius: 50%; background: #0f2d52; color: #fff;
           font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .cap span { font-size: 13px; font-weight: 700; letter-spacing: .09em; color: #3d4a5c; text-transform: uppercase; }
  .card { background: #fff; border-radius: 14px; overflow: hidden;
          box-shadow: 0 10px 30px rgba(15,45,82,.12), 0 2px 6px rgba(15,45,82,.08); }
  .card img { display: block; width: 100%; }
  .note { margin-top: 16px; background: #dce8f8; border-radius: 8px; padding: 13px 17px;
          color: #1d4f91; font-size: 14.5px; line-height: 1.55; }
  </style>
  <div class="wrap">
    <div class="cap"><div class="badge">${shot.badge}</div><span>${shot.title}</span></div>
    <div class="card"><img src="data:image/png;base64,${pngB64}"></div>
    <div class="note">${shot.note}</div>
  </div>`;
}

/* ---------- go ---------- */
const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the mockups")); process.exit(0); }

const shots = ONLY.length ? SHOTS.filter(s => ONLY.includes(s.id)) : SHOTS;
const unknown = ONLY.filter(id => !SHOTS.some(s => s.id === id));
if (unknown.length) { console.error("unknown --only ids: " + unknown.join(", ")); process.exit(1); }

/* Default records for the two detail shots: first id in each archive, same
   trick as shoot_ui.mjs, so a reseed never strands a hardcoded id. */
const partsJson = JSON.parse(await readFile(join(APP_ROOT, "sn5-parts.json"), "utf8"));
const woJsonRaw = JSON.parse(await readFile(join(APP_ROOT, "sn5-work-orders.json"), "utf8"));
const woJson = Array.isArray(woJsonRaw) ? woJsonRaw : (woJsonRaw.workOrders || []);
const PART_ID = (partsJson[0] || {}).id || "";
const WO_ID = (woJson[0] || {}).id || "";

const browser = await chromium.launch();
const written = [];
const problems = [];

/* One server per root, started lazily and shut down at the end. */
const servers = {};
async function portFor(kind) {
  const roots = {
    app: null, // serveApp
    q: null,
    cfd: join(REPO, "07 CFD PDF Viewer", "app"),
    site: join(REPO, "08 Website", "site"),
    guide: join(REPO, "06 Design System"),
  };
  const key = kind === "q" ? "app" : kind;
  if (!servers[key]) {
    servers[key] = key === "app" ? await serveApp({}) : await serveDir(roots[key], {});
  }
  return servers[key].port;
}

async function rawShot(shot) {
  const phone = shot.kind === "q";
  const vw = phone ? 393 : 1440;
  const ctx = await browser.newContext({
    viewport: { width: vw, height: shot.vh },
    deviceScaleFactor: 2,
    isMobile: phone,
    hasTouch: phone,
  });
  const port = await portFor(shot.kind);
  try {
    const page = await ctx.newPage();
    page.on("pageerror", e => problems.push(`${shot.id}: page error — ${String(e).slice(0, 160)}`));

    if (shot.kind === "app") {
      await ctx.route("**/fb.js", r => r.fulfill({ body: STUB, contentType: "text/javascript" }));
      await ctx.addInitScript(`try { localStorage.setItem("feb-theme", "light"); } catch (e) {}`);
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
      /* fb.state is "ready" on the stub's first line, long before the seeds and
         fixtures have landed, the trap test_detailui.mjs documents. Wait on the
         flag the fixtures set LAST, or the shot photographs a half-seeded
         database (and the labels shot finds no DB.molds at all). */
      await page.waitForFunction("window.__fixturesReady === true", null, { timeout: 20000 });
      const seedError = await page.evaluate("window.__seedError || null");
      if (seedError) throw new Error(`app booted with an empty database: ${seedError}`);
      const js = shot.js
        .replace("__WO__", JSON.stringify(WO_ID))
        .replace("__PART__", JSON.stringify(PART_ID));
      await page.evaluate(js);
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await page.waitForFunction(
        () => !/Loading documents/.test(document.getElementById("main").textContent),
        null, { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(400);
    } else if (shot.kind === "q") {
      /* q.html reads the ID off location.pathname (/Q/<ID>); the plain static
         server has no rewrite, so serve it at that path explicitly. Then feed
         render() a fixture directly, the same way test_q_landing.mjs does,
         instead of standing up a fake Firestore. */
      const qHtml = await readFile(join(APP_ROOT, "q.html"), "utf8");
      await ctx.route("**/Q/*", r => r.fulfill({ body: qHtml, contentType: "text/html" }));
      await page.goto(`http://127.0.0.1:${port}/Q/MOLD-SN6-004`, { waitUntil: "load" });
      await page.waitForTimeout(300);
      await page.evaluate(`render({
        id: "MOLD-SN6-004", cls: "MOLD", name: "Undertray diffuser mold",
        stage: "Sealed", location: "RFS · Rack B2", wo: "WO-SN6-011", rev: "A"
      })`);
      await page.waitForTimeout(200);
    } else if (shot.kind === "cfd") {
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
      await page.setInputFiles("#filepick", [
        join(REPO, "07 CFD PDF Viewer", "DP_22.pdf"),
        join(REPO, "07 CFD PDF Viewer", "DP_22_variant.pdf"),
      ]);
      /* Indexing two reports takes a few seconds; the tab bar only fills once
         the first document is in. Wait for the view tab, click it, then give
         the canvases a beat to paint. */
      await page.waitForFunction(
        () => document.querySelectorAll("#tabs button").length >= 4, null, { timeout: 60000 });
      await page.getByRole("button", { name: shot.view, exact: true }).click();
      await page.waitForTimeout(2500);
    } else if (shot.kind === "site") {
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await page.waitForTimeout(600);
    } else if (shot.kind === "guide") {
      await page.goto(`http://127.0.0.1:${port}/styleguide.html`, { waitUntil: "load" });
      await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), shot.theme);
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await page.waitForTimeout(400);
    }

    return await page.screenshot({ fullPage: false });
  } finally {
    await ctx.close();
  }
}

for (const shot of shots) {
  const png = await rawShot(shot);
  const phone = shot.kind === "q";
  const frame = frameHtml(shot, png.toString("base64"), phone);
  const fctx = await browser.newContext({
    viewport: { width: phone ? 620 : 1300, height: 800 },
    deviceScaleFactor: 2,
  });
  const fpage = await fctx.newPage();
  await fpage.setContent(frame, { waitUntil: "load" });
  const outDir = join(REPO, shot.dir || "03 App/design");
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, `${shot.id}-mockup-${DATE}.png`);
  await fpage.screenshot({ path: file, fullPage: true });
  await fctx.close();
  written.push(file.slice(REPO.length + 1));
  console.log("  " + file.slice(REPO.length + 1));
}

await browser.close();
for (const s of Object.values(servers)) s.server.close();

console.log(`${written.length} mockups written`);
if (problems.length) {
  console.log(`\n${problems.length} page error${problems.length === 1 ? "" : "s"} while shooting:`);
  [...new Set(problems)].slice(0, 10).forEach(p => console.log("  " + p));
}
