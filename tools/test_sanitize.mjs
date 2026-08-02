/* test_sanitize.mjs — the sanitizer, against the REAL DOMPurify, in a real browser.
 *
 * WHY THIS EXISTS SEPARATELY.
 * tools/test_app.mjs runs the app against a hand-rolled `document` stub, which
 * real DOMPurify cannot use — it needs a live DOM. So the suite stubbed it with
 * a regex that strips scripts and passes everything else through. That stub
 * ignores ALLOWED_TAGS and ALLOWED_ATTR entirely, which means the allowlist —
 * the thing standing between a shared comment thread and stored XSS — had no
 * test coverage at all. You could widen or empty it and CI stayed green.
 *
 * This file closes that hole by loading index.html in Chromium, so the
 * assertions run against the exact vendored, SRI-pinned purify.min.js that
 * ships, and the exact sanitizeHtml() in core.js. Nothing is mocked.
 *
 *   node tools/test_sanitize.mjs
 *
 * Needs Playwright, same as the other browser tests, and skips loudly without it.
 */

import { serveApp, loadChromium, skipMessage } from "./lib/browser.mjs";

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the HTML sanitizer")); process.exit(0); }

const srv = await serveApp();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${srv.port}/index.html`, { waitUntil: "networkidle" });

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
};
// Run sanitizeHtml in the page and hand the string back.
const clean = (html) => page.evaluate(h => sanitizeHtml(h), html);

console.log("sanitizer (real DOMPurify):");

ok("DOMPurify is genuinely loaded, not a stub",
  await page.evaluate(() => !!(window.DOMPurify && window.DOMPurify.version)),
  "if this fails every assertion below is meaningless");

/* ---- the things that must never get through ---- */
const xss = [
  ["script tag", "<script>alert(1)</script>", /script/i],
  ["onerror handler", '<img src=x onerror="alert(1)">', /onerror/i],
  ["slash-before-attr handler", "<img/onerror=alert(2)>", /onerror/i],
  ["javascript: href", '<a href="javascript:alert(3)">x</a>', /javascript:/i],
  ["data: image src (base64 blobs must not reach Firestore)", '<img src="data:image/png;base64,iVBORw0KGgo=">', /data:/i],
  ["data: svg src", '<img src="data:image/svg+xml,<svg onload=alert(1)>">', /data:/i],
  ["data: href", '<a href="data:text/html,<script>alert(1)</script>">x</a>', /data:/i],
  ["svg (a live script surface)", "<svg><script>alert(1)</script></svg>", /<svg/i],
  ["iframe embed", '<iframe src="https://evil.test"></iframe>', /<iframe/i],
  ["form", '<form action="https://evil.test"><input name=p></form>', /<form/i],
  ["style tag", "<style>body{display:none}</style>", /<style/i],
];
for (const [name, dirty, bad] of xss) {
  const c = await clean(dirty);
  ok("blocks " + name, !bad.test(c), c);
}

/* ---- the allowlist, asserted properly for the first time ---- */
console.log("allowlist:");
for (const tag of ["b", "i", "u", "strong", "em", "p", "ul", "ol", "li", "code",
                   "h1", "h2", "h3", "h4", "blockquote", "pre"]) {
  const c = await clean(`<${tag}>x</${tag}>`);
  ok(`keeps <${tag}>`, new RegExp(`<${tag}[ >]`, "i").test(c), c);
}
ok("keeps a table with its cells", /<table[\s\S]*<td[^>]*>a<\/td>/i.test(await clean("<table><tr><td>a</td></tr></table>")));
ok("keeps an https image", /<img[^>]+src="https:\/\/x\.test\/a\.png"/i.test(await clean('<img src="https://x.test/a.png" alt="a">')));
ok("keeps the download attribute (attachments rely on it)",
  /download="f\.png"/.test(await clean('<a href="https://x.test/f.png" download="f.png">f</a>')));

/* Disallowed tags are UNWRAPPED with their text kept, not dropped. That is the
   behaviour that makes a pasted Google Doc silently flatten to plain text, so
   it is worth pinning explicitly rather than discovering again later. */
console.log("unwrapping:");
const unwrapped = await clean("<marquee>scrolling</marquee>");
ok("a disallowed tag is unwrapped but its text survives",
  !/marquee/i.test(unwrapped) && /scrolling/.test(unwrapped), unwrapped);
const scripted = await clean("<script>secret()</script>");
ok("...except script, whose CONTENT is dropped too", !/secret/.test(scripted), scripted);

/* ---- the hooks ---- */
console.log("link + image hooks:");
const link = await clean('<a href="https://x.test/f.png">f</a>');
ok("every link is forced to a new tab", /target="_blank"/.test(link), link);
ok("...with rel=noopener, set by us and not by stored content", /rel="noopener noreferrer nofollow"/.test(link), link);
ok("a hostile target in the source cannot survive",
  /target="_blank"/.test(await clean('<a href="https://x.test" target="evilframe">x</a>')));
ok("width/height survive as integers",
  /width="800"/.test(await clean('<img src="https://x.test/a.png" width="800">')));
ok("a width with junk appended is clamped to its integer, not passed through",
  /width="800"/.test(await clean('<img src="https://x.test/a.png" width="800px; evil">')));
ok("a non-numeric width is dropped",
  !/width=/.test(await clean('<img src="https://x.test/a.png" width="calc(100%)">')));
ok("an absurd width is dropped rather than left to blow out the layout",
  !/width=/.test(await clean('<img src="https://x.test/a.png" width="999999">')));
ok('loading is only ever "lazy"',
  !/loading=/.test(await clean('<img src="https://x.test/a.png" loading="eager">')));

/* ---- attributes ---- */
console.log("attributes:");
ok("strips style (Google Docs would otherwise dictate our typography forever)",
  !/style=/i.test(await clean('<p style="font-size:11pt;color:#000">x</p>')));
ok("strips class (pasted markup must not adopt app chrome)",
  !/class=/i.test(await clean('<div class="card">x</div>')));
ok("strips id (would collide with our own anchors)",
  !/id=/i.test(await clean('<p id="topbar">x</p>')));
ok("strips event handlers on an allowed tag",
  !/onclick/i.test(await clean('<p onclick="alert(1)">x</p>')));

/* ---- fail closed ---- */
console.log("fail-closed:");
const noPurify = await page.evaluate(() => {
  const saved = window.DOMPurify;
  window.DOMPurify = undefined;
  const out = sanitizeHtml("<b>hi</b><script>alert(1)</script>");
  window.DOMPurify = saved;
  return out;
});
ok("without DOMPurify it escapes rather than strips",
  !/<b>/.test(noPurify) && noPurify.includes("&lt;b&gt;"), noPurify);

await browser.close();
srv.server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
