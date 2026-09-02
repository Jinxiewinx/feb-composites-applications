#!/usr/bin/env node
/* Tests for the public team website in "09 Website/site".

   The site is static HTML with no framework, so the things that can silently
   break are not logic bugs — they are the design system failing to load, a
   scroll reveal leaving content invisible, an easter egg wired to a selector
   that no longer exists, or a fixed-width grid overflowing a phone. All of
   those need a real browser, so this test skips cleanly when Playwright is
   absent rather than pretending to pass.

   Run from SN6 Resources/:  node tools/test_website.mjs
   (run `node "09 Website/build.mjs"` first — the test needs site/_ds/feb/) */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { loadChromium, serveDir, skipMessage } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "09 Website", "site");
const PAGES = ["index", "about", "cars", "subteams", "sponsors", "join", "news", "contact"];
const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`); }
};

if (!existsSync(join(SITE, "_ds", "feb", "styles.css"))) {
  console.error('The design system is not built. Run: node "09 Website/build.mjs"');
  process.exit(1);
}

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the team website")); process.exit(0); }

const { server, port } = await serveDir(SITE);
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();

/* Walk the whole page so every IntersectionObserver fires. The 220ms dwell is
   deliberate: the observer is async, and a faster sweep outruns it and reports
   reveals as stuck when they are only late. */
async function fullScroll(page) {
  await page.evaluate(async () => {
    const step = Math.round(innerHeight * 0.6);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 220));
    }
    await new Promise(r => setTimeout(r, 400));
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(600);
}

// ── every page: design system loaded, nothing broken, nothing invisible ─────
console.log("pages render with the design system applied");
for (const name of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [], failed = [];
  page.on("pageerror", e => errs.push(String(e).split("\n")[0]));
  page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("requestfailed", r => failed.push(r.url().replace(base, "")));

  await page.goto(`${base}/${name}.html`, { waitUntil: "networkidle" });
  await fullScroll(page);

  const i = await page.evaluate(() => ({
    blue: getComputedStyle(document.documentElement).getPropertyValue("--blue").trim(),
    font: getComputedStyle(document.body).fontFamily,
    canvas: getComputedStyle(document.body).backgroundColor,
    hidden: [...document.querySelectorAll("[data-reveal]")].filter(e => getComputedStyle(e).opacity === "0").length,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));

  ok(`${name}: tokens loaded`, i.blue === "#003262", `--blue = "${i.blue}"`);
  ok(`${name}: brand font applied`, i.font.includes("Inter"), i.font);
  ok(`${name}: canvas token applied`, i.canvas === "rgb(238, 241, 246)", i.canvas);
  ok(`${name}: no console or page errors`, errs.length === 0, errs.join(" | "));
  ok(`${name}: no failed requests`, failed.length === 0, failed.join(" | "));
  ok(`${name}: every reveal fired`, i.hidden === 0, `${i.hidden} still at opacity 0`);
  ok(`${name}: no horizontal overflow`, i.sw <= i.cw + 1, `${i.sw} > ${i.cw}`);
  await page.close();
}

// ── the home page's interactive parts ───────────────────────────────────────
console.log("home page behavior");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });

  const nums = await page.evaluate(() => [...document.querySelectorAll(".bignum")].map(n => n.textContent));
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => [...document.querySelectorAll(".bignum")].map(n => n.textContent));
  ok("stat count-ups reach their targets", after.join() === "6,120+,80 kW,2 pg", after.join());

  await page.click('[data-scroll="sponsors"]');
  await page.waitForTimeout(1200);
  const top = await page.evaluate(() => document.getElementById("sponsors").getBoundingClientRect().top);
  ok("hero CTA scrolls to Sponsors clear of the sticky nav", Math.abs(top - 60) < 90, `${Math.round(top)}px`);

  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(400);
  const low = await page.textContent("[data-soc]");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(400);
  const high = await page.textContent("[data-soc]");
  ok("footer battery drains with scroll and regenerates", low === "SOC 4%" && high === "SOC 100%", `${low} → ${high}`);

  const bars = await page.evaluate(() =>
    [...document.querySelectorAll("[data-bar]")].map(b => b.style.width));
  ok("traveler stage bars filled to their targets", bars.join() === "100%,66%,33%", bars.join());
  await page.close();
}

// ── easter eggs ─────────────────────────────────────────────────────────────
console.log("easter eggs");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });

  // The marquee never stops on its own; hovering pauses it, which is also what
  // makes the item clickable for a real visitor.
  await page.hover(".ticker");
  await page.waitForTimeout(250);
  await page.locator("[data-pump]").first().click();
  await page.waitForTimeout(150);
  ok("vacuum pump switches off", (await page.textContent("[data-pump]")).includes("off. thank you."));
  ok("  ...and toasts", await page.isVisible(".toast"));

  await page.click("[data-logo]");
  ok("logo wheel spins", await page.locator(".nav-wheel.spin").count() === 1);
  await page.waitForTimeout(1200);

  await page.click("[data-archive]");
  await page.waitForTimeout(150);
  ok("SN1's 88 mph turns on archive mode",
    (await page.evaluate(() => getComputedStyle(document.documentElement).filter)).includes("sepia"));
  await page.click("[data-archive]");
  await page.waitForTimeout(150);
  ok("  ...and back off", !(await page.evaluate(() => document.documentElement.classList.contains("archive"))));

  await page.click("[data-redacted]");
  await page.waitForTimeout(150);
  ok("redacted post reveals SN7", (await page.textContent("[data-redtitle]")).includes("four hub motors"));

  await page.click("[data-fax]");
  await page.waitForTimeout(150);
  ok("fax line dials up", await page.isVisible(".toast"));

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  for (const k of KONAMI) await page.keyboard.press(k);
  await page.waitForTimeout(1400);
  const joinTop = await page.evaluate(() => document.getElementById("join").getBoundingClientRect().top);
  ok("konami jumps to Join", Math.abs(joinTop - 60) < 90, `${Math.round(joinTop)}px`);
  await page.close();
}
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/join.html`, { waitUntil: "networkidle" });
  for (const k of KONAMI) await page.keyboard.press(k);
  await page.waitForTimeout(400);
  ok("konami pre-fills the referral field on the application",
    (await page.inputValue("[data-referral]")) === "↑↑↓↓←→←→BA");
  await page.close();
}

// ── the page has to work without JS, and without animation ──────────────────
console.log("progressive enhancement");
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`${base}/index.html`, { waitUntil: "load" });
  ok("hero copy is readable with JavaScript disabled",
    await page.locator(".hero-lede").isVisible() && (await page.textContent("body")).includes("Zero combustion"));
  ok("sponsor tiers are readable with JavaScript disabled",
    await page.locator(".tier-price").first().isVisible());
  await ctx.close();
}
{
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll("[data-reveal]")].filter(e => getComputedStyle(e).opacity === "0").length);
  ok("prefers-reduced-motion shows everything without scrolling", hidden === 0, `${hidden} hidden`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────────────────────────
console.log("phone layout (390px)");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const name of PAGES) {
    const page = await ctx.newPage();
    await page.goto(`${base}/${name}.html`, { waitUntil: "networkidle" });
    await fullScroll(page);
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      navWrapped: (() => {
        const links = [...document.querySelectorAll(".nav-links a")];
        return links.some(a => a.getClientRects().length > 1); // a link broken across lines
      })(),
    }));
    ok(`${name}: fits the viewport`, m.sw <= m.cw + 1, `${m.sw} > ${m.cw}`);
    ok(`${name}: no nav label broken across lines`, !m.navWrapped);
    await page.close();
  }
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
