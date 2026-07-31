/* Direction C — "screenshot-led".
   The product is the argument: on any slide with a `shot`, the image is the
   slide and the type reduces to the claim plus one caption line. Dropped body
   lines are appended to the speaker notes, so the presenter still has them.

   Copy comes from content.mjs and is never rewritten here. Colours come from
   03 App/app/index.html (--blue, --gold, --ink, --muted, --line, --canvas).

   node build_deck_c.mjs   ->   sn6-app-deck-c.pptx
*/

import pptxgen from "pptxgenjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { acts, slides, meta } from "./content.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, ".img-c");
mkdirSync(CACHE, { recursive: true });

/* ---------------------------------------------------------------- palette */
const INK = "141d2b";      // --ink
const BLUE = "003262";     // --blue  (Berkeley Blue)
const GOLD = "FDB515";     // --gold  (California Gold)
const MUTED = "515f74";    // --muted
const LINE = "dde3ec";     // --line
const CANVAS = "eef1f6";   // --canvas
const WHITE = "FFFFFF";
const ON_DARK = "9fb0c4";  // body text on ink
const RULE_DARK = "2b3648";

const SANS = "Arial";
const W = 13.3, H = 7.5, M = 0.75;

/* ------------------------------------------------------------- image prep */
const PY = `
import sys
from PIL import Image
src, dst, ta, ax, ay = sys.argv[1:]
ta, ax, ay = float(ta), float(ax), float(ay)
im = Image.open(src).convert("RGB")
w, h = im.size
if ta > 0:
    if w / h > ta:
        nw = int(round(h * ta)); x = int((w - nw) * ax)
        im = im.crop((x, 0, x + nw, h))
    else:
        nh = int(round(w / ta)); y = int((h - nh) * ay)
        im = im.crop((0, y, w, y + nh))
w, h = im.size
if w > 2200:
    im = im.resize((2200, int(round(h * 2200 / w))), Image.LANCZOS)
im.save(dst, quality=92)
`;

const dims = (p) => {
  const out = execFileSync("python3", ["-c",
    "import sys;from PIL import Image;print(*Image.open(sys.argv[1]).size)", p], { encoding: "utf8" });
  const [w, h] = out.trim().split(/\s+/).map(Number);
  return { w, h, aspect: w / h };
};

/* Crop `src` to `aspect` (0 = leave alone), anchored at ax/ay in 0..1. */
const prep = (src, aspect, ax = 0.5, ay = 0) => {
  const abs = join(HERE, src);
  const key = `${basename(src, ".png")}-${aspect.toFixed(3)}-${ax}-${ay}.jpg`;
  const dst = join(CACHE, key);
  if (!existsSync(dst)) execFileSync("python3", ["-c", PY, abs, dst, String(aspect), String(ax), String(ay)]);
  return dst;
};

/* ------------------------------------------------------------ text sizing */
/* Approximate Arial advance width, in inches per character per point. */
const ADV = { bold: 0.0072, reg: 0.0068 };
const linesAt = (text, pt, widthIn, bold) =>
  Math.max(1, Math.ceil((text.length * pt * (bold ? ADV.bold : ADV.reg)) / widthIn));

/* Largest size in `sizes` whose wrapped height fits `maxLines`. */
const shrink = (text, widthIn, sizes, maxLines, bold = true) => {
  for (const pt of sizes) if (linesAt(text, pt, widthIn, bold) <= maxLines) return pt;
  return sizes[sizes.length - 1];
};

/* --------------------------------------------------------------- act info */
const actNo = new Map();
let n = 0;
for (const a of acts) { if (a.label) actNo.set(a.label, ++n); }
const agenda = acts.filter(a => a.label).map(a => a.label);

/* ------------------------------------------------------------------- deck */
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";      // before any slide is added
pres.author = "FEB Composites";
pres.title = meta.title;

const newSlide = (dark) => {
  const s = pres.addSlide();
  s.background = { color: dark ? INK : WHITE };
  return s;
};

/* Small uppercase kicker: act number + label. */
const kicker = (s, slide, dark, x = M, y = 0.5) => {
  const label = slide.act ? `${String(actNo.get(slide.act)).padStart(2, "0")}  ${slide.act}` : meta.footer;
  s.addText(label.toUpperCase(), {
    x, y, w: 9.0, h: 0.26, margin: 0,
    fontFace: SANS, fontSize: 10.5, bold: true, charSpacing: 2.2,
    color: dark ? GOLD : BLUE, valign: "middle",
  });
};

const notesFor = (slide, dropped = []) => {
  const extra = dropped.filter(Boolean);
  return extra.length ? `${slide.notes}\n\nNot on the slide — say it: ${extra.join(" ")}` : slide.notes;
};

/* --------------------------------------------------------------- layouts */

function title(s, slide) {
  s.addText("FEB", {
    x: M, y: 1.55, w: 8.0, h: 1.35, margin: 0,
    fontFace: SANS, fontSize: 86, bold: true, color: WHITE, charSpacing: 1.5,
  });
  s.addText("COMPOSITES", {
    x: M, y: 2.75, w: 8.4, h: 1.35, margin: 0,
    fontFace: SANS, fontSize: 86, bold: true, color: GOLD, charSpacing: 1.5,
  });
  s.addText(slide.subtitle, {
    x: M, y: 4.35, w: 7.6, h: 1.0, margin: 0,
    fontFace: SANS, fontSize: 17, color: ON_DARK, lineSpacing: 24,
  });
  s.addText(`${meta.presenter}   ·   ${meta.date}`, {
    x: M, y: 6.15, w: 6.0, h: 0.3, margin: 0,
    fontFace: SANS, fontSize: 12, color: MUTED,
  });
  s.addText(slide.footnote, {
    x: M, y: 6.5, w: 6.0, h: 0.32, margin: 0,
    fontFace: SANS, fontSize: 13, bold: true, color: GOLD,
  });

  // Right-hand agenda: the seven acts, as a running order.
  s.addShape(pres.ShapeType.rect, { x: 9.35, y: 1.55, w: 0.012, h: 4.6, fill: { color: RULE_DARK } });
  agenda.forEach((label, i) => {
    const y = 1.55 + i * 0.66;
    s.addText(String(i + 1), {
      x: 9.6, y, w: 0.4, h: 0.4, margin: 0,
      fontFace: SANS, fontSize: 13, bold: true, color: GOLD, valign: "middle",
    });
    s.addText(label, {
      x: 10.05, y, w: 2.9, h: 0.4, margin: 0,
      fontFace: SANS, fontSize: 13, color: ON_DARK, valign: "middle",
    });
  });
  s.addNotes(notesFor(slide));
}

function statement(s, slide) {
  kicker(s, slide, true);
  const pt = shrink(slide.title, 11.0, [42, 38, 34, 30], 3);
  s.addText(slide.title, {
    x: M, y: 1.35, w: 11.0, h: 2.2, margin: 0, valign: "top",
    fontFace: SANS, fontSize: pt, bold: true, color: WHITE, lineSpacing: pt * 1.16,
  });
  const body = slide.body || [];
  s.addText(body.map((t, i) => ({ text: t, options: { breakLine: i < body.length - 1, paraSpaceAfter: 10 } })), {
    x: M, y: 4.05, w: 8.6, h: 2.4, margin: 0, valign: "top",
    fontFace: SANS, fontSize: 15.5, color: ON_DARK, lineSpacing: 23,
  });
  s.addNotes(notesFor(slide));
}

function threeUp(s, slide) {
  kicker(s, slide, true);
  const pt = shrink(slide.title, 11.6, [32, 28, 25], 2);
  s.addText(slide.title, {
    x: M, y: 1.0, w: 11.6, h: 1.0, margin: 0, valign: "top",
    fontFace: SANS, fontSize: pt, bold: true, color: WHITE, lineSpacing: pt * 1.16,
  });
  const top = 2.35, rowH = 1.62;
  slide.items.forEach((it, i) => {
    const y = top + i * rowH;
    if (i > 0) s.addShape(pres.ShapeType.rect, { x: M, y: y - 0.28, w: W - 2 * M, h: 0.012, fill: { color: RULE_DARK } });
    s.addText(it.tag, {
      x: M, y, w: 1.3, h: 0.32, margin: 0,
      fontFace: SANS, fontSize: 12, bold: true, color: GOLD, charSpacing: 1.4,
    });
    s.addText(it.head, {
      x: 2.05, y: y - 0.03, w: 3.3, h: 0.7, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 19, bold: true, color: WHITE, lineSpacing: 23,
    });
    s.addText(it.body, {
      x: 5.5, y: y - 0.02, w: 7.05, h: 1.2, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 13.5, color: ON_DARK, lineSpacing: 19,
    });
  });
  s.addNotes(notesFor(slide));
}

/* Screenshot bleeds the full width; the claim sits in a quiet band beneath it. */
function shotHero(s, slide) {
  const bandY = 5.72, bandH = H - bandY;
  const img = prep(slide.shot, W / bandY, 0.5, 0);
  s.addImage({ path: img, x: 0, y: 0, w: W, h: bandY });
  s.addShape(pres.ShapeType.rect, { x: 0, y: bandY, w: W, h: bandH, fill: { color: INK } });

  const label = slide.act ? `${String(actNo.get(slide.act)).padStart(2, "0")}  ${slide.act}` : meta.footer;
  s.addText(label.toUpperCase(), {
    x: M, y: bandY + 0.17, w: 6.0, h: 0.24, margin: 0,
    fontFace: SANS, fontSize: 10, bold: true, charSpacing: 2.2, color: GOLD, valign: "middle",
  });
  const cap = (slide.body || [])[0];
  const tw = 11.8;
  const pt = shrink(slide.title, tw, [26, 23, 20], 2);
  s.addText(slide.title, {
    x: M, y: bandY + 0.44, w: tw, h: 0.78, margin: 0, valign: "top",
    fontFace: SANS, fontSize: pt, bold: true, color: WHITE, lineSpacing: pt * 1.13,
  });
  if (cap) s.addText(cap, {
    x: M, y: H - 0.53, w: 11.8, h: 0.34, margin: 0, valign: "top",
    fontFace: SANS, fontSize: 12.5, color: ON_DARK,
  });
  s.addNotes(notesFor(slide, (slide.body || []).slice(1)));
}

/* Claim across the top; the screenshot bleeds into the bottom-right corner,
   uncropped — aspect ratios here vary too much to force a common frame. */
function shotCorner(s, slide) {
  kicker(s, slide, false);
  const pt = shrink(slide.title, 11.8, [30, 27, 24, 21], 2);
  s.addText(slide.title, {
    x: M, y: 0.9, w: 11.8, h: 1.15, margin: 0, valign: "top",
    fontFace: SANS, fontSize: pt, bold: true, color: INK, lineSpacing: pt * 1.14,
  });

  const a = dims(join(HERE, slide.shot)).aspect;
  let h = 4.85, w = h * a;
  if (w > 11.4) { w = 11.4; h = w / a; }
  const x = W - w, y = H - h;
  s.addImage({ path: prep(slide.shot, 0), x, y, w, h });
  s.addShape(pres.ShapeType.rect, { x, y, w: 0.012, h, fill: { color: LINE } });

  const cap = (slide.body || [])[0];
  const capW = Math.min(5.4, Math.max(3.2, x - M - 0.45));
  if (cap) s.addText(cap, {
    x: M, y: y + 0.15, w: capW, h: 2.2, margin: 0, valign: "top",
    fontFace: SANS, fontSize: 14, color: MUTED, lineSpacing: 21,
  });
  s.addNotes(notesFor(slide, (slide.body || []).slice(1)));
}

/* A tall print sheet is not a landscape screenshot: show it whole, at height. */
function shotSheet(s, slide) {
  kicker(s, slide, false);
  const a = dims(join(HERE, slide.shot)).aspect;
  const h = 6.4, w = h * a;
  const x = W - w - 0.55, y = (H - h) / 2;
  s.addImage({
    path: prep(slide.shot, 0), x, y, w, h,
    shadow: { type: "outer", color: "0a1628", opacity: 0.22, blur: 16, offset: 3, angle: 90 },
  });

  const tw = x - M - 0.6;
  const pt = shrink(slide.title, tw, [30, 26, 23, 20], 4);
  s.addText(slide.title, {
    x: M, y: 1.5, w: tw, h: 2.6, margin: 0, valign: "top",
    fontFace: SANS, fontSize: pt, bold: true, color: INK, lineSpacing: pt * 1.15,
  });
  const cap = (slide.body || [])[0];
  if (cap) s.addText(cap, {
    x: M, y: 4.35, w: tw, h: 2.0, margin: 0, valign: "top",
    fontFace: SANS, fontSize: 13.5, color: MUTED, lineSpacing: 20,
  });
  s.addNotes(notesFor(slide, (slide.body || []).slice(1)));
}

function tabsMap(s, slide) {
  kicker(s, slide, false);
  const pt = shrink(slide.title, 6.9, [40, 36, 32], 3);
  s.addText(slide.title, {
    x: M, y: 1.15, w: 6.9, h: 2.3, margin: 0, valign: "top",
    fontFace: SANS, fontSize: pt, bold: true, color: INK, lineSpacing: pt * 1.14,
  });
  (slide.body || []).forEach((t, i) => s.addText(t, {
    x: M, y: 4.15 + i * 0.7, w: 6.4, h: 0.9, margin: 0, valign: "top",
    fontFace: SANS, fontSize: 14, color: MUTED, lineSpacing: 21,
  }));

  const hi = new Set(slide.highlight || []);
  const shown = [...slide.tabs].sort((a, b) => (hi.has(b) ? 1 : 0) - (hi.has(a) ? 1 : 0));
  const x0 = 8.35;
  let y = 0.95;
  for (const t of shown) {
    const on = hi.has(t);
    const h = on ? 0.62 : 0.4;
    if (on) s.addText("→", {
      x: x0 - 0.02, y, w: 0.5, h, margin: 0, valign: "middle",
      fontFace: SANS, fontSize: 15, bold: true, color: GOLD,
    });
    s.addText(t, {
      x: on ? x0 + 0.5 : x0 + 0.5, y, w: 4.0, h, margin: 0, valign: "middle",
      fontFace: SANS, fontSize: on ? 25 : 15,
      bold: on, color: on ? INK : MUTED, charSpacing: on ? 0 : 0.3,
    });
    y += h + (on ? 0.12 : 0.06);
  }
  s.addNotes(notesFor(slide));
}

function stats(s, slide) {
  kicker(s, slide, false);
  const pt = shrink(slide.title, 11.8, [34, 30, 27], 2);
  s.addText(slide.title, {
    x: M, y: 1.0, w: 11.8, h: 1.0, margin: 0, valign: "top",
    fontFace: SANS, fontSize: pt, bold: true, color: INK, lineSpacing: pt * 1.14,
  });
  const top = 2.4, rowH = 1.32;
  slide.stats.forEach((st, i) => {
    const y = top + i * rowH;
    if (i > 0) s.addShape(pres.ShapeType.rect, { x: M, y: y - 0.2, w: W - 2 * M, h: 0.012, fill: { color: LINE } });
    s.addText(st.n, {
      x: M, y: y - 0.16, w: 2.45, h: 0.95, margin: 0, align: "right", valign: "middle",
      fontFace: SANS, fontSize: st.n.length > 3 ? 40 : 52, bold: true, color: BLUE, charSpacing: -1,
    });
    s.addText(st.label, {
      x: 3.5, y: y - 0.1, w: 2.5, h: 0.4, margin: 0, valign: "middle",
      fontFace: SANS, fontSize: 15, bold: true, color: INK,
    });
    s.addText(st.sub, {
      x: 6.15, y: y - 0.14, w: 6.4, h: 1.0, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 13, color: MUTED, lineSpacing: 18,
    });
  });
  (slide.body || []).forEach((t, i) => s.addText(t, {
    x: M, y: 6.5 + i * 0.4, w: 11.8, h: 0.5, margin: 0, valign: "top",
    fontFace: SANS, fontSize: 13, italic: true, color: BLUE, lineSpacing: 18,
  }));
  s.addNotes(notesFor(slide));
}

function twoUp(s, slide) {
  kicker(s, slide, false);
  const pt = shrink(slide.title, 11.8, [30, 27, 24], 2);
  s.addText(slide.title, {
    x: M, y: 0.9, w: 11.8, h: 0.95, margin: 0, valign: "top",
    fontFace: SANS, fontSize: pt, bold: true, color: INK, lineSpacing: pt * 1.14,
  });
  const cols = [slide.left, slide.right];
  const cw = 5.75, gap = 0.3;
  cols.forEach((c, i) => {
    const x = M + i * (cw + gap);
    const ih = 3.3;
    s.addImage({ path: prep(c.shot, cw / ih, 0.5, 0), x, y: 2.1, w: cw, h: ih });
    s.addText(c.head, {
      x, y: 5.55, w: cw, h: 0.36, margin: 0,
      fontFace: SANS, fontSize: 17, bold: true, color: BLUE,
    });
    s.addText(c.body, {
      x, y: 5.98, w: cw, h: 1.1, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 13, color: MUTED, lineSpacing: 19,
    });
  });
  s.addNotes(notesFor(slide));
}

function limits(s, slide) {
  kicker(s, slide, true);
  s.addText(slide.title, {
    x: M, y: 1.0, w: 8.0, h: 0.95, margin: 0, valign: "top",
    fontFace: SANS, fontSize: 44, bold: true, color: WHITE, charSpacing: -0.5,
  });
  const top = 2.5, rowH = 1.2;
  slide.items.forEach((it, i) => {
    const y = top + i * rowH;
    if (i > 0) s.addShape(pres.ShapeType.rect, { x: M, y: y - 0.22, w: W - 2 * M, h: 0.012, fill: { color: RULE_DARK } });
    s.addText(it.head, {
      x: M, y, w: 4.5, h: 0.75, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 17, bold: true, color: GOLD, lineSpacing: 21,
    });
    s.addText(it.body, {
      x: 5.55, y: y - 0.02, w: 7.0, h: 1.0, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 13, color: ON_DARK, lineSpacing: 18,
    });
  });
  s.addNotes(notesFor(slide));
}

function ask(s, slide) {
  kicker(s, slide, true);
  s.addText(slide.title, {
    x: M, y: 0.95, w: 6.0, h: 0.9, margin: 0, valign: "top",
    fontFace: SANS, fontSize: 44, bold: true, color: WHITE, charSpacing: -0.5,
  });
  const top = 2.25, rowH = 1.2;
  slide.asks.forEach((a, i) => {
    const y = top + i * rowH;
    if (i > 0) s.addShape(pres.ShapeType.rect, { x: M, y: y - 0.22, w: W - 2 * M, h: 0.012, fill: { color: RULE_DARK } });
    s.addText(String(i + 1).padStart(2, "0"), {
      x: M, y: y - 0.05, w: 0.75, h: 0.5, margin: 0, valign: "middle",
      fontFace: SANS, fontSize: 22, bold: true, color: GOLD,
    });
    s.addText(a.what, {
      x: 1.6, y: y - 0.05, w: 3.5, h: 0.6, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 17, bold: true, color: WHITE, lineSpacing: 21,
    });
    s.addText(a.detail, {
      x: 5.25, y: y - 0.04, w: 5.55, h: 1.0, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 12.5, color: ON_DARK, lineSpacing: 17,
    });
    s.addText(`${a.owner}\n${a.when}`, {
      x: 11.0, y: y - 0.04, w: 1.55, h: 0.8, margin: 0, valign: "top", align: "right",
      fontFace: SANS, fontSize: 12, bold: true, color: WHITE, lineSpacing: 17,
    });
  });
  s.addText(slide.footnote, {
    x: M, y: 6.85, w: 6.0, h: 0.32, margin: 0,
    fontFace: SANS, fontSize: 13, bold: true, color: GOLD,
  });
  s.addNotes(notesFor(slide));
}

/* ------------------------------------------------------------------- loop */
const DARK = new Set(["title", "statement", "three-up", "limits", "ask"]);

const render = {
  "title": title,
  "statement": statement,
  "three-up": threeUp,
  "shot-hero": shotHero,
  "shot-left": shotCorner,
  "tabs-map": tabsMap,
  "stats": stats,
  "two-up": twoUp,
  "limits": limits,
  "ask": ask,
};

for (const slide of slides) {
  const portrait = slide.shot && dims(join(HERE, slide.shot)).aspect < 1.05;
  const fn = portrait ? shotSheet : render[slide.kind];
  if (!fn) throw new Error(`no layout for kind: ${slide.kind}`);
  const s = newSlide(DARK.has(slide.kind));
  fn(s, slide);
}

await pres.writeFile({ fileName: join(HERE, "sn6-app-deck-c.pptx") });
console.log(`wrote sn6-app-deck-c.pptx — ${slides.length} slides`);
