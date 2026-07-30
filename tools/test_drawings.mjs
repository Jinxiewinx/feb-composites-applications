#!/usr/bin/env node
/* Legibility tests for the mold drawing sheets (03 App/app/drawings.js).

   WHY THIS EXISTS
   ===============
   Every other test in this repo asserts on strings and numbers, and drawings.js
   passes all of them while printing a dimension label straight through a
   dimension line. "No NaN in the output" says nothing about whether a human can
   read the sheet, and the first version of these drawings shipped three separate
   overprinted labels that every string assertion was happy with.

   Screenshots are not the answer either. Looking at a PNG catches what you
   happen to look at, on the fixtures you happen to render, and it silently stops
   catching anything the moment nobody looks. So: render the real sheets in a
   real browser, then interrogate the DOM geometrically.

   WHAT IT CHECKS
   ==============
     1. text vs geometry  — no label may be crossed by a drawn line, arrowhead,
                            rectangle or outline. This is THE failure: a
                            dimension sitting on a rule is unreadable on a laser
                            print even though it is "there".
     2. text vs text      — no two labels may overlap.
     3. containment       — no text may fall outside its drawing area, and no
                            sheet may spill onto a second printed page.
     4. legibility floor  — no text below MIN_PT on paper. A shop reads these at
                            arm's length under bad light.

   Text boxes come from getBoundingClientRect(), so they are what the browser
   ACTUALLY laid out in the real font — which is why the drawing font is bundled
   (see 03 App/app/fonts/osifont-LICENSE.md). Geometry is read as segments from
   the element attributes and mapped through the SVG's CTM, NOT as bounding
   boxes: a diagonal line's box covers a huge empty triangle and would report a
   collision with every label near it.

   RUNNING
   =======
     node tools/test_drawings.mjs            # all fixtures
     node tools/test_drawings.mjs --shots    # …and write PNGs of failing sheets
     node tools/test_drawings.mjs --shots-all

   Needs Playwright (`npm i -g playwright` or a local install) and its Chromium.
   Without it the run SKIPS loudly rather than failing — but nothing else in this
   repo can catch a drawing that overprints itself, so run it before touching
   drawings.js or print.css. */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "03 App", "app");
const SHOTS = process.argv.includes("--shots") || process.argv.includes("--shots-all");
const SHOTS_ALL = process.argv.includes("--shots-all");
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".drawing-shots");

/* Text under this on paper is not readable in a shop. Page px are CSS px, which
   the spec pins at 96/in, so pt = px * 72/96. */
const MIN_PT = 5.5;
/* Text boxes carry side bearings, and getBBox() reports the em box — ascent and
   descent — not the ink. A rule grazing that padding is not actually touching a
   glyph. So shrink before testing: 1.2px off each side for bearings, and 10% off
   the top and bottom, which keeps the whole cap-to-descender band and drops the
   empty strip above the caps. This is the difference between a failure list
   worth reading and one people learn to ignore. */
const TEXT_INSET_PX = 1.2;

/* ---------------- fixtures ----------------
   Each one is a shape that broke something, or a path with no other coverage.
   Built in the page, from the app's own slicer, so they are real plans. */
const FIXTURES = [
  { id: "nosecone", label: "single body, 3 layers", src: { file: "nosecone-plug.stl" } },
  { id: "undertray", label: "9.4in tall, splits into 2 machine setups", src: { file: "undertray-diffuser.stl" } },
  { id: "clamshell", label: "one body out of a 3-body assembly", src: { file: "clamshell-assembly.stl", body: 1 } },
  { id: "twotower", label: "multi-blank layers — two towers on one base", src: { synth: "towers" } },
  { id: "thinstack", label: "many thin boards — worst case for label crowding", src: { synth: "thin" } },
  { id: "overhang", label: "a layer that hangs over the board below", src: { synth: "overhang" } },
  { id: "tiny", label: "a small mold — tight spans, text pushed off to the side", src: { synth: "tiny" } },
  { id: "nomesh", label: "no stored mesh — the layer-outline fallback", src: { file: "nosecone-plug.stl" }, noMesh: true },
];

/* ---------------- the harness page ----------------
   Served from a virtual route so the app directory stays clean, but from the
   app's own origin so it loads the real files and the real samples. Only the two
   core.js helpers drawings.js needs are stubbed — booting core.js would drag in
   Firebase. */
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><title>drawing checks</title>
<link rel="stylesheet" href="print.css">
<style>body{margin:0;background:#fff}</style></head><body>
<div id="out"></div>
<script>
  function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
  function today(){return "2026-07-30";}
</script>
<script src="slicer.js"></script><script src="stlio.js"></script>
<script src="stackview.js"></script><script src="meshview.js"></script>
<script src="drawings.js"></script>
<script>
window.buildFixture = async function (spec) {
  let tris;
  if (spec.synth === "towers") {
    tris = [].concat(
      blankTris({ x0: 0, y0: 0, x1: 700, y1: 300 }, 0, 25),
      blankTris({ x0: 30, y0: 40, x1: 190, y1: 250 }, 25, 150),
      blankTris({ x0: 480, y0: 60, x1: 660, y1: 230 }, 25, 110));
  } else if (spec.synth === "thin") {
    tris = boxTris(600, 400, 190);
  } else if (spec.synth === "overhang") {
    // Wider at the top than at the bottom: the blank above genuinely hangs over.
    tris = [].concat(
      blankTris({ x0: 120, y0: 90, x1: 330, y1: 260 }, 0, 50),
      blankTris({ x0: 0, y0: 0, x1: 460, y1: 350 }, 50, 100));
  } else if (spec.synth === "tiny") {
    tris = boxTris(90, 60, 40);
  } else {
    const buf = await (await fetch("samples/" + spec.file)).arrayBuffer();
    tris = splitBodies(scaleTris(parseSTL(buf).tris, "mm"))[spec.body || 0].tris;
  }
  const avail = spec.synth === "thin" ? [12.7, 19.05, 25.4] : [25.4, 38.1, 50.8, 76.2];
  const r = planMold(tris, avail, {});
  return { plan: {
    id: "STK-" + (spec.file || spec.synth), name: spec.name || "fixture",
    source: spec.file || ("synthetic " + spec.synth),
    layers: r.layers, sections: r.sections, bounds: r.bounds,
    by: "simon@example.com", ts: "2026-07-30T10:00:00.000Z",
  }, tris };
};

window.renderFixture = async function (spec, noMesh) {
  const { plan, tris } = await window.buildFixture(spec);
  document.getElementById("out").innerHTML = drawingSetHtml(plan, { tris: noMesh ? null : tris });
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  return document.querySelectorAll(".dwg-page").length;
};

/* ---- the geometric checks, run in the page where layout is real ---- */
window.auditSheets = function (minPt, inset) {
  const segsOf = (el, toScreen) => {
    const n = el.tagName.toLowerCase();
    const num = a => parseFloat(el.getAttribute(a) || "0");
    const out = [];
    const push = (a, b) => out.push([toScreen(a[0], a[1]), toScreen(b[0], b[1])]);
    if (n === "line") push([num("x1"), num("y1")], [num("x2"), num("y2")]);
    else if (n === "polyline" || n === "polygon") {
      const pts = (el.getAttribute("points") || "").trim().split(/\\s+/)
        .map(p => p.split(",").map(Number)).filter(p => p.length === 2 && p.every(Number.isFinite));
      for (let i = 0; i + 1 < pts.length; i++) push(pts[i], pts[i + 1]);
      if (n === "polygon" && pts.length > 2) push(pts[pts.length - 1], pts[0]);
    } else if (n === "rect") {
      const x = num("x"), y = num("y"), w = num("width"), h = num("height");
      push([x, y], [x + w, y]); push([x + w, y], [x + w, y + h]);
      push([x + w, y + h], [x, y + h]); push([x, y + h], [x, y]);
    } else if (n === "circle") {
      const cx = num("cx"), cy = num("cy"), r = num("r");
      let prev = null;
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 2, p = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
        if (prev) push(prev, p);
        prev = p;
      }
    }
    return out;
  };
  /* Text boxes are ORIENTED quads, not axis-aligned rectangles.

     Vertical dimensions letter bottom-to-top and the isometric ones lie along
     their own axis, so half the labels on a sheet are rotated. The axis-aligned
     box of a 30°-rotated string covers a large empty triangle either side of the
     glyphs, and testing against that reports a collision for every rule passing
     anywhere near — which makes the whole check untrustworthy and, worse,
     trainable to ignore. So: take getBBox() in the element's own space, inset it
     there, and push the four corners through getScreenCTM(). */
  const quadOf = (el, hIn, vFrac) => {
    const b = el.getBBox();
    const m = el.getScreenCTM();
    if (!m || !(b.width > 0)) return null;
    const s = Math.hypot(m.a, m.b) || 1;
    const x0 = b.x + hIn / s, x1 = b.x + b.width - hIn / s;
    const y0 = b.y + b.height * vFrac, y1 = b.y + b.height * (1 - vFrac);
    if (!(x1 > x0) || !(y1 > y0)) return null;
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
      .map(([x, y]) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }));
  };
  // Segment vs convex quad, by clipping the segment against the quad's four
  // half-planes (Cyrus-Beck). Exact, and indifferent to the quad's angle.
  const hits = (seg, quad) => {
    let t0 = 0, t1 = 1;
    const dx = seg[1].x - seg[0].x, dy = seg[1].y - seg[0].y;
    for (let i = 0; i < 4; i++) {
      const a = quad[i], b = quad[(i + 1) % 4];
      // Inward normal for a quad wound consistently by quadOf.
      const nx = -(b.y - a.y), ny = b.x - a.x;
      const denom = nx * dx + ny * dy;
      const dist = nx * (seg[0].x - a.x) + ny * (seg[0].y - a.y);
      if (denom === 0) { if (dist < 0) return false; continue; }
      const t = -dist / denom;
      if (denom > 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t0 <= t1;
  };
  // Quad vs quad by separating axis — the same two labels may both be rotated.
  const overlap = (p, q) => {
    for (const poly of [p, q]) {
      for (let i = 0; i < 4; i++) {
        const a = poly[i], b = poly[(i + 1) % 4];
        const ax = -(b.y - a.y), ay = b.x - a.x;
        let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
        p.forEach(v => { const d = v.x * ax + v.y * ay; p0 = Math.min(p0, d); p1 = Math.max(p1, d); });
        q.forEach(v => { const d = v.x * ax + v.y * ay; q0 = Math.min(q0, d); q1 = Math.max(q1, d); });
        if (p1 <= q0 || q1 <= p0) return false;
      }
    }
    return true;
  };

  const findings = [];
  document.querySelectorAll(".dwg-page").forEach((page, pi) => {
    const sheet = pi + 1;
    const pr = page.getBoundingClientRect();
    if (page.scrollHeight > page.clientHeight + 2) {
      findings.push({ sheet, kind: "sheet-overflow", detail: page.scrollHeight + "px of content in " + page.clientHeight + "px of sheet" });
    }
    page.querySelectorAll("svg").forEach(svg => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const toScreen = (x, y) => ({ x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f });
      const sr = svg.getBoundingClientRect();

      const texts = [...svg.querySelectorAll("text")].map(t => ({
        el: t, text: (t.textContent || "").trim(),
        pt: parseFloat(getComputedStyle(t).fontSize) * 72 / 96,
        raw: t.getBoundingClientRect(),
        quad: quadOf(t, inset, 0.10),
      })).filter(t => t.text && t.quad);

      /* Which crossings count.

         ASME Y14.5 is explicit and this follows it: a dimension line is BROKEN
         for its text and is never drawn through it, and neither is an object
         line — those crossings are layout errors. Centre lines and hidden or
         reference lines, on the other hand, are broken by text as a matter of
         course; a dimension printed across the dashed mold outline, with the
         halo drawings.js gives every label, is how a real sheet looks.

         So: SOLID geometry crossing a label fails. DASHED geometry does not.
         That is the drafting rule, not a threshold picked to make the run green
         — the datum box, the arrowheads and every block outline are solid, and
         all of them still fail if they touch a label. */
      const segs = [];
      svg.querySelectorAll("line, polyline, polygon, rect, circle").forEach(el => {
        const dash = el.getAttribute("stroke-dasharray");
        if (dash && dash.trim() && dash !== "none") return;
        segsOf(el, toScreen).forEach(s => segs.push({ el, s }));
      });

      texts.forEach(t => {
        if (t.pt < minPt - 0.01) {
          findings.push({ sheet, kind: "too-small", detail: t.pt.toFixed(2) + "pt", text: t.text });
        }
        /* Upside down. A drawing may letter horizontally or bottom-to-top and
           nothing else; mirrored text is as unreadable as text under a line and
           a geometric overlap check cannot see it. The element's own matrix
           says which way the baseline runs: local +x maps to (a, b), so a
           negative horizontal component is a string running right to left.
           Worth a check of its own — the first fix for labels crossing their
           dimension lines placed them perfectly and reversed two of them. */
        const m = t.el.getScreenCTM();
        if (m && m.a < -1e-6) {
          findings.push({ sheet, kind: "upside-down", text: t.text, detail: "baseline runs right-to-left" });
        }
        if (t.raw.left < sr.left - 0.5 || t.raw.right > sr.right + 0.5 || t.raw.top < sr.top - 0.5 || t.raw.bottom > sr.bottom + 0.5) {
          findings.push({ sheet, kind: "out-of-frame", text: t.text,
            detail: "box " + [t.raw.left - sr.left, t.raw.top - sr.top, t.raw.right - sr.right, t.raw.bottom - sr.bottom].map(n => Math.round(n)).join(",") });
        }
        for (const { el, s } of segs) {
          if (hits(s, t.quad)) {
            findings.push({ sheet, kind: "text-on-line", text: t.text,
              detail: el.tagName + " at " + Math.round(t.raw.left - sr.left) + "," + Math.round(t.raw.top - sr.top) });
            break;
          }
        }
      });
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          if (overlap(texts[i].quad, texts[j].quad)) {
            findings.push({ sheet, kind: "text-on-text", text: texts[i].text + "  ×  " + texts[j].text,
              detail: Math.round(texts[i].raw.left - sr.left) + "," + Math.round(texts[i].raw.top - sr.top) });
          }
        }
      }
    });
  });
  return findings;
};
</script></body></html>`;

/* ---------------- static server ---------------- */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".stl": "model/stl", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
function serve() {
  return new Promise(resolve => {
    const s = createServer(async (req, res) => {
      const path = decodeURIComponent((req.url || "/").split("?")[0]);
      if (path === "/__harness.html") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(HARNESS);
      }
      try {
        const buf = await readFile(join(root, path.replace(/^\/+/, "")));
        res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
        res.end(buf);
      } catch { res.writeHead(404); res.end("no"); }
    });
    s.listen(0, "127.0.0.1", () => resolve({ server: s, port: s.address().port }));
  });
}

/* Playwright is not a dependency of this repo — it is a dependency of THIS test.
   Look where it plausibly is, and say plainly what to do if it is nowhere. */
async function loadChromium() {
  const require_ = createRequire(import.meta.url);
  const tries = [];
  try { tries.push(require_.resolve("playwright")); } catch { /* not local */ }
  try {
    const g = execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    tries.push(join(g, "playwright", "index.mjs"));
  } catch { /* no npm */ }
  for (const p of tries) {
    try { return (await import(p.startsWith("/") ? "file://" + p : p)).chromium; } catch { /* next */ }
  }
  return null;
}

/* ---------------- run ---------------- */
const chromium = await loadChromium();
if (!chromium) {
  console.log("SKIPPED — Playwright is not installed, so the drawing sheets were not rendered.");
  console.log("  npm i -g playwright && npx playwright install chromium");
  console.log("  Nothing else in this repo can catch a drawing that overprints itself; run this before shipping a drawings.js change.");
  process.exit(0);
}

const { server, port } = await serve();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 980, height: 1300 }, deviceScaleFactor: 2 });
const pageErrors = [];
page.on("pageerror", e => pageErrors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/__harness.html`, { waitUntil: "load" });

let pass = 0, fail = 0;
for (const fx of FIXTURES) {
  const sheets = await page.evaluate(([spec, noMesh]) => window.renderFixture(spec, noMesh), [fx.src, !!fx.noMesh]);
  const findings = await page.evaluate(([mp, ins]) => window.auditSheets(mp, ins), [MIN_PT, TEXT_INSET_PX]);
  const bad = pageErrors.splice(0).map(e => ({ sheet: 0, kind: "page-error", text: e, detail: "" })).concat(findings);
  if (!bad.length) {
    pass++;
    console.log(`  ok  ${fx.id} — ${sheets} sheets · ${fx.label}`);
  } else {
    fail++;
    console.log(`FAIL  ${fx.id} — ${bad.length} finding${bad.length > 1 ? "s" : ""} · ${fx.label}`);
    // Group so one crowded sheet doesn't bury the other seven.
    const byKind = {};
    bad.forEach(b => { (byKind[b.kind] = byKind[b.kind] || []).push(b); });
    for (const kind of Object.keys(byKind)) {
      const list = byKind[kind];
      console.log(`        ${kind} (${list.length}):`);
      list.slice(0, 8).forEach(b => console.log(`          sheet ${b.sheet}: "${b.text}"${b.detail ? "  [" + b.detail + "]" : ""}`));
      if (list.length > 8) console.log(`          … and ${list.length - 8} more`);
    }
  }
  if (SHOTS && (bad.length || SHOTS_ALL)) {
    await mkdir(SHOT_DIR, { recursive: true });
    const only = new Set(bad.map(b => b.sheet));
    const els = await page.$$(".dwg-page");
    for (let i = 0; i < els.length; i++) {
      if (!SHOTS_ALL && !only.has(i + 1)) continue;
      await els[i].screenshot({ path: join(SHOT_DIR, `${fx.id}-sheet${i + 1}.png`) });
    }
  }
}

await browser.close();
server.close();
if (SHOTS) console.log(`\nsheet images in ${SHOT_DIR}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
