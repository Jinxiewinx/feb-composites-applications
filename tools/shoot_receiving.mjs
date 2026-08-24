#!/usr/bin/env node
/* shoot_receiving.mjs — photograph the receiving desk in the states that matter.
 *
 * shoot_ui.mjs shoots a TAB in its list/detail states. The desk is neither: it
 * is a doing surface you have to drive into, with a sheet that has to have rows
 * in it before it can be judged (an empty grid cannot overflow, and cannot be
 * unreadable either). So this drives the real app — real receiving.js, real
 * stylesheet, populated fixtures — into each state and writes a PNG.
 *
 * Like shoot_ui.mjs it asserts NOTHING. It is a camera, for the failures that
 * cannot be written down as a number, and it resolves the app relative to
 * itself so a git worktree photographs that worktree.
 *
 * Needs serve_populated.mjs running, because that is what seeds the app and
 * sets __fixturesReady; building a second fixture stub here would be a second
 * thing to keep in sync with the real one.
 *
 *   node tools/serve_populated.mjs --port 8791 &
 *   node tools/shoot_receiving.mjs --out .ui-shots/rx
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadChromium, skipMessage } from "./lib/browser.mjs";


function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const OUT = arg("out", ".ui-shots/rx");
const LABEL = arg("label", "rx");
const URL_ = arg("url", "http://127.0.0.1:8791");

const WIDTHS = [
  { w: 1440, h: 1000, id: "1440", mobile: false },
  { w: 900, h: 1100, id: "900", mobile: false },
  { w: 393, h: 852, id: "393", mobile: true },
];
const THEMES = ["light", "dark"];

/* A delivery worth looking at: three shelves, a fan-out, a long material name,
   and a resin/hardener pair that trips CS-011 §6 on the confirm. */
const SHEET = `
  const bins = invActiveBins().map(b => b.id);
  const b0 = bins[0] || "", b1 = bins[1] || b0, b2 = bins[2] || b0;
  RX = { rows: [], supplier: "Easy Composites", receivedOn: "2026-08-23", buyId: "",
         defBin: b0, lockBin: "", index: "orders" };
  const add = (o) => RX.rows.push({ ...rxBlankRow({}), ...o });
  add({ cls: "FAB", name: "195 Twill Sigmatex 2x2 3k 1250mm", qty: "3", bin: b0, vendorLot: "SG24-1180", unitCost: "61.40" });
  add({ cls: "FAB", name: "450gsm Biax E-Glass", qty: "2", bin: b0, vendorLot: "EG-9902", unitCost: "22.00" });
  add({ cls: "RSN:resin", name: "IN2 Infusion Resin", qty: "4", bin: b1, vendorLot: "IN2-44120", unitCost: "78.00", expiresOn: "2027-04-30" });
  add({ cls: "RSN:hardener", name: "AT30 Slow Hardener", qty: "2", bin: b1, vendorLot: "AT30-8871", unitCost: "41.50", expiresOn: "2027-04-30" });
  add({ cls: "CON", name: "Blue tack tape", qty: "12", bin: b2, unitCost: "9.40" });
  add({ cls: "CON", name: "Peel ply 80gsm", qty: "4", bin: b2, unitCost: "14.00" });
  add({ cls: "CON", name: "", qty: "1", bin: b2 });
  view = { ...view, tab: "inventory", invView: "desk", mode: "list", id: null };
  render();
`;

const STATES = [
  { id: "sheet", js: SHEET },
  { id: "empty", js: `RX = null; view = { ...view, tab: "inventory", invView: "desk", mode: "list", id: null }; render();` },
  { id: "confirm", js: SHEET + `\nrxConfirm();` },
  { id: "shelflocked", js: `
      const b = invActiveBins()[0];
      RX = null; invReceive(b ? b.id : "");
      RX.rows[0].name = "AT30 Slow Hardener"; RX.rows[0].cls = "RSN:hardener"; RX.rows[0].qty = "2";
      RX.rows.push({ ...rxBlankRow({}), cls: "RSN:resin", name: "IN2 Infusion Resin", qty: "1", bin: RX.lockBin });
      RX.rows.push({ ...rxBlankRow({}), cls: "CON", name: "", qty: "1", bin: RX.lockBin });
      render();` },
];

const main = async () => {
  const chromium = await loadChromium();
  if (!chromium) { console.log(skipMessage("shoot_receiving")); return; }
  await mkdir(OUT, { recursive: true });
  const url = URL_;
  const browser = await chromium.launch();
  let n = 0;
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      const ctx = await browser.newContext({
        viewport: { width: width.w, height: width.h },
        deviceScaleFactor: 2,
        isMobile: width.mobile,
        hasTouch: width.mobile,
        colorScheme: theme,
      });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
      await page.addInitScript(`localStorage.setItem("feb-theme", ${JSON.stringify(theme)});`);
      await page.goto(url + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction("window.__fixturesReady === true", null, { timeout: 20000 });
      for (const st of STATES) {
        await page.evaluate("closeModal(); RX_UNDO = null;");
        await page.evaluate(st.js);
        await page.waitForTimeout(120);
        const file = join(OUT, `${LABEL}-${st.id}-${width.id}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: true });
        n++;
      }
      if (errs.length) console.log(`  page errors at ${width.id}/${theme}: ${errs.slice(0, 3).join(" | ")}`);
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`${n} shots written to ${OUT}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
