/* test_appui.mjs — the app's layout, measured, on every tab at every width.
 *
 * WHY THIS EXISTS
 * tools/shoot_ui.mjs photographs the app so a person can say "that's ugly".
 * This is the other half: the things that are ugly AND are numbers. Does a tab
 * run off the side of a phone. Is a button too small to hit with a glove on.
 * Did a colour get hardcoded so it never changes in dark mode. Is 27% of a
 * 1920px monitor empty.
 *
 * Eleven tabs x four widths x two themes is 88 renders, and a check that only
 * runs on Parts is a check that misses Weekly Plan. So everything here is
 * per-tab by construction: one page.evaluate() returns a flat facts object,
 * and each fact becomes one ok() with its measured value attached, so a
 * failure line tells you what it found without a second run.
 *
 *   node tools/test_appui.mjs
 *   node tools/test_appui.mjs --tab timeline      one tab, all widths
 *   node tools/test_appui.mjs --width 393         one width, all tabs
 *
 * Needs Playwright, same as the other browser tests, and skips loudly without
 * it. Nothing here touches Firebase: the app boots on tools/lib/fixtures.mjs.
 */

import { serveApp, loadChromium, skipMessage } from "./lib/browser.mjs";
import { APPLY_FIXTURES } from "./lib/fixtures.mjs";

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`); }
};

const TABS = ["dashboard", "workorders", "parts", "stock", "projects",
  "timeline", "weekplan", "budget", "documents", "reports", "people"];

/* The same four widths shoot_ui.mjs photographs, so a failing number and the
   picture of it always come from the same layout. `coarse` drives the tap
   target rule rather than width, matching the stylesheet's own
   @media (pointer: coarse) block — a touchscreen at any width gets the bigger
   target, and that is what should be measured. */
const WIDTHS = [
  { w: 1920, h: 1080, id: "1920", coarse: false },
  { w: 1440, h: 1000, id: "1440", coarse: false },
  { w: 900, h: 1100, id: "900", coarse: false },
  { w: 393, h: 852, id: "393", coarse: true },
];

const tabs = arg("tab", "") ? TABS.filter(t => t === arg("tab", "")) : TABS;
const widths = arg("width", "") ? WIDTHS.filter(v => v.id === arg("width", "")) : WIDTHS;

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the app's layout")); process.exit(0); }

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
window.onFbChange("ready");
`;

/* Everything measured in one pass in the page, returned as plain data.
   Deliberately NOT a list of pass/fail booleans: the assertions live in node
   where a failure can print the number it saw, and the number is what tells
   you whether a 41px button is a near miss or a 12px one is a real bug.

   One template literal, so: no backticks below this line. */
const AUDIT = `(() => {
  const vw = document.documentElement.clientWidth;
  const main = document.getElementById("main");
  const topbar = document.querySelector("header.topbar");
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };

  /* Anything inside main that scrolls sideways. A nested scroller is not
     automatically wrong (a wide detail table is a reasonable answer), so this
     is reported with its overflow so the caller can judge, not asserted here. */
  const scrollers = [...main.querySelectorAll("*")]
    .filter(el => el.scrollWidth > el.clientWidth + 1 && vis(el))
    .map(el => ({
      cls: el.className && el.className.baseVal === undefined ? String(el.className).slice(0, 40) : el.tagName,
      over: el.scrollWidth - el.clientWidth,
    }));

  /* Content wider than the window. Excludes elements INSIDE a scroller, since
     those are wide on purpose and their container already owns the problem. */
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.scrollWidth > p.clientWidth + 1) return true;
      if (getComputedStyle(p).overflowX === "auto" || getComputedStyle(p).overflowX === "scroll") return true;
    }
    return false;
  };
  const spills = [...main.querySelectorAll("*")]
    .filter(el => vis(el) && !inScroller(el))
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(o => o.r.right > vw + 1 || o.r.left < -1)
    .map(o => ({
      cls: String(o.el.className || o.el.tagName).slice(0, 40),
      right: Math.round(o.r.right), left: Math.round(o.r.left),
    }));

  /* Tap targets. Only things a finger is meant to hit, only where they are
     actually visible. Height is what fails in practice; a control can be
     narrow and still hittable if it is tall. */
  const targets = [...document.querySelectorAll("#main button, #main a[href], #main select, #main input:not([type=hidden]), header.topbar button")]
    .filter(vis)
    .map(el => ({
      t: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28),
      h: Math.round(el.getBoundingClientRect().height),
      box: el.type === "checkbox" || el.type === "radio",
    }));

  /* Type that has shrunk below the app's own floor. 11px is the smallest size
     the stylesheet deliberately uses for text you READ; anything under that is
     a mistake or an inherited shrink. Text nodes only — an empty span with a
     small font-size is not a legibility problem.

     Three exemptions, all of them things the design system defines below the
     floor on purpose and none of them prose: kbd (10.5px, and .keyhint is
     hidden below 900 anyway), .kind (a 10px uppercase micro-tag, spelled out
     in components.css), and avatar monograms, whose type is set proportional
     to the circle by avatar() in core.js. Exempting them here rather than
     raising the floor keeps the check sharp for the case it is for: body text
     that got small by accident. */
  const EXEMPT = "kbd, .kind, .kindbadge, .avatar, .avatar *, .stage-bar, .stage-bar *";
  const tiny = [...main.querySelectorAll("*")]
    .filter(el => vis(el) && el.children.length === 0 && (el.textContent || "").trim().length > 1)
    .filter(el => !el.matches(EXEMPT) && !el.closest(EXEMPT))
    .map(el => ({ t: el.textContent.trim().slice(0, 24), px: parseFloat(getComputedStyle(el).fontSize) }))
    .filter(o => o.px < 11);

  /* Sticky things must not pin above the topbar's bottom edge, or they slide
     under opaque chrome and become unreachable. */
  const tbBottom = topbar ? Math.round(topbar.getBoundingClientRect().bottom) : 0;
  const stuck = [...main.querySelectorAll("*")]
    .filter(el => vis(el) && getComputedStyle(el).position === "sticky")
    .map(el => ({ cls: String(el.className || el.tagName).slice(0, 30), top: Math.round(el.getBoundingClientRect().top) }))
    .filter(o => o.top < tbBottom - 1);

  /* Theme proof. These are read in both themes and compared in node: a value
     identical in light and dark is a colour that was hardcoded past the token
     layer. Sampled off real rendered elements rather than :root, because a
     token can be correct while the rule using it is not. */
  /* The first element in main that actually paints a surface. Naming one
     selector does not work: table.list loses its background entirely when it
     card-stacks below 900, .pitem is transparent on a wide screen, and Reports
     has none of them — so a fixed pick samples "transparent" and the check
     compares nothing against nothing in both themes and passes. Scan for the
     first opaque background instead, and report when there is none so the
     caller can skip rather than assert on air. */
  const opaqueSurface = () => {
    for (const el of main.querySelectorAll(".card, table.list, .col, .pcard, .stat-tile, .pitem, .docrow, .carcard")) {
      if (!vis(el)) continue;
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(bg)) return bg;
    }
    return "";
  };

  const mr = main.getBoundingClientRect();
  const mcs = getComputedStyle(main);
  return {
    vw,
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    /* main's CONTENT box, padding removed: the honest measure of how much of
       the window the app is actually putting information into. */
    contentW: Math.round(mr.width - parseFloat(mcs.paddingLeft) - parseFloat(mcs.paddingRight)),
    sidebarW: Math.round((document.querySelector("nav.sidebar") || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width),
    topbarH: getComputedStyle(document.documentElement).getPropertyValue("--topbar-h").trim(),
    inlineStyled: main.querySelectorAll("[style]").length,
    scrollers, spills, tiny, stuck,
    targets: targets.filter(t => t.h > 0),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    cardBg: opaqueSurface(),
    inkColor: getComputedStyle(document.body).color,
    tokenBlue: getComputedStyle(document.documentElement).getPropertyValue("--blue").trim(),
    fontFamily: getComputedStyle(document.body).fontFamily,
    mainText: (main.textContent || "").trim().length,
  };
})()`;

const { server, port } = await serveApp({});
const browser = await chromium.launch();

for (const vp of widths) {
  for (const tab of tabs) {
    const seen = {};   // theme -> facts, so the two themes can be compared
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        deviceScaleFactor: 1,
        isMobile: vp.coarse,
        hasTouch: vp.coarse,
      });
      await ctx.route("**/fb.js", r => r.fulfill({ body: STUB, contentType: "text/javascript" }));
      await ctx.addInitScript(`try { localStorage.setItem("feb-theme", ${JSON.stringify(theme)}); } catch (e) {}`);

      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
      page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160)); });
      page.on("requestfailed", r => errors.push("request: " + r.url().split("/").pop()));

      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
      await page.waitForFunction("window.fb && fb.state === 'ready'", null, { timeout: 20000 });
      const seedError = await page.evaluate("window.__seedError || null");
      if (seedError) throw new Error(`app booted with an empty database: ${seedError}`);

      await page.evaluate(`setTab(${JSON.stringify(tab)});`);
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await page.waitForFunction(
        () => !/Loading documents/.test(document.getElementById("main").textContent),
        null, { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(250);

      const a = await page.evaluate(AUDIT);
      seen[theme] = a;
      const at = `${tab}/${vp.id}/${theme}`;

      /* The tab rendered something at all. Everything below is meaningless if
         it did not, and an empty main reads as "all checks passed". */
      ok(`${at} renders`, a.mainText > 20, `only ${a.mainText} chars in main`);
      ok(`${at} no errors`, errors.length === 0, [...new Set(errors)].slice(0, 2).join(" | "));

      /* The page itself never scrolls sideways. A nested scroller is allowed;
         the document scrolling is the bug people report as "it's broken on my
         phone". */
      ok(`${at} no page h-overflow`, a.docScrollW <= a.docClientW + 1,
        `document is ${a.docScrollW}px wide in ${a.docClientW}px`);

      ok(`${at} nothing off-screen`, a.spills.length === 0,
        a.spills.slice(0, 2).map(s => `${s.cls} at ${s.left}..${s.right}`).join(", "));

      ok(`${at} type >= 11px`, a.tiny.length === 0,
        a.tiny.slice(0, 2).map(t => `"${t.t}" at ${t.px}px`).join(", "));

      ok(`${at} sticky below topbar`, a.stuck.length === 0,
        a.stuck.slice(0, 2).map(s => `${s.cls} top ${s.top}`).join(", "));

      ok(`${at} --topbar-h measured`, /^\d+(\.\d+)?px$/.test(a.topbarH), `is "${a.topbarH}"`);

      /* The design system is actually loaded and applied, not merely present.
         Checked per tab because a tab that fails to render its own styles
         still inherits the shell's. */
      ok(`${at} tokens applied`, a.tokenBlue === "#003262", `--blue is "${a.tokenBlue}"`);
      ok(`${at} brand font`, /Inter/.test(a.fontFamily), a.fontFamily.slice(0, 40));

      if (vp.coarse) {
        /* 40px for anything whose height CSS can set, 24px for a checkbox or
           radio, whose box is its own size and cannot reach 40 without looking
           broken. The row around it carries the rest of the target; see the
           pointer:coarse block in index.html. */
        const small = a.targets.filter(t => t.h < (t.box ? 24 : 40));
        ok(`${at} tap targets`, small.length === 0,
          small.slice(0, 3).map(t => `"${t.t}" ${t.h}px${t.box ? " (box)" : ""}`).join(", "));
      }

      /* Space. Only asks the question where there is space to waste: below
         1440 the cap is not the binding constraint. 78% is the bar the 1600px
         cap clears at 1920 (1600 of 1920-216 = 94% of the available width,
         with the gutter that keeps a table row scannable). */
      if (vp.w >= 1920) {
        const avail = a.vw - a.sidebarW;
        const used = a.contentW / avail;
        ok(`${at} uses the window`, used >= 0.78,
          `${a.contentW}px of ${avail}px available (${Math.round(used * 100)}%)`);
      }

      /* Timeline earns three of its own. It is the tab that was rebuilt, and
         each of these pins a specific thing that was wrong or nearly went
         wrong while rebuilding it. */
      if (tab === "timeline") {
        /* The grid places itself with grid-auto-flow:column over a week-major
           DOM precisely so no renderer has to compute a coordinate. The moment
           one inline style appears here, that has stopped being true. */
        ok(`${at} no inline styles`, a.inlineStyled === 0, `${a.inlineStyled} elements carry style=""`);

        if (!vp.coarse) {
          /* The station rail has to stay put while the weeks scroll past it,
             or you lose which row you are reading — which is the whole reason
             the wide layout pins it. Scroll and measure rather than assert on
             the CSS: `position: sticky` computes fine on an element whose
             ancestor quietly clips it. */
          const pinned = await page.evaluate(() => {
            const g = document.querySelector("#main .tlgrid");
            if (!g || g.scrollWidth <= g.clientWidth + 1) return "n/a";
            const rail = g.querySelector(".tl-strow");
            g.scrollLeft = 0;
            const before = rail.getBoundingClientRect().left;
            g.scrollLeft = 240;
            const after = rail.getBoundingClientRect().left;
            g.scrollLeft = 0;
            return Math.abs(after - before) <= 1 ? "pinned" : `moved ${Math.round(after - before)}px`;
          });
          ok(`${at} station rail pins`, pinned === "pinned" || pinned === "n/a", pinned);
        } else {
          /* Narrow, the same DOM is a stack of week cards. If the grid is
             still a grid down here the phone gets the 1600px layout in a
             393px window. */
          const shape = await page.evaluate(() => {
            const g = document.querySelector("#main .tlgrid");
            return g ? [getComputedStyle(g).display,
              getComputedStyle(g.querySelector(".tl-stations")).display].join("/") : "none";
          });
          ok(`${at} collapses to week cards`, shape === "block/none", shape);
        }

        /* A cell is a <button>, and @media print hides every button in the
           app. Without the counter-rule this tab prints an empty schedule —
           every assignment in the grid is inside one of these. */
        await page.emulateMedia({ media: "print" });
        const printed = await page.evaluate(() => {
          const c = document.querySelector("#main .tl-cell:not(.empty)");
          return c ? getComputedStyle(c).display : "no-cell";
        });
        await page.emulateMedia({ media: "screen" });
        ok(`${at} filled cells survive print`, printed !== "none", `display: ${printed}`);
      }

      await ctx.close();
    }

    /* Both themes rendered: anything that looks identical in both is a colour
       that never reached the token layer. Run once per tab/width rather than
       per theme, since it is a comparison. */
    const at = `${tab}/${vp.id}`;
    ok(`${at} body themes`, seen.light.bodyBg !== seen.dark.bodyBg,
      `both ${seen.light.bodyBg}`);
    ok(`${at} text themes`, seen.light.inkColor !== seen.dark.inkColor,
      `both ${seen.light.inkColor}`);
    if (seen.light.cardBg && seen.dark.cardBg) {
      ok(`${at} surfaces theme`, seen.light.cardBg !== seen.dark.cardBg,
        `both ${seen.light.cardBg}`);
    }
  }
}

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
