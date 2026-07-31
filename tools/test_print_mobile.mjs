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

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
