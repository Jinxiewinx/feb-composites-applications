/* test_safearea.mjs — does the UI stay out of the notch, the Dynamic Island
 * and the home indicator?
 *
 * WHY THIS EXISTS
 * Reported from a phone: opening the engineering drawings put the print
 * toolbar — Close / Save / Print — under the Dynamic Island. It did, and the
 * cause is deliberate. index.html sets `viewport-fit=cover`, the PWA runs
 * standalone with a translucent status bar, and that is what lets the navy
 * topbar meet the island like a native app instead of sitting under a white
 * letterbox. The price is that EVERY element at a screen edge owns its own
 * inset, and for a long time only two did.
 *
 * THE TRICK THAT MAKES THIS TESTABLE
 * env(safe-area-inset-*) cannot be faked in headless Chromium — there is no
 * emulation switch for it, and a desktop browser always reports 0. But the app
 * does not read env() at the point of use: it reads --sa-t / --sa-r / --sa-b /
 * --sa-l, custom properties that hold the env() values. A custom property CAN
 * be overridden by an injected stylesheet. So this test states "you are an
 * iPhone 15 Pro" in one rule and then measures what the browser actually laid
 * out, which is the same standard test_drawings and test_print_mobile hold
 * themselves to. Asserting that the stylesheet contains the string "env(" would
 * prove nothing about where anything ended up.
 *
 * WHAT IT CHECKS
 *  1. No control or chrome text intrudes into any inset band.
 *  2. The top band is covered by CHROME, not by content — the island should
 *     land on the navy topbar or the dark print toolbar, not on a table row.
 *     "Nothing overlaps" alone would be satisfied by a white gap, which is the
 *     letterboxed look this app deliberately doesn't want.
 *  3. No sticky element hides behind the topbar. This is the invisible one: the
 *     element is on screen and perfectly laid out, just underneath something
 *     opaque, so a screenshot diff and a geometry check both pass.
 *
 *   node tools/test_safearea.mjs
 *   node tools/test_safearea.mjs --shots     # PNGs of whatever failed
 *
 * Needs Playwright; skips loudly without it.
 */

import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serveApp, loadChromium, skipMessage } from "./lib/browser.mjs";

const SHOTS = process.argv.includes("--shots");
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".drawing-shots");

/* Real iPhone 15 Pro values. Portrait puts the island at the top and the home
   indicator at the bottom; rotating moves the island to a SIDE and shortens the
   indicator — which is exactly why an app that only ever handled the top inset
   looks fine in every screenshot anyone takes and still fails in the hand. */
const PROFILES = [
  { id: "portrait", w: 393, h: 852, t: 59, r: 0, b: 34, l: 0 },
  { id: "landscape", w: 852, h: 393, t: 0, r: 59, b: 21, l: 59 },
  /* A Pro Max on its side is 932 CSS px — WIDER than the 900px breakpoint. It
     therefore takes the desktop topbar rule and shows the Parts split, while
     still having a 59px island down one edge. That combination is why the
     insets had to move onto the base rules instead of living in the ≤900
     block, and it is the profile that would have caught the original mistake. */
  { id: "landscape-max", w: 932, h: 430, t: 0, r: 59, b: 21, l: 59 },
];

/* Each state is a string of app JS evaluated in the page — driving the app
   through its own entry points rather than reaching in and rearranging state. */
const STATES = [
  { id: "parts-list", js: `setTab("parts");` },
  { id: "parts-detail", js: `setTab("parts"); openRecord("parts", DB.parts[0] && DB.parts[0].id);` },
  { id: "wo-detail", js: `setTab("workorders"); openRecord("workorders", DB.workOrders[0] && DB.workOrders[0].id);` },
  { id: "drawer-open", js: `setTab("parts"); toggleDrawer();` },
  { id: "modal-open", js: `setTab("parts"); openSearch();` },
  { id: "toast", js: `setTab("parts"); toast("A saved change, bottom right");` },
  /* The undo bar only exists after a stage write, so it has to be provoked —
     without this state nothing renders it and the behind-the-topbar check has
     nothing to bite on. It shipped once pinned at top:0 behind a z-index:5
     topbar, which is precisely the failure this state exists to catch. */
  {
    id: "undo-bar", js: `(() => {
      setTab("parts");
      const p = DB.parts[0];
      openRecord("parts", p.id);
      const i = STAGE_CAD.indexOf(p.cadProgress || STAGE_CAD[0]);
      setPartStage(p.id, "cadProgress", STAGE_CAD[Math.min(STAGE_CAD.length - 1, Math.max(0, i) + 1)]);
    })()`,
  },
  /* The lightbox was never in this list, and it is the one overlay that owns
     the entire screen — bar at the top where the island is, image down to the
     home indicator. Its four controls are also the only way through a set of
     photos, so they have to be reachable on a phone in both orientations. Built
     by hand rather than through a click, so the state does not depend on a
     fixture record happening to carry a photo. */
  {
    id: "lightbox", js: `(() => {
      setTab("parts");
      const host = document.createElement("div");
      host.className = "prose";
      host.innerHTML = '<img src="data:image/svg+xml,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"></svg>') +
        '" alt="mold flange">';
      document.getElementById("main").appendChild(host);
      const img = host.querySelector("img");
      LB_LIST = [img, img];          // two, so the prev/next arrows are shown
      LB_I = 0; LB_RETURN = img;
      document.getElementById("lightbox").classList.add("open");
      lbShow();
    })()`,
  },
  // The reported bug, and its sibling: both printable documents.
  { id: "print-wo", js: `setTab("workorders"); openPrintPreview(DB.workOrders[0] && DB.workOrders[0].id);` },
  {
    id: "print-drawings", js: `(async () => {
      const plan = planMold(boxTris(400, 300, 120), [25.4, 50.8], {});
      plan.id = "SP-SAFE-1"; plan.name = "safe-area fixture";
      DB.stackplans = [plan];
      setTab("stock");
      await openDrawings("SP-SAFE-1");
    })()`,
  },
];

const STUB = `
window.fb = {
  state: "ready",
  user: { uid: "u1", email: "simon@berkeley.edu", name: "Simon Starbuck" },
  roster: { role: "lead", name: "Simon Starbuck", email: "simon@berkeley.edu" },
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
      if (!Array.isArray(arr) || !arr.length) throw new Error(file + " held no records");
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
window.onFbChange("ready");
`;

/* The measurement. Everything returned is a fact about what the browser did.

   Only VISIBLE elements count: a display:none control is not one anybody has to
   reach, and the phone rules hide several deliberately. Elements are also
   skipped if an ancestor is a scroll container that has them clipped — an
   off-screen row inside the parts rail is not "in the notch".

   TOL of 1px absorbs sub-pixel layout; anything real is tens of pixels out. */
const AUDIT = `(() => {
  const TOL = 1;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const css = getComputedStyle(document.documentElement);
  const num = n => parseFloat(css.getPropertyValue(n)) || 0;
  const sa = { t: num("--sa-t"), r: num("--sa-r"), b: num("--sa-b"), l: num("--sa-l") };

  /* A scrim's whole job is to cover the screen, insets included — flagging one
     for reaching the edges would be flagging it for working. */
  const isScrim = el => el.id === "drawer-backdrop" || el.classList.contains("backdrop")
    // The lightbox's scrim and its image stage are both full-bleed by design,
    // and both carry an onclick (tap outside to close), so the audit's
    // onclick selector picks them up. Covering the screen is the job.
    || el.classList.contains("lb-scrim") || el.classList.contains("lb-stage");

  const visible = el => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    // Off-screen in any direction. The closed drawer is the case that matters:
    // it is translateX(-100%), so every nav item sits at a negative x and would
    // otherwise read as a permanent left-inset violation.
    // Inclusive bounds, not strict: the closed drawer lands its right edge at
    // exactly 0, and a strict test called that on-screen.
    // (No backticks in this string — the whole block is a template literal.)
    if (r.top >= vh || r.bottom <= 0 || r.left >= vw || r.right <= 0) return false;
    // Clipped out of a scroller (the parts rail, the modal backdrop).
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflow === "hidden" || ps.overflowY === "auto" || ps.overflowY === "scroll") {
        const pr = p.getBoundingClientRect();
        if (r.bottom < pr.top - 1 || r.top > pr.bottom + 1) return false;
      }
    }
    return true;
  };

  /* Content scrolling UNDER the opaque topbar is the design, not a fault — the
     bar is why the island has something solid to sit on. So an element only
     counts as intruding into the top band if it is the thing you would actually
     touch there. Ask the browser who is on top at that point. */
  const occludedAtTop = el => {
    const r = el.getBoundingClientRect();
    const x = Math.min(vw - 2, Math.max(2, r.left + Math.min(r.width, 40) / 2));
    const y = Math.max(2, Math.min(sa.t / 2, r.bottom - 1));
    const hit = document.elementFromPoint(x, y);
    return !!hit && hit !== el && !el.contains(hit);
  };

  /* The home indicator is a thin overlay, not a wall: content that can be
     SCROLLED clear of it is fine, and every scroller in the app now carries
     bottom-inset padding so it can be. What must never sit in the bottom band
     is chrome that cannot move — a toast, a sticky footer. */
  const canScrollClearOfBottom = el => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      const scrolls = ps.overflowY === "auto" || ps.overflowY === "scroll";
      if (scrolls && parseFloat(ps.paddingBottom) >= sa.b - 1) return true;
    }
    const bodyPad = parseFloat(getComputedStyle(document.querySelector("main") || document.body).paddingBottom);
    const s = getComputedStyle(el);
    if (s.position === "fixed" || s.position === "sticky") return false;
    return bodyPad >= sa.b - 1;
  };

  const label = el => (el.getAttribute("aria-label") || el.textContent || el.tagName)
    .replace(/\\s+/g, " ").trim().slice(0, 42) || el.tagName;

  const intrusions = [];
  document.querySelectorAll("button, a[href], input, select, textarea, [onclick], h1, h2, .kbd, kbd").forEach(el => {
    if (!visible(el) || isScrim(el)) return;
    const r = el.getBoundingClientRect();
    const hit = [];
    if (sa.t && r.top < sa.t - TOL && !occludedAtTop(el)) hit.push("top");
    if (sa.b && r.bottom > vh - sa.b + TOL && !canScrollClearOfBottom(el)) hit.push("bottom");
    if (sa.l && r.left < sa.l - TOL) hit.push("left");
    if (sa.r && r.right > vw - sa.r + TOL) hit.push("right");
    if (hit.length) intrusions.push({ what: label(el), edges: hit.join("+"),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] });
  });

  /* Who owns the top band? Sample across the width rather than at one point —
     the island is centred, so a single centre probe would miss a bar that only
     covers the left half. */
  let topOwners = [];
  if (sa.t) {
    for (const frac of [0.15, 0.35, 0.5, 0.65, 0.85]) {
      const el = document.elementFromPoint(Math.round(vw * frac), Math.max(2, Math.round(sa.t / 2)));
      topOwners.push(el ? (el.closest("header.topbar") ? "topbar"
        : el.closest(".pv-bar") ? "pv-bar"
        : el.closest("nav.sidebar") ? "sidebar"
        : el.closest("#modal") ? "modal"
        : el.closest("#lightbox") ? "lightbox"
        : el.id === "drawer-backdrop" ? "scrim"
        : (el.id || el.className || el.tagName).toString().slice(0, 30)) : "none");
    }
  }

  /* Sticky things must clear the topbar, not slide under it. */
  const tb = document.querySelector("header.topbar");
  const tbBottom = tb && getComputedStyle(tb).display !== "none" ? tb.getBoundingClientRect().bottom : 0;
  const stuck = [];
  document.querySelectorAll(".undobar, .jumpbar, .mdindex").forEach(el => {
    if (!visible(el)) return;
    const s = getComputedStyle(el);
    if (s.position !== "sticky") return;
    const r = el.getBoundingClientRect();
    stuck.push({ what: el.className.split(" ")[0], top: Math.round(r.top),
      z: s.zIndex, hidden: r.top < tbBottom - 1 });
  });

  return { vw, vh, sa, intrusions, topOwners, tbBottom: Math.round(tbBottom), stuck,
    topbarH: css.getPropertyValue("--topbar-h").trim() };
})()`;

/* ---------- run ---------- */
const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the safe-area layout")); process.exit(0); }

const { server, port } = await serveApp({});
const browser = await chromium.launch();
let pass = 0, fail = 0;

for (const vp of PROFILES) {
  console.log(`\n${vp.id} — ${vp.w}x${vp.h}, insets ${vp.t}/${vp.r}/${vp.b}/${vp.l}:`);
  for (const st of STATES) {
    const findings = [];
    const check = (cond, kind, detail) => { if (!cond) findings.push(`${kind}: ${detail}`); };
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true,
    });
    await ctx.route("**/fb.js", r => r.fulfill({ body: STUB, contentType: "text/javascript" }));
    /* "You are an iPhone." Injected before any app CSS can matter, at :root, so
       it beats the env() defaults on specificity-free ground (same selector,
       later sheet). */
    await ctx.addInitScript(`
      addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = ":root { --sa-t: ${vp.t}px; --sa-r: ${vp.r}px; --sa-b: ${vp.b}px; --sa-l: ${vp.l}px; }";
        document.head.appendChild(s);
      });
    `);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));

    try {
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
      await page.waitForFunction("window.fb && fb.state === 'ready'", null, { timeout: 20000 });
      const seedError = await page.evaluate("window.__seedError || null");
      if (seedError) throw new Error(`app booted with an empty database: ${seedError}`);

      await page.evaluate(st.js);
      await page.waitForTimeout(500);
      // Scroll a little: sticky elements only reveal their pinned position once
      // there is something to stick to.
      await page.evaluate("window.scrollTo(0, 400)");
      await page.waitForTimeout(200);

      const a = await page.evaluate(AUDIT);

      // 1. Nothing in the bands.
      a.intrusions.slice(0, 6).forEach(i =>
        check(false, "in-the-inset", `"${i.what}" crosses the ${i.edges} inset — rect ${i.rect.join(",")}`));
      check(a.intrusions.length === 0, "intrusion-count", `${a.intrusions.length} element(s) in an inset band`);

      // 2. The island lands on chrome, not on content. Only meaningful where
      //    there IS a top inset — in landscape the island is on the side.
      if (vp.t) {
        const bad = a.topOwners.filter(o => !["topbar", "pv-bar", "sidebar", "modal", "scrim", "lightbox"].includes(o));
        check(bad.length === 0, "top-band-not-chrome",
          `the island sits on [${a.topOwners.join(", ")}] — it should land on the topbar or the print bar`);
      }

      // 3. Nothing sticky pinned behind the topbar.
      a.stuck.filter(s => s.hidden).forEach(s =>
        check(false, "behind-the-topbar", `.${s.what} pinned at ${s.top}px, topbar ends at ${a.tbBottom}px (z ${s.z})`));

      // The measured chrome height must actually be published, or every sticky
      // offset silently falls back to its desktop guess.
      check(/^\d+px$/.test(a.topbarH || ""), "topbar-h-unset", `--topbar-h is "${a.topbarH}"`);

      errors.forEach(e => findings.push("page-error: " + e.slice(0, 160)));
    } catch (e) {
      findings.push("threw: " + (e && e.message));
    }

    if (findings.length) {
      fail++;
      console.log(`FAIL  ${st.id}`);
      findings.slice(0, 8).forEach(f => console.log("        " + f));
      if (findings.length > 8) console.log(`        … and ${findings.length - 8} more`);
      if (SHOTS) {
        await mkdir(SHOT_DIR, { recursive: true });
        await page.screenshot({ path: join(SHOT_DIR, `safearea-${st.id}-${vp.id}.png`) });
      }
    } else {
      pass++;
      console.log(`  ok  ${st.id}`);
    }
    await ctx.close();
  }
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
if (SHOTS && fail) console.log(`images in ${SHOT_DIR}`);
process.exit(fail ? 1 : 0);
