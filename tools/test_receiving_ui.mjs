#!/usr/bin/env node
/* test_receiving_ui.mjs — the receiving desk, measured in a real browser.
 *
 * test_appui.mjs sweeps every TAB in its list state. The desk is not a tab and
 * not a list: it is a surface you have to drive into, and an EMPTY grid cannot
 * overflow, cannot be unreadable, and cannot have a tap target that is too
 * small. So this fills it before it measures it — including a 40-row case,
 * because "the sheet is twelve screens tall on a phone" is a failure no
 * assertion catches unless the rows exist.
 *
 * Needs serve_populated.mjs running (it seeds the app and sets __fixturesReady):
 *
 *   node tools/serve_populated.mjs --port 8791 &
 *   node tools/test_receiving_ui.mjs
 */

import { loadChromium, skipMessage } from "./lib/browser.mjs";

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const URL_ = arg("url", "http://127.0.0.1:8791");

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
}

/* Widths chosen the way shoot_ui chooses them: each one is a real decision
   boundary in the stylesheet, not a round number. 393 is an iPhone 15 and is
   the only one that also emulates a coarse pointer, which is where the touch
   rules live. */
const WIDTHS = [
  { w: 1440, h: 1000, id: "1440", mobile: false },
  { w: 900, h: 1100, id: "900", mobile: false },
  { w: 393, h: 852, id: "393", mobile: true },
];

const fill = (n) => `
  const bins = invActiveBins().map(b => b.id);
  RX = { rows: [], supplier: "Easy Composites", receivedOn: "2026-08-23", buyId: "",
         defBin: bins[0] || "", lockBin: "", index: "orders" };
  const names = ["195 Twill Sigmatex 2x2 3k 1250mm wide", "IN2 Infusion Resin 5kg kit",
                 "AT30 Slow Hardener", "Blue tack tape", "Peel ply 80gsm", "VB160 bagging film 10m"];
  const cls = ["FAB", "RSN:resin", "RSN:hardener", "CON", "CON", "CON"];
  for (let i = 0; i < ${n}; i++) {
    RX.rows.push({ ...rxBlankRow({}), cls: cls[i % cls.length], name: names[i % names.length],
      qty: String((i % 4) + 1), bin: bins[i % Math.max(1, bins.length)] || "",
      vendorLot: "LOT-" + (1000 + i), unitCost: String(10 + i) });
  }
  view = { ...view, tab: "inventory", invView: "desk", mode: "list", id: null };
  render();
`;

/* Measured in the page. checkVisibility() rather than a bounding box, because
   a box can be a perfectly good rectangle that paints nothing — the lesson
   test_detailui was rewritten around. */
const MEASURE = `(() => {
  const r = { spills: [], tiny: [], small: [], unreachable: 0,
              docScrollW: document.documentElement.scrollWidth,
              docClientW: document.documentElement.clientWidth,
              pageH: document.documentElement.scrollHeight,
              rows: document.querySelectorAll(".rxgrid tbody tr").length };
  const coarse = matchMedia("(pointer: coarse)").matches;
  const vw = document.documentElement.clientWidth;
  /* Scoped to #main: the sidebar is a drawer parked off-screen at these widths
     by design, and its group labels are the app's own 10.5px — neither is
     anything this test has business judging. */
  const desk = document.querySelector("#main") || document.body;
  for (const el of desk.querySelectorAll("*")) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    if (b.right > vw + 1 || b.left < -1) {
      r.spills.push({ cls: el.className && el.className.toString().slice(0, 40), left: Math.round(b.left), right: Math.round(b.right) });
    }
  }
  for (const el of desk.querySelectorAll("input, select, button, label, span, td, th")) {
    if (!el.checkVisibility || !el.checkVisibility()) continue;
    const txt = (el.childNodes.length === 1 && el.firstChild && el.firstChild.nodeType === 3)
      ? el.textContent.trim() : "";
    if (txt) {
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px && px < 11) r.tiny.push({ t: txt.slice(0, 24), px });
    }
  }
  if (coarse) {
    for (const el of desk.querySelectorAll("input:not([type=checkbox]), select, button")) {
      if (!el.checkVisibility || !el.checkVisibility()) continue;
      const b = el.getBoundingClientRect();
      if (b.height < 40) r.small.push({ tag: el.tagName, id: el.id, h: Math.round(b.height) });
    }
  }
  // Every cell the sheet claims to have must actually be reachable.
  for (const el of desk.querySelectorAll(".rxgrid tbody input, .rxgrid tbody select")) {
    if (!el.checkVisibility || !el.checkVisibility()) r.unreachable++;
  }
  return r;
})()`;

const main = async () => {
  const chromium = await loadChromium();
  if (!chromium) { console.log(skipMessage("the receiving desk")); return; }
  const browser = await chromium.launch();

  for (const width of WIDTHS) {
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({
        viewport: { width: width.w, height: width.h },
        isMobile: width.mobile, hasTouch: width.mobile, colorScheme: theme,
      });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String((e && e.message) || e)));
      await page.addInitScript(`localStorage.setItem("feb-theme", ${JSON.stringify(theme)});`);
      await page.goto(URL_ + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction("window.__fixturesReady === true", null, { timeout: 20000 });

      for (const n of [7, 40]) {
        const at = `desk/${n}rows/${width.id}/${theme}`;
        await page.evaluate(fill(n));
        await page.waitForTimeout(80);
        const a = await page.evaluate(MEASURE);

        ok(`${at} all ${n} rows rendered`, a.rows === n, `got ${a.rows}`);
        ok(`${at} no page h-overflow`, a.docScrollW <= a.docClientW + 1,
          `document is ${a.docScrollW}px wide in ${a.docClientW}px`);
        ok(`${at} nothing off-screen`, a.spills.length === 0,
          a.spills.slice(0, 2).map(s => `${s.cls} at ${s.left}..${s.right}`).join(", "));
        ok(`${at} type >= 11px`, a.tiny.length === 0,
          a.tiny.slice(0, 2).map(t => `"${t.t}" at ${t.px}px`).join(", "));
        ok(`${at} every cell reachable`, a.unreachable === 0, `${a.unreachable} cells paint nothing`);
        if (width.mobile) {
          ok(`${at} tap targets >= 40px`, a.small.length === 0,
            a.small.slice(0, 3).map(s => `${s.tag}#${s.id} ${s.h}px`).join(", "));
        }
      }
      ok(`desk/${width.id}/${theme} no page errors`, errs.length === 0, errs.slice(0, 2).join(" | "));
      await ctx.close();
    }
  }

  /* The phone framing has a job: two items at a shelf, without wading through
     an order list or answering a question the scan already answered. */
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(URL_ + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__fixturesReady === true", null, { timeout: 20000 });
  const locked = await page.evaluate(`(() => {
    const b = invActiveBins()[0];
    RX = null; invReceive(b.id);
    return {
      index: !!document.querySelector(".rxindex"),
      shelfCol: !!document.querySelector(".rxc-bin"),
      title: (document.querySelector(".rxsheet h2") || {}).textContent,
      back: (document.querySelector(".toolbar .ib") || {}).textContent.trim(),
    };
  })()`);
  ok("shelf-locked: no order list to wade through", locked.index === false);
  ok("shelf-locked: no shelf column, because the scan already answered it", locked.shelfCol === false);
  ok("shelf-locked: the back button names the shelf you came from",
    /\S/.test(locked.back) && !/Storage map/.test(locked.back), `is "${locked.back}"`);
  await ctx.close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });
