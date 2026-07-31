/* Direction A — "Engineering document".
   Near-monochrome Berkeley Blue on white, wide margins, small confident type.
   Set like a technical report that happens to be projected.

   Content comes from content.mjs and is never rewritten here. If a line will
   not fit, this file shortens the *rendering* (smaller type, tighter box),
   never the copy.

   Build:  node build_deck_a.mjs   ->  sn6-app-deck-a.pptx
*/

import PptxGenJS from "pptxgenjs";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { meta, slides } = await import("./content.mjs");

/* ---------------------------------------------------------------- palette */
/* From 03 App/app/index.html :root — no invented colours. */
const INK      = "141D2B"; // --ink
const BLUE     = "003262"; // --blue, Berkeley Blue
const MUTED    = "515F74"; // --muted
const FAINT    = "616E83"; // --faint
const LINE     = "DDE3EC"; // --line
const BORDER2  = "C6D0DE"; // --border-2
const GOLD     = "FDB515"; // --gold  — used on exactly two slides, both times
                           // to mean "this is the thing you have to act on".
const WHITE    = "FFFFFF";

const SERIF = "Cambria";   // headings
const SANS  = "Calibri";   // body

/* ------------------------------------------------------------------ grid */
const W = 13.33, H = 7.5;
const ML = 0.9, MR = 0.9;                 // wide margins are the thesis
const CW = W - ML - MR;                   // 11.53
const HEAD_Y = 0.40;                      // running head
const TITLE_Y = 1.00;
const FOOT_Y = 6.92;
const BOT = 6.80;                         // content must not pass this

/* ------------------------------------------------- PNG dimensions (no deps)
   Reads the IHDR chunk directly; every shot in shots/ is a PNG.            */
const dimCache = new Map();
function pngSize(file) {
  if (dimCache.has(file)) return dimCache.get(file);
  const b = readFileSync(file);
  const d = { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  dimCache.set(file, d);
  return d;
}

/* Contain-fit: preserve aspect ratio, centre inside the box. Never distort. */
function contain(file, box, topAlign = false) {
  const { w: iw, h: ih } = pngSize(file);
  const a = iw / ih;
  let w = box.w, h = w / a;
  if (h > box.h) { h = box.h; w = h * a; }
  return {
    x: box.x + (box.w - w) / 2,
    y: topAlign ? box.y : box.y + (box.h - h) / 2,
    w, h, aspect: a,
  };
}

function shotPath(rel) {
  const p = path.join(HERE, rel);
  if (!existsSync(p)) throw new Error("missing shot: " + rel);
  return p;
}

/* A screenshot sits in a hairline frame so it reads as a plate, not a bleed. */
function addShot(slide, rel, box, topAlign = false) {
  const f = shotPath(rel);
  const g = contain(f, box, topAlign);
  slide.addShape("rect", {
    x: g.x - 0.02, y: g.y - 0.02, w: g.w + 0.04, h: g.h + 0.04,
    fill: { color: WHITE }, line: { color: BORDER2, width: 0.75 },
  });
  slide.addImage({ path: f, x: g.x, y: g.y, w: g.w, h: g.h });
  return g;
}

/* ----------------------------------------------------------- text metrics
   Rough advance-width model, good enough to decide 1 line vs 2 and to catch
   a title that needs a size step down. Calibrated against Cambria/Calibri.  */
const NARROW = new Set([..."ijltIfr.,:;'\"!|()[]- "]);
const WIDE = new Set([..."mwMW@"]);
function textWidthIn(s, ptSize, factor) {
  let em = 0;
  for (const ch of s) em += NARROW.has(ch) ? 0.34 : WIDE.has(ch) ? 0.88 : 0.52;
  return em * (ptSize / 72) * factor;
}
function lineCount(s, ptSize, boxW, factor = 1.0) {
  const words = s.split(/\s+/);
  let lines = 1, cur = "";
  for (const wd of words) {
    const t = cur ? cur + " " + wd : wd;
    if (textWidthIn(t, ptSize, factor) > boxW && cur) { lines++; cur = wd; }
    else cur = t;
  }
  return lines;
}

/* ------------------------------------------------------------- chrome */
function chrome(slide, s, n) {
  slide.background = { color: WHITE };
  slide.addText(s.act ? s.act.toUpperCase() : "", {
    x: ML, y: HEAD_Y, w: CW * 0.6, h: 0.24, margin: 0,
    fontFace: SANS, fontSize: 9, color: FAINT, charSpacing: 1.6, bold: true,
  });
  slide.addText(`${String(n).padStart(2, "0")} / ${String(slides.length)}`, {
    x: ML + CW * 0.6, y: HEAD_Y, w: CW * 0.4, h: 0.24, margin: 0, align: "right",
    fontFace: SANS, fontSize: 9, color: FAINT, charSpacing: 1.0,
  });
  slide.addText(meta.footer, {
    x: ML, y: FOOT_Y, w: CW, h: 0.24, margin: 0,
    fontFace: SANS, fontSize: 8.5, color: FAINT, charSpacing: 0.6,
  });
}

/* Title helper. Long claim titles wrap to two lines; returns the y where
   content may begin, so nothing below ever collides with a wrapped title. */
function title(slide, text, opts = {}) {
  const w = opts.w ?? CW * 0.90;
  let pt = opts.pt ?? 25;
  const chars = text.length;
  if (chars > 96) pt = Math.min(pt, 21);
  else if (chars > 70) pt = Math.min(pt, 23);
  const lines = lineCount(text, pt, w, 1.02);
  /* 1.46 em per line + slack: LibreOffice sets Cambria a touch taller than the
     nominal line box, and an under-measured title is what collides with body. */
  const h = lines * (pt / 72) * 1.46 + 0.14;
  slide.addText(text, {
    x: ML, y: TITLE_Y, w, h, margin: 0, valign: "top",
    fontFace: SERIF, fontSize: pt, bold: true, color: BLUE, lineSpacing: pt * 1.24,
  });
  return TITLE_Y + h + (opts.gap ?? 0.34);
}

/* A quiet hairline used only as a table rule between rows — never as a
   decorative stripe, never under a title. */
function rule(slide, x, y, w) {
  slide.addShape("line", { x, y, w, h: 0, line: { color: LINE, width: 0.75 } });
}

/* ----------------------------------------------------------------- kinds */
const kinds = {};

kinds.title = (slide, s) => {
  slide.background = { color: WHITE };
  slide.addText(s.title, {
    x: ML, y: 2.20, w: CW * 0.8, h: 0.95, margin: 0,
    fontFace: SERIF, fontSize: 44, bold: true, color: BLUE, charSpacing: 0.4,
  });
  slide.addText(s.subtitle, {
    x: ML, y: 3.20, w: CW * 0.66, h: 0.95, margin: 0,
    fontFace: SANS, fontSize: 16, color: MUTED, lineSpacing: 24,
  });
  rule(slide, ML, 4.55, CW * 0.42);
  slide.addText(
    [
      { text: meta.presenter, options: { color: INK, bold: true, breakLine: true } },
      { text: meta.date, options: { color: MUTED, breakLine: true } },
      { text: s.footnote, options: { color: MUTED } },
    ],
    { x: ML, y: 4.78, w: CW * 0.5, h: 1.2, margin: 0, fontFace: SANS, fontSize: 12, lineSpacing: 17 }
  );
};

kinds.statement = (slide, s) => {
  const y0 = title(slide, s.title, { pt: 28, w: CW * 0.86, gap: 0.42 });
  let y = y0;
  for (const p of s.body) {
    const h = Math.max(0.42, lineCount(p, 15, CW * 0.70, 1.0) * 0.30 + 0.10);
    slide.addText(p, {
      x: ML, y, w: CW * 0.70, h, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 15, color: INK, lineSpacing: 21,
    });
    y += h + 0.20;
  }
};

/* Three findings as stacked table rows with a reference column in the left
   gutter — an SAE-paper table, not a three-column icon grid. */
kinds["three-up"] = (slide, s) => {
  const y0 = title(slide, s.title, { gap: 0.46 });
  const tagW = 1.25, gap = 0.28;
  const bodyX = ML + tagW + gap, bodyW = CW - tagW - gap;
  const avail = BOT - y0;
  const rowH = avail / s.items.length;
  s.items.forEach((it, i) => {
    const y = y0 + i * rowH;
    if (i > 0) rule(slide, ML, y - 0.14, CW);
    slide.addText(it.tag, {
      x: ML, y: y + 0.03, w: tagW, h: 0.3, margin: 0,
      fontFace: SANS, fontSize: 10.5, bold: true, color: MUTED, charSpacing: 1.2,
    });
    slide.addText(it.head, {
      x: bodyX, y, w: bodyW, h: 0.34, margin: 0,
      fontFace: SERIF, fontSize: 16, bold: true, color: BLUE,
    });
    slide.addText(it.body, {
      x: bodyX, y: y + 0.36, w: bodyW * 0.86, h: rowH - 0.55, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 13, color: INK, lineSpacing: 19,
    });
  });
};

kinds["shot-hero"] = (slide, s) => {
  const f = shotPath(s.shot);
  const a = (() => { const d = pngSize(f); return d.w / d.h; })();
  if (a < 1.2) {
    /* Portrait plate: the title keeps the full measure, then prose and the
       tall shot share the band below it, so nothing runs under the title. */
    const y0 = title(slide, s.title, { gap: 0.36 });
    const colW = CW * 0.46;
    let y = y0;
    for (const p of s.body) {
      const h = lineCount(p, 13.5, colW, 1.0) * 0.28 + 0.16;
      slide.addText(p, {
        x: ML, y, w: colW, h, margin: 0, valign: "top",
        fontFace: SANS, fontSize: 13.5, color: INK, lineSpacing: 19,
      });
      y += h + 0.18;
    }
    addShot(slide, s.shot, { x: ML + CW * 0.53, y: y0, w: CW * 0.47, h: BOT - y0 }, true);
  } else {
    const y0 = title(slide, s.title, { gap: 0.22 });
    const body = s.body.join("   ·   ");
    const bh = lineCount(body, 13, CW * 0.92, 1.0) * 0.27 + 0.12;
    slide.addText(body, {
      x: ML, y: y0, w: CW * 0.92, h: bh, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 13, color: MUTED, lineSpacing: 18,
    });
    const top = y0 + bh + 0.22;
    addShot(slide, s.shot, { x: ML, y: top, w: CW, h: BOT - top });
  }
};

kinds["shot-left"] = (slide, s) => {
  /* Name notwithstanding: prose left, plate right. */
  const colW = CW * 0.36, gap = CW * 0.05;
  const y0 = title(slide, s.title, { w: CW * 0.92, gap: 0.32 });
  let y = y0;
  for (const p of s.body) {
    const h = lineCount(p, 13, colW, 1.0) * 0.27 + 0.14;
    slide.addText(p, {
      x: ML, y, w: colW, h, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 13, color: INK, lineSpacing: 18.5,
    });
    y += h + 0.18;
  }
  addShot(slide, s.shot, {
    x: ML + colW + gap, y: y0 - 0.06,
    w: CW - colW - gap, h: BOT - (y0 - 0.06),
  });
};

/* Eleven tabs as an index, four of them called out in gold — first of the
   deck's two gold moments, and it means "this is the path we follow". */
kinds["tabs-map"] = (slide, s) => {
  const y0 = title(slide, s.title, { gap: 0.40 });
  const cols = 4, colW = CW / cols;
  const rows = Math.ceil(s.tabs.length / cols);
  const rowH = 0.62;
  s.tabs.forEach((t, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const on = s.highlight.includes(t);
    slide.addText(
      [
        { text: String(i + 1).padStart(2, "0") + "  ", options: { fontSize: 11, color: on ? GOLD : FAINT, fontFace: SANS } },
        { text: t, options: { fontSize: 16, bold: on, color: on ? BLUE : MUTED, fontFace: SERIF } },
      ],
      { x: ML + c * colW, y: y0 + r * rowH, w: colW - 0.2, h: 0.4, margin: 0, valign: "middle" }
    );
  });
  const yb = y0 + rows * rowH + 0.22;
  rule(slide, ML, yb, CW);
  slide.addText(s.body.join(" "), {
    x: ML, y: yb + 0.16, w: CW * 0.78, h: 0.5, margin: 0, valign: "top",
    fontFace: SANS, fontSize: 13, color: INK, lineSpacing: 19,
  });
};

kinds.stats = (slide, s) => {
  const y0 = title(slide, s.title, { gap: 0.44 });
  const n = s.stats.length, colW = CW / n, pad = 0.34;
  /* Size the block to the longest caption rather than to the slide, so the
     closing line sits under the stats instead of across a dead band. */
  const subLines = Math.max(...s.stats.map((st) => lineCount(st.sub, 11.5, colW - pad, 1.0)));
  const blockH = Math.min(BOT - y0 - 0.72, 1.18 + subLines * 0.245 + 0.20);
  s.stats.forEach((st, i) => {
    const x = ML + i * colW;
    slide.addText(st.n, {
      x, y: y0, w: colW - pad, h: 0.82, margin: 0, valign: "top",
      fontFace: SERIF, fontSize: 46, bold: true, color: BLUE,
    });
    slide.addText(st.label, {
      x, y: y0 + 0.82, w: colW - pad, h: 0.30, margin: 0,
      fontFace: SANS, fontSize: 12, bold: true, color: INK, charSpacing: 0.6,
    });
    slide.addText(st.sub, {
      x, y: y0 + 1.18, w: colW - pad, h: blockH - 1.18, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 11.5, color: MUTED, lineSpacing: 17,
    });
  });
  const yb = y0 + blockH + 0.10;
  rule(slide, ML, yb, CW);
  slide.addText(s.body.join(" "), {
    x: ML, y: yb + 0.16, w: CW * 0.86, h: 0.52, margin: 0, valign: "top",
    fontFace: SANS, fontSize: 12.5, color: INK, lineSpacing: 18,
  });
};

kinds["two-up"] = (slide, s) => {
  const y0 = title(slide, s.title, { gap: 0.34 });
  const gap = 0.55, colW = (CW - gap) / 2;
  [s.left, s.right].forEach((col, i) => {
    const x = ML + i * (colW + gap);
    slide.addText(col.head, {
      x, y: y0, w: colW, h: 0.32, margin: 0,
      fontFace: SERIF, fontSize: 17, bold: true, color: BLUE,
    });
    const bh = lineCount(col.body, 12.5, colW, 1.0) * 0.26 + 0.14;
    slide.addText(col.body, {
      x, y: y0 + 0.36, w: colW, h: bh, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 12.5, color: INK, lineSpacing: 18,
    });
    const top = y0 + 0.36 + bh + 0.18;
    addShot(slide, col.shot, { x, y: top, w: colW, h: BOT - top });
  });
};

kinds.limits = (slide, s) => {
  const y0 = title(slide, s.title, { pt: 28, gap: 0.40 });
  const headW = 3.5, gap = 0.40;
  const bodyX = ML + headW + gap, bodyW = CW - headW - gap;
  const avail = BOT - y0;
  const rowH = avail / s.items.length;
  s.items.forEach((it, i) => {
    const y = y0 + i * rowH;
    if (i > 0) rule(slide, ML, y - 0.16, CW);
    slide.addText(it.head, {
      x: ML, y, w: headW, h: rowH - 0.3, margin: 0, valign: "top",
      fontFace: SERIF, fontSize: 15, bold: true, color: BLUE, lineSpacing: 20,
    });
    slide.addText(it.body, {
      x: bodyX, y: y + 0.02, w: bodyW * 0.94, h: rowH - 0.3, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 13, color: INK, lineSpacing: 19,
    });
  });
};

/* Second and last gold moment: the four numerals on the ask. */
kinds.ask = (slide, s) => {
  const y0 = title(slide, s.title, { pt: 30, gap: 0.36 });
  const numW = 0.55, whatW = 3.0, metaW = 2.1, gap = 0.28;
  const detailX = ML + numW + whatW + gap;
  const detailW = CW - numW - whatW - metaW - gap * 2;
  const metaX = ML + CW - metaW;
  const avail = BOT - y0 - 0.45;
  const rowH = avail / s.asks.length;
  s.asks.forEach((a, i) => {
    const y = y0 + i * rowH;
    if (i > 0) rule(slide, ML, y - 0.12, CW);
    slide.addText(String(i + 1), {
      x: ML, y: y - 0.02, w: numW, h: 0.4, margin: 0,
      fontFace: SERIF, fontSize: 20, bold: true, color: GOLD,
    });
    slide.addText(a.what, {
      x: ML + numW, y, w: whatW, h: 0.62, margin: 0, valign: "top",
      fontFace: SERIF, fontSize: 15, bold: true, color: BLUE, lineSpacing: 19,
    });
    slide.addText(a.detail, {
      x: detailX, y: y + 0.01, w: detailW, h: rowH - 0.24, margin: 0, valign: "top",
      fontFace: SANS, fontSize: 12, color: INK, lineSpacing: 17,
    });
    slide.addText(
      [
        { text: a.owner, options: { bold: true, color: INK, breakLine: true } },
        { text: a.when, options: { color: MUTED } },
      ],
      { x: metaX, y: y + 0.01, w: metaW, h: 0.7, margin: 0, align: "right", fontFace: SANS, fontSize: 12, lineSpacing: 16 }
    );
  });
  slide.addText(s.footnote, {
    x: ML, y: BOT - 0.36, w: CW, h: 0.3, margin: 0,
    fontFace: SANS, fontSize: 12, bold: true, color: BLUE, charSpacing: 0.6,
  });
};

/* ------------------------------------------------------------------ build */
const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE";          // before any slide is added
pres.author = "FEB Composites";
pres.title = meta.title;

slides.forEach((s, i) => {
  const slide = pres.addSlide();
  if (s.kind !== "title") chrome(slide, s, i + 1);
  const fn = kinds[s.kind];
  if (!fn) throw new Error("no renderer for kind: " + s.kind);
  fn(slide, s);
  slide.addNotes(s.notes || "");
});

await pres.writeFile({ fileName: path.join(HERE, "sn6-app-deck-a.pptx") });
console.log(`wrote sn6-app-deck-a.pptx — ${slides.length} slides`);
