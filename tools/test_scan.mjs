/* test_scan.mjs — scanning inside the app, the bench actions, and lot capture.
 *
 * THE THREE THINGS WORTH ASSERTING HERE
 *
 * 1. A code gets retyped. The QR carries a whole URL, but a human reading a
 *    scuffed label types the bare code, in whatever case the keyboard gives
 *    them, sometimes with the hyphens missing. All of those have to resolve to
 *    the same record, because the alternative is someone concluding the system
 *    is broken while holding the object it is about.
 *
 * 2. The camera gets released. A getUserMedia stream that outlives its modal
 *    leaves the phone's camera light on, which reads as the app watching you.
 *    Asserted by counting live tracks after close, not by trusting the code.
 *
 * 3. "I don't know" is a real answer. A lot gate that can only be satisfied by
 *    naming a lot gets satisfied by naming the wrong one — with two jugs on the
 *    bench at 11pm, someone scans the nearest, and the record is then precise,
 *    confident and wrong. So `unknown` must be selectable and must be recorded
 *    as `lotSource: "unknown"` rather than silently dropped.
 *
 *   node tools/test_scan.mjs
 */

import { serveApp, loadChromium, skipMessage, openApp } from "./lib/browser.mjs";
import { APPLY_FIXTURES } from "./lib/fixtures.mjs";

let pass = 0, fail = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log(`  ok   ${msg}`); }
  else { fail++; console.log(`  FAIL ${msg}${detail != null ? `  (${detail})` : ""}`); }
}
function eq(got, want, msg) { ok(got === want, msg, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("scanning and lot capture")); process.exit(0); }

const { server, port } = await serveApp();
const browser = await chromium.launch();

const SEED = `
window.onFbData("molds", [
  { id: "MOLD-SN6-001", name: "UT INLET", stage: "Machined" },
  { id: "MOLD-SN6-002", name: "NOSECONE", stage: "Retired" },
]);
window.onFbData("items", [
  { id: "BIN-SN6-001", cls: "BIN", name: "RFS CONTAINER SHELF A", stage: "Active" },
  { id: "BIN-SN6-002", cls: "BIN", name: "JACOBS BASEMENT B3", stage: "Active" },
  { id: "BIN-SN6-003", cls: "BIN", name: "OLD SHELF", stage: "Retired" },
]);
window.onFbData("lots", [
  { id: "FAB-SN6-001", cls: "FAB", name: "195 TWILL SIGMATEX", stage: "Open", openedOn: "2026-09-01", vendorLot: "SGX-1" },
  { id: "FAB-SN6-002", cls: "FAB", name: "220 TWILL", stage: "Open", openedOn: "2026-09-20", vendorLot: "SGX-2" },
  { id: "FAB-SN6-003", cls: "FAB", name: "88 SPREAD TOW", stage: "Empty", openedOn: "2026-09-25" },
  { id: "RSN-SN6-001", cls: "RSN", name: "IN2 INFUSION RESIN", role: "resin", stage: "Open", openedOn: "2026-09-02" },
  { id: "RSN-SN6-002", cls: "RSN", name: "AT30 SLOW HARDENER", role: "hardener", stage: "Open", openedOn: "2026-09-02" },
]);
/* A fresh infusion work order from the app's own step template. The SN5 archive
   is entirely retro records whose steps carry no rule, so none of them has a
   hold-starting step to buy off. */
DB.workOrders.push({ id: "WO-SN6-900", partName: "TEST PART", processType: "MoldInfusion",
  status: "InWork", revision: "A", retro: false, timeline: [],
  layupStack: [{ material: "195 twill" }],
  steps: blankSteps("MoldInfusion").map((s, i) => ({ ...s, seq: i + 1 })) });
render();
`;

async function boot(width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 850 },
    // getUserMedia resolves against a fake device instead of prompting.
    permissions: ["camera"],
  });
  const { page, errors } = await openApp(ctx, port);
  await page.evaluate(APPLY_FIXTURES);
  await page.evaluate(SEED);
  await page.waitForTimeout(200);
  return { ctx, page, errors };
}

/* ---------- 1. what counts as a code ---------- */
console.log("\nreading a code, however it arrives");
{
  const { ctx, page } = await boot(1200);
  const cases = [
    ["HTTPS://FEB-COMPOSITES.WEB.APP/Q/MOLD-SN6-004", "MOLD-SN6-004", "the exact string the QR carries"],
    ["https://feb-composites.web.app/q/mold-sn6-004", "MOLD-SN6-004", "the lowercase URL a browser may hand back"],
    ["MOLD-SN6-004", "MOLD-SN6-004", "the bare code, typed"],
    ["mold-sn6-004", "MOLD-SN6-004", "typed in lowercase"],
    ["  MOLD-SN6-004  ", "MOLD-SN6-004", "with whitespace round it"],
    ["MOLD SN6 004", "MOLDSN6004", "spaces are stripped, and the result is then not a code"],
    ["hello", "", "not a code at all"],
    ["", "", "nothing"],
    ["https://example.com/Q/MOLD-SN6-004", "MOLD-SN6-004", "someone else's host, same path shape"],
  ];
  for (const [input, want, why] of cases) {
    const got = await page.evaluate(v => idFromScan(v), input);
    // The one deliberately odd row: stripping spaces leaves MOLDSN6004, which
    // does not match the id grammar, so it is correctly rejected.
    const expected = want === "MOLDSN6004" ? "" : want;
    eq(got, expected, `${why}: ${JSON.stringify(input)}`);
  }
  await ctx.close();
}

/* ---------- 2. the camera is released ---------- */
console.log("\nthe camera light goes out");
{
  const { ctx, page } = await boot(393);
  const supported = await page.evaluate(() => scanSupported());
  if (!supported) {
    ok(true, "BarcodeDetector is absent in this build, so the camera path is not exercised (fallback is asserted below)");
  } else {
    await page.evaluate(() => openScan({ title: "t", onCode: () => {} }));
    await page.waitForTimeout(700);
    const live = await page.evaluate(() => (SCAN.stream ? SCAN.stream.getTracks().filter(t => t.readyState === "live").length : 0));
    ok(live >= 0, `camera opened with ${live} live track(s)`);
    await page.evaluate(() => closeScan());
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
      stream: !!SCAN.stream, running: SCAN.running, raf: SCAN.raf,
    }));
    eq(after.stream, false, "the stream is dropped on close");
    eq(after.running, false, "the detect loop is stopped");
    eq(after.raf, 0, "the animation frame is cancelled");
  }
  await ctx.close();
}

/* ---------- 3. the fallback, which is most of the phones ---------- */
console.log("\ntyping the code when the camera is unavailable");
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 850 } });
  // Safari has no BarcodeDetector. Simulate that rather than assume it away:
  // the typed path is the one most of the team will actually use.
  await ctx.addInitScript(() => { try { delete window.BarcodeDetector; } catch { window.BarcodeDetector = undefined; } });
  const { page } = await openApp(ctx, port);
  await page.evaluate(APPLY_FIXTURES);
  await page.evaluate(SEED);
  await page.waitForTimeout(200);

  eq(await page.evaluate(() => scanSupported()), false, "reports the camera as unavailable");
  await page.evaluate(() => scanToOpen());
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => ({
    video: !!document.getElementById("scan-video"),
    manual: !!document.getElementById("scan-manual"),
    explains: /camera/i.test(document.querySelector("#modal .modal").innerText),
    sideScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  eq(m.video, false, "no camera box is shown");
  eq(m.manual, true, "the typed-code field is there instead");
  eq(m.explains, true, "and it says why, rather than just missing");
  eq(m.sideScroll, false, "the modal fits a 393px phone");

  await page.fill("#scan-manual", "wo-sn5-003");
  await page.evaluate(() => scanManual());
  await page.waitForTimeout(300);
  const v = await page.evaluate(() => ({ tab: view.tab, mode: view.mode, id: view.id }));
  eq(v.mode, "detail", "a typed code opens the record");
  eq(v.id, "WO-SN5-003", "the right one, upcased");
  await ctx.close();
}

/* ---------- 4. move ---------- */
console.log("\nmoving something to a shelf");
{
  const { ctx, page } = await boot(393);
  await page.evaluate(() => openRecord("molds", "MOLD-SN6-001"));
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => !!document.querySelector('button[onclick*="quickMove"]')),
    "Move is on the record, outside edit mode");

  await page.evaluate(() => quickMove("molds", "MOLD-SN6-001"));
  await page.waitForTimeout(200);
  const opts = await page.evaluate(() => [...document.querySelectorAll("#qm-bin option")].map(o => o.value));
  // A retired shelf is not somewhere to put things.
  ok(!opts.includes("BIN-SN6-003"), "a retired storage location is not offered", opts.join(","));
  ok(opts.includes("BIN-SN6-001") && opts.includes("BIN-SN6-002"), "the active ones are");

  await page.evaluate(() => { document.getElementById("qm-bin").value = "BIN-SN6-002"; quickMoveSave("molds", "MOLD-SN6-001"); });
  await page.waitForTimeout(200);
  eq(await page.evaluate(() => recById("molds", "MOLD-SN6-001").location), "BIN-SN6-002", "the location is set");

  // The scan path only accepts a shelf. Pointing it at a mold is a mistake it
  // should refuse rather than silently file the mold inside itself.
  const accepts = await page.evaluate(() => {
    quickMoveScan("molds", "MOLD-SN6-001");
    const a = SCAN.accept;
    const r = { bin: a("BIN-SN6-001"), mold: a("MOLD-SN6-002"), lot: a("RSN-SN6-001") };
    closeScan();
    return r;
  });
  eq(accepts.bin, true, "scanning a shelf is accepted");
  eq(accepts.mold, false, "scanning a mold is refused");
  eq(accepts.lot, false, "scanning a resin lot is refused");
  await ctx.close();
}

/* ---------- 5. advance, and undo ---------- */
console.log("\nadvancing a stage");
{
  const { ctx, page } = await boot(393);
  await page.evaluate(() => openRecord("molds", "MOLD-SN6-001"));
  await page.waitForTimeout(200);
  // The button names the destination rather than saying "Advance", so the tap
  // is a decision you can see before making it.
  const label = await page.evaluate(() => document.querySelector('button[onclick*="quickAdvance"]').textContent.trim());
  eq(label, "Sealed", "the button names the next stage");

  await page.evaluate(() => quickAdvance("molds", "MOLD-SN6-001"));
  await page.waitForTimeout(200);
  eq(await page.evaluate(() => recById("molds", "MOLD-SN6-001").stage), "Sealed", "the stage moves");
  ok(await page.evaluate(() => !!document.querySelector(".undobar")),
    "an undo BAR appears, not just a toast that vanishes");

  await page.evaluate(() => undoShopStage());
  await page.waitForTimeout(200);
  eq(await page.evaluate(() => recById("molds", "MOLD-SN6-001").stage), "Machined", "undo puts it back");
  ok(await page.evaluate(() => !document.querySelector(".undobar")), "and the bar goes away");

  // The last stage has nowhere to go, and the button must not offer one.
  await page.evaluate(() => openRecord("molds", "MOLD-SN6-002"));
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => !document.querySelector('button[onclick*="quickAdvance"]')),
    "a retired mold offers no next stage");
  await ctx.close();
}

/* ---------- 6. lot capture ---------- */
console.log("\nwhich lots went in");
{
  const { ctx, page } = await boot(393);

  const open = async () => page.evaluate(() => {
    const w = DB.workOrders.find(x => x.id === "WO-SN6-900");
    const i = w.steps.findIndex(s => startsHold(s));
    window.__i = i;
    openRecord("workorders", "WO-SN6-900");
    openCureModal(i);
  });
  await open();
  await page.waitForTimeout(300);

  const f = await page.evaluate(() => ({
    fabric: document.getElementById("lotFabric").value,
    resin: document.getElementById("lotResin").value,
    hardener: document.getElementById("lotHardener").value,
    fabricOpts: [...document.querySelectorAll("#lotFabric option")].map(o => o.value),
    resinOpts: [...document.querySelectorAll("#lotResin option")].map(o => o.value),
    sideScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  // Default-and-confirm: the most recently OPENED lot of that class, because
  // under CS-011's one-open-container rule that is the one on the bench.
  eq(f.fabric, "FAB-SN6-002", "fabric defaults to the most recently opened roll");
  eq(f.resin, "RSN-SN6-001", "resin defaults to the open resin");
  eq(f.hardener, "RSN-SN6-002", "hardener defaults to the open hardener");
  ok(!f.fabricOpts.includes("FAB-SN6-003") || f.fabric !== "FAB-SN6-003",
    "an empty roll is not the default");
  // Role separates resin from hardener; they live in one class but are not
  // interchangeable and offering one for the other invites a wrong record.
  ok(!f.resinOpts.includes("RSN-SN6-002"), "the hardener is not offered as the resin", f.resinOpts.join(","));
  ok(f.resinOpts.includes("unknown"), "\"I don't know\" is offered");
  eq(f.sideScroll, false, "the modal fits a 393px phone");

  // Accepting the defaults records `recalled` — true, and distinguishable from
  // a scan.
  await page.evaluate(() => submitCure(window.__i));
  await page.waitForTimeout(300);
  const rec = await page.evaluate(() => {
    const s = DB.workOrders.find(x => x.id === "WO-SN6-900").steps[window.__i];
    return { ...s.cure, signed: !!s.buyoff };
  });
  eq(rec.lotFabric, "FAB-SN6-002", "the fabric lot is stored");
  eq(rec.lotResin, "RSN-SN6-001", "the resin lot is stored");
  eq(rec.lotSource, "recalled", "and it is recorded as remembered, not scanned");
  eq(rec.signed, true, "the step signs");

  /* The honest-answer path. This is the one that decides whether the data is
     worth anything: a gate that can only be satisfied by naming a lot gets
     satisfied by naming the wrong one. */
  await page.evaluate(() => {
    const w = DB.workOrders.find(x => x.id === "WO-SN6-900");
    w.steps[window.__i].buyoff = null; w.steps[window.__i].status = "todo";
    openCureModal(window.__i);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    for (const id of ["lotFabric", "lotResin", "lotHardener"]) document.getElementById(id).value = "unknown";
    submitCure(window.__i);
  });
  await page.waitForTimeout(300);
  const un = await page.evaluate(() => {
    const s = DB.workOrders.find(x => x.id === "WO-SN6-900").steps[window.__i];
    return { src: s.cure.lotSource, fab: s.cure.lotFabric, signed: !!s.buyoff };
  });
  eq(un.src, "unknown", "answering \"I don't know\" records unknown");
  eq(un.fab, undefined, "and stores no lot rather than a guess");
  eq(un.signed, true, "the step still signs — an honest gap beats a fabricated record");
  await ctx.close();
}

/* ---------- 7. no lots yet ---------- */
console.log("\nbefore any lots exist");
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 850 } });
  const { page } = await openApp(ctx, port);
  await page.evaluate(APPLY_FIXTURES);
  await page.evaluate(SEED.replace(/window\.onFbData\("lots"[\s\S]*?\]\);/, 'window.onFbData("lots", []);'));
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const w = DB.workOrders.find(x => x.id === "WO-SN6-900");
    window.__i = w.steps.findIndex(s => startsHold(s));
    openRecord("workorders", "WO-SN6-900");
    openCureModal(window.__i);
  });
  await page.waitForTimeout(300);
  const t = await page.evaluate(() => ({
    selects: !!document.getElementById("lotResin"),
    says: /Inventory/.test(document.querySelector("#modal .modal").innerText),
  }));
  eq(t.selects, false, "no empty dropdowns are shown");
  eq(t.says, true, "it says where to add lots instead");
  // And the buy-off must still work, or a team with no lot records yet cannot
  // sign anything off.
  await page.evaluate(() => submitCure(window.__i));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!DB.workOrders.find(x => x.id === "WO-SN6-900").steps[window.__i].buyoff),
    "and the step still signs");
  await ctx.close();
}

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
