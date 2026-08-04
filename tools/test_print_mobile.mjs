#!/usr/bin/env node
/* The printed sheets, on a phone.

   WHY THIS EXISTS
   ===============
   A sheet is 8.5in — 816 CSS px — because "this is exactly what prints" is the
   whole promise of the preview. On a 390px phone the browser blew the layout
   viewport out to 816px to contain it, so the traveler's Initial and Date
   columns sat off the right edge with no way to reach them, and the app around
   the preview went with it. Reported from real use, and invisible to every test
   in the repo: the markup was correct, the numbers were correct, the sheet just
   did not fit on the device it was being read on.

   So this drives the REAL app — index.html, with fb.js stubbed at the route so
   there is no Firebase and no auth — at four widths, opens each printable
   document, and measures what the browser actually laid out.

   WHAT IT CHECKS, per document per width
     1. no horizontal overflow   — the page never scrolls sideways
     2. sheet within the viewport — no column parked off the right edge
     3. controls reachable        — every preview-bar button inside the viewport,
                                    and big enough for a thumb on a phone
     4. legible                   — the fitted sheet is not shrunk past reading
     5. close restores the app    — no way to get stranded in the preview
     6. print is unaffected       — the screen fit must not shrink the paper

   RUNNING
     node tools/test_print_mobile.mjs
     node tools/test_print_mobile.mjs --shots    # PNGs of failures

   Needs Playwright and its Chromium; skips loudly without it. */

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveApp, loadChromium, skipMessage, openApp } from "./lib/browser.mjs";

const SHOTS = process.argv.includes("--shots");
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".drawing-shots");

/* Real devices, not round numbers. The narrow end is what actually goes to the
   shop; the desktop entry is the regression guard, because the fix must not
   shrink anything on a screen that already had room. */
const VIEWPORTS = [
  { id: "iphone-se", w: 375, h: 667, mobile: true },
  { id: "iphone-15", w: 393, h: 852, mobile: true },
  { id: "ipad-portrait", w: 768, h: 1024, mobile: true },
  { id: "desktop", w: 1440, h: 900, mobile: false },
];

/* The three things in the app that mount a sheet. */
const DOCS = [
  {
    id: "work-order",
    open: `view = {...view, tab:'workorders', mode:'detail', id:'WO-SN5-001'}; render(); openPrintPreview('WO-SN5-001');`,
  },
  {
    id: "blank-traveler",
    open: `view = {...view, tab:'workorders', mode:'list'}; render(); printBlankWO('MoldInfusion');`,
  },
  {
    id: "mold-drawings",
    // Plan a small block through the real slicer so this is a real plan record,
    // then open its drawing set — the longest document the app can mount.
    open: `(async () => {
      const r = planMold(boxTris(400, 300, 120), [25.4, 50.8], {});
      DB.stackplans = [{ id: "STK-T1", name: "test mold", source: "block", layers: r.layers,
        sections: r.sections, bounds: r.bounds, by: "simon@example.com", ts: "2026-07-30T10:00:00.000Z" }];
      view = {...view, tab:'stock', mode:'plan', id:'STK-T1'};
      render();
      await openDrawings('STK-T1');
    })()`,
  },
];

/* Measured in the page, where layout is real. Everything here is a fact about
   what the browser did, not about what the markup says. */
const AUDIT = `(() => {
  const root = document.getElementById("printroot");
  const de = document.documentElement;
  const vw = de.clientWidth;
  const pages = [...document.querySelectorAll(".ws-page")];
  /* Only controls that are actually SHOWN. A phone hides the B&W proof toggle
     (a desk task), and a display:none control is not one anybody has to reach. */
  const btns = [...document.querySelectorAll(".pv-bar button, .pv-bar label")]
    .filter(b => b.getBoundingClientRect().width > 0);
  const widest = pages.reduce((m, p) => Math.max(m, p.getBoundingClientRect().right), 0);
  const leftmost = pages.reduce((m, p) => Math.min(m, p.getBoundingClientRect().left), Infinity);
  return {
    vw,
    docScrollW: de.scrollWidth,
    bodyClass: document.body.className,
    pages: pages.length,
    pageW: pages.length ? Math.round(pages[0].getBoundingClientRect().width) : 0,
    pageRight: Math.round(widest),
    pageLeft: Number.isFinite(leftmost) ? Math.round(leftmost) : 0,
    zoom: root ? (getComputedStyle(root).getPropertyValue("--pv-zoom").trim() || "1") : "1",
    appHidden: getComputedStyle(document.getElementById("app")).display === "none",
    barH: document.querySelector(".pv-bar") ? Math.round(document.querySelector(".pv-bar").getBoundingClientRect().height) : 0,
    controls: btns.map(b => {
      const r = b.getBoundingClientRect();
      return { t: (b.textContent || "").trim().slice(0, 12), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) };
    }),
  };
})()`;

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the print sheets")); process.exit(0); }

const { server, port } = await serveApp();
const browser = await chromium.launch();
let pass = 0, fail = 0;

const check = (findings, cond, kind, detail) => { if (!cond) findings.push(`${kind}: ${detail}`); };

for (const vp of VIEWPORTS) {
  for (const doc of DOCS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      hasTouch: vp.mobile, isMobile: vp.mobile, deviceScaleFactor: 2,
    });
    const findings = [];
    const { page, errors } = await openApp(ctx, port);
    await page.evaluate(doc.open);
    await page.waitForFunction("document.querySelector('.ws-page') !== null", null, { timeout: 20000 });
    await page.waitForTimeout(250);
    const a = await page.evaluate(AUDIT);

    check(findings, a.pages > 0, "no-sheet", "nothing mounted");
    // 1. No sideways scrolling. This is the reported bug, stated as a number.
    check(findings, a.docScrollW <= a.vw + 1, "h-overflow",
      `document is ${a.docScrollW}px wide in a ${a.vw}px viewport`);
    // 2. Nothing parked off the right edge, and nothing pushed off the left.
    check(findings, a.pageRight <= a.vw + 1, "sheet-clipped",
      `sheet reaches ${a.pageRight}px, viewport is ${a.vw}px`);
    check(findings, a.pageLeft >= -1, "sheet-offscreen-left", `sheet starts at ${a.pageLeft}px`);
    // 3. Every control reachable, and thumb-sized where there are thumbs.
    a.controls.forEach(c => {
      check(findings, c.left >= -1 && c.right <= a.vw + 1, "control-offscreen",
        `"${c.t}" spans ${c.left}..${c.right} in ${a.vw}px`);
      if (vp.mobile) check(findings, c.h >= 34, "control-too-small", `"${c.t}" is ${c.h}px tall`);
    });
    // 4. Shrunk to fit is fine; shrunk past reading is not. Below ~40% a 9.5pt
    //    traveler is under 4pt on screen, which is not a preview of anything.
    check(findings, Number(a.zoom) >= 0.35, "zoomed-past-reading", `--pv-zoom is ${a.zoom}`);
    // 5. The app is hidden while previewing (that part was always right) and
    //    comes back on close — no way to get stranded in a broken sheet.
    check(findings, a.appHidden, "app-not-hidden", "the app is still visible behind the sheet");
    /* The toolbar is chrome over a document. Wrapped onto three rows it took a
       tenth of a phone screen for two words and a checkbox — "breaks the UI" is
       partly just this. One row of controls, or close to it. */
    check(findings, a.barH <= 64, "toolbar-too-tall", `preview bar is ${a.barH}px tall`);
    await page.evaluate("closePrintPreview()");
    await page.waitForTimeout(120);
    const after = await page.evaluate(`(() => ({
      app: getComputedStyle(document.getElementById("app")).display,
      cls: document.body.className,
      root: document.getElementById("printroot").innerHTML.length,
      zoomVar: document.getElementById("printroot").style.getPropertyValue("--pv-zoom"),
    }))()`);
    check(findings, after.app !== "none", "close-broken", "the app did not come back");
    check(findings, after.root === 0, "close-leak", `${after.root} chars left mounted`);
    check(findings, !/sheet|previewing/.test(after.cls), "close-classes", `body still "${after.cls}"`);
    check(findings, after.zoomVar === "", "close-zoom-leak", `--pv-zoom left as "${after.zoomVar}"`);
    // 6. The screen fit must never reach the paper. Chromium applies the print
    //    stylesheet under emulateMedia, so this reads the real printed value.
    await page.evaluate(doc.open);
    await page.waitForFunction("document.querySelector('.ws-page') !== null", null, { timeout: 20000 });
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(120);
    const printZoom = await page.evaluate(`getComputedStyle(document.querySelector(".ws-page")).zoom`);
    check(findings, printZoom === "1" || printZoom === "" || printZoom === "normal",
      "print-shrunk", `printed sheet has zoom ${printZoom}`);
    await page.emulateMedia({ media: "screen" });

    errors.forEach(e => findings.push("page-error: " + e));

    if (!findings.length) {
      pass++;
      console.log(`  ok  ${doc.id} @ ${vp.id} (${vp.w}px) — ${a.pages} sheet${a.pages > 1 ? "s" : ""}, zoom ${a.zoom}`);
    } else {
      fail++;
      console.log(`FAIL  ${doc.id} @ ${vp.id} (${vp.w}px)`);
      findings.slice(0, 8).forEach(f => console.log("        " + f));
      if (findings.length > 8) console.log(`        … and ${findings.length - 8} more`);
      if (SHOTS) {
        await mkdir(SHOT_DIR, { recursive: true });
        await page.evaluate(doc.open).catch(() => {});
        await page.waitForTimeout(200);
        await page.screenshot({ path: join(SHOT_DIR, `mobile-${doc.id}-${vp.id}.png`) });
      }
    }
    await ctx.close();
  }
}

/* Saving to the device: the other half of the fix. The download is the answer
   to "I want this ON my phone" — a real file, no library, no PDF engine. */
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
  const { page } = await openApp(ctx, port);
  await page.evaluate(DOCS[0].open);
  await page.waitForFunction("document.querySelector('.ws-page') !== null", null, { timeout: 20000 });
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.evaluate("downloadSheet()"),
  ]);
  const name = dl.suggestedFilename();
  const body = await (await dl.createReadStream()).toArray().then(b => Buffer.concat(b).toString("utf8"));
  const findings = [];
  check(findings, /\.html$/.test(name), "bad-name", name);
  check(findings, /WO-SN5-001/.test(name), "name-lost-the-id", name);
  check(findings, body.length > 5000, "empty-file", `${body.length} bytes`);
  // Self-contained: the styles have to travel with it, or the file is unreadable
  // on the device it was saved to — which is the entire point of saving it.
  check(findings, /<style>/.test(body) && /ws-page/.test(body), "no-styles", "stylesheet not inlined");
  check(findings, /@page/.test(body), "no-page-rule", "no @page rule, so it prints wrong");
  check(findings, /DASHBOARD/.test(body), "no-content", "the traveler's own data is missing");
  /* The preview bar is app chrome; it must not end up in the saved document.
     Matched on the ELEMENT, not the class name: the class name also appears in
     the inlined stylesheet, where it is harmless and unavoidable. */
  check(findings, !/<div class="pv-bar/.test(body), "chrome-saved", "the preview toolbar was saved into the file");
  check(findings, !/>Print</.test(body) && !/>Close</.test(body), "chrome-buttons", "preview buttons ended up in the file");
  if (!findings.length) { pass++; console.log(`  ok  save-to-device — ${name}, ${body.length} bytes, self-contained`); }
  else { fail++; console.log("FAIL  save-to-device"); findings.forEach(f => console.log("        " + f)); }
  await ctx.close();
}

function check2(cond, msg, detail) {
  if (cond) { pass++; console.log(`  ok  ${msg}`); }
  else { fail++; console.log(`FAIL  ${msg}${detail ? "\n        " + detail : ""}`); }
}
// LAYOUTS has nine rungs (0..8); "has headroom" means the worst case is not
// pinned at the last one.
const LAYOUTS_LEN_HINT = 8;

/* ---------- the two-page cap, with every hold step fully filled in ----------
 *
 * The traveler promises exactly two pages, and print.js keeps that promise with
 * a nine-rung layout ladder: it renders at the most generous layout that still
 * fits and drops a rung when it does not. Anything added to a step row spends
 * that headroom, and the failure is quiet — the sheet just gets tighter until
 * one day it does not fit and prints a third page nobody expects.
 *
 * Lot capture added a line to every hold step (which fabric, which resin, which
 * hardener), so this measures the worst realistic case: every work order with
 * every cure filled in, using the app's OWN measurePages(), which is what
 * fitSheetHtml() gates on. Measuring a bounding box instead would be wrong —
 * .ws-page is one growing div that the print engine splits, so its height is
 * not the page count.
 */
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  // openApp creates the page, stubs fb.js and waits for the seed; making a
  // second one here is what made the first version of this block time out.
  const { page } = await openApp(ctx, port);
  // `DB` is a top-level `let` in core.js, so it is NOT a property of window.
  await page.waitForFunction(() => typeof DB !== "undefined" && (DB.workOrders || []).length > 0, null, { timeout: 15000 });

  const res = await page.evaluate(() => {
    window.onFbData("lots", [
      { id: "FAB-SN6-001", cls: "FAB", name: "195 TWILL SIGMATEX", stage: "Open", vendorLot: "SGX-2411-B7" },
      { id: "RSN-SN6-001", cls: "RSN", name: "IN2 INFUSION RESIN", role: "resin", stage: "Open", vendorLot: "24C-0918" },
      { id: "RSN-SN6-002", cls: "RSN", name: "AT30 SLOW HARDENER", role: "hardener", stage: "Open", vendorLot: "24C-0919" },
    ]);
    for (const w of DB.workOrders) {
      w.retro = false;                                  // retro records skip the gates
      for (const s of w.steps || []) {
        if (typeof startsHold === "function" && startsHold(s)) {
          s.cure = { resin: "in2-at30-slow", startedAt: "2026-09-22T21:42:00.000Z", tempC: 18,
                     lotFabric: "FAB-SN6-001", lotResin: "RSN-SN6-001", lotHardener: "RSN-SN6-002",
                     lotSource: "scanned" };
        }
      }
    }
    const out = [];
    const host = printRoot();
    const prevHtml = host.innerHTML, prevClass = host.className;
    for (const w of DB.workOrders) {
      host.className = "measuring";
      let rung = -1, pages = 0;
      for (let li = 0; li < LAYOUTS.length; li++) {
        host.innerHTML = woSheetHtml(w, { layout: LAYOUTS[li] });
        pages = measurePages(host);
        if (pages <= MAX_PAGES) { rung = li; break; }
      }
      out.push({ id: w.id, rung, pages });
    }
    host.innerHTML = prevHtml; host.className = prevClass;
    return out;
  });

  const over = res.filter(r => r.rung < 0);
  const worst = Math.max(...res.map(r => r.pages));
  check2(over.length === 0,
    `every work order fits ${2} pages with lots recorded (${res.length} checked, worst ${worst.toFixed(2)})`,
    over.map(r => `${r.id} needs ${r.pages.toFixed(2)} pages even at the tightest layout`).join("; "));
  /* Reported, not asserted, and deliberately so.
     The ladder is ALREADY pinned at its tightest rung for the longest SN5 work
     orders — measured with and without the lot line, the rung distribution is
     identical (4,5,6,7,8 both ways), so lot capture cost nothing. Asserting
     "there is headroom" here would fail on debt that predates this feature and
     would read as a regression it is not.
     What IS asserted is the thing that actually matters: nothing needs a third
     page. But the number below is worth watching — at rung 8 the next thing
     anybody adds to a step row has nowhere to go, and the fix then is a real
     one (a third page, or less on the row), not another rung. */
  const worstRung = Math.max(...res.map(r => r.rung));
  const pinned = res.filter(r => r.rung >= LAYOUTS_LEN_HINT).length;
  console.log(`  ..  layout headroom: worst rung ${worstRung} of ${LAYOUTS_LEN_HINT}` +
    (pinned ? ` — ${pinned} work order${pinned === 1 ? " is" : "s are"} at the tightest layout already (pre-existing)` : ""));
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
