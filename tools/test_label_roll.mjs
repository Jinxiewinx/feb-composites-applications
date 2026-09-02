/* test_label_roll.mjs — labels on a roll, and the custom label. No browser.
 *
 * THE TWO THINGS THIS FILE IS FOR.
 *
 * 1. THE JS AND THE CSS HAVE TO AGREE ABOUT MILLIMETRES, and nothing else can
 *    notice when they stop. LABEL_ROLLS in labels.js says a DK-2210 label is
 *    101.6 x 25.4mm; `@page roll2210` in print.css says the same thing in a
 *    different file in a different language. Change one and the label still
 *    previews perfectly, still saves, still prints — onto the wrong length of
 *    tape, which you find out by walking to the printer. So the numbers are
 *    parsed out of both files and compared.
 *
 * 2. A CUSTOM LABEL MUST NOT BE ABLE TO IMPERSONATE A RECORD. labels.js exists
 *    because SN5 had no ID column and a part's name was its primary key. A
 *    hand-typed label reading MOLD-SN6-011 that nothing answers to puts that
 *    back, with an official-looking label on top of it. clProblem() is the
 *    guard and this is what proves it fires.
 *
 * Loaded the same way tools/test_qr.mjs loads it — labels.js alone in a vm
 * sandbox with esc and qrcode and nothing else — which is also how this file
 * catches the other easy mistake: reaching for `window` or `DB` at the top
 * level of labels.js, where it is a ReferenceError that takes the QR suite down
 * with it.
 *
 *   node tools/test_label_roll.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "06 Composites App", "app");

let pass = 0, fail = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log(`  ok   ${msg}`); }
  else { fail++; console.log(`  FAIL ${msg}${detail != null ? `  (${detail})` : ""}`); }
}
function eq(got, want, msg) { ok(got === want, msg, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }

const ctx = vm.createContext({ console });
vm.runInContext(readFileSync(join(APP, "vendor", "qrcode.min.js"), "utf8"), ctx);
ctx.esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
vm.runInContext(readFileSync(join(APP, "labels.js"), "utf8"), ctx);

// Top-level `const`/`let` in a classic script are not properties of the global
// object, so they are read by evaluating their name in the same context.
const peek = expr => vm.runInContext(expr, ctx);
const ROLLS = peek("LABEL_ROLLS");
const CSS = readFileSync(join(APP, "print.css"), "utf8");

const PART = {
  id: "P-SN6-007", partName: "UT INLET L/H", layupSchedule: "6X 195 TWILL + .125 NOMEX",
  layupType: "MOLD INFUSION", workOrderId: "WO-SN6-031", moldLocation: "RFS",
  layupProgress: "Layup Complete", laidOn: "2026-09-22", by: "RJB", weightG: 412, subteam: "AERO"
};

/* ---------- 1. the millimetres, in both languages ---------- */
console.log("\ngeometry agrees between labels.js and print.css");

for (const [key, m] of Object.entries(ROLLS)) {
  const page = new RegExp(`@page\\s+${m.page}\\s*\\{([^}]*)\\}`).exec(CSS);
  ok(!!page, `@page ${m.page} exists for media ${key}`);
  if (page) {
    const size = /size:\s*([\d.]+)mm\s+([\d.]+)mm/.exec(page[1]);
    ok(!!size, `@page ${m.page} declares a size in mm`);
    if (size) {
      eq(Number(size[1]), m.wMm, `${key}: @page width matches LABEL_ROLLS.wMm`);
      eq(Number(size[2]), m.hMm, `${key}: @page height matches LABEL_ROLLS.hMm`);
    }
    ok(/margin:\s*0\s*;/.test(page[1]), `@page ${m.page} has margin 0`,
      "a margin on a label page is a margin on the label");
  }

  // The screen rule, which is what the preview is measured against, and the
  // print re-assertion that survives index.html's #printroot .ws-page reset.
  const rule = new RegExp(`\\.roll-page\\[data-media="${key}"\\]\\s*\\{([^}]*)\\}`, "g");
  const decls = [...CSS.matchAll(rule)].map(x => x[1]);
  ok(decls.length >= 2, `${key} has both a screen rule and a print re-assertion`, `${decls.length} rules`);
  for (const d of decls) {
    const w = /width:\s*([\d.]+)mm/.exec(d), h = /height:\s*([\d.]+)mm/.exec(d);
    ok(w && Number(w[1]) === m.wMm, `${key}: rule width is ${m.wMm}mm`, w && w[1]);
    ok(h && Number(h[1]) === m.hMm, `${key}: rule height is ${m.hMm}mm`, h && h[1]);
  }
  ok(new RegExp(`\\.roll-page\\[data-media="${key}"\\][^{]*\\{[^}]*page:\\s*${m.page}`).test(CSS),
    `${key} is assigned to its named page`);
}

/* ---------- 2. the roll sheet ---------- */
console.log("\nthe roll wrapper");

{
  const html = ctx.labelRollHtml([{ coll: "parts", o: PART }], { media: "dk2210" });
  eq((html.match(/class="roll-page"/g) || []).length, 1, "one label, one page");
  ok(html.includes('data-media="dk2210"'), "the page carries its media");
  ok(html.includes('class="wsheet rolls"'), "wrapped in .wsheet so the sheet vars apply");

  /* NOT ws-page, and this is the assertion that earns its keep. print.js
     sheetFileHtml() injects `@media print { .ws-page { padding: 0 0.45in } }`
     into every SAVED standalone sheet. 0.45in either side of a 101.6mm label
     leaves nothing at all — and the preview in the app would look perfect,
     because that rule only exists in the saved copy. The saved copy is the one
     that gets printed at the bench with no wifi. */
  ok(!/\bws-page\b/.test(html), "a roll page is never .ws-page (sheetFileHtml pads those 0.45in)");
  ok(!html.includes("lbl-cal"), "no calibration bar on a roll — the label is its own ruler");

  const three = ctx.labelRollHtml([{ coll: "parts", o: PART }], { media: "dk2210", copies: 3 });
  eq((three.match(/class="roll-page"/g) || []).length, 3, "copies repeat the page");

  // Clamped, because this ends up as N physical labels coming off a roll and a
  // fat-fingered 500 is a lot of tape.
  const max = peek("LABEL_COPIES_MAX");
  eq(ctx.labelCopies(0), 1, "0 copies clamps up to 1");
  eq(ctx.labelCopies("abc"), 1, "nonsense clamps to 1");
  eq(ctx.labelCopies(9999), max, `too many clamps down to ${max}`);

  // An unknown media falls back rather than emitting a page with no @page rule,
  // which would silently print one label per US Letter sheet.
  ok(ctx.labelRollHtml([{ coll: "parts", o: PART }], { media: "nope" }).includes('data-media="dk2210"'),
    "an unknown media falls back to DK-2210");
}

/* ---------- 3. the label itself does not change with the stock ---------- */
console.log("\nthe same label, both paths");

{
  /* The whole argument for a 29mm continuous roll cut at 101.6mm is that it IS
     the Avery 5161 cell, so the label must come out byte-identical down both
     paths. If this ever fails, either the roll geometry drifted or somebody
     forked the renderer — and forking it is how the printed label and the
     public scan card start disagreeing about what an object is. */
  const sheet = ctx.labelSheetHtml([{ coll: "parts", o: PART }], { grid: "5161", calibrate: false });
  const roll = ctx.labelRollHtml([{ coll: "parts", o: PART }], { media: "dk2210" });
  const grab = h => (/<div class="lbl" [\s\S]*?<\/div>\s*<\/div>\s*<\/div>/.exec(h) || [""])[0];
  const a = grab(sheet), b = grab(roll);
  ok(a.length > 200, "found the label in the sheet output", a.length);
  eq(b, a, "the DK-2210 label is byte-identical to the Avery 5161 label");
}

/* ---------- 4. nameTier's narrow track ---------- */
console.log("\nthe narrow (die-cut) track");

{
  // DK-1201 gives 86.6mm of printable length against 101.6, so every tier has
  // to fire earlier. 19 characters is one line on the wide track and two on the
  // narrow one — which is exactly the boundary that would otherwise clip.
  const n19 = "X".repeat(19);
  eq(ctx.nameTier(n19).cls, "n1", "19 chars is one line on the wide track");
  eq(ctx.nameTier(n19, true).cls, "n2a", "and two lines on the narrow one");
  eq(ctx.nameTier("X".repeat(18), true).cls, "n1", "18 still fits one narrow line");
  // The ladder must stay monotonic or a longer name gets a BIGGER font.
  const order = ["n1", "n2a", "n2b", "n2c", "n2d"];
  for (const narrow of [false, true]) {
    let last = -1, monotonic = true;
    for (let n = 0; n <= 90; n++) {
      const i = order.indexOf(ctx.nameTier("X".repeat(n), narrow).cls);
      if (i < last) monotonic = false;
      last = i;
    }
    ok(monotonic, `the ${narrow ? "narrow" : "wide"} tier ladder never goes backwards`);
  }
  ok(!!ROLLS.dk1201.narrow, "DK-1201 is flagged narrow");
  ok(!ROLLS.dk2210.narrow, "DK-2210 is not — it is the 5161 cell");
}

/* ---------- 5. labelMarkup with no record behind it ---------- */
console.log("\nlabelMarkup on its own");

{
  const bare = ctx.labelMarkup({ name: "SOLVENT CABINET", key: "FLAMMABLES" });
  ok(!bare.includes("lbl-rid"), "no id, no ID row — an empty .lbl-rid is a blank bold line");
  ok(!bare.includes("<svg"), "no qr text, no code");
  ok(bare.includes("SOLVENT CABINET"), "the name is there");
  ok(bare.includes('class="lbl-feb"'), "and it still wears the FEB tag");

  const withId = ctx.labelMarkup({ name: "SHELF B3", id: "SHELF B3", key: "STORAGE" });
  ok(withId.includes("lbl-rid"), "an id brings the row back");

  const coded = ctx.labelMarkup({ name: "SCAN ME", qr: "HTTPS://FEB-COMPOSITES.WEB.APP/Q/P-SN6-007" });
  ok(coded.includes("<svg"), "qr text draws a code");
}

/* ---------- 6. the impersonation guard ---------- */
console.log("\na custom label cannot pretend to be a record");

// clFindRecord walks DB, so give the sandbox one.
ctx.DB = { molds: [{ id: "MOLD-SN6-004", name: "UT INLET" }], parts: [PART] };
const setCL = o => vm.runInContext(`CL = ${JSON.stringify(Object.assign({
  name: "", id: "", key: "", foot: "", qr: "", media: "dk2210", copies: 1 }, o))}`, ctx);

{
  setCL({});
  ok(/type something/i.test(ctx.clProblem() || ""), "an empty label is refused");

  setCL({ name: "SOLVENT CABINET", key: "FLAMMABLES ONLY" });
  eq(ctx.clProblem(), null, "a plain shelf label is fine");

  setCL({ name: "SPARE MOLD", id: "MOLD-SN6-999" });
  const made = ctx.clProblem() || "";
  ok(made.includes("MOLD-SN6-999"), "an invented id is refused", made.slice(0, 60));
  ok(/nothing in the app answers to it/.test(made), "and the message says why");

  setCL({ name: "UT INLET", id: "MOLD-SN6-004" });
  const real = ctx.clProblem() || "";
  ok(/real record/.test(real), "a REAL id is refused too", real.slice(0, 60));
  ok(/Label button/.test(real), "and points at the record's own Label button");

  // Case and whitespace must not be a way around it.
  setCL({ name: "X", id: "  mold-sn6-999  " });
  ok(/MOLD-SN6-999/.test(ctx.clProblem() || ""), "lowercase and padding do not slip past the guard");

  // A second line that is not id-shaped is exactly what this field is for.
  setCL({ name: "CURE OVEN", id: "DO NOT STACK" });
  eq(ctx.clProblem(), null, "a second line that isn't id-shaped is allowed");

  // And the guard must not fire on ordinary text that merely has a dash in it.
  setCL({ name: "SHELF", id: "ROW B - LOWER" });
  eq(ctx.clProblem(), null, "a dash alone is not an id");
}

/* ---------- 7. a QR that would not scan is explained, not thrown ---------- */
console.log("\nthe custom QR is checked before it is printed");

{
  /* Characters QR alphanumeric mode has no room for at all. Uppercasing has
     already happened by this point, so lowercase is NOT what this catches —
     ? # & _ are. */
  setCL({ name: "LINK", qr: "HTTPS://EXAMPLE.COM/X?UTM=SLACK" });
  const bad = ctx.clProblem() || "";
  ok(/can't carry/.test(bad), "an un-encodable character is caught and named", bad.slice(0, 70));
  ok(bad.includes("?"), "and the offending character is quoted back");

  setCL({ name: "LINK", qr: "HTTPS://FEB-COMPOSITES.WEB.APP/Q/P-SN6-007" });
  eq(ctx.clProblem(), null, "the canonical uppercase form is fine");
  eq(ctx.clAdvice(), null, "and needs no explaining");

  /* Lowercase is UPPERCASED, not refused — that is what keeps a custom code in
     alphanumeric mode, and plain text is the common case. But it is said out
     loud, because a case-sensitive URL path does not survive it. */
  setCL({ name: "LINK", qr: "https://example.com/Docs/Setup" });
  eq(ctx.clProblem(), null, "lowercase is not a refusal");
  const note = ctx.clAdvice() || "";
  ok(/HTTPS:\/\/EXAMPLE.COM\/DOCS\/SETUP/.test(note), "the advisory shows what will actually be encoded", note.slice(0, 90));
  ok(/path/.test(note), "and warns that a path is case-sensitive");

  setCL({ name: "LABEL", qr: "hello world" });
  ok(/uppercased/.test(ctx.clAdvice() || ""), "plain lowercase text gets the shorter note");

  /* Long enough that the modules get finer than a phone camera can resolve at
     21.4mm. The cliff is 126 characters at ECC Q; the field allows 200 SO THAT
     this guard is reachable — capped at 47 it was exactly v3 capacity and could
     never fire, which is how it shipped dead the first time. Nothing about the
     printed label looks wrong when a code is too dense, which is the whole
     reason it is arithmetic and not eyeballing. */
  setCL({ name: "LINK", qr: "A".repeat(109) });
  eq(ctx.clProblem(), null, "109 characters still scans at 21.4mm");
  setCL({ name: "LINK", qr: "A".repeat(126) });
  const dense = ctx.clProblem() || "";
  ok(/mm per module/.test(dense), "126 is refused on density", dense.slice(0, 90));

  // And the preview must not draw a code the print would drop.
  ok(!ctx.clMarkup().includes("<svg"), "a code that would not scan is not previewed either");
}

/* ---------- 8. the media registry ---------- */
console.log("\nmedia keys");

{
  const opts = ctx.labelMediaOptions();
  const keys = opts.map(o => o[0]);
  ok(keys.includes("5161") && keys.includes("5522"), "the Avery sheets are still offered");
  for (const k of Object.keys(ROLLS)) ok(keys.includes(k), `${k} is offered`);
  eq(keys[0], "5161", "the historical default is first in the list");
  for (const [k, name] of opts) ok(!!name && name === ctx.labelMediaName(k), `${k} has a name`);
  ok(ctx.isRollMedia("dk2210") && !ctx.isRollMedia("5161"), "rolls and sheets are told apart");
  ok(!ctx.labelMediaKnown("dk9999"), "an unknown key is unknown");

  /* No localStorage and no team default in this sandbox, which is the state a
     brand-new device is in. It has to land on the Avery sheet: that is the
     path that works with no hardware, and CS-001 §7.8 calls it the documented
     fallback. A preference lookup must never be why a label fails to preview. */
  eq(ctx.labelMedia(), "5161", "with nothing configured, the sheet is the default");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
