/* Direction B — "Motorsport".
   Renders 06 Pitch/content.mjs into sn6-app-deck-b.pptx.
   Copy is never edited here; only its typographic fit is. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pptxgen from "pptxgenjs";
import { meta, acts, slides } from "./content.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "sn6-app-deck-b.pptx");

/* ---- tokens, straight from 03 App/app/index.html :root ---- */
const C = {
  navy: "002B50",        // --sb-bg
  navyDeep: "00294D",
  blue: "003262",        // --blue
  navy2: "024A86",       // --navy-2
  gold: "FDB515",        // --gold
  gold2: "FFC63D",
  canvas: "EEF1F6",      // --canvas
  card: "FFFFFF",
  surface2: "F4F7FB",
  line: "DDE3EC",
  border2: "C6D0DE",
  ink: "141D2B",
  muted: "515F74",
  faint: "616E83",
  sbText: "C4D0E0",      // --sb-text
  carbon: "0A3559",      // --carbon, flattened over --sb-bg
  ghost: "0B3A64",       // background numeral on dark fields
};

const F = "Arial";
const W = 13.3, H = 7.5;
const M = 0.62;                 // left/right margin
const COLW = W - 2 * M;         // 12.06
const FOOT_Y = 6.78;
const BOTTOM = 6.55;            // content must end above this

/* ---- geometry helpers ---- */
const pngSize = (p) => {
  const b = fs.readFileSync(p);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

// contain-fit: preserve aspect ratio, centre inside box. Never distorts.
function fit(file, box) {
  const { w: iw, h: ih } = pngSize(path.join(DIR, file));
  const a = iw / ih;
  let w = box.w, h = w / a;
  if (h > box.h) { h = box.h; w = h * a; }
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, aspect: a };
}

// Arial width estimate in inches (bold runs a touch wider than regular).
const textW = (s, pt, bold) => s.length * (pt / 72) * (bold ? 0.512 : 0.492);
const lineCount = (s, pt, wIn, bold) => Math.max(1, Math.ceil(textW(s, pt, bold) / wIn));

/* ---- chrome ---- */
function carbon(slide) {
  // 45/-45 crosshatch, the app sidebar's --carbon texture, as a full field.
  for (let i = -8; i < 22; i++) {
    const x = i * 0.62;
    slide.addShape("line", { x, y: 0, w: 7.5, h: 7.5, line: { color: C.carbon, width: 1 } });
    slide.addShape("line", { x, y: 0, w: 7.5, h: 7.5, flipH: true, line: { color: C.carbon, width: 1 } });
  }
}

function footer(slide, n, dark) {
  slide.addText(meta.footer, {
    x: M, y: FOOT_Y, w: 6, h: 0.28, margin: 0, fontFace: F, fontSize: 9.5,
    color: dark ? "6E8AAA" : C.faint, charSpacing: 0.6,
  });
  slide.addText(String(n), {
    x: W - M - 1.2, y: FOOT_Y, w: 1.2, h: 0.28, margin: 0, align: "right",
    fontFace: F, fontSize: 9.5, color: dark ? "6E8AAA" : C.faint,
  });
}

/* Title block. Returns the y where content may begin. */
function head(slide, s, opt = {}) {
  const dark = !!opt.dark;
  const w = opt.w || COLW;
  const eyebrow = (s.act || opt.eyebrow || "").toUpperCase();
  if (eyebrow) {
    slide.addText(eyebrow, {
      x: M, y: 0.44, w, h: 0.26, margin: 0, fontFace: F, fontSize: 10.5, bold: true,
      color: C.gold, charSpacing: 2.2,
    });
  }
  const t = s.title;
  let fs_ = t.length > 76 ? 26 : t.length > 52 ? 29 : t.length > 30 ? 32 : 36;
  if (opt.size) fs_ = opt.size;
  let lines = lineCount(t, fs_, w, true);
  if (lines > 2 && fs_ > 24) { fs_ = 24; lines = lineCount(t, fs_, w, true); }
  const lh = (fs_ * 1.18) / 72;
  const y = eyebrow ? 0.8 : 0.6;
  slide.addText(t, {
    x: M, y, w, h: lines * lh + 0.12, margin: 0, valign: "top",
    fontFace: F, fontSize: fs_, bold: true, color: dark ? "FFFFFF" : C.blue,
    charSpacing: -0.7, lineSpacingMultiple: 0.94,
  });
  return y + lines * lh + 0.34;
}

/* Bulleted body block on a light slide. Returns bottom y. */
function body(slide, lines, x, y, w, opt = {}) {
  if (!lines || !lines.length) return y;
  const pt = opt.fontSize || 14;
  const color = opt.color || C.muted;
  const runs = lines.map((t, i) => ({
    text: t,
    options: { bullet: { code: "25AA" }, breakLine: i !== lines.length - 1 },
  }));
  const n = lines.reduce((a, t) => a + lineCount(t, pt, w - 0.3, false), 0);
  const h = n * (pt * 1.35) / 72 + lines.length * 0.09;
  slide.addText(runs, {
    x, y, w, h: h + 0.1, margin: 0, valign: "top",
    fontFace: F, fontSize: pt, color, paraSpaceAfter: 6, lineSpacingMultiple: 1.05,
  });
  return y + h + 0.12;
}

/* White frame + screenshot, contain-fit. */
function shot(slide, file, box) {
  const r = fit(file, box);
  const pad = 0.13;
  slide.addShape("roundRect", {
    x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad, rectRadius: 0.06,
    fill: { color: "FFFFFF" }, line: { color: C.border2, width: 0.75 },
    shadow: { type: "outer", color: "0A1628", opacity: 0.18, blur: 14, offset: 3, angle: 90 },
  });
  slide.addImage({ path: path.join(DIR, file), x: r.x, y: r.y, w: r.w, h: r.h });
  return r;
}

/* ---- deck ---- */
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "FEB Composites";
pres.title = meta.title;

const actIndex = new Map();
acts.forEach((a, i) => { if (a.label) actIndex.set(a.label, String(i).padStart(2, "0")); });

const dark = (slide, textured) => {
  slide.background = { color: C.navy };
  if (textured) carbon(slide);
};

const K = {};

K.title = (slide, s) => {
  dark(slide, true);
  slide.addText("UC BERKELEY FORMULA ELECTRIC  ·  COMPOSITES  ·  SN6", {
    x: M, y: 1.55, w: COLW, h: 0.3, margin: 0, fontFace: F, fontSize: 11.5, bold: true,
    color: C.gold, charSpacing: 2.6,
  });
  slide.addText(s.title.toUpperCase(), {
    x: M, y: 2.05, w: COLW, h: 1.25, margin: 0, fontFace: F, fontSize: 60, bold: true,
    color: "FFFFFF", charSpacing: -1.6,
  });
  slide.addText(s.subtitle, {
    x: M, y: 3.45, w: 9.6, h: 1.0, margin: 0, fontFace: F, fontSize: 19, color: C.sbText,
    lineSpacingMultiple: 1.2,
  });
  slide.addText(s.footnote, {
    x: M, y: 5.55, w: 6.5, h: 0.32, margin: 0, fontFace: F, fontSize: 14, bold: true,
    color: C.gold, charSpacing: 0.4,
  });
  slide.addText(`${meta.presenter}   ·   ${meta.date}`, {
    x: M, y: 5.98, w: 6.5, h: 0.3, margin: 0, fontFace: F, fontSize: 12.5, color: "8FA6BF",
  });
};

K.statement = (slide, s) => {
  dark(slide, false);
  const num = actIndex.get(s.act) || "";
  if (num) {
    slide.addText(num, {
      x: 8.4, y: 3.3, w: 4.2, h: 2.9, margin: 0, align: "right", valign: "bottom",
      fontFace: F, fontSize: 124, bold: true, color: C.ghost,
    });
  }
  const y = head(slide, s, { dark: true, w: 11.4, size: s.title.length > 70 ? 30 : 34 });
  const runs = s.body.map((t, i) => ({
    text: t,
    options: { bullet: { code: "25AA" }, breakLine: i !== s.body.length - 1 },
  }));
  slide.addText(runs, {
    x: M, y: y + 0.15, w: 9.6, h: 2.6, margin: 0, valign: "top",
    fontFace: F, fontSize: 16.5, color: C.sbText, paraSpaceAfter: 12, lineSpacingMultiple: 1.12,
  });
};

K["three-up"] = (slide, s) => {
  slide.background = { color: C.canvas };
  const y = head(slide, s);
  const gap = 0.34, cw = (COLW - 2 * gap) / 3;
  const top = Math.max(y + 0.15, 2.05);
  const ch = Math.min(3.45, BOTTOM - top);
  s.items.forEach((it, i) => {
    const x = M + i * (cw + gap);
    slide.addShape("roundRect", {
      x, y: top, w: cw, h: ch, rectRadius: 0.08,
      fill: { color: "FFFFFF" }, line: { color: C.line, width: 1 },
      shadow: { type: "outer", color: "0A1628", opacity: 0.1, blur: 10, offset: 2, angle: 90 },
    });
    slide.addText(it.tag, {
      x: x + 0.34, y: top + 0.3, w: 1.3, h: 0.3, margin: 0, fontFace: F, fontSize: 11.5,
      bold: true, color: "9A6E00", charSpacing: 1.6,
    });
    const headLines = lineCount(it.head, 20, cw - 0.68, true);
    const headH = headLines * 0.34;
    slide.addText(it.head, {
      x: x + 0.34, y: top + 0.66, w: cw - 0.68, h: headH + 0.06, margin: 0, valign: "top",
      fontFace: F, fontSize: 20, bold: true, color: C.blue, charSpacing: -0.4,
      lineSpacingMultiple: 0.98,
    });
    const bodyY = top + 0.66 + Math.max(headH, 0.68) + 0.24;
    slide.addText(it.body, {
      x: x + 0.34, y: bodyY, w: cw - 0.68, h: top + ch - bodyY - 0.25, margin: 0, valign: "top",
      fontFace: F, fontSize: 13, color: C.muted, lineSpacingMultiple: 1.1,
    });
  });
};

K["shot-hero"] = (slide, s) => {
  slide.background = { color: C.canvas };
  const { w: iw, h: ih } = pngSize(path.join(DIR, s.shot));
  const tall = iw / ih < 1.25;
  const y = head(slide, s);
  if (tall) {
    // Title stays full width; body left, portrait screenshot right.
    const top = Math.max(y + 0.1, 2.0);
    body(slide, s.body, M, top, 6.3, { fontSize: 14.5 });
    shot(slide, s.shot, { x: 7.35, y: top - 0.1, w: 5.33, h: BOTTOM - top + 0.1 });
  } else {
    const by = body(slide, s.body, M, y, 11.6, { fontSize: 14.5 });
    shot(slide, s.shot, { x: M + 0.2, y: by + 0.22, w: COLW - 0.4, h: BOTTOM - by - 0.25 });
  }
};

K["shot-left"] = (slide, s) => {
  slide.background = { color: C.canvas };
  const { w: iw, h: ih } = pngSize(path.join(DIR, s.shot));
  const wide = iw / ih > 1.2;
  const shotW = wide ? 7.3 : 4.4;
  const y = head(slide, s);
  const top = Math.max(y + 0.1, 1.9);
  shot(slide, s.shot, { x: M + 0.15, y: top, w: shotW - 0.3, h: BOTTOM - top });
  const tx = M + shotW + 0.45;
  body(slide, s.body, tx, top + 0.05, W - M - tx, { fontSize: 14.5 });
};

K["tabs-map"] = (slide, s) => {
  slide.background = { color: C.canvas };
  const y = head(slide, s);
  const cols = 4, gap = 0.3, pw = (COLW - (cols - 1) * gap) / cols, ph = 0.66;
  const top = Math.max(y + 0.1, 2.2);
  s.tabs.forEach((t, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const on = s.highlight.includes(t);
    const x = M + c * (pw + gap), yy = top + r * (ph + 0.3);
    slide.addShape("roundRect", {
      x, y: yy, w: pw, h: ph, rectRadius: 0.07,
      fill: { color: on ? C.blue : "FFFFFF" },
      line: { color: on ? C.blue : C.line, width: 1 },
    });
    slide.addText(t, {
      x, y: yy, w: pw, h: ph, margin: 0, align: "center", valign: "middle",
      fontFace: F, fontSize: 15, bold: on, color: on ? C.gold : C.muted,
      charSpacing: on ? 0.4 : 0,
    });
  });
  const rows = Math.ceil(s.tabs.length / cols);
  body(slide, s.body, M, top + rows * (ph + 0.3) + 0.25, COLW, { fontSize: 14.5, color: C.ink });
};

K.stats = (slide, s) => {
  slide.background = { color: C.canvas };
  const y = head(slide, s);
  const top = Math.max(y + 0.1, 1.9);
  const rowH = 1.18;
  s.stats.forEach((st, i) => {
    const yy = top + i * rowH;
    slide.addText(st.n, {
      x: M, y: yy - 0.06, w: 2.05, h: 0.8, margin: 0, align: "right", valign: "middle",
      fontFace: F, fontSize: 42, bold: true, color: C.blue, charSpacing: -1.4,
    });
    slide.addText(st.label.toUpperCase(), {
      x: 2.95, y: yy + 0.02, w: 9.4, h: 0.3, margin: 0, fontFace: F, fontSize: 12.5,
      bold: true, color: "9A6E00", charSpacing: 1.8,
    });
    slide.addText(st.sub, {
      x: 2.95, y: yy + 0.36, w: 9.4, h: 0.72, margin: 0, valign: "top",
      fontFace: F, fontSize: 13.5, color: C.muted, lineSpacingMultiple: 1.08,
    });
    if (i < s.stats.length - 1) {
      slide.addShape("line", {
        x: M, y: yy + rowH - 0.16, w: COLW, h: 0, line: { color: C.line, width: 1 },
      });
    }
  });
  if (s.body) {
    const yy = Math.min(top + s.stats.length * rowH + 0.12, 5.85);
    slide.addText(s.body[0], {
      x: M, y: yy, w: COLW, h: 0.62, margin: 0, valign: "top",
      fontFace: F, fontSize: 14, italic: true, color: C.ink, lineSpacingMultiple: 1.1,
    });
  }
};

K["two-up"] = (slide, s) => {
  slide.background = { color: C.canvas };
  const y = head(slide, s);
  const gap = 0.4, cw = (COLW - gap) / 2;
  const top = Math.max(y, 2.05), ch = BOTTOM - top;
  [s.left, s.right].forEach((col, i) => {
    const x = M + i * (cw + gap);
    slide.addShape("roundRect", {
      x, y: top, w: cw, h: ch, rectRadius: 0.08,
      fill: { color: "FFFFFF" }, line: { color: C.line, width: 1 },
      shadow: { type: "outer", color: "0A1628", opacity: 0.1, blur: 10, offset: 2, angle: 90 },
    });
    slide.addText(col.head.toUpperCase(), {
      x: x + 0.34, y: top + 0.26, w: cw - 0.68, h: 0.34, margin: 0,
      fontFace: F, fontSize: 17, bold: true, color: C.blue, charSpacing: 1.4,
    });
    const bl = lineCount(col.body, 12.5, cw - 0.68, false);
    slide.addText(col.body, {
      x: x + 0.34, y: top + 0.68, w: cw - 0.68, h: bl * 0.22 + 0.1, margin: 0, valign: "top",
      fontFace: F, fontSize: 12.5, color: C.muted, lineSpacingMultiple: 1.08,
    });
    const imgTop = top + 0.68 + bl * 0.22 + 0.32;
    const r = fit(col.shot, { x: x + 0.34, y: imgTop, w: cw - 0.68, h: top + ch - imgTop - 0.3 });
    slide.addImage({ path: path.join(DIR, col.shot), x: r.x, y: r.y, w: r.w, h: r.h });
    slide.addShape("rect", {
      x: r.x, y: r.y, w: r.w, h: r.h, fill: { type: "none" },
      line: { color: C.border2, width: 0.75 },
    });
  });
};

K.limits = (slide, s) => {
  slide.background = { color: C.canvas };
  const y = head(slide, s, { size: 40 });
  const top = Math.max(y, 2.0);
  const rowH = (BOTTOM - top) / s.items.length;
  s.items.forEach((it, i) => {
    const yy = top + i * rowH;
    slide.addShape("rect", {
      x: M, y: yy + 0.13, w: 0.13, h: 0.13, fill: { color: C.gold }, line: { width: 0 },
    });
    slide.addText(it.head, {
      x: M + 0.42, y: yy, w: 3.55, h: rowH - 0.2, margin: 0, valign: "top",
      fontFace: F, fontSize: 17, bold: true, color: C.blue, charSpacing: -0.3,
      lineSpacingMultiple: 1.0,
    });
    slide.addText(it.body, {
      x: M + 4.25, y: yy + 0.02, w: W - M - (M + 4.25), h: rowH - 0.2, margin: 0, valign: "top",
      fontFace: F, fontSize: 13.5, color: C.muted, lineSpacingMultiple: 1.1,
    });
    if (i < s.items.length - 1) {
      slide.addShape("line", {
        x: M, y: yy + rowH - 0.14, w: COLW, h: 0, line: { color: C.line, width: 1 },
      });
    }
  });
};

K.ask = (slide, s) => {
  dark(slide, true);
  slide.addText((s.act || "").toUpperCase(), {
    x: M, y: 0.44, w: COLW, h: 0.26, margin: 0, fontFace: F, fontSize: 10.5, bold: true,
    color: C.gold, charSpacing: 2.2,
  });
  slide.addText(s.title.toUpperCase(), {
    x: M, y: 0.82, w: 8, h: 0.8, margin: 0, fontFace: F, fontSize: 44, bold: true,
    color: "FFFFFF", charSpacing: -1.2,
  });
  const top = 1.95, rowH = 1.1;
  s.asks.forEach((a, i) => {
    const yy = top + i * rowH;
    slide.addText(String(i + 1).padStart(2, "0"), {
      x: M, y: yy, w: 0.7, h: 0.4, margin: 0, fontFace: F, fontSize: 16, bold: true,
      color: C.gold, charSpacing: 0.4,
    });
    slide.addText(a.what, {
      x: M + 0.8, y: yy - 0.03, w: 6.9, h: 0.36, margin: 0, fontFace: F, fontSize: 19,
      bold: true, color: "FFFFFF", charSpacing: -0.4,
    });
    slide.addText(a.detail, {
      x: M + 0.8, y: yy + 0.36, w: 8.9, h: 0.62, margin: 0, valign: "top",
      fontFace: F, fontSize: 12.5, color: C.sbText, lineSpacingMultiple: 1.06,
    });
    slide.addText(a.owner.toUpperCase(), {
      x: 9.9, y: yy - 0.02, w: 2.78, h: 0.3, margin: 0, align: "right",
      fontFace: F, fontSize: 12, bold: true, color: C.gold, charSpacing: 1.2,
    });
    slide.addText(a.when, {
      x: 9.9, y: yy + 0.28, w: 2.78, h: 0.3, margin: 0, align: "right",
      fontFace: F, fontSize: 12, color: "8FA6BF",
    });
    if (i < s.asks.length - 1) {
      slide.addShape("line", {
        x: M, y: yy + rowH - 0.12, w: COLW, h: 0, line: { color: "0E3A63", width: 1 },
      });
    }
  });
  slide.addText(s.footnote, {
    x: M, y: 6.72, w: 6, h: 0.34, margin: 0, valign: "middle", fontFace: F, fontSize: 15,
    bold: true, color: C.gold, charSpacing: 0.6,
  });
};

const DARK_KINDS = new Set(["title", "statement", "ask"]);

slides.forEach((s, i) => {
  const slide = pres.addSlide();
  const fn = K[s.kind];
  if (!fn) throw new Error(`no layout for kind "${s.kind}"`);
  fn(slide, s);
  if (s.kind === "ask") {
    // the ask slide carries the live URL where the footer would sit
    slide.addText(String(i + 1), {
      x: W - M - 1.2, y: FOOT_Y, w: 1.2, h: 0.28, margin: 0, align: "right",
      fontFace: F, fontSize: 9.5, color: "6E8AAA",
    });
  } else if (s.kind !== "title") {
    footer(slide, i + 1, DARK_KINDS.has(s.kind));
  }
  slide.addNotes(s.notes || "");
});

await pres.writeFile({ fileName: OUT });
console.log(`wrote ${OUT} — ${slides.length} slides`);
