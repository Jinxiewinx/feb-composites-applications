#!/usr/bin/env node
/* Screenshots of the real app, for the deck.

   WHY THIS EXISTS
   ===============
   A deck full of hand-drawn mockups is a deck about a plan. The whole point of
   this pitch is that the thing already runs, so every screen in it has to be the
   actual app, rendering actual SN5 records. That means booting index.html for
   real — the same way tools/test_print_mobile.mjs does, with fb.js stubbed at
   the route so there is no Firebase and no auth — and photographing it.

   It reuses tools/lib/browser.mjs (serveApp, loadChromium) rather than standing
   up its own server and its own Chromium lookup. It does NOT reuse that file's
   FB_STUB, which seeds work orders only: a deck needs every tab populated, so
   the stub here loads all four SN5 archives and synthesises the three
   collections that ship no archive (tickets, budget, roster).

   Nothing here writes to `03 App/` — the app is served read-only and the stub is
   injected at the route.

     node "06 Pitch/capture_shots.mjs"            # all shots
     node "06 Pitch/capture_shots.mjs" dashboard  # just the ones matching

   Needs Playwright and its Chromium; skips loudly without it, same as the tests. */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveApp, loadChromium, skipMessage } from "../tools/lib/browser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "shots");

/* 2x, so a screenshot placed half-slide-wide on a 13.3in deck still has more
   pixels than the projector does. */
const DESKTOP = { width: 1440, height: 900, dsf: 2 };
const PHONE = { width: 393, height: 852, dsf: 3 };

/* ---------- the stub ----------
   Same boundary as tools/lib/browser.mjs FB_STUB (onFbData / onFbChange), wider
   seed. Signed in as a lead, because half the deck is about lead-only actions. */
const FB_STUB = `
/* "loading" until the seeds land. It has to start un-ready: the capture waits on
   fb.state, and an fb that says "ready" the instant the script parses lets the
   first shot photograph an app whose tables are still empty. */
window.fb = {
  state: "loading",
  user: { uid: "u1", email: "n.jepsen@berkeley.edu", name: "Nick Jepsen" },
  roster: { role: "lead", name: "Nick Jepsen", email: "n.jepsen@berkeley.edu" },
  rosterCheckFailed: false,
  save: async () => {}, del: async () => {}, mutateField: async () => {}, appendTo: async () => {},
  /* Real object URLs, not empty strings. The planner parks the mold mesh in
     Storage and the 3D view reads it back from that URL — stub it to "" and the
     centrepiece of the deck renders an empty canvas. */
  upload: async (path, file) => ({ url: URL.createObjectURL(file), path, name: file.name || "f", size: file.size || 0, type: file.type || "" }),
  deleteFile: async () => {},
  allocId: async (coll) => (coll === "stackplans" ? "STK-001" : "X-1"),
  importMany: async () => {},
  rosterAll: async () => [], rosterSet: async () => {}, rosterDelete: async () => {},
  notify: async () => {}, markNotifRead: async () => {},
  signOut: async () => {}, refreshRoster: async () => {},
  getConfig: async () => null, setConfig: async () => {},
};

window.__seedError = null;
async function seed(coll, file) {
  const res = await fetch(file);
  if (!res.ok) throw new Error(file + ": HTTP " + res.status);
  const j = await res.json();
  const arr = Array.isArray(j) ? j : (j[coll] || []);
  if (!arr.length) throw new Error(file + " parsed but held nothing");
  window.onFbData(coll, arr);
  return arr;
}

try {
  const wos = await seed("workOrders", "sn5-work-orders.json");
  window.onFbData("workOrders", [window.__DECK_WO, ...wos].filter(Boolean));
  const parts = await seed("parts", "sn5-parts.json");
  /* The SN5 schedule ships with weekOf blank on purpose — retro records leave
     unverifiable fields empty rather than guessing. Weekly Plan is a day grid,
     so it correctly refuses to draw undated weeks, and the screenshot would be
     an empty-state card. Dates are stamped on here, for the deck only. */
  const sched = await seed("schedule", "sn5-schedule.json");
  const MON = Date.UTC(2026, 6, 27);
  window.onFbData("schedule", sched.map((w, i) => {
    const week = w.weekOf ? w
      : { ...w, weekOf: new Date(MON + i * 7 * 864e5).toISOString().slice(0, 10) };
    /* Goals and carpools are typed in during the week; no archive carries them,
       so the first week gets a plausible set or the tab photographs empty. */
    return i === 0 ? { ...week, goals: window.__DECK_GOALS || [], cars: window.__DECK_CARS || [] } : week;
  }));
  await seed("stock", "sn5-stock.json");
  window.onFbData("users", window.__DECK_USERS || []);
  window.onFbData("projects", window.__DECK_TICKETS || []);
  window.onFbData("budget", window.__DECK_BUDGET || []);
  window.onFbData("documents", []);
  window.onFbData("notifications", []);
  window.onFbData("stackplans", []);
} catch (e) {
  window.__seedError = String((e && e.message) || e);
}
window.fb.state = "ready";
window.onFbChange("ready");
`;

/* ---------- collections with no archive file ----------
   Invented records, but every field is shaped like the real thing and every
   name is a real FEB roster name or a real SN5 part. Nothing here becomes a
   claim on a slide; it exists so the tables are not empty. */
const USERS = [
  ["n.jepsen@berkeley.edu", "Nick Jepsen", "lead"],
  ["simon.starbuck@berkeley.edu", "Simon Starbuck", "member"],
  ["a.rivera@berkeley.edu", "Ana Rivera", "member"],
  ["d.okafor@berkeley.edu", "David Okafor", "member"],
  ["m.chen@berkeley.edu", "Mei Chen", "member"],
  ["j.patel@berkeley.edu", "Jai Patel", "member"],
  ["l.novak@berkeley.edu", "Lena Novak", "member"],
  ["t.brooks@berkeley.edu", "Theo Brooks", "member"],
].map(([email, name, role]) => ({ id: email, email, name, role }));

/* Dates straddle "today" on purpose: the Dashboard's whole job is to separate
   what is due soon from what is already late, and it cannot demonstrate that
   against a set of tickets that are all comfortably in the future. */
const TICKETS = [
  ["Qualify XCR as the standing mold sealer", "Project", "In Progress", ["a.rivera@berkeley.edu"], "2026-08-07", "High", "Tooling"],
  ["Order carbon before the customs window closes", "Project", "To Do", ["n.jepsen@berkeley.edu"], "2026-08-04", "High", "Aero"],
  ["Infusion line kinks at the nosecone corner", "Issue", "In Progress", ["d.okafor@berkeley.edu"], "2026-08-11", "Medium", "Aero"],
  ["Drop-test rig needs a new load cell", "Issue", "Blocked", ["t.brooks@berkeley.edu"], "2026-07-24", "High", "Chassis"],
  ["Write the layup induction for new members", "Project", "To Do", ["m.chen@berkeley.edu"], "2026-09-02", "Low", "Aero"],
  ["Vacuum pump loses 3 inHg overnight", "Issue", "In Review", ["j.patel@berkeley.edu"], "2026-08-12", "Medium", "Tooling"],
  ["Sponsor outreach: Sigmatex fabric donation", "Project", "In Progress", ["l.novak@berkeley.edu"], "2026-08-28", "Medium", "Aero"],
  ["Bag film roll ran out mid-layup", "Issue", "Done", ["a.rivera@berkeley.edu"], "2026-07-15", "Low", "Aero"],
  ["Move Firebase project to a team account", "Project", "To Do", ["n.jepsen@berkeley.edu"], "2026-08-08", "High", "Chassis"],
  ["Field-verify the CS-011 storage map at RFS", "Project", "To Do", ["simon.starbuck@berkeley.edu"], "2026-08-14", "Medium", "Tooling"],
].map(([title, kind, status, assignees, dueDate, priority, subteam], i) => ({
  id: `T-${String(i + 1).padStart(3, "0")}`,
  title, kind, status, assignees, dueDate, priority, subteam,
  description: "", relatedTickets: [], relatedWorkOrders: [],
  watchers: assignees,
  createdBy: "simon.starbuck@berkeley.edu",
  created: "2026-07-10T09:00:00.000Z",
  comments: [], files: [], subOf: null,
}));

const BUDGET = [
  ["Carbon twill 2x2, 3k, 50in — 12 yd", "Sigmatex", "Manufacturing", "Ordered", "838.00"],
  ["IN2 infusion resin, 5 kg + AT30 hardener", "Easy Composites", "Manufacturing", "Reimbursed", "214.60"],
  ["XCR mold sealer, 1 qt", "Rexco", "Tooling", "Reimbursed", "68.40"],
  ["Tooling board 40 lb/ft3, 2in x 24in x 48in", "Coastal Enterprises", "Tooling", "Ordered", "412.00"],
  ["Breather cloth, 10 yd", "Airtech", "Manufacturing", "Reimbursed", "96.25"],
  ["Vacuum bag film, 60in x 25 yd", "Airtech", "Restock", "Submitted", "132.90"],
  ["Spiral wrap tubing, 50 ft", "Easy Composites", "Restock", "Reimbursed", "31.80"],
  ["Peel ply, 5 yd", "Airtech", "Restock", "Submitted", "44.15"],
  ["Mixing cups and sticks, bulk", "McMaster-Carr", "Other", "Reimbursed", "27.30"],
  ["Load cell, 500 lbf", "McMaster-Carr", "Testing", "Submitted", "189.00"],
].map(([item, source, purpose, status, cost], i) => ({
  id: `PR-${String(i + 1).padStart(3, "0")}`,
  item, source, purpose, status, cost,
  purchaser: USERS[(i % 5) + 1].name,
  dateOrdered: `2026-0${8 + (i % 2)}-${String(3 + i * 2).padStart(2, "0")}`,
  notes: "", retro: false, createdBy: "simon.starbuck@berkeley.edu",
  receiptUrl: "", receiptPath: "",
}));

/* ---------- the shots ----------
   `run` is evaluated in the page after boot. Each drives the app through the
   same globals the UI's own onclick handlers use, so a shot cannot show a state
   the app cannot reach. */
const SHOTS = [
  { id: "05-dashboard", run: `view = {...view, tab:'dashboard', mode:'list', id:null}; render();` },
  { id: "07-parts", run: `view = {...view, tab:'parts', mode:'list', id:null}; render();` },
  { id: "08-part-detail", run: `view = {...view, tab:'parts', mode:'detail', id:DB.parts[0].id}; render();` },
  { id: "09-stock", run: `view = {...view, tab:'stock', mode:'list', id:null}; render();` },
  { id: "15-workorders", run: `view = {...view, tab:'workorders', mode:'list', id:null}; render();` },
  { id: "16-wo-detail", run: `view = {...view, tab:'workorders', mode:'detail', id:'WO-SN6-004'}; render();` },
  { id: "16b-buyoffs", wait: 1200,
    run: `view = {...view, tab:'workorders', mode:'detail', id:'WO-SN6-004'}; render();`,
    after: `document.getElementById('wo-steps')?.scrollIntoView({block:'start'})` },
  { id: "17-print-traveler", device: { width: 1400, height: 1500, dsf: 2 }, crop: false, wait: 2500,
    run: `view = {...view, tab:'workorders', mode:'detail', id:'WO-SN6-004'}; render(); openPrintPreview('WO-SN6-004');` },
  { id: "18-tickets-board", run: `view = {...view, tab:'projects', mode:'list', id:null, board:true}; render();` },
  { id: "18b-weeklyplan", run: `view = {...view, tab:'weekplan', mode:'list', id:null}; render();` },
  { id: "19-budget", run: `view = {...view, tab:'budget', mode:'list', id:null}; render();` },
  { id: "20-documents", run: `view = {...view, tab:'documents', mode:'list', id:null}; render();` },
  { id: "20b-reports", run: `view = {...view, tab:'reports', mode:'list', id:null}; render();` },
  { id: "06-people", run: `view = {...view, tab:'people', mode:'list', id:null}; render();` },
  { id: "07b-timeline", run: `view = {...view, tab:'timeline', mode:'list', id:null}; render();` },

  /* The planner. Driven through the real modal — uploadMold() then submitMold()
     — rather than by calling the slicer directly, so every one of these shots
     is a state a user can actually reach. The cut list, the 3D view and the
     drawing sheets are all computed by the real code, not drawn for the deck. */
  {
    id: "10-body-picker",
    wait: 3000,
    /* A real Fusion export is an assembly. clamshell-assembly.stl holds three
       bodies, so Plan stops and asks which one — the slide's whole point. */
    run: `(async () => {
      view = {...view, tab:'stock', mode:'list', id:null}; render();
      uploadMold();
      document.getElementById('ml-name').value = 'Clamshell — upper';
      document.getElementById('ml-src').value = 'stl'; moldSrcChanged();
      document.getElementById('ml-sample').value = 'clamshell-assembly.stl';
      await loadSampleMold('clamshell-assembly.stl');
      await submitMold();
    })()`,
  },
  {
    id: "11-plan",
    wait: 3500,
    run: `PLAN_NOSECONE`,
  },
  {
    id: "12-plan-3d",
    wait: 3500,
    run: `PLAN_NOSECONE`,
    after: `document.querySelector('canvas')?.scrollIntoView({block:'center'})`,
  },
  {
    id: "11b-cutlist",
    wait: 3500,
    run: `PLAN_NOSECONE`,
    after: `[...document.querySelectorAll('h3')].find(h=>/Blanks to cut/i.test(h.textContent))?.scrollIntoView({block:'start'})`,
  },
  {
    /* Taller frame and no crop: the print preview is a fixed overlay, so the
       content-height measurement below sees the toolbar and nothing else, and
       a sheet is 11in of paper that has to be readable on a slide. */
    id: "13-drawings",
    device: { width: 1400, height: 1500, dsf: 2 },
    crop: false,
    wait: 4500,
    run: `PLAN_NOSECONE`,
    after: `openDrawings('STK-001')`,
  },

  /* Phone. The bench is a phone, so the deck needs at least one. */
  { id: "12b-phone-plan", device: PHONE, wait: 3500, run: `PLAN_NOSECONE`,
    after: `document.querySelector('canvas')?.scrollIntoView({block:'center'})` },
  { id: "19b-phone-budget", device: PHONE, run: `view = {...view, tab:'budget', mode:'list', id:null}; render();` },
];

/* One live SN6 work order.

   The SN5 archive is retro: every buy-off reads "not recorded (retro)", which is
   the right thing for the archive to say and the wrong thing to put on a slide
   about buy-offs carrying a name. Blocker enforcement is switched off on retro
   records too (workorders.js blockerOpenBefore returns null for wo.retro), so a
   retro record cannot demonstrate the enforcement either. This one is a normal,
   in-progress record: three steps signed, the drop-test blocker still open. */
const LIVE_WO = {
  id: "WO-SN6-004",
  partName: "UT NOSE",
  subteam: "Aero",
  revision: "B",
  status: "In Work",
  processType: "MoldInfusion",
  moldEngineer: "Ana Rivera",
  manufacturingEngineer: "David Okafor",
  createdDate: "2026-07-20",
  dueDate: "2026-08-14",
  mold: { moldId: "STK-001", layers: "3", density: "30", sealingType: "XCR, 2 coats", location: "RFS — rack B, bay 2" },
  layupStack: [
    { material: "195 twill", orientation: "0/90", coverage: "full", notes: "" },
    { material: "88 spread-tow", orientation: "+45", coverage: "full", notes: "" },
    { material: "Nomex honeycomb 0.125\"", orientation: "—", coverage: "core, 40mm inset", notes: "chamfer the edge" },
    { material: "88 spread-tow", orientation: "−45", coverage: "full", notes: "" },
    { material: "195 twill", orientation: "0/90", coverage: "full", notes: "" },
  ],
  stackNote: "Frozen 2026-07-24. Any change past this point needs a new revision.",
  bom: [
    { item: "195 twill 2x2, 3k", qty: "2.4", unit: "yd", source: "Sigmatex", estCost: "168.00" },
    { item: "88 spread-tow", qty: "1.8", unit: "yd", source: "Sigmatex", estCost: "121.00" },
    { item: "Nomex honeycomb 0.125\"", qty: "0.5", unit: "sheet", source: "ACP", estCost: "46.50" },
    { item: "IN2 infusion resin + AT30", qty: "1.2", unit: "kg", source: "Easy Composites", estCost: "52.80" },
    { item: "Peel ply / flow mesh / bag film", qty: "1", unit: "set", source: "Airtech", estCost: "38.20" },
  ],
  standardsRefs: ["CS-002", "CS-003", "CS-004", "CS-006"],
  steps: [
    ["Stack frozen (CS-002 §7.2)", "CS-002", "done", "Ana Rivera", "2026-07-24"],
    ["Mold design review (CS-003 §7.2)", "CS-003", "done", "Nick Jepsen", "2026-07-27"],
    ["Seal and release the mold (CS-004 §7.1)", "CS-004", "done", "Mei Chen", "2026-07-29"],
    ["Dry stack + bag (CS-006 §7.2–7.3)", "CS-006", "open", "", ""],
    ["Drop test (CS-006 §7.4)", "CS-006", "open", "", ""],
    ["Infuse (CS-006 §7.5)", "CS-006", "open", "", ""],
    ["Cure + demould (CS-006 §7.6)", "CS-006", "open", "", ""],
    ["Trim and finish (CS-009)", "CS-009", "open", "", ""],
  ].map(([title, csRef, status, name, date], i) => ({
    seq: i + 1, title, csRef, status,
    buyoff: { name, date },
    notes: "", photoRefs: [],
  })),
  qualityChecks: [
    { criterion: "mass", target: "740", actual: "", pass: null },
    { criterion: "no dry spots at the corner radius", target: "none visible", actual: "", pass: null },
    { criterion: "bag holds 25 inHg for 10 min", target: "≤ 1 inHg drop", actual: "0.5 inHg", pass: true },
  ],
  weightTargetG: 740,
  weightActualG: null,
  timeline: [
    { date: "2026-07-24", note: "Stack frozen at Rev B after the core inset changed" },
    { date: "2026-07-27", note: "Mold design review signed — fit checked against STK-001" },
    { date: "2026-07-29", note: "Two XCR coats, buffed between" },
  ],
  notes: "First SN6 part through the planner end to end: STK-001 cut list, then this traveler.",
  retro: false,
};

const GOALS = [
  ["a.rivera@berkeley.edu", "Seal and wax the nose plug — two XCR coats", "2026-07-29", true],
  ["a.rivera@berkeley.edu", "Cut the 45° plies for the UT skin", "2026-07-31", false],
  ["d.okafor@berkeley.edu", "Re-route the infusion spiral at the corner", "2026-07-30", false],
  ["m.chen@berkeley.edu", "Photograph the rack and reconcile the offcuts", "2026-07-28", true],
  ["j.patel@berkeley.edu", "Leak-check the bag before Thursday's infusion", "2026-07-30", false],
  ["t.brooks@berkeley.edu", "Chase the load cell quote", "2026-07-31", false],
  ["n.jepsen@berkeley.edu", "Sign the CS-003 approval table", "2026-07-31", false],
  ["l.novak@berkeley.edu", "Draft the Sigmatex follow-up email", "2026-07-29", true],
].map(([person, text, dueDate, done], i) => ({
  id: `G-w0-${i}`, person, text, dueDate, done, ticketId: "",
  createdBy: "n.jepsen@berkeley.edu", ts: "2026-07-27T08:00:00.000Z",
}));

const CARS = [
  ["a.rivera@berkeley.edu", "Tue", "09:30", 4, ["d.okafor@berkeley.edu", "m.chen@berkeley.edu"]],
  ["t.brooks@berkeley.edu", "Thu", "08:45", 3, ["j.patel@berkeley.edu"]],
  ["n.jepsen@berkeley.edu", "Sat", "10:00", 5, ["l.novak@berkeley.edu", "simon.starbuck@berkeley.edu"]],
].map(([driver, day, time, capacity, passengers], i) => ({
  id: `C-w0-${i}`, driver, day, time, capacity, passengers,
  createdBy: "n.jepsen@berkeley.edu", ts: "2026-07-27T08:00:00.000Z",
}));

/* The five planner shots all need the same plan to exist first. Written once. */
const PLAN_NOSECONE = `(async () => {
  view = {...view, tab:'stock', mode:'list', id:null}; render();
  uploadMold();
  document.getElementById('ml-name').value = 'UT nose plug';
  document.getElementById('ml-src').value = 'stl'; moldSrcChanged();
  document.getElementById('ml-sample').value = 'nosecone-plug.stl';
  await loadSampleMold('nosecone-plug.stl');
  await submitMold();
})()`;

const filter = process.argv.slice(2).filter(a => !a.startsWith("-"));
const wanted = SHOTS.filter(s => !filter.length || filter.some(f => s.id.includes(f)));

async function main() {
  const chromium = await loadChromium();
  if (!chromium) { console.log(skipMessage("the deck screenshots")); process.exit(0); }
  await mkdir(OUT, { recursive: true });
  const { server, port } = await serveApp();

  const browser = await chromium.launch();
  let ok = 0; const failed = [];

  for (const shot of wanted) {
    const dev = shot.device || DESKTOP;
    const ctx = await browser.newContext({
      viewport: { width: dev.width, height: dev.height },
      deviceScaleFactor: dev.dsf,
      isMobile: dev === PHONE,
      hasTouch: dev === PHONE,
      colorScheme: "light",
    });
    await ctx.route("**/fb.js", r => r.fulfill({ body: FB_STUB, contentType: "text/javascript" }));
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    await page.addInitScript(`
      window.__DECK_USERS = ${JSON.stringify(USERS)};
      window.__DECK_TICKETS = ${JSON.stringify(TICKETS)};
      window.__DECK_BUDGET = ${JSON.stringify(BUDGET)};
      window.__DECK_GOALS = ${JSON.stringify(GOALS)};
      window.__DECK_CARS = ${JSON.stringify(CARS)};
      window.__DECK_WO = ${JSON.stringify(LIVE_WO)};
      try { localStorage.setItem("theme", "light"); } catch (e) {}
    `);
    try {
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
      await page.waitForFunction("window.fb && fb.state === 'ready'", null, { timeout: 20000 });
      const seedError = await page.evaluate("window.__seedError || null");
      if (seedError) throw new Error("empty database: " + seedError);

      await page.evaluate(shot.run === "PLAN_NOSECONE" ? PLAN_NOSECONE : shot.run);
      await page.waitForTimeout(shot.wait || 900);
      if (shot.after) { await page.evaluate(shot.after); await page.waitForTimeout(shot.wait || 900); }

      /* Trim the empty canvas below the content. A screenshot with 300px of
         nothing at the bottom lands on a slide as a short, oddly-floating
         image, and cropping it in the deck script instead means every slide
         needs to know a different crop. Never grows past the viewport, so the
         shot still shows one screenful, not a stitched scroll. */
      const m = await page.evaluate(`(() => {
        const main = document.querySelector("main") || document.body;
        const kids = [...main.querySelectorAll(":scope > *")];
        const bottom = kids.reduce((a, el) => Math.max(a, el.getBoundingClientRect().bottom), 0);
        return { bottom: Math.ceil(bottom), scrolled: window.scrollY > 2 };
      })()`);
      /* A scrolled shot is deliberately showing a slice partway down the page,
         so its viewport is already the frame — cropping it against page
         coordinates would photograph the top of the document instead. */
      const shotOpts = { path: join(OUT, shot.id + ".png") };
      if (shot.crop !== false && !m.scrolled) {
        shotOpts.clip = { x: 0, y: 0, width: dev.width, height: Math.min(dev.height, Math.max(360, m.bottom + 24)) };
      }
      await page.screenshot(shotOpts);
      console.log(`  ok  ${shot.id}${errors.length ? "   (page errors: " + errors.length + ")" : ""}`);
      if (errors.length) console.log("        " + errors.slice(0, 2).join("\n        "));
      ok++;
    } catch (e) {
      failed.push(`${shot.id}: ${e.message.split("\n")[0]}`);
      console.log(`  FAIL ${shot.id}: ${e.message.split("\n")[0]}`);
      try { await page.screenshot({ path: join(OUT, "_fail-" + shot.id + ".png") }); } catch {}
    }
    await ctx.close();
  }

  await browser.close();
  server.close();
  await writeFile(join(OUT, "MANIFEST.txt"),
    wanted.map(s => s.id + ".png").join("\n") + "\n");
  console.log(`\n${ok}/${wanted.length} captured into 06 Pitch/shots/`);
  if (failed.length) { console.log("failed:\n  " + failed.join("\n  ")); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
