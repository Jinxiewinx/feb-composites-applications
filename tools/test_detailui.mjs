/* test_detailui.mjs — the detail pages, POPULATED, measured on a phone.
 *
 * WHY THIS EXISTS
 * tools/test_appui.mjs audits eleven tabs at four widths and passes clean. It
 * also never opens a record, and every fixture it renders has `comments: []`,
 * no `docs` and no `files`. So the thing Simon actually reported — open a work
 * order that has comments and linked documents on a phone, and the page runs
 * off the side of the screen, the browser zooms out to fit it, and text clips —
 * was invisible to the suite by construction. An empty thread cannot overflow.
 *
 * This is the missing half: lib/fixtures-content.mjs fills those fields with
 * the shapes that actually break a narrow layout (a bare 120-character Drive
 * URL, an underscore-joined CAD filename, a 600-character single-paragraph
 * update, a pasted six-column table, a code block), then every detail page is
 * opened and measured.
 *
 *   node tools/test_detailui.mjs
 *   node tools/test_detailui.mjs --view wo-detail
 *   node tools/test_detailui.mjs --width 393
 *   node tools/test_detailui.mjs --shots /tmp/shots     also write PNGs
 *
 * WHAT IT ASSERTS, and why each one is its own check
 *   page h-overflow   the document scrolling sideways IS the zoom-out. Mobile
 *                     Safari fits the layout viewport to the widest content, so
 *                     one 120-character URL shrinks the whole page.
 *   spills            an element past the right edge, named, so the fix has an
 *                     address. Excludes anything inside a deliberate scroller.
 *   clipping          overflow:hidden with content wider than the box AND no
 *                     text-overflow:ellipsis. Ellipsis is a designed truncation
 *                     and passes; a hard cut with no affordance does not.
 *   runaway height    one comment taller than three phone screens means the
 *                     text is wrapping one or two words per line, which is the
 *                     "long messages split over many lines" half of the report.
 *   tap targets       same 40px floor test_appui.mjs uses, applied to the
 *                     controls that only exist once a record has content: the
 *                     per-comment edit and delete buttons, Open on a doc row.
 *
 * Needs Playwright, same as the other browser tests, and skips loudly without
 * it. Nothing here touches Firebase.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serveApp, loadChromium, skipMessage } from "./lib/browser.mjs";
import { APPLY_FIXTURES } from "./lib/fixtures.mjs";
import { APPLY_CONTENT } from "./lib/fixtures-content.mjs";

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; return; }
  fail++;
  failures.push(`${name}${detail ? " — " + detail : ""}`);
  console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`);
};

/* Three narrow widths and one wide control. 320 is the smallest phone still in
   use (iPhone SE 1st gen, and the width Chrome's device toolbar defaults to for
   "Galaxy Fold" folded); 393 is an iPhone 15; 430 is a 15 Pro Max. The wide one
   is here so a failure can be read as "narrow only" or "everywhere", which is
   the difference between a media query bug and a missing wrap rule. */
const WIDTHS = [
  { w: 320, h: 780, id: "320", coarse: true },
  { w: 393, h: 852, id: "393", coarse: true },
  { w: 430, h: 932, id: "430", coarse: true },
  { w: 1440, h: 1000, id: "1440", coarse: false },
];

/* Each view names the tab, how to get into it, and what it is for. `open` runs
   in the page after the tab is set. `needs` is a string that MUST appear in
   main — per view rather than one global rule, because "populated" means a
   different thing on each: a thread on a work order, a linked document on the
   weekly plan, a pinned one on the shelf. A single shared token would either
   miss a view or exempt one, and an exempted view is one that passes every
   check below while rendering nothing. Kept declarative so adding a populated
   surface is one row. */
const VIEWS = [
  { id: "wo-detail", tab: "workorders", what: "a work order with notes, documents and files",
    open: `openRecord("workorders", (DB.workOrders[0] || {}).id)`, needs: "inHg" },
  { id: "wo-detail-edit", tab: "workorders", what: "the same work order in edit mode",
    open: `openRecord("workorders", (DB.workOrders[0] || {}).id); view.edit = true; render()`, needs: "inHg" },
  { id: "part-detail", tab: "parts", what: "a part with a comment thread, documents and files",
    open: `openRecord("parts", (DB.parts[0] || {}).id)`, needs: "inHg" },
  { id: "ticket-detail", tab: "projects", what: "a ticket with a comment thread, documents and files",
    open: `openRecord("projects", (DB.projects[0] || {}).id)`, needs: "inHg" },
  { id: "budget-detail", tab: "budget", what: "a purchase with a long note",
    open: `openRecord("budget", (DB.budget[0] || {}).id)`, needs: "inHg" },
  { id: "weekplan", tab: "weekplan", what: "the weekly plan with documents linked",
    needs: "CAM notes" },
  { id: "documents", tab: "documents", what: "the documents shelf, with pinned links",
    needs: "CAM notes" },
  { id: "dashboard", tab: "dashboard", what: "the dashboard, with populated records behind it",
    needs: "" },
];

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the populated detail pages")); process.exit(0); }

const STUB = `
window.fb = {
  state: "ready",
  user: { uid: "u1", email: "starbuck@berkeley.edu", name: "Simon Starbuck" },
  roster: { role: "lead", name: "Simon Starbuck", email: "starbuck@berkeley.edu" },
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
${APPLY_CONTENT}
window.onFbChange("ready");
/* fb.state is "ready" from the first line of this stub, because the app reads
   it during boot — so waiting on it proves nothing and the audit ran against a
   half-seeded database. That is not hypothetical: it is why the first run of
   this file reported "no populated content" on four views whose fixtures were
   fine. Wait on this instead. */
window.__fixturesReady = true;
`;

/* One pass in the page. Same shape as test_appui.mjs's AUDIT — plain data out,
   assertions in node — so a failure line carries the number it measured.
   One template literal: no backticks below this line. */
const AUDIT = `(() => {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const main = document.getElementById("main");
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const name = (el) => {
    const c = el.className && el.className.baseVal === undefined ? String(el.className) : "";
    return (el.tagName.toLowerCase() + (c ? "." + c.trim().split(/\\s+/).join(".") : "")).slice(0, 52);
  };
  /* Which of the three hostile fixture tokens is inside this element, if any.
     Turns "something spilled" into "the bare Drive URL spilled", which is the
     difference between a bug report and a fix. */
  const TOKENS = {
    url: "drive.google.com/file/d/1aBcDeFg",
    cad: "SN6_Undertray_Diffuser_MoldHalf_A",
    word: "polyoxymethylene-reinforced-toolingboard",
  };
  const blame = (el) => {
    const t = el.textContent || "";
    return Object.keys(TOKENS).filter(k => t.includes(TOKENS[k])).join("+") || "";
  };

  const isScroller = (el) => {
    const ox = getComputedStyle(el).overflowX;
    return (ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1;
  };
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
      if (p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };

  const all = [...main.querySelectorAll("*")].filter(vis);

  /* Off the right edge, and not inside something that scrolls on purpose. */
  const spills = all
    .filter(el => !inScroller(el))
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(o => o.r.right > vw + 1 || o.r.left < -1)
    .map(o => ({ cls: name(o.el), right: Math.round(o.r.right), left: Math.round(o.r.left), why: blame(o.el) }));

  /* Cut off with no affordance: the box hides its overflow, the content is
     wider than the box, and nothing tells the reader there is more. A designed
     ellipsis truncation is exempt — that is a decision, not a defect. A
     deliberate horizontal scroller is exempt for the same reason. */
  const clipped = all
    .filter(el => {
      /* A text input whose value is longer than the box is not clipped, it is
         a text input; you scroll it by typing in it. Same for a textarea and a
         select. And .vh is the screen-reader-only class, which is 1px by
         design and would report every label in the app. */
      if (/^(input|textarea|select)$/i.test(el.tagName)) return false;
      if (el.classList.contains("vh")) return false;
      const cs = getComputedStyle(el);
      if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") return false;
      if (cs.textOverflow === "ellipsis") return false;
      return el.scrollWidth > el.clientWidth + 4;
    })
    .map(el => ({ cls: name(el), over: el.scrollWidth - el.clientWidth, why: blame(el),
      t: (el.textContent || "").trim().slice(0, 30) }));

  /* Anything that scrolls sideways, reported not asserted: a wide pasted table
     inside .tblwrap is the right answer, a .comment that scrolls is not. */
  const scrollers = all.filter(isScroller)
    .map(el => ({ cls: name(el), over: el.scrollWidth - el.clientWidth }));

  /* Runaway height. Measured on the containers that hold user text, because a
     tall PAGE is fine — a tall single comment is text wrapping two words to a
     line. Reported with its text length so the ratio is judgable: 600
     characters in 400px is prose, 600 characters in 2000px is a column one
     word wide. */
  const blocks = [...main.querySelectorAll(".comment, .doclink, .fileitem, .richfield, .prose, .step, .gitem, .docrow")]
    .filter(vis)
    .map(el => ({ cls: name(el), h: Math.round(el.getBoundingClientRect().height),
      chars: (el.textContent || "").trim().length }))
    .filter(o => o.chars > 0)
    .sort((a, b) => b.h - a.h);

  /* Tap targets that only exist on a populated record.

     Leaf controls only. An <a> wrapping a <button> is the shape docLinkRow
     uses for Open, and the anchor's own box is one line-box tall while the
     40px button inside it is what a finger lands on — measuring the wrapper
     reported "Open 14px" on every doc row in the app and none of them were
     small. Text links inside .prose are exempt for the opposite reason: a link
     in the middle of a sentence cannot be 40px tall without breaking the
     sentence, and nobody expects it to be. */
  const targets = [...main.querySelectorAll(".comment button, .doclink button, .doclink a, .fileitem a, .fileitem button, .filegrid button, .docrow button")]
    .filter(vis)
    .filter(el => el.children.length === 0)
    .filter(el => !el.closest(".prose"))
    .map(el => ({ t: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28),
      h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }));

  /* Did the populated content actually land? Every check below is vacuous if
     the fixtures did not apply, and a page with nothing on it passes them all. */
  const txt = main.textContent || "";

  return {
    vw, vh,
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    spills, clipped, scrollers, targets,
    blocks: blocks.slice(0, 8),
    mainText: txt.trim().length,
  };
})()`;

const only = arg("view", "");
const views = only ? VIEWS.filter(v => v.id === only) : VIEWS;
const widths = arg("width", "") ? WIDTHS.filter(v => v.id === arg("width", "")) : WIDTHS;
const SHOTS = arg("shots", "");
if (SHOTS) await mkdir(SHOTS, { recursive: true });

const { server, port } = await serveApp({});
const browser = await chromium.launch();
const report = [];

for (const vp of widths) {
  for (const v of views) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 1,
      isMobile: vp.coarse,
      hasTouch: vp.coarse,
    });
    await ctx.route("**/fb.js", r => r.fulfill({ body: STUB, contentType: "text/javascript" }));

    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
    page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160)); });

    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction("window.__fixturesReady === true", null, { timeout: 20000 });
    const seedError = await page.evaluate("window.__seedError || null");
    if (seedError) throw new Error(`app booted with an empty database: ${seedError}`);

    await page.evaluate(`setTab(${JSON.stringify(v.tab)});`);
    if (v.open) await page.evaluate(v.open);
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await page.waitForTimeout(300);

    const a = await page.evaluate(AUDIT);
    const at = `${v.id}/${vp.id}`;
    report.push({ at, ...a });

    ok(`${at} renders`, a.mainText > 20, `only ${a.mainText} chars in main`);
    if (v.needs) {
      const found = await page.evaluate(
        `(document.getElementById("main").textContent || "").includes(${JSON.stringify(v.needs)})`);
      ok(`${at} fixtures applied`, found, `"${v.needs}" is not on the page`);
    }
    ok(`${at} no errors`, errors.length === 0, [...new Set(errors)].slice(0, 2).join(" | "));

    /* The zoom-out. Everything else on this page is cosmetic next to it. */
    ok(`${at} no page h-overflow`, a.docScrollW <= a.docClientW + 1,
      `document is ${a.docScrollW}px wide in ${a.docClientW}px`);

    ok(`${at} nothing off-screen`, a.spills.length === 0,
      a.spills.slice(0, 3).map(s => `${s.cls} ${s.left}..${s.right}${s.why ? " [" + s.why + "]" : ""}`).join(", "));

    ok(`${at} nothing clipped`, a.clipped.length === 0,
      a.clipped.slice(0, 3).map(c => `${c.cls} +${c.over}px${c.why ? " [" + c.why + "]" : ""}`).join(", "));

    /* Three screens. A comment that long on a phone is not a long comment, it
       is a broken wrap. */
    const tall = a.blocks.filter(b => b.h > vp.h * 3);
    ok(`${at} no runaway height`, tall.length === 0,
      tall.slice(0, 2).map(b => `${b.cls} ${b.h}px for ${b.chars} chars`).join(", "));

    if (vp.coarse) {
      const small = a.targets.filter(t => t.h < 40);
      ok(`${at} tap targets`, small.length === 0,
        small.slice(0, 3).map(t => `"${t.t}" ${t.h}px`).join(", "));
    }

    /* The ticket rail's disclosure, both directions. It is the one thing here
       that is a behaviour rather than a measurement, and it can break silently
       in two opposite ways: shipping `open` again (the phone gets five screens
       of metadata before the discussion, which is how it shipped) or losing the
       901px force-show (a desktop gets a hidden summary AND a closed rail, so
       the ticket's metadata is unreachable at any width). Neither shows up in a
       screenshot of the other width. */
    if (v.id === "ticket-detail") {
      const rail = await page.evaluate(() => {
        const d = document.querySelector("#main details.tkmeta-fold");
        if (!d) return "no rail";
        const kid = [...d.children].find(el => el.tagName !== "SUMMARY");
        const sum = d.querySelector("summary");
        return [
          d.hasAttribute("open") ? "open" : "closed",
          kid && kid.getBoundingClientRect().height > 0 ? "shown" : "hidden",
          sum && getComputedStyle(sum).display !== "none" ? "summary" : "no-summary",
        ].join("/");
      });
      ok(`${at} rail disclosure`,
        vp.w <= 900 ? rail === "closed/hidden/summary" : rail === "closed/shown/no-summary", rail);
    }

    if (SHOTS) {
      await page.screenshot({ path: join(SHOTS, `${v.id}-${vp.id}.png`), fullPage: true });
    }

    await ctx.close();
  }
}

await browser.close();
server.close();

if (SHOTS) {
  await writeFile(join(SHOTS, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nshots + report.json in ${SHOTS}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
