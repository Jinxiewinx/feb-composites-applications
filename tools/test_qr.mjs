/* test_qr.mjs — the QR encoder, checked as arithmetic. No browser needed.
 *
 * THE ASSERTION THAT MATTERS is `29 modules at ECC Q`. It is the only check in
 * this repo that can catch the failure it guards, and that failure is silent:
 *
 *   HTTPS://FEB-COMPOSITES.WEB.APP/Q/MOLD-SN6-004 is 45 characters. In QR
 *   ALPHANUMERIC mode that fits version 3 (29x29) with error-correction level Q
 *   (25% recovery). In BYTE mode the same string needs version 4 (33x33) and
 *   only gets level M (15%).
 *
 * So one lowercase letter, one "?utm=", or a switch to a #hash route costs a
 * version AND an ECC level, and nothing about the printed label looks different
 * — it just scans worse once it has resin on it, and nobody finds out for a
 * season. Hence: assert the number, not the appearance.
 *
 * qrcode-generator does NOT auto-detect alphanumeric mode; addData() defaults
 * to Byte. labels.js passes 'Alphanumeric' explicitly. This file checks that
 * too, because if that argument is ever dropped the codes get denser and every
 * other test still passes.
 *
 *   node tools/test_qr.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "03 App", "app");

let pass = 0, fail = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log(`  ok   ${msg}`); }
  else { fail++; console.log(`  FAIL ${msg}${detail != null ? `  (${detail})` : ""}`); }
}
function eq(got, want, msg) { ok(got === want, msg, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }

/* Load the vendored encoder and labels.js into one sandbox. labels.js is a
   classic script that expects `esc` and `qrcode` as globals, so give it the
   two it needs for qrSvg() and nothing else — anything more and this test
   starts depending on core.js's whole surface. */
const ctx = vm.createContext({ console });
vm.runInContext(readFileSync(join(APP, "vendor", "qrcode.min.js"), "utf8"), ctx);
ctx.esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
vm.runInContext(readFileSync(join(APP, "labels.js"), "utf8"), ctx);

const { qrSvg, scanUrl } = ctx;

/* ---------- 1. the canonical URLs ---------- */
console.log("\nversion and ECC");

const IDS = [
  "MOLD-SN6-004",     // longest realistic: 4-char prefix
  "WO-SN6-118",
  "P-SN6-007",
  "CP-SN6-052",
  "PNL-SN6-003",
  "FAB-SN6-021",
  "RSN-SN6-009",
  "BRD-SN6-002",
];

for (const id of IDS) {
  const url = scanUrl(id);
  const q = ctx.qrcode(0, "Q");
  q.addData(url, "Alphanumeric");
  q.make();
  const n = q.getModuleCount();
  ok(n === 29, `${id} -> 29 modules at ECC Q`, `${n} modules, url ${url.length} chars`);
}

/* ---------- the character budget ----------
   47 alphanumeric chars at v3-Q, less 30 of host and 3 of "/Q/", leaves 14 for
   the ID. This is a constraint on the ID GRAMMAR, not just on this file, so it
   is asserted rather than assumed. A 15th character silently costs a version
   and an ECC level while the printed label looks identical. */
console.log("\ncharacter budget");

// Probed through fitsQrBudget rather than by reading the constant: a top-level
// `const` in a classic script is not a property of the global object, and
// testing the boundary behaviour is the better check anyway.
ok(ctx.fitsQrBudget("X".repeat(14)), "14 characters is inside the budget");
ok(!ctx.fitsQrBudget("X".repeat(15)), "15 characters is over it");
// Prove 14 is the real cliff and not a number someone typed in: at 14 the code
// is still 29 modules, at 15 it is not.
for (const [len, want] of [[14, 29], [15, 33]]) {
  const q = ctx.qrcode(0, "Q"); q.addData(scanUrl("X".repeat(len)), "Alphanumeric"); q.make();
  eq(q.getModuleCount(), want, `a ${len}-character id encodes at ${want} modules`);
}
for (const id of IDS) ok(ctx.fitsQrBudget(id), `${id} (${id.length}) is inside the budget`);

// The one thing in the grammar that busts it, and the reason coupons are
// text-only on 12mm tape rather than an oversight. If this ever starts fitting,
// somebody shortened the host and coupons could get a QR after all.
{
  const coupon = "PNL-SN6-006-C03";
  eq(coupon.length, 15, "a coupon id is 15 characters");
  ok(!ctx.fitsQrBudget(coupon), "a coupon id is over budget, which is why coupon labels carry no QR");
  const q = ctx.qrcode(0, "Q"); q.addData(scanUrl(coupon), "Alphanumeric"); q.make();
  ok(q.getModuleCount() > 29, "and it really would cost a version", `${q.getModuleCount()} modules`);
  ok(!ctx.labelHtml("items", { id: coupon, cls: "PNL", partName: "TEST PANEL" }).includes("<svg"),
    "labelHtml drops the QR rather than silently printing a denser one");
}

/* The counterfactual, so the number above is meaningful rather than incidental:
   the same string in byte mode really is worse. If this ever stops being true
   the check above has stopped guarding anything. */
{
  const url = scanUrl("MOLD-SN6-004");
  const b = ctx.qrcode(0, "Q");
  b.addData(url);            // no mode argument = Byte, the library's default
  b.make();
  ok(b.getModuleCount() > 29,
    "byte mode is genuinely worse, so the alphanumeric win is real",
    `byte gives ${b.getModuleCount()} modules vs 29`);
}

/* ---------- 2. the charset gate ---------- */
console.log("\ncharset");

eq(scanUrl("mold-sn6-004"), "HTTPS://FEB-COMPOSITES.WEB.APP/Q/MOLD-SN6-004", "scanUrl uppercases the id");
ok(/^[0-9A-Z $%*+\-./:]+$/.test(scanUrl("MOLD-SN6-004")), "the canonical URL is entirely inside QR alphanumeric");

for (const bad of [
  "https://feb-composites.web.app/q/MOLD-SN6-004",        // lowercase
  "HTTPS://FEB-COMPOSITES.WEB.APP/#/MOLD-SN6-004",        // hash route
  "HTTPS://FEB-COMPOSITES.WEB.APP/Q/X?UTM=SLACK",         // query string
  "HTTPS://FEB-COMPOSITES.WEB.APP/Q/MOLD_SN6_004",        // underscore
]) {
  let threw = false;
  try { qrSvg(bad, 21.4); } catch { threw = true; }
  ok(threw, `rejected: ${bad.slice(0, 48)}`);
}

/* ---------- 3. the size floor ---------- */
console.log("\nsize floor");

// 29 modules + 8 of quiet zone = 37. At 14mm that is 0.378mm per module,
// already under the 0.4mm a phone camera needs. A too-small QR looks perfectly
// fine on screen, which is exactly why this is a throw.
for (const mm of [8, 12, 13.9]) {
  let threw = false;
  try { qrSvg(scanUrl("P-SN6-007"), mm); } catch { threw = true; }
  ok(threw, `${mm}mm refused`);
}
for (const mm of [14, 21.4, 27, 35]) {
  let threw = false;
  try { qrSvg(scanUrl("P-SN6-007"), mm); } catch (e) { threw = e.message; }
  ok(threw === false, `${mm}mm allowed`, threw);
}

/* ---------- 4. the SVG is self-contained ---------- */
console.log("\nself-contained output");

const svg = qrSvg(scanUrl("MOLD-SN6-004"), 21.4);

for (const banned of ["<script", "<image", "xlink:href", "<use", "url(", "@import"]) {
  ok(!svg.includes(banned), `no ${banned}`);
}
/* print.js sheetFileHtml() inlines CSS and nothing else, so a saved sheet on a
   phone with no wifi must not need to fetch anything. Exactly two http strings
   are allowed and neither is a fetch: the payload we deliberately encoded, and
   the SVG namespace (which is an identifier, not a URL the browser resolves).
   Counted rather than pattern-matched so a third one cannot slip in. */
eq((svg.match(/https?:\/\//gi) || []).length, 2, "exactly two http strings: the payload and the xmlns");
ok(svg.includes(`xmlns="http://www.w3.org/2000/svg"`),
  "carries xmlns, so the code survives being saved as a standalone .svg or pasted into a data URL");
ok(svg.includes("HTTPS://FEB-COMPOSITES.WEB.APP/Q/MOLD-SN6-004"), "payload appears in the aria-label");

/* ---------- 5. quiet zone ---------- */
console.log("\nquiet zone");

const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
ok(!!vb, "has a viewBox");
if (vb) {
  // Inside the viewBox, not as a CSS margin: printers clip to the element box,
  // so a margin-based quiet zone vanishes in the saved file. 29 + 4 each side.
  eq(Number(vb[1]), 37, "viewBox is moduleCount + 8 (4 modules of quiet zone per side)");
  eq(Number(vb[1]), Number(vb[2]), "viewBox is square");
}
ok(/<rect width="37" height="37" fill="#fff"\/>/.test(svg), "quiet zone is painted white, not left transparent");

/* ---------- 6. the path round-trips ---------- */
console.log("\npath round-trip");

/* The run-length merger is the one piece of real logic in qrSvg, and a bug in
   it produces a QR that passes every DOM-level check and is simply wrong. So
   parse the emitted path back into a module matrix and compare it against the
   encoder, module by module. */
{
  const q = ctx.qrcode(0, "Q");
  q.addData(scanUrl("MOLD-SN6-004"), "Alphanumeric");
  q.make();
  const n = q.getModuleCount(), QUIET = 4, box = n + QUIET * 2;

  const grid = Array.from({ length: box }, () => new Array(box).fill(false));
  const d = svg.match(/ d="([^"]*)"/)[1];
  const segs = d.match(/M(\d+) (\d+)h(\d+)v1h-\d+z/g) || [];
  for (const s of segs) {
    const [, x, y, w] = s.match(/M(\d+) (\d+)h(\d+)v1h-\d+z/).map(Number);
    for (let i = 0; i < w; i++) grid[y][x + i] = true;
  }

  let mismatches = 0, dark = 0;
  for (let r = 0; r < box; r++) {
    for (let c = 0; c < box; c++) {
      const inCode = r >= QUIET && r < QUIET + n && c >= QUIET && c < QUIET + n;
      const want = inCode ? q.isDark(r - QUIET, c - QUIET) : false;
      if (want) dark++;
      if (grid[r][c] !== want) mismatches++;
    }
  }
  eq(mismatches, 0, "every module in the path matches the encoder");
  ok(dark > 0, "the code is not blank", `${dark} dark modules`);

  // One <path> and one <rect>, not ~420 rects. A 20-up sheet of rect-per-module
  // QRs is 8,400 DOM nodes and a saved file in the megabytes.
  eq((svg.match(/<path/g) || []).length, 1, "exactly one <path>");
  // A QR is high-entropy by construction, so runs are short: about 1.9 modules
  // each in practice. The check is that merging happened at all, not that it
  // hit some invented ratio — one segment per dark module means the merger is
  // broken and the saved sheet balloons.
  ok(segs.length < dark * 0.8, "runs are merged, not one segment per dark module",
    `${segs.length} segments for ${dark} dark modules`);
  ok(svg.length < 4000, "one QR stays under 4KB", `${svg.length} bytes`);
}

/* ---------- 7. what the label says ---------- */
console.log("\nprojection");

// pubProjection is the security boundary for the public scan page: Firestore
// rules cannot filter fields, only whole documents, so this function is what
// keeps layup stacks and people's names off a public URL.
{
  const hostile = {
    id: "P-SN6-007", partName: "UT INLET", layupProgress: "Layup Complete",
    moldLocation: "RFS", workOrderId: "WO-SN6-031",
    // everything below must NOT survive the projection
    layupStack: [{ material: "195 twill" }], steps: [{ buyoff: { name: "Simon Starbuck" } }],
    updatedBy: "simon@berkeley.edu", comments: [{ author: "someone@berkeley.edu" }],
    files: [{ url: "https://firebasestorage.googleapis.com/v0/b/x/o/y?token=SECRET" }],
    bom: [{ item: "resin", cost: 300 }],
  };
  const p = ctx.pubProjection("parts", hostile);
  const json = JSON.stringify(p);
  eq(p.id, "P-SN6-007", "keeps the id");
  eq(p.cls, "PART", "class word present");
  eq(p.name, "UT INLET", "keeps the name");
  for (const leak of ["layupStack", "buyoff", "Starbuck", "@", "firebasestorage", "bom", "195 twill", "300"]) {
    ok(!json.includes(leak), `does not leak ${leak}`);
  }
  ok(ctx.pubProjection("projects", { id: "PROJ-SN6-001", title: "x" }) === null,
    "tickets are not physical and get no public record");
  ok(ctx.pubProjection("budget", { id: "BUY-SN6-001" }) === null, "budget gets no public record");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
